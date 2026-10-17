import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoSpeakerRelationshipStore } from "./mongo-store.js";
import type { RelationshipRow } from "./types.js";

function fixture() {
  const calls: { method: string; name: string; filter: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  let ended = false; let aborted = false; let active = false; let transactionOptions: unknown;
  const session = { async withTransaction<T>(run: () => Promise<T>, options: unknown) { active = true; transactionOptions = options; const result = await run(); active = false; return result; }, async endSession() { ended = true; }, inTransaction() { return active; }, async abortTransaction() { active = false; aborted = true; } };
  const db = { client: { startSession: () => session }, collection(name: string) { return {
    async findOne(filter: Record<string, unknown>, options: Record<string, unknown>) { calls.push({ method: "findOne", name, filter, options }); return null; },
    find(filter: Record<string, unknown>, options: Record<string, unknown>) {
      calls.push({ method: "find", name, filter, options });
      const cursor = { sort() { return cursor; }, limit() { return cursor; }, async toArray() { return []; } }; return cursor;
    },
    async insertOne(row: Record<string, unknown>, options: Record<string, unknown>) { calls.push({ method: "insertOne", name, filter: row, options }); return { insertedId: row._id }; },
    async replaceOne(filter: Record<string, unknown>, _row: unknown, options: Record<string, unknown>) { calls.push({ method: "replaceOne", name, filter, options }); return { modifiedCount: 1 }; },
  }; } } as unknown as Db;
  const row: RelationshipRow = { _id: "rel:example", tenantId: "A", revision: 1, status: "suggested", type: "contradicts", from: { personId: "person:example", claimId: "c1" }, to: { personId: "person:example", claimId: "c2" }, evidence: [{ sessionId: "s1", turnId: "t1", quote: "Exact", transcriptHash: "a".repeat(64) }], createdBy: "reviewer", sourceRevisionDigest: "b".repeat(64) };
  return { db, row, calls, session, ended: () => ended, aborted: () => aborted, options: () => transactionOptions };
}

test("Mongo store binds authority and relation CRUD to one session with tenant/revision CAS", async () => {
  const f = fixture();
  const store = createMongoSpeakerRelationshipStore(f.db, async (db, tenant) => {
    await db.collection("turns").findOne({ tenantId: tenant, sessionId: "s1" }); return null;
  });
  await store.transaction("A", async tx => {
    await tx.authority("person:example"); await tx.get("rel:example"); await tx.insert(f.row);
    assert.equal(await tx.replaceCAS(f.row._id, 1, { ...f.row, revision: 2 }), true);
    assert.deepEqual(await tx.list("person:example", "accepted"), []); return true;
  });
  assert.ok(f.calls.every(c => c.filter.tenantId === "A" && c.options?.session === f.session));
  assert.equal(f.calls.find(c => c.method === "replaceOne")!.filter.revision, 1);
  assert.deepEqual(f.options(), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 });
  assert.equal(f.ended(), true); assert.equal(f.aborted(), false);
});

test("Mongo authority capability refuses source writes/unscoped reads; failure aborts and closes session", async () => {
  for (const illegalWrite of [true, false]) {
    const f = fixture();
    const store = createMongoSpeakerRelationshipStore(f.db, async db => {
      if (illegalWrite) await db.collection<{ _id: string; tenantId: string }>("speakers").insertOne({ tenantId: "A", _id: "must-not-write" });
      else await db.collection("turns").findOne({ sessionId: "foreign-unscoped" });
      return null;
    });
    await assert.rejects(store.transaction("A", tx => tx.authority("person:example")), /forbidden|Unscoped/);
    assert.equal(f.calls.length, 0); assert.equal(f.aborted(), true); assert.equal(f.ended(), true);
  }
});

test("Mongo store refuses missing transaction support, foreign writes and inconsistent replacement", async () => {
  const broken = createMongoSpeakerRelationshipStore({ collection() { throw new Error("must-not-read"); } } as unknown as Db, async () => null);
  await assert.rejects(broken.transaction("A", async () => true), /snapshot unavailable/);
  for (const replace of [false, true]) {
    const f = fixture(); const store = createMongoSpeakerRelationshipStore(f.db, async () => null);
    await assert.rejects(store.transaction("A", async tx => {
      if (replace) await tx.replaceCAS(f.row._id, 1, { ...f.row, revision: 8 });
      else await tx.insert({ ...f.row, tenantId: "B" });
    }), /Invalid relationship/);
    assert.equal(f.calls.length, 0); assert.equal(f.aborted(), true); assert.equal(f.ended(), true);
  }
});
