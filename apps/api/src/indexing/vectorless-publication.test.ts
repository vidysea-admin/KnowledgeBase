import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claims, Chunks, SessionPages, Sessions, Turns } from "@lkb/core";
import { indexSession } from "./session.js";
import { fakeDb } from "./testutils.js";
import { verifyIndexGeneration } from "./generation.js";
import { assertSourceBoundPublication, assertPreservedClaimMeaning } from "./vectorless-grounding.js";
import { createConnectorMongoStore } from "../connector-workflow/mongo-store.js";

/** Deterministic source-support fixture, not a live LLM or human quality evaluation. */
function groundedComplete() {
  return async (job: { messages: { content: string }[] }) => {
    const input = JSON.parse(job.messages[1]!.content);
    const claims = input.spans.map((span: { text: string; origin: string; turnId: string; sessionId: string }) => ({
      text: span.text, origin: span.origin, verification: "unverified",
      evidence: [{ turnId: span.turnId, sessionId: span.sessionId, quote: span.text }],
    }));
    const result = input.phase === "extract-summary" ? { processed: input.inventory, items: claims.map((claim: object) => ({ ...claim, kind: "insight" })), qa: [] }
      : input.phase === "extract-claims" ? { processed: input.inventory, claims }
      : { processed: input.inventory, complete: true, noContent: false, verdicts: input.items.map((item: { id: string }) => ({
        id: item.id, supported: true, categoryCorrect: true, answerRelevant: true,
      })) };
    return { text: JSON.stringify(result), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
  };
}

test("strict default publishes current lexical/tree evidence with zero embedding calls and no vector backlog", async () => {
  const { db, calls } = fakeDb();
  let embeddingCalls = 0;
  const result = await indexSession("t", "s1", { db, strictWebinar: true, complete: groundedComplete(),
    embed: async () => { embeddingCalls++; throw new Error("vector call forbidden"); } });
  assert.equal(embeddingCalls, 0);
  assert.equal(result.completion?.complete, true);
  assert.equal(result.completion?.retrievalMode, "vectorless");
  assert.equal(result.completion?.lexicalWritten, true);
  assert.equal(result.completion?.provenanceValidated, true);
  assert.equal(result.chunks.skipped, null);
  const chunks = await db.collection<Chunks>("chunks").find({ tenantId: "t", sourceRef: "s1" }).toArray();
  assert.ok(chunks.length);
  for (const chunk of chunks) {
    assert.equal(chunk.vector, undefined); assert.equal(chunk.dims, undefined); assert.equal(chunk.embeddingModel, undefined);
    assert.deepEqual(chunk.turnRefs, ["t1"]); assert.equal(chunk.text, undefined);
  }
  assert.ok(await verifyIndexGeneration(db, "t", "s1", result.completion!.generation));
  const session = await db.collection<Sessions>("sessions").findOne({ tenantId: "t", _id: "s1" });
  assert.equal(session!.indexAttempt!.manifest!.retrievalMode, "vectorless");
  assert.ok(!calls.some(call => call.coll === "gaps" && JSON.stringify(call.update).includes('"status":"open"')));
  assert.equal(await verifyIndexGeneration(db, "other-tenant", "s1"), null);
});

test("ordinary source-bound publication refuses foreign evidence and forged supplied quotes", async () => {
  const { db } = fakeDb();
  const turns = await db.collection<Turns>("turns").find({ tenantId: "t", sessionId: "s1" }).toArray();
  const page = { summary: "A faithful abstract.", keyInsights: [], decisions: [], actionItems: [] };
  for (const evidence of [[{ turnId: "foreign", sessionId: "s1", quote: "A real sentence." }], [{ turnId: "t1", sessionId: "s1", quote: "Invented quotation." }]]) {
    assert.throws(() => assertSourceBoundPublication("t", "s1", turns, page,
      [{ text: "A paraphrase.", evidenceTurnIds: ["t1"], evidence }]));
  }
});

test("reviewed substring cannot bypass meaning verification of full negated source context", async () => {
  const turn = { _id: "t1", tenantId: "t", sessionId: "s1", speakerRef: "speaker", tStart: 0, tEnd: 1,
    text: "Maths compulsory is a myth." };
  const claim: Claims = { _id: "reviewed", tenantId: "t", text: "Maths compulsory", status: "verified",
    evidence: [{ turnId: "t1", sessionId: "s1", quote: "Maths compulsory" }] };
  await assert.rejects(assertPreservedClaimMeaning([claim], [turn]), /requires current-source meaning verification/);
  let seen = false;
  await assert.rejects(assertPreservedClaimMeaning([claim], [turn], async batch => {
    seen = true; assert.equal(batch[0]!.sources[0]!.text, turn.text);
    return { verdicts: [{ id: claim._id, verdict: "different", reason: "source explicitly rejects the claim" }] };
  }), /not supported by its current source/);
  assert.equal(seen, true);
});

test("source-native paraphrase ordinary publication is consumed without embeddings and refuses tampered inventory", async () => {
  const { db } = fakeDb();
  const reviewed: Claims = { _id: "reviewed", tenantId: "t", text: "A previously reviewed abstract.", status: "verified",
    evidence: [{ turnId: "t1", sessionId: "s1", quote: "A real sentence." }] };
  await db.collection<Claims>("claims").insertOne(reviewed);
  const result = await indexSession("t", "s1", { db, complete: async job => ({
    text: job.kind === "claims" ? JSON.stringify([{ text: "A paraphrase of the source sentence.", turnIds: ["t1"] }])
      : JSON.stringify({ summary: "A concise abstract of the source.", keyInsights: [], decisions: [], actionItems: [] }),
    usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0,
  }), embed: async () => { throw new Error("must never call an embedding provider"); },
  noteJudge: async batch => ({ verdicts: batch.map(item => ({ id: item.id, verdict: "same", reason: "synthetic reviewed paraphrase support" })), costUsd: 0 }) });
  assert.equal(result.completion?.strict, false);
  assert.equal(result.completion?.complete, true);
  assert.equal(result.completion?.lexicalWritten, true);
  assert.deepEqual(await db.collection<Claims>("claims").findOne({ _id: "reviewed", tenantId: "t" }), reviewed);
  assert.ok(await verifyIndexGeneration(db, "t", "s1", result.completion!.generation));
  const session = await db.collection<Sessions>("sessions").findOne({ tenantId: "t", _id: "s1" });
  const store = createConnectorMongoStore({ MONGODB_DB: "t053_fixture" }, db);
  assert.equal(await store.recordConsumedSource("t", session!.sourceId, "s1", result), true);
  await db.collection<Chunks>("chunks").updateOne({ tenantId: "t", sourceRef: "s1" }, { $set: { turnRefs: ["forged"] } });
  assert.equal(await store.recordConsumedSource("t", session!.sourceId, "s1", result), false);
});

test("corrected effective source invalidates old receipt; reindex pins new source without vectors", async () => {
  const { db } = fakeDb();
  const deps = { db, strictWebinar: true, complete: groundedComplete() };
  const first = await indexSession("t", "s1", deps);
  await db.collection<Turns>("turns").updateOne({ tenantId: "t", _id: "t1" }, { $set: { text: "A corrected real sentence." } });
  assert.equal(await verifyIndexGeneration(db, "t", "s1", first.completion!.generation), null);
  const next = await indexSession("t", "s1", deps);
  assert.equal(next.completion?.complete, true);
  assert.notEqual(next.completion!.generation, first.completion!.generation);
  assert.equal(await verifyIndexGeneration(db, "t", "s1", first.completion!.generation), null);
  assert.ok(await verifyIndexGeneration(db, "t", "s1", next.completion!.generation));
  const chunks = await db.collection<Chunks>("chunks").find({ tenantId: "t", sourceRef: "s1" }).toArray();
  assert.equal(chunks.length, 1); assert.equal(chunks[0]!.vector, undefined);
});

test("legacy vector rows are replaced on vectorless publication; failed preflight preserves prior artifacts", async () => {
  const { db } = fakeDb();
  const deps = { db, strictWebinar: true, complete: groundedComplete() };
  await indexSession("t", "s1", deps);
  const chunk = (await db.collection<Chunks>("chunks").find({ tenantId: "t", sourceRef: "s1" }).toArray())[0]!;
  await db.collection<Chunks>("chunks").updateOne({ tenantId: "t", _id: chunk._id }, { $set: { vector: [1], dims: 1, embeddingModel: "old" } });
  await indexSession("t", "s1", deps);
  assert.equal((await db.collection<Chunks>("chunks").findOne({ tenantId: "t", _id: chunk._id }))!.vector, undefined);
  const before = await db.collection<SessionPages>("session_pages").find({ tenantId: "t" }).toArray();
  await assert.rejects(indexSession("t", "s1", { ...deps, complete: async () => { throw new Error("summary unavailable"); } }), /strict webinar index incomplete/);
  assert.deepEqual(await db.collection<SessionPages>("session_pages").find({ tenantId: "t" }).toArray(), before);
});

test("native transaction boundary rolls back a mid-write failure and preserves the accepted generation", async () => {
  let activeSession: unknown, boundOperations = 0;
  const { db } = fakeDb({ onSession: session => { assert.equal(session, activeSession); boundOperations++; } });
  const deps = { db, strictWebinar: true, complete: groundedComplete() };
  const accepted = await indexSession("t", "s1", deps);
  const names = ["sessions", "session_pages", "claims", "chunks", "tree_index", "topics", "orgs", "gaps"];
  const collection = db.collection.bind(db);
  const before = new Map(await Promise.all(names.map(async name => [name, await collection(name).find({ tenantId: "t" }).toArray()] as const)));
  let ended = false, attemptedWrites = 0;
  db.collection = ((name: string) => {
    const coll = collection(name);
    return name === "claims" ? { ...coll, insertMany: async () => { attemptedWrites++; throw new Error("synthetic mid-write failure"); } } : coll;
  }) as typeof db.collection;
  // Deterministic transactional store model; native replica-set acceptance remains separate.
  Object.assign(db, { client: { startSession: () => (activeSession = {
    startTransaction(options: { readConcern: { level: string }; writeConcern: { w: string } }) {
      assert.equal(options.readConcern.level, "snapshot"); assert.equal(options.writeConcern.w, "majority");
    },
    async commitTransaction() { throw new Error("failed work cannot commit"); },
    async abortTransaction() {
      for (const [name, rows] of before) {
        await collection(name).deleteMany({ tenantId: "t" });
        if (rows.length) await collection(name).insertMany(rows);
      }
    }, async endSession() { ended = true; },
  }) } });
  await assert.rejects(indexSession("t", "s1", deps), /synthetic mid-write failure/);
  assert.equal(attemptedWrites, 1); assert.equal(ended, true);
  assert.ok(boundOperations > 0);
  for (const [name, rows] of before) assert.deepEqual(await collection(name).find({ tenantId: "t" }).toArray(), rows, name);
  assert.ok(await verifyIndexGeneration(db, "t", "s1", accepted.completion!.generation));
});

test("unsupported native transactions fail closed without a non-atomic retry", async () => {
  const { db, calls } = fakeDb();
  let ended = false;
  Object.assign(db, { client: { startSession: () => ({ startTransaction() { throw new Error("replica set required"); }, async abortTransaction() {},
    async endSession() { ended = true; } }) } });
  await assert.rejects(indexSession("t", "s1", { db, strictWebinar: true, complete: groundedComplete() }), /replica set required/);
  assert.equal(ended, true); assert.equal(calls.length, 0);
});

test("unknown commit retries cannot replay paid model calls or duplicate physical completion", async () => {
  let baselineCalls = 0;
  const baseline = fakeDb(); const complete = groundedComplete();
  await indexSession("t", "s1", { db: baseline.db, strictWebinar: true, complete: async job => { baselineCalls++; return complete(job); } });
  let activeSession: unknown, boundOperations = 0;
  const { db, calls } = fakeDb({ onSession: session => { assert.equal(session, activeSession); boundOperations++; } });
  let modelCalls = 0, commits = 0, callbackRetries = 0;
  Object.assign(db, { client: { startSession: () => (activeSession = {
    startTransaction() {}, async abortTransaction() { throw new Error("successful publication must not abort"); }, async endSession() {},
    async withTransaction(work: () => Promise<unknown>) { callbackRetries++; await work(); return work(); },
    async commitTransaction() {
      commits++;
      if (commits === 1) throw Object.assign(new Error("uncertain synthetic commit"), { hasErrorLabel: (label: string) => label === "UnknownTransactionCommitResult" });
    },
  }) } });
  const result = await indexSession("t", "s1", { db, strictWebinar: true, complete: async job => { modelCalls++; return complete(job); } });
  assert.equal(result.completion?.complete, true);
  assert.equal(commits, 2); assert.equal(callbackRetries, 0); assert.equal(modelCalls, baselineCalls);
  assert.ok(boundOperations > 0);
  assert.equal(calls.filter(call => call.coll === "sessions" && (call.update?.$set as Record<string, unknown> | undefined)?.["indexAttempt.state"] === "complete").length, 1);
});

test("index hook runs after acknowledged commit and callback failure cannot replay publication", async () => {
  const { db } = fakeDb(); let commits = 0, notifications = 0, aborts = 0;
  Object.assign(db, { client: { startSession: () => ({ startTransaction() {},
    async commitTransaction() { commits++; }, async abortTransaction() { aborts++; }, async endSession() {},
  }) } });
  const result = await indexSession("t", "s1", { db, strictWebinar: true, complete: groundedComplete(),
    onIndexCommitted: async binding => {
      notifications++; assert.equal(commits, 1);
      assert.equal(binding.tenantId, "t"); assert.equal(binding.sessionId, "s1");
      assert.equal(binding.reviewRevision, null); assert.match(binding.turnDigest, /^[a-f0-9]{64}$/);
      assert.ok(await verifyIndexGeneration(db, "t", "s1", binding.generation));
      throw new Error("archive temporarily unavailable after successful commit");
    } });
  assert.equal(result.completion?.complete, true);
  assert.equal(notifications, 1); assert.equal(commits, 1); assert.equal(aborts, 0);
});

test("caller-owned index transaction does not notify before its outer commit", async () => {
  const { db } = fakeDb(); let notifications = 0;
  const result = await indexSession("t", "s1", { db, strictWebinar: true, complete: groundedComplete(),
    onIndexCommitted: async () => { notifications++; } });
  assert.equal(result.completion?.complete, true); assert.equal(notifications, 0);
});

test("failed outer index commit never invokes post-commit work", async () => {
  const { db } = fakeDb(); let notifications = 0;
  Object.assign(db, { client: { startSession: () => ({ startTransaction() {},
    async commitTransaction() { throw new Error("commit refused"); }, async abortTransaction() {}, async endSession() {},
  }) } });
  await assert.rejects(indexSession("t", "s1", { db, strictWebinar: true, complete: groundedComplete(),
    onIndexCommitted: async () => { notifications++; } }), /commit refused/);
  assert.equal(notifications, 0);
});
