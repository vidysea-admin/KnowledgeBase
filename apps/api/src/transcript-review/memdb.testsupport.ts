// Test support only: a small stateful in-memory `Db` for the operators the transcript-review store uses (equality filters;
// insertOne with a duplicate-_id error; updateOne with $set / $setOnInsert / upsert). It adds NO tenant scoping: the REAL
// `scopedCollection` runs on top, so a missing tenant merge shows up as a leaked row. It records every write per collection
// so a test can prove the original `turns` collection was never written.
import type { Db } from "mongodb";

export type Row = Record<string, unknown>;

export function memoryDb() {
  const store = new Map<string, Row[]>();
  const writes: { collection: string; op: string }[] = [];
  const failures = new Map<string, number>();
  const rowsOf = (name: string): Row[] => { let r = store.get(name); if (!r) { r = []; store.set(name, r); } return r; };
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, v]) => row[k] === v);
  const guard = (name: string, op: string): void => {
    const key = `${name}:${op}`;
    const left = failures.get(key) ?? 0;
    if (left > 0) { failures.set(key, left - 1); throw new Error(`injected failure ${key}`); }
    writes.push({ collection: name, op });
  };
  const collection = (name: string) => ({
    find: (filter: Row) => { const out = rowsOf(name).filter((r) => matches(r, filter)).map((r) => structuredClone(r)); return { toArray: async () => out }; },
    async findOne(filter: Row) { const r = rowsOf(name).find((x) => matches(x, filter)); return r ? structuredClone(r) : null; },
    async insertOne(doc: Row) {
      guard(name, "insertOne");
      if (rowsOf(name).some((r) => r._id === doc._id)) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      rowsOf(name).push(structuredClone(doc));
      return { acknowledged: true };
    },
    async updateOne(filter: Row, update: Row, options: { upsert?: boolean } = {}) {
      guard(name, "updateOne");
      const set = (update.$set ?? {}) as Row;
      const onInsert = (update.$setOnInsert ?? {}) as Row;
      const hit = rowsOf(name).find((x) => matches(x, filter));
      if (hit) { Object.assign(hit, structuredClone(set)); return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }; }
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      rowsOf(name).push({ ...filter, ...structuredClone(set), ...structuredClone(onInsert) });
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    },
  });
  return {
    db: { collection } as unknown as Db, rows: rowsOf, writes,
    seed(name: string, doc: Row) { rowsOf(name).push(structuredClone(doc)); },
    /** The next `times` calls of `op` on `name` throw (and write nothing). */
    failNext(name: string, op: string, times = 1) { failures.set(`${name}:${op}`, times); },
  };
}
