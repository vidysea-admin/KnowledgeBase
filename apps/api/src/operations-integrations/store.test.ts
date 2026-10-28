import test from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoScheduleStore } from "./store.js";
import { initialSchedule, type Schedule } from "./model.js";
function fixture(name = "private-fixture") {
  const rows: Schedule[] = [], filters: Record<string, unknown>[] = [];
  const match = (row: Schedule, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => row[key as keyof Schedule] === value);
  const raw = {
    find(filter: Record<string, unknown>) { filters.push(filter); const cursor = { maxTimeMS: (ms: number) => { assert.equal(ms, 15000); return cursor; }, limit: (limit: number) => { assert.equal(limit, 1); return cursor; }, next: async () => structuredClone(rows.find(row => match(row, filter)) ?? null) }; return cursor; },
    async insertOne(row: Schedule) { if (rows.some(existing => existing._id === row._id)) throw Object.assign(new Error("Duplicate"), { code: 11000 }); rows.push(structuredClone(row)); return { insertedId: row._id }; },
    async replaceOne(filter: Record<string, unknown>, row: Schedule, options: { upsert?: boolean; timeoutMS?: number }) { filters.push(filter); assert.equal(options.timeoutMS, 15000); const index = rows.findIndex(existing => match(existing, filter)); if (index < 0) { if (options.upsert) { if (rows.some(existing => existing._id === row._id)) throw Object.assign(new Error("Duplicate"), { code: 11000 }); rows.push(structuredClone(row)); return { matchedCount: 0, upsertedCount: 1 }; } return { matchedCount: 0 }; } rows[index] = structuredClone(row); return { matchedCount: 1 }; },
  };
  const db = { databaseName: name, collection: (collection: string) => { assert.equal(collection, "operations_schedules"); return raw; } } as unknown as Db;
  return { rows, filters, db, store: createMongoScheduleStore(() => false, () => db) };
}
function configured(tenant: string): Schedule {
  return { ...initialSchedule(tenant, "digest"), revision: 1, audit: [{ revision: 1, at: "2026-10-14T00:00:00.000Z", actorKeyId: "verified-key", action: "config-save", outcome: "configured" }] };
}
test("actual scopedCollection accessor stamps tenant and CAS preserves foreign sentinel/audit prefix", async () => {
  const f = fixture(); const a = configured("A"), b = configured("B"); f.rows.push(b);
  assert.equal(await f.store.replace("A", null, a), true); assert.deepEqual(await f.store.load("A", "digest"), a);
  const next: Schedule = { ...a, revision: 2, intervalHours: 168, audit: [...a.audit, { ...a.audit[0]!, revision: 2 }] };
  assert.equal(await f.store.replace("A", a, next), true); assert.equal(await f.store.replace("A", a, next), false);
  assert.deepEqual(f.rows.find(row => row.tenantId === "B"), b); assert.ok(f.filters.every(filter => filter.tenantId === "A"));
  const modifiedPrefix = { ...next, revision: 3, audit: [...next.audit.map(event => ({ ...event, actorKeyId: "forged" })), { ...next.audit[0]!, revision: 3 }] };
  await assert.rejects(f.store.replace("A", next, modifiedPrefix));
});
test("production writes require explicit separate gate and malformed ownership is refused before IO", async () => {
  const f = fixture("lkb"); await assert.rejects(f.store.replace("A", null, configured("A"))); assert.equal(f.rows.length, 0);
  const allowed = createMongoScheduleStore(() => true, () => f.db); assert.equal(await allowed.replace("A", null, configured("A")), true);
  await assert.rejects(allowed.replace("A", null, configured("B"))); assert.equal(f.rows.length, 1);
});
