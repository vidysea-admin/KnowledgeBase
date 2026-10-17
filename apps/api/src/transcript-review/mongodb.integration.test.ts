import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { MongoClient } from "mongodb";
import { commitReview, loadReview, loadReviewHistory, runRefresh } from "./service.js";
import { createMongoReviewStore } from "./store.js";
import { createTranscriptRefreshExecutor } from "./refresh-executor.js";
import { indexSession } from "../indexing/session.js";
import { readEffectiveTurns } from "./effective-reader.js";
import { createGroundedContentDeps } from "../grounded-content/reader.js";

const url = process.env.LKB_T054_MONGO_URL;
const base = process.env.LKB_T054_MONGO_DB;
const enabled = process.env.LKB_T054_MONGO_RUN === "1" && !!url && typeof base === "string" && /^t054_test_[a-z0-9_-]+$/.test(base);
const TEXT = "The programme fee is 1,000 rupees today.";
const complete = async (job: { messages: { content: string }[] }) => {
  const p = JSON.parse(job.messages[1]!.content);
  const item = { text: TEXT, origin: "speaker-statement", verification: "unverified", evidence: [{ turnId: "t1", sessionId: "s1", quote: TEXT }] };
  const output = p.phase === "extract-summary" ? { processed: p.inventory, items: [{ ...item, kind: "insight" }], qa: [] } : p.phase === "extract-claims" ? { processed: p.inventory, claims: [item] } :
    { processed: p.inventory, complete: true, noContent: false, noClaims: false, verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
  return { text: JSON.stringify(output), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
};

test("real replica-set Mongo: indexed review survives reload; superseded transaction publishes no stale derived data", { skip: !enabled, timeout: 60000 }, async () => {
  assert.ok(url && base && /^t054_test_[a-z0-9_-]+$/.test(base), "explicit isolated test database required");
  const database = `${base}_${randomUUID().replaceAll("-", "")}`;
  assert.match(database, /^t054_test_[a-z0-9_-]+$/);
  let client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  let db = client.db(database);
  let connected = false;
  try {
    await client.connect(); connected = true;
    const topology = await db.command({ hello: 1 });
    assert.ok(typeof topology.setName === "string" && topology.setName.length > 0, "T054 native acceptance requires a replica set");
    const require = createRequire(import.meta.url);
    await require("../../../../migrations/20261014100000-transcript-reviews.cjs").up(db);
    const original = { _id: "t1", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", text: "The programme fee is 2,000 rupees today.", tStart: 0, tEnd: 4 };
    await db.collection("turns").insertOne(original as never);
    await db.collection("turns").insertOne({ _id: "t-reviewed", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", text: "Admissions are open.", tStart: 5, tEnd: 7 } as never);
    await db.collection("sources").insertOne({ _id: "src1", tenantId: "t", kind: "recording", path: "offline-fixture/fees" } as never);
    await db.collection("sessions").insertOne({ _id: "s1", tenantId: "t", sourceId: "src1", title: "Fees", org: "Acme University", date: "2026-10-14", status: { transcribe: "done", index: "pending" } } as never);
    await db.collection("claims").insertOne({ _id: "reviewed", tenantId: "t", text: "Admissions are open.", status: "verified", evidence: [{ turnId: "t-reviewed", sessionId: "s1", quote: "Admissions are open." }], topicRefs: [] } as never);
    let store = createMongoReviewStore(db);
    const request = (revision: string, text: string) => ({ tenantId: "t", sessionId: "s1", actorRef: "apikey:fixture", now: new Date().toISOString(), request: { expectedRevision: revision, reason: "Recording checked", corrections: [{ turnId: "t1", text }] } });
    const r0 = (await loadReview(store, "t", "s1")).snapshot.revision;
    const receipt = await commitReview(store, { ...request(r0, TEXT), request: { ...request(r0, TEXT).request, mapping: { turnIds: ["t1"], speakerRef: "person:mapped", speakerLabel: "Mapped speaker" } } });
    const realIndex: Parameters<typeof createTranscriptRefreshExecutor>[0]["index"] = (tenant, session, view) => indexSession(tenant, session, { db: view, complete: complete as never,
      embed: async () => { assert.fail("Vectorless transcript refresh must never request embeddings"); }, strictWebinar: true, dropUnverified: true });
    const state = await runRefresh(store, createTranscriptRefreshExecutor({ db, index: realIndex }), "t", "s1");
    assert.equal(state?.status, "complete");
    // Close every socket and construct a new client: a second store over the same client is
    // not persistence/reconnection evidence. This is not a database-server restart claim.
    await client.close(); connected = false;
    client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
    await client.connect(); connected = true; db = client.db(database);
    const restarted = createMongoReviewStore(db);
    store = restarted;
    assert.equal((await loadReview(restarted, "t", "s1")).snapshot.revision, receipt.revision);
    assert.equal((await loadReviewHistory(restarted, "t", "s1"))[0]!.changes[0]!.after.text, TEXT);
    assert.equal((await db.collection("turns").findOne({ _id: "t1" } as never))!.text, original.text);
    assert.equal((await readEffectiveTurns(db, "t", [original], "s1"))[0]!.text, TEXT);
    assert.equal(await db.collection("claims").countDocuments({ _id: "reviewed", status: "verified" } as never), 1);
    for (const name of ["session_pages", "chunks", "tree_index", "graph_edges"]) assert.ok(await db.collection(name).countDocuments({ tenantId: "t" }));
    const content = await createGroundedContentDeps({ async getSessionDetail(tenantId, sessionId) {
      const turns = await db.collection("turns").find({ tenantId, sessionId }).toArray();
      return { session: await db.collection("sessions").findOne({ _id: sessionId, tenantId } as never),
        page: await db.collection("session_pages").findOne({ tenantId, sessionId }), claims: await db.collection("claims").find({ tenantId, "evidence.sessionId": sessionId }).toArray(),
        turns: await readEffectiveTurns(db, tenantId, turns as never, sessionId) } as never;
    } }).getGroundedContent("t", "s1");
    assert.ok(content?.notes.length); assert.ok(content!.notes.every((n) => n.evidence.every((e) => e.available && e.quote === TEXT && e.speaker === "Mapped speaker")));
    // Begin another refresh but supersede its revision while its real indexer has written only
    // inside the transaction. The revision-head write conflict must abort all those writes.
    const prior = await commitReview(store, request(receipt.revision, TEXT + " This is the current fee."));
    const before = await Promise.all(["session_pages", "chunks", "tree_index", "graph_edges"].map((name) => db.collection(name).find({ tenantId: "t" }).toArray()));
    let superseded = false;
    const executor = createTranscriptRefreshExecutor({ db, index: async (tenant, session, view) => {
      const result = await realIndex(tenant, session, view);
      if (!superseded) { superseded = true; await commitReview(store, request(prior.revision, TEXT + " Ask the office for confirmation.")); }
      return result;
    } });
    await assert.rejects(executor({ tenantId: "t", sessionId: "s1", revision: prior.revision, target: "claims" }));
    const after = await Promise.all(["session_pages", "chunks", "tree_index", "graph_edges"].map((name) => db.collection(name).find({ tenantId: "t" }).toArray()));
    assert.deepEqual(after, before, "superseded generation never replaces committed derived knowledge");
    assert.equal((await loadReview(store, "t", "s1")).refresh?.status, "pending");
  } finally { try { if (connected) await db.dropDatabase(); } finally { await client.close(); } }
});
