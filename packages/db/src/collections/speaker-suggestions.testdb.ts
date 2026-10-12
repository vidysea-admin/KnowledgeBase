// Test support only (not exported from the package index): a small stateful in-memory `Db` that understands exactly the
// operators the speaker-suggestions accessor uses (equality, $in; $set, $setOnInsert, $addToSet[$each]; upsert). It does NOT
// add tenant scoping: the REAL `scopedCollection` runs on top of it, so a missing tenant merge shows up as a leaked row.
import assert from "node:assert/strict";
import type { Db } from "mongodb";

export type Row = Record<string, unknown>;

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (v !== null && typeof v === "object" && "$in" in (v as Row)) return ((v as { $in: unknown[] }).$in).some((x) => x === row[k]);
    return row[k] === v;
  });
}
function applyUpdate(row: Row, update: Row, inserting: boolean): boolean {
  const before = JSON.stringify(row);
  for (const [op, body] of Object.entries(update)) {
    const fields = body as Row;
    if (op === "$set") Object.assign(row, fields);
    else if (op === "$setOnInsert") { if (inserting) Object.assign(row, fields); }
    else if (op === "$addToSet") {
      for (const [k, v] of Object.entries(fields)) {
        const list = (row[k] as unknown[] | undefined) ?? [];
        const items = v !== null && typeof v === "object" && "$each" in (v as Row) ? (v as { $each: unknown[] }).$each : [v];
        for (const item of items) if (!list.some((x) => JSON.stringify(x) === JSON.stringify(item))) list.push(item);
        row[k] = list;
      }
    } else throw new Error(`fake db: unsupported update operator ${op}`);
  }
  return JSON.stringify(row) !== before;
}

export function memoryDb() {
  const store = new Map<string, Row[]>();
  const rowsOf = (name: string): Row[] => { let r = store.get(name); if (!r) { r = []; store.set(name, r); } return r; };
  const collection = (name: string) => ({
    find: (filter: Row) => { const out = rowsOf(name).filter((r) => matches(r, filter)).map((r) => structuredClone(r)); return { toArray: async () => out }; },
    async findOne(filter: Row) { const r = rowsOf(name).find((x) => matches(x, filter)); return r ? structuredClone(r) : null; },
    async deleteMany(filter: Row) { const rows = rowsOf(name); let n = 0; for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i]!, filter)) { rows.splice(i, 1); n++; } return { deletedCount: n }; },
    async countDocuments(filter: Row) { return rowsOf(name).filter((r) => matches(r, filter)).length; },
    async insertOne(doc: Row) { rowsOf(name).push(structuredClone(doc)); return { acknowledged: true }; },
    async updateOne(filter: Row, update: Row, options: { upsert?: boolean } = {}) {
      const hit = rowsOf(name).find((x) => matches(x, filter));
      if (hit) { const changed = applyUpdate(hit, update, false); return { matchedCount: 1, modifiedCount: changed ? 1 : 0, upsertedCount: 0 }; }
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      const fresh: Row = {};
      for (const [k, v] of Object.entries(filter)) if (v === null || typeof v !== "object") fresh[k] = v;
      applyUpdate(fresh, update, true);
      assert.ok(typeof fresh._id === "string", "fake db: an upsert needs an _id");
      rowsOf(name).push(fresh);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    },
  });
  return { db: { collection } as unknown as Db, rows: rowsOf, seed(name: string, doc: Row) { rowsOf(name).push(structuredClone(doc)); } };
}
