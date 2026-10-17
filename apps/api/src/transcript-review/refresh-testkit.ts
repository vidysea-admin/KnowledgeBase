import type { Db } from "mongodb";
type Row = Record<string, any>;
type Data = Map<string, Row[]>;
const clone = (data: Data): Data => new Map([...data].map(([name, rows]) => [name, structuredClone(rows)]));
const values = (v: any, keys: string[]): any[] => !keys.length ? [v] : Array.isArray(v) ? v.flatMap((x) => values(x, keys)) : values(v?.[keys[0]!], keys.slice(1));
const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, wanted]) => {
  if (k === "$or") return wanted.some((branch: Row) => matches(row, branch));
  if (k === "$and") return wanted.every((branch: Row) => matches(row, branch));
  const got = values(row, k.split("."));
  if (wanted && typeof wanted === "object" && Object.keys(wanted).some((key) => key.startsWith("$"))) return Object.entries(wanted).every(([op, value]) => {
    if (op === "$exists") return got.some((x) => x !== undefined) === value;
    if (op === "$in") return got.some((x) => (value as unknown[]).includes(x));
    if (op === "$nin") return got.every((x) => !(value as unknown[]).includes(x));
    if (op === "$ne") return got.every((x) => JSON.stringify(x) !== JSON.stringify(value));
    throw new Error(`Unsupported fixture filter: ${op}`);
  });
  return got.some((x) => JSON.stringify(x) === JSON.stringify(wanted));
});
function setField(row: Row, path: string, value: unknown): void {
  const keys = path.split("."), leaf = keys.pop()!;
  let target = row;
  for (const key of keys) { if (!target[key] || typeof target[key] !== "object") target[key] = {}; target = target[key]; }
  target[leaf] = structuredClone(value);
}

/** Transaction semantic fixture; this is NOT real Mongo proof. Tracks session propagation,
 * serial operations, rollback, and head write conflicts while the real indexer executes. */
