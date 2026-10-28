import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoSpeakerAttributeStore, readAcceptedSpeakerAttributes } from "./mongo-store.js";
import type { AttributeAuthority, AttributeRow } from "./types.js";

function fixture() {
  const calls: { name: string; method: string; filter: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  let ended = false; let aborted = false; let active = false; let options: unknown; let overflow = false;
  const session = { async withTransaction<T>(run: () => Promise<T>, opts: unknown) { active = true; options = opts; const result = await run(); active = false; return result; }, async endSession() { ended = true; }, inTransaction() { return active; }, async abortTransaction() { aborted = true; active = false; } };
  const db = { client: { startSession() { return session; } }, collection(name: string) { return {
    async findOne(filter: Record<string, unknown>, options: Record<string, unknown>) { calls.push({ name, method: "findOne", filter, options }); return null; },
    find(filter: Record<string, unknown>, options: Record<string, unknown>) { calls.push({ name, method: "find", filter, options }); const cursor = { sort() { return cursor; }, limit() { return cursor; }, async toArray() { return overflow ? Array(101).fill({}) : []; } }; return cursor; },
    async insertOne(filter: Record<string, unknown>, options: Record<string, unknown>) { calls.push({ name, method: "insertOne", filter, options }); return { insertedId: filter._id }; },
    async replaceOne(filter: Record<string, unknown>, _row: unknown, options: Record<string, unknown>) { calls.push({ name, method: "replaceOne", filter, options }); return { modifiedCount: 1 }; },
  }; } } as unknown as Db;
  const row: AttributeRow = { _id: "attr:fixture", tenantId: "A", personId: "person:priya", field: "org", value: "Example", revision: 1, status: "suggested", createdBy: "user:1", sourceRevisionDigest: "a".repeat(64), reviewHistory: [],
    evidence: [{ sessionId: "s1", turnId: "t1", quote: "Example", transcriptHash: "b".repeat(64), speakerRef: "spk:1", startTurnIndex: 0, endTurnIndex: 1 }] };
  return { db, row, calls, session, ended: () => ended, aborted: () => aborted, options: () => options, overflow() { overflow = true; } };
}
test("attribute writes and source authority share tenant-pinned snapshot/CAS", async () => {
  const f = fixture(); const store = createMongoSpeakerAttributeStore(f.db, async (db, tenantId) => { await db.collection<{ _id: string; tenantId: string }>("turns").findOne({ tenantId, _id: "t1" }); return null; });
  await store.transaction("A", async tx => { await tx.authority("person:priya"); await tx.get(f.row._id); await tx.insert(f.row); assert.equal(await tx.replaceCAS(f.row._id, 1, { ...f.row, revision: 2 }), true); await tx.list("person:priya", "accepted"); return true; });
  assert.ok(f.calls.every(c => c.filter.tenantId === "A" && c.options.session === f.session)); assert.equal(f.calls.find(c => c.method === "replaceOne")!.filter.revision, 1);
  assert.deepEqual(f.options(), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 }); assert.equal(f.ended(), true);
});
test("source writes/unscoped reads forbidden and errors abort/end transaction", async () => {
  for (const write of [true, false]) { const f = fixture(); const store = createMongoSpeakerAttributeStore(f.db, async db => {
    if (write) await db.collection<{ _id: string; tenantId: string }>("speakers").insertOne({ tenantId: "A", _id: "forbidden" }); else await db.collection<{ _id: string; tenantId: string }>("turns").findOne({ _id: "t1" }); return null;
  }); await assert.rejects(store.transaction("A", tx => tx.authority("person:priya")), /forbidden|Unscoped/); assert.equal(f.calls.length, 0); assert.equal(f.aborted(), true); assert.equal(f.ended(), true); }
});
test("foreign writes, inconsistent CAS, overflow and unsupported transactions refuse", async () => {
  for (const operation of ["foreign", "revision", "overflow"]) { const f = fixture(); const store = createMongoSpeakerAttributeStore(f.db, async () => null); if (operation === "overflow") f.overflow();
    await assert.rejects(store.transaction("A", async tx => {
      if (operation === "foreign") await tx.insert({ ...f.row, tenantId: "B" });
      else if (operation === "revision") await tx.replaceCAS(f.row._id, 1, { ...f.row, revision: 3 });
      else await tx.list("person:priya", "accepted");
    }), /Invalid attribute|limit exceeded/);
    assert.equal(f.aborted(), true); assert.equal(f.ended(), true);
  }
  await assert.rejects(createMongoSpeakerAttributeStore({} as Db, async () => null).transaction("A", async () => true), /snapshot unavailable/);
});
test("accepted profile reader reuses caller snapshot and opens no nested session", async () => {
  const f = fixture(); const authority: AttributeAuthority = { view: { tenantId: "A", personId: "person:priya", identityStatus: "human-confirmed", ambiguity: null, revision: "a".repeat(64), nodes: [], edges: [], statements: [], withheldRelationships: 0 }, transcriptHashes: {}, attributedTurns: [] };
  const result = await readAcceptedSpeakerAttributes({ collection: f.db.collection.bind(f.db) }, "A", "person:priya", authority);
  assert.deepEqual(result.fields, {}); assert.equal(f.ended(), false); assert.equal(f.options(), undefined); assert.equal(f.calls.length, 1); assert.equal(f.calls[0]!.filter.tenantId, "A");
});
