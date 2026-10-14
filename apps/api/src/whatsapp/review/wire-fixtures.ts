/** In-memory transactional Mongo fixture for the wiring tests (never connects anywhere). */
import type { Db } from "mongodb";

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;
const valuesAt = (row: unknown, path: string[]): unknown[] => {
  if (!path.length) return [row];
  if (Array.isArray(row)) return row.flatMap(item => valuesAt(item, path));
  if (row === null || typeof row !== "object") return [];
  return valuesAt((row as Row)[path[0]!], path.slice(1));
};
const one = (value: unknown, expected: unknown): boolean => {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const op = expected as Row;
    if ("$in" in op) return (op.$in as unknown[]).includes(value);
    if ("$ne" in op) return value !== op.$ne;
  }
  return value === expected;
};
const matches = (row: Row, filter: Filter): boolean => Object.entries(filter).every(([key, expected]) => {
  const found = valuesAt(row, key.split("."));
  return found.length ? found.some(value => one(value, expected)) : one(undefined, expected);
});

export function wireMongoFixture(seed: Record<string, Row[]> = {}) {
  let rows: Record<string, Row[]> = structuredClone(seed);
  let tail = Promise.resolve();
  const coll = (name: string) => (rows[name] ??= []);
  const db = {
    client: { startSession: () => ({
      async withTransaction<T>(body: () => Promise<T>): Promise<T> {
        let unlock!: () => void; const prior = tail; tail = new Promise(r => { unlock = r; }); await prior;
        const backup = structuredClone(rows);
        try { return await body(); } catch (error) { rows = backup; throw error; } finally { unlock(); }
      },
      async endSession() { /* noop */ },
    }) },
    collection: (name: string) => ({
      find: (filter: Filter = {}) => ({ async toArray() { return structuredClone(coll(name).filter(r => matches(r, filter))); } }),
      async findOne(filter: Filter = {}) { return structuredClone(coll(name).find(r => matches(r, filter)) ?? null); },
      async countDocuments(filter: Filter = {}) { return coll(name).filter(r => matches(r, filter)).length; },
      async replaceOne(filter: Filter, replacement: Row, options: { upsert?: boolean } = {}) {
        const index = coll(name).findIndex(r => matches(r, filter));
        if (index >= 0) { coll(name)[index] = structuredClone(replacement); return { modifiedCount: 1, upsertedCount: 0 }; }
        if (options.upsert) { coll(name).push(structuredClone(replacement)); return { modifiedCount: 0, upsertedCount: 1 }; }
        return { modifiedCount: 0, upsertedCount: 0 };
      },
      async bulkWrite(ops: { replaceOne: { filter: Filter; replacement: Row; upsert?: boolean } }[]) {
        for (const { replaceOne: op } of ops) await db.collection(name).replaceOne(op.filter, op.replacement, { upsert: op.upsert === true });
        return {};
      },
      async updateOne(filter: Filter, update: { $set?: Row; $setOnInsert?: Row }, options: { upsert?: boolean } = {}) {
        const row = coll(name).find(r => matches(r, filter));
        if (row) { Object.assign(row, structuredClone(update.$set ?? {})); return { modifiedCount: update.$set ? 1 : 0, upsertedCount: 0 }; }
        if (options.upsert) {
          const plain = Object.fromEntries(Object.entries(filter).filter(([, v]) => v === null || typeof v !== "object"));
          coll(name).push(structuredClone({ ...plain, ...update.$setOnInsert, ...update.$set })); return { modifiedCount: 0, upsertedCount: 1 };
        }
        return { modifiedCount: 0, upsertedCount: 0 };
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
