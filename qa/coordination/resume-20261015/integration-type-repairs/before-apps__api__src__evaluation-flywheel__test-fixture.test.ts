import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./test-fixture.js";

test("memory fixture replaceOne reports insert match no-op miss and duplicate outcomes", async () => {
  const mem = memoryDb(), coll = mem.db.collection<{ _id: string; [key: string]: any }>("chunks");
  const doc = { _id: "current", tenantId: "t", sourceRef: "s", value: 1 };
  const counts = (r: { acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedCount: number }) =>
    [r.acknowledged, r.matchedCount, r.modifiedCount, r.upsertedCount];
  const inserted = await coll.replaceOne({ _id: "current", tenantId: "t" }, doc, { upsert: true });
  assert.deepEqual(counts(inserted), [true, 0, 0, 1]);
  assert.equal(inserted.matchedCount + inserted.upsertedCount, 1);
  assert.deepEqual(counts(await coll.replaceOne({ _id: "current", tenantId: "t" }, doc, { upsert: true })), [true, 1, 0, 0]);
  assert.deepEqual(counts(await coll.replaceOne({ _id: "current", tenantId: "t" }, { ...doc, value: 2 }, { upsert: true })), [true, 1, 1, 0]);
  assert.deepEqual(counts(await coll.replaceOne({ _id: "missing", tenantId: "t" }, doc)), [true, 0, 0, 0]);
  assert.deepEqual(counts(await coll.replaceOne({ _id: "current", tenantId: "foreign" }, doc)), [true, 0, 0, 0]);
  await assert.rejects(coll.replaceOne({ _id: "current", tenantId: "foreign" }, doc, { upsert: true }), { code: 11000 });
  assert.deepEqual(mem.tables.chunks, [{ ...doc, value: 2 }]);
});

test("memory fixture nin prunes stale scoped rows and preserves missing array and operator semantics", async () => {
  const mem = memoryDb({ chunks: [
    { _id: "current", tenantId: "t", sourceRef: "s", tags: ["keep", "blocked"] },
    { _id: "stale", tenantId: "t", sourceRef: "s", tags: ["keep"] },
    { _id: "missing", tenantId: "t", sourceRef: "other" },
    { _id: "null", tenantId: "t", sourceRef: "other", tags: null },
    { _id: "foreign", tenantId: "foreign", sourceRef: "s" },
  ] }), coll = mem.db.collection<{ _id: string; [key: string]: any }>("chunks");
  const ids = async (filter: Record<string, any>) => (await coll.find(filter).toArray()).map(row => row._id).sort();
  assert.deepEqual(await ids({ tenantId: "t", tags: { $nin: ["blocked"] } }), ["missing", "null", "stale"]);
  assert.deepEqual(await ids({ tenantId: "t", tags: { $exists: true, $nin: ["blocked"] } }), ["null", "stale"]);
  assert.deepEqual(await ids({ tenantId: "t", tags: { $nin: [] } }), ["current", "missing", "null", "stale"]);
  assert.deepEqual(await ids({ tenantId: "t", tags: { $nin: ["blocked"], $unsupported: true } }), []);
  assert.deepEqual(await ids({ tenantId: "t", tags: { $nin: "blocked" } }), []);
  const pruned = await coll.deleteMany({ tenantId: "t", sourceRef: "s", _id: { $nin: ["current"] } });
  assert.deepEqual(pruned, { acknowledged: true, deletedCount: 1 });
  assert.deepEqual(mem.tables.chunks.map(row => row._id).sort(), ["current", "foreign", "missing", "null"]);
});


test("memory fixture traverses claim evidence arrays with tenant scoped dotted filters", async () => {
  const mem = memoryDb({ claims: [
    { _id: "current", tenantId: "t", evidence: [{ sessionId: "s1" }, { sessionId: "s2" }], tags: ["allowed", "blocked"] },
    { _id: "other", tenantId: "t", evidence: [{ sessionId: "other" }], tags: ["allowed"] },
    { _id: "absent", tenantId: "t", evidence: [{}] },
    { _id: "foreign", tenantId: "foreign", evidence: [{ sessionId: "s1" }] },
  ] }), coll = mem.db.collection<{ _id: string; [key: string]: any }>("claims");
  const ids = async (filter: Record<string, any>) => (await coll.find(filter).toArray()).map(row => row._id).sort();
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": "s1" }), ["current"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": "s2" }), ["current"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": "missing" }), []);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": { $exists: true, $in: ["s1"] } }), ["current"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": { $nin: ["s1"] } }), ["absent", "other"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": { $exists: false } }), ["absent"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": { $exists: true, $nin: ["s1"] } }), ["other"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": { $nin: [null] } }), ["current", "other"]);
  assert.deepEqual(await ids({ tenantId: "t", tags: "blocked" }), ["current"]);
  assert.deepEqual(await ids({ tenantId: "t", "evidence.sessionId": { $in: ["s1"], $unsupported: true } }), []);
});