export function transactionalFixture() {
  let data: Data = new Map();
  const calls: { collection: string; method: string; transaction: boolean }[] = [];
  let active = 0, maxActive = 0;
  let beforeCommit: (() => void | Promise<void>) | undefined;
  let unsupported = false;
  const failures = new Map<string, number>();
  const rows = (state: Data, name: string): Row[] => { if (!state.has(name)) state.set(name, []); return state.get(name)!; };
  const db = { client: { startSession() {
    const session = { working: null as Data | null, base: null as Data | null, touched: new Set<string>(),
      committed: false,
      inTransaction() { return session.working !== null; },
      startTransaction() {
        if (unsupported) throw new Error("Transactions unsupported");
        session.base = clone(data); session.working = clone(data); session.touched.clear(); session.committed = false;
      },
      async commitTransaction() {
        if (session.committed) return; // retrying commit never reapplies generation writes
        if (!session.working || !session.base) throw new Error("No active transaction");
        const barrier = beforeCommit; beforeCommit = undefined;
        await barrier?.();
        for (const name of session.touched) if (JSON.stringify(data.get(name)) !== JSON.stringify(session.base.get(name))) throw Object.assign(new Error("WriteConflict"), { code: 112 });
        for (const name of session.touched) data.set(name, structuredClone(rows(session.working, name)));
        session.committed = true; session.working = null;
      },
      async abortTransaction() { session.working = null; },
      async withTransaction(run: () => Promise<void>) {
        // Driver-shaped regression model: convenient callbacks can replay after transient
        // body OR commit errors. Paid-work consumers must use the manual API instead.
        for (let attempt = 0; attempt < 2; attempt++) {
          session.startTransaction();
          try { await run(); await session.commitTransaction(); return; }
          catch (error) {
            await session.abortTransaction();
            const transient = (error as { hasErrorLabel?: (label: string) => boolean }).hasErrorLabel?.("TransientTransactionError");
            if (!transient || attempt === 1) throw error;
          }
        }
      }, async endSession() { session.working = null; },
    };
    return session;
  } }, collection(name: string) {
    const operation = async (method: string, options: Row | undefined, run: (state: Data) => any, write = false) => {
      const session = options?.session;
      const state = session?.working ?? data;
      const failureKey = `${name}:${method}`, remaining = failures.get(failureKey) ?? 0;
      if (remaining > 0) { failures.set(failureKey, remaining - 1); throw new Error(`injected failure ${failureKey}`); }
      calls.push({ collection: name, method, transaction: !!session });
      active++; maxActive = Math.max(maxActive, active);
      try { await new Promise<void>((r) => setImmediate(r)); if (write && session) session.touched.add(name); return run(state); }
      finally { active--; }
    };
    const update = (state: Data, filter: Row, value: Row, options: Row = {}) => {
      let hit = rows(state, name).find((r) => matches(r, filter));
      if (!hit && options.upsert) {
        const inserted: Row = { ...filter, ...(value.$setOnInsert ?? {}) };
        rows(state, name).push(inserted);
        for (const [key, field] of Object.entries(value.$set ?? {})) setField(inserted, key, field);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      if (!hit) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      for (const [key, field] of Object.entries(value.$set ?? {})) setField(hit, key, field);
      for (const [key, field] of Object.entries(value.$inc ?? {})) setField(hit, key, (values(hit, key.split("."))[0] ?? 0) + Number(field));
      for (const key of Object.keys(value.$unset ?? {})) {
        const keys = key.split("."), leaf = keys.pop()!;
        let parent = hit;
        for (const part of keys) parent = parent?.[part];
        if (parent) delete parent[leaf];
      }
      for (const [key, field] of Object.entries(value.$addToSet ?? {})) {
        const additions = field && typeof field === "object" && "$each" in field ? field.$each as unknown[] : [field];
        const existing = values(hit, key.split("."))[0];
        const output = Array.isArray(existing) ? [...existing] : [];
        for (const item of additions) if (!output.some((old) => JSON.stringify(old) === JSON.stringify(item))) output.push(item);
        setField(hit, key, output);
      }
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    };
    return {
      find(filter: Row, options?: Row) { const cursor: any = { toArray: () => operation("find", options, (state) => structuredClone(rows(state, name).filter((r) => matches(r, filter)))), sort: () => cursor, limit: () => cursor, skip: () => cursor, project: () => cursor }; return cursor; },
      findOne: (filter: Row, options?: Row) => operation("findOne", options, (state) => structuredClone(rows(state, name).find((r) => matches(r, filter)) ?? null)),
      insertOne: (doc: Row, options?: Row) => operation("insertOne", options, (state) => {
        if (rows(state, name).some(r => r._id === doc._id)) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
        rows(state, name).push(structuredClone(doc)); return { acknowledged: true, insertedId: doc._id };
      }, true),
      insertMany: (docs: Row[], options?: Row) => operation("insertMany", options, (state) => { rows(state, name).push(...structuredClone(docs)); return { acknowledged: true, insertedCount: docs.length }; }, true),
      updateOne: (filter: Row, value: Row, options?: Row) => operation("updateOne", options, (state) => update(state, filter, value, options), true),
      replaceOne: (filter: Row, doc: Row, options?: Row) => operation("replaceOne", options, (state) => { const old = rows(state, name); const i = old.findIndex((r) => matches(r, filter)); if (i >= 0) old[i] = structuredClone(doc); else if (options?.upsert) old.push(structuredClone(doc)); return { acknowledged: true, matchedCount: i >= 0 ? 1 : 0, upsertedCount: i < 0 && options?.upsert ? 1 : 0 }; }, true),
      deleteMany: (filter: Row, options?: Row) => operation("deleteMany", options, (state) => { const before = rows(state, name); const kept = before.filter((r) => !matches(r, filter)); state.set(name, kept); return { acknowledged: true, deletedCount: before.length - kept.length }; }, true),
      deleteOne: (filter: Row, options?: Row) => operation("deleteOne", options, (state) => { const old = rows(state, name); const i = old.findIndex((r) => matches(r, filter)); if (i >= 0) old.splice(i, 1); return { acknowledged: true, deletedCount: i >= 0 ? 1 : 0 }; }, true),
    };
  } };
  return { db: db as unknown as Db, calls, rows: (name: string) => rows(data, name), seed: (name: string, doc: Row) => rows(data, name).push(structuredClone(doc)),
    maxActive: () => maxActive, onBeforeCommit: (fn: () => void | Promise<void>) => { beforeCommit = fn; }, refuseTransactions: () => { unsupported = true; },
    failNext(name: string, method: string, times = 1) { failures.set(`${name}:${method}`, times); } };
}
