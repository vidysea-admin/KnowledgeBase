import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { ClientSession, Db, TransactionOptions } from "mongodb";
import type { Claims, Sessions, Sources, Turns } from "@lkb/core";
import { requireAuth } from "../auth.js";
import { fakeKeyStore } from "../fixtures.js";
import { createMongoWhatsAppReviewRepository } from "../whatsapp/review/store.js";
import { detectWhatsAppReviewCandidates, type WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { materializeWhatsAppClaim, whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "../whatsapp/review/test-fixtures.js";
import { headId, type ReviewHead } from "../transcript-review/store.js";
import { createMongoWhatsAppReviewSourceReader, createWhatsAppReviewSourceRouter, ReviewSourceStaleError } from "./review-source.js";

async function fixture() {
  const input = reviewInput(), sibling = { ...input.turns[0]!, _id: "unrelated-turn", text: "PRIVATE unrelated sibling" };
  input.turns = [...input.turns, sibling];
  // Native publication (run by the real materializer) requires explicit current source consent.
  input.source = { ...input.source, consent: { given: true, recordedBy: "owner" } } as typeof input.source;
  const f = reviewMongoFixture([input, reviewInput("OTHER TENANT SECRET", "tenant-b")]);
  const candidate = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const repository = createMongoWhatsAppReviewRepository(f.db, { materialize: materializeWhatsAppClaim, now: () => REVIEW_TIME });
  await repository.insert("tenant-a", [candidate]);
  return { ...f, input, candidate, repository, reader: createMongoWhatsAppReviewSourceReader(f.db),
    get: () => createMongoWhatsAppReviewSourceReader(f.db).get("tenant-a", candidate._id) };
}
test("pending reviewer source is exact projected evidence, not raw session/siblings or trusted authorization", async () => {
  const f = await fixture();
  await f.db.collection<Sessions>("sessions").updateOne({ tenantId: "tenant-a", _id: "session-a" }, { $set: { title: "PRIVATE group title", participants: ["PRIVATE member"] } });
  const source = await f.get(); assert.ok(source);
  assert.equal(source.status, "needs-review"); assert.equal(source.evidence[0]!.quote, f.input.turns[0]!.text);
  assert.deepEqual(Object.keys(source).sort(), ["candidateId", "evidence", "kind", "sessionId", "status", "text"]);
  assert.deepEqual(Object.keys(source.evidence[0]!).sort(), ["occurredAt", "quote", "sessionId", "speakerLabel", "speakerRef", "turnId"]);
  assert.ok(!JSON.stringify(source).includes("PRIVATE")); assert.ok(!JSON.stringify(source).includes("OTHER TENANT"));
  assert.equal(f.rows("claims").length, 0);
  assert.ok(f.calls.filter(c => c.operation === "findOne" || c.operation === "find").every(c => c.filter.tenantId === "tenant-a"));
});
test("real repository approval/materialization permits current reviewer evidence; withdrawn claim refuses", async () => {
  const f = await fixture(); assert.equal((await f.repository.decide("tenant-a", f.candidate._id, "approved", "reviewer")).result, "ok");
  assert.equal((await f.get())!.status, "approved");
  await f.db.collection<Claims>("claims").updateOne({ tenantId: "tenant-a", _id: whatsAppClaimId(f.candidate._id) }, { $set: { status: "needs-review" } });
  await assert.rejects(f.get(), ReviewSourceStaleError);
});
test("foreign tenant, invalid identity and rejected candidate disclose no source", async () => {
  const f = await fixture();
  assert.equal(await f.reader.get("tenant-b", f.candidate._id), null);
  assert.equal(await f.reader.get("tenant-a", "bad-id"), null);
  assert.equal((await f.repository.decide("tenant-a", f.candidate._id, "rejected", "reviewer")).result, "ok");
  assert.equal(await f.get(), null);
});
test("source/raw/effective changes, upstream deletion and pending invalidation refuse old evidence", async () => {
  for (const change of ["text", "speaker", "time", "source", "deleted", "effective", "marker", "consent", "redacted"]) {
    const f = await fixture();
    if (change === "text") f.replaceTurn({ ...f.input.turns[0]!, text: "CHANGED" });
    if (change === "speaker") f.replaceTurn({ ...f.input.turns[0]!, speakerLabel: "Someone else" });
    if (change === "time") f.replaceTurn({ ...f.input.turns[0]!, occurredAt: "2026-10-15T10:00:00.000Z" });
    if (change === "deleted") f.removeTurn("turn-a");
    if (change === "source") await f.db.collection<Sources>("sources").updateOne({ tenantId: "tenant-a", _id: f.input.source._id }, { $set: { kind: "document" } });
    if (change === "consent") await f.db.collection<Sources>("sources").updateOne({ tenantId: "tenant-a", _id: f.input.source._id }, { $set: { consent: { given: false, recordedBy: "owner" } } });
    if (change === "redacted") await f.db.collection<WhatsAppReviewCandidate>("whatsapp_candidates").updateOne({ tenantId: "tenant-a", _id: f.candidate._id }, { $set: { text: "[redacted: message deleted upstream]" } });
    if (change === "marker") await f.db.collection<{ _id: string; tenantId: string; kind: string; groupJid: string }>("whatsapp_review_log").updateOne({ tenantId: "tenant-a", _id: "marker" }, { $set: { kind: "pending-invalidation", groupJid: "group@g.us" } }, { upsert: true });
    if (change === "effective") await f.db.collection<ReviewHead>("transcript_reviews").updateOne({ tenantId: "tenant-a", _id: headId("tenant-a", "session-a") }, { $set: {
      sessionId: "session-a", overlay: [{ turnId: "turn-a", text: "CORRECTED PRIVATE", speakerRef: "person-a", speakerLabel: "Expert" }],
    } }, { upsert: true });
    await assert.rejects(f.get(), ReviewSourceStaleError, change);
    if (change === "effective") {
      // Capture the reader's calls before issuing a positive fixture query: the
      // latch must be reached by the actual effective reader, not this assertion.
      const physicalReads = f.calls.filter(call => call.collection === "turns" && call.operation === "find"
        && call.filter.tenantId === "tenant-a" && call.filter.sessionId === "session-a"
        && JSON.stringify(call.filter._id) === JSON.stringify({ $in: ["turn-a"] }));
      assert.ok(physicalReads.length > 0, "effective reader must reach the scoped physical turn query");
      const physical = await f.db.collection<Turns>("turns").find({ tenantId: "tenant-a", sessionId: "session-a", _id: { $in: ["turn-a"] } }).toArray();
      assert.deepEqual(physical, [f.input.turns[0]!], "correction refuses the effective quote while physical evidence remains unchanged");
      assert.deepEqual(await f.db.collection<Turns>("turns").find({ tenantId: "tenant-a", sessionId: "session-a", _id: { $in: [] } }).toArray(), []);
      assert.deepEqual(await f.db.collection<Turns>("turns").find({ tenantId: "tenant-a", sessionId: "session-a", _id: { $in: ["turn-a"], $ne: "turn-a" } }).toArray(), [],
        "mixed operators must retain the previous unsupported equality behavior");
    }
  }
});
test("attachment source exposes bound metadata and message evidence only, not file bytes", async () => {
  const input = { ...reviewInput(), attachments: [{ turnId: "turn-a", name: "deadlines.pdf", mimeType: "application/pdf" }] };
  const f = reviewMongoFixture([input]); const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME).find(c => c.kind === "attachment")!;
  await createMongoWhatsAppReviewRepository(f.db).insert("tenant-a", [row]);
  const source = await createMongoWhatsAppReviewSourceReader(f.db).get("tenant-a", row._id);
  assert.deepEqual(source!.attachment, { name: "deadlines.pdf", mimeType: "application/pdf" });
  assert.equal(source!.evidence[0]!.quote, input.turns[0]!.text); assert.equal(Object.hasOwn(source!, "url"), false);
});
test("effective redaction during the last candidate consistency lookup refuses unchanged candidate JSON", async () => {
  const f = await fixture(); let loads = 0;
  const db = { client: f.db.client, collection(name: string) {
    const collection = f.db.collection(name);
    return { ...collection, async findOne(filter: Record<string, unknown>) {
      const row = await collection.findOne(filter);
      if (name === "whatsapp_candidates" && ++loads === 2) await f.db.collection<ReviewHead>("transcript_reviews").updateOne(
        { tenantId: "tenant-a", _id: headId("tenant-a", "session-a") }, { $set: {
          sessionId: "session-a", overlay: [{ turnId: "turn-a", text: "[redacted]", speakerRef: "person-a", speakerLabel: "Expert" }],
        } }, { upsert: true });
      return row;
    } };
  } } as unknown as Pick<Db, "collection" | "client">;
  await assert.rejects(createMongoWhatsAppReviewSourceReader(db).get("tenant-a", f.candidate._id), ReviewSourceStaleError);
  const physicalReads = f.calls.filter(call => call.collection === "turns" && call.operation === "find"
    && call.filter.tenantId === "tenant-a" && call.filter.sessionId === "session-a"
    && JSON.stringify(call.filter._id) === JSON.stringify({ $in: ["turn-a"] }));
  assert.ok(physicalReads.length > 0, "late redaction must reach the scoped physical turn query before the positive probe");
  assert.deepEqual(await f.db.collection<Turns>("turns").find({ tenantId: "tenant-a", sessionId: "session-a", _id: { $in: ["turn-a"] } }).toArray(),
    [f.input.turns[0]!], "late effective redaction must not remove or mutate physical evidence");
  assert.deepEqual(f.rows("whatsapp_candidates")[0], f.candidate, "unchanged candidate cannot establish effective source freshness");
});
test("authoritative reviewer proof pins every read to one required snapshot transaction and ends its session", async () => {
  const f = await fixture(); let active: ClientSession | null = null, transactions = 0, ended = 0, snapshotReads = 0;
  const db = { client: { startSession() {
    const underlying = f.db.client.startSession();
    const session = { async withTransaction<T>(run: () => Promise<T>, options: TransactionOptions) {
      transactions++;
      assert.ok(options.readConcern !== null && typeof options.readConcern === "object" && "level" in options.readConcern);
      assert.equal(options.readConcern.level, "snapshot");
      active = session as unknown as ClientSession;
      try { return await underlying.withTransaction(run); } finally { active = null; }
    }, async endSession() { ended++; await underlying.endSession(); } };
    return session;
  } }, collection(name: string) {
    const collection = f.db.collection(name);
    return { ...collection, async findOne(filter: Record<string, unknown>, options: { session?: ClientSession } = {}) {
      if (active) { assert.equal(options.session, active, "source/candidate/turn/head/claim/marker read must share snapshot"); snapshotReads++; }
      return collection.findOne(filter, options);
    }, find(filter: Record<string, unknown>, options: { session?: ClientSession } = {}) {
      if (active) { assert.equal(options.session, active); snapshotReads++; }
      return collection.find(filter, options);
    } };
  } } as unknown as Pick<Db, "collection" | "client">;
  const result = await createMongoWhatsAppReviewSourceReader(db).get("tenant-a", f.candidate._id);
  assert.equal(result?.evidence[0].quote, f.input.turns[0]!.text);
  assert.equal(transactions, 1); assert.equal(ended, 1); assert.ok(snapshotReads > 10);
});
test("collection-only reader cannot return evidence without a snapshot capability", async () => {
  const f = await fixture();
  const db = { collection: (name: string) => f.db.collection(name) } as unknown as Pick<Db, "collection" | "client">;
  await assert.rejects(createMongoWhatsAppReviewSourceReader(db).get("tenant-a", f.candidate._id), /Knowledge snapshot unavailable/);
});
test("actual authenticated HTTP source route uses whatsapp scope and fixed private errors", async () => {
  const f = await fixture(); let calls = 0, unavailable = false;
  const app = express(); app.use(requireAuth(fakeKeyStore({ WA: { tenantId: "tenant-a", scopes: ["whatsapp"] }, CIT: { tenantId: "tenant-a", scopes: ["citations"] }, OTHER: { tenantId: "tenant-b", scopes: ["whatsapp"] } })));
  app.use(createWhatsAppReviewSourceRouter({ get: async (...args) => { calls++; if (unavailable) throw new Error("PRIVATE storage error"); return f.reader.get(...args); } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  const url = `http://127.0.0.1:${addr.port}/whatsapp/review/${encodeURIComponent(f.candidate._id)}/source`;
  const get = (key: string, suffix = "") => fetch(url + suffix, { headers: { authorization: `Bearer ${key}` } });
  try {
    assert.equal((await get("bad")).status, 401); const forbidden = await get("CIT"); assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get("cache-control"), "private, no-store"); assert.equal(calls, 0);
    assert.equal((await get("OTHER")).status, 404);
    const ok = await get("WA"); assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "private, no-store");
    assert.equal((await ok.json() as { source: { candidateId: string } }).source.candidateId, f.candidate._id);
    assert.equal((await get("WA", "?tenantId=tenant-b")).status, 404);
    f.removeTurn("turn-a"); const stale = await get("WA"); assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: "review_source_stale", message: "Current source evidence could not be verified. Refresh the review queue." });
    unavailable = true; const failed = await get("WA"); assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: "review_source_unavailable", message: "Review source is unavailable" });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
