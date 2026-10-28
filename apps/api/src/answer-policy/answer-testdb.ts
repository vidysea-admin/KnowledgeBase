/** Stateful Mongo boundary double. It records actual filters and adds no tenancy/CAS behavior. */
import type { Db } from "mongodb";
type Row = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);
const at = (row: Row, key: string): unknown => key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Row)[part] : undefined, row);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const value = at(row, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const operators = expected as Row;
      if ("$exists" in operators) return (value !== undefined) === operators.$exists;
      if (Array.isArray(operators.$in)) return operators.$in.some((item) => same(item, value));
    }
    return same(value, expected);
  });
}

export function answerTestDb(databaseName = "lkb_t056_test") {
  const data = new Map<string, Row[]>(), calls: { collection: string; filter: Row }[] = [];
  const rows = (name: string): Row[] => { let found = data.get(name); if (!found) { found = []; data.set(name, found); } return found; };
  const collection = (name: string) => ({
    find(filter: Row) {
      calls.push({ collection: name, filter: clone(filter) }); let found = rows(name).filter((r) => matches(r, filter)).map(clone);
      const cursor = { sort(spec: Record<string, 1 | -1>) {
        found.sort((a, b) => { for (const [key, order] of Object.entries(spec)) { const x = a[key] as never, y = b[key] as never; if (x !== y) return (x < y ? -1 : 1) * order; } return 0; }); return cursor;
      }, limit(limit: number) { found = found.slice(0, limit); return cursor; }, toArray: async () => clone(found) }; return cursor;
    },
    async findOne(filter: Row) { calls.push({ collection: name, filter: clone(filter) }); return clone(rows(name).find((r) => matches(r, filter)) ?? null); },
    async insertOne(row: Row) {
      if (rows(name).some((r) => same(r._id, row._id))) throw Object.assign(new Error("Duplicate key"), { code: 11000 });
      rows(name).push(clone(row)); return { acknowledged: true };
    },
    async updateOne(filter: Row, update: { $set?: Row; $push?: Row }) {
      calls.push({ collection: name, filter: clone(filter) }); const row = rows(name).find((r) => matches(r, filter));
      if (!row) return { modifiedCount: 0, matchedCount: 0 };
      Object.assign(row, clone(update.$set ?? {}));
      for (const [key, item] of Object.entries(update.$push ?? {})) (row[key] as unknown[]).push(clone(item));
      return { modifiedCount: 1, matchedCount: 1 };
    },
  });
  return { db: { databaseName, collection } as unknown as Db, rows, calls };
}
