/** In-memory transactional Mongo fixture for the wiring tests (never connects anywhere). */
import type { Db } from "mongodb";

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;
const setFields = (row: Row, values: Row): void => {
  for (const [key, value] of Object.entries(values)) {
    const parts = key.split("."); let target = row;
    for (const part of parts.slice(0, -1)) target = (target[part] ??= {}) as Row;
    target[parts.at(-1)!] = structuredClone(value);
  }
};
const valuesAt = (row: unknown, path: string[]): unknown[] => {
  if (!path.length) return [row];
  if (Array.isArray(row)) return row.flatMap(item => valuesAt(item, path));
  if (row === null || typeof row !== "object") return [];
  return valuesAt((row as Row)[path[0]!], path.slice(1));
};
const one = (value: unknown, expected: unknown): boolean => {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const op = expected as Row;
    if ("$in" in op) return (op.$in as unknown[]).some(item => (value ?? null) === item);
    if ("$ne" in op) return value !== op.$ne;
    if ("$exists" in op) return (value !== undefined) === op.$exists;
  }
  return (value ?? null) === (expected ?? null);
};
const matches = (row: Row, filter: Filter): boolean => Object.entries(filter).every(([key, expected]) => {
  const found = valuesAt(row, key.split("."));
  return found.length ? found.some(value => one(value, expected)) : one(undefined, expected);
});

export function wireMongoFixture(seed: Record<string, Row[]> = {}) {
  let rows: Record<string, Row[]> = structuredClone(seed);
  let tail = Promise.resolve();
  const coll = (name: string) => (rows[name] ??= []);
  // Mongo _id is unique per collection across ALL tenants; the double must enforce it or tenant collisions stay invisible.
  const insertRow = (name: string, row: Row) => {
    if (coll(name).some(existing => existing._id === row._id)) throw new Error(`E11000 duplicate key error collection: ${name} dup key: ${JSON.stringify(row._id)}`);
    coll(name).push(structuredClone(row));
  };
  const db = {
    client: { startSession: () => { let active = false; return ({
      inTransaction: () => active,
      async withTransaction<T>(body: () => Promise<T>): Promise<T> {
        let unlock!: () => void; const prior = tail; tail = new Promise(r => { unlock = r; }); await prior;
        const backup = structuredClone(rows);
        active = true;
        try { return await body(); } catch (error) { rows = backup; throw error; } finally { active = false; unlock(); }
      },
      async endSession() { /* noop */ },
    }); } },
    collection: (name: string) => ({
      find: (filter: Filter = {}) => ({ async toArray() { return structuredClone(coll(name).filter(r => matches(r, filter))); } }),
      async findOne(filter: Filter = {}) { return structuredClone(coll(name).find(r => matches(r, filter)) ?? null); },
      /** Plain append; a duplicate `_id` throws like a unique index (W7 audit events and seeds). */
      async insertOne(doc: Row) { insertRow(name, doc); return { acknowledged: true, insertedId: doc._id }; },
      async countDocuments(filter: Filter = {}) { return coll(name).filter(r => matches(r, filter)).length; },
      async replaceOne(filter: Filter, replacement: Row, options: { upsert?: boolean } = {}) {
        const index = coll(name).findIndex(r => matches(r, filter));
        if (index >= 0) { coll(name)[index] = structuredClone(replacement); return { modifiedCount: 1, upsertedCount: 0 }; }
        if (options.upsert) { insertRow(name, replacement); return { modifiedCount: 0, upsertedCount: 1 }; }
        return { modifiedCount: 0, upsertedCount: 0 };
      },
      async bulkWrite(ops: { replaceOne: { filter: Filter; replacement: Row; upsert?: boolean } }[]) {
        for (const { replaceOne: op } of ops) await db.collection(name).replaceOne(op.filter, op.replacement, { upsert: op.upsert === true });
        return {};
      },
      async updateOne(filter: Filter, update: { $set?: Row; $setOnInsert?: Row; $unset?: Record<string, unknown>; $inc?: Record<string, number> }, options: { upsert?: boolean } = {}) {
        const row = coll(name).find(r => matches(r, filter));
        if (row) {
          setFields(row, update.$set ?? {});
          for (const key of Object.keys(update.$unset ?? {})) delete row[key];
          for (const [key, by] of Object.entries(update.$inc ?? {})) setFields(row, { [key]: (Number(valuesAt(row, key.split("."))[0]) || 0) + by });
          return { acknowledged: true, matchedCount: 1, modifiedCount: update.$set || update.$inc || update.$unset ? 1 : 0, upsertedCount: 0 };
        }
        if (options.upsert) {
          const plain = Object.fromEntries(Object.entries(filter).filter(([, v]) => v === null || typeof v !== "object"));
          insertRow(name, { ...plain, ...update.$setOnInsert, ...update.$set }); return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      },
      async deleteOne(filter: Filter) {
        const index = coll(name).findIndex(r => matches(r, filter));
        if (index >= 0) coll(name).splice(index, 1);
        return { deletedCount: index >= 0 ? 1 : 0 };
      },
    }),
  } as unknown as Db;
  return { db, rows: (name: string): Row[] => structuredClone(coll(name)), put: (name: string, row: Row) => { coll(name).push(structuredClone(row)); } };
}
