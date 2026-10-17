/** Explicit opt-in isolated replica-set proof; never provision Mongo or use configured production DBs. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { insertSuggestionsIfAbsent, scopedCollection } from "@lkb/db";
import { publicPreservedReviewFixture } from "../public-preserved-review.fixture.js";
import { indexSession } from "../session.js";
import { createMongoReviewStore, headId, type ReviewHead } from "../../transcript-review/store.js";
import { createNativeSuggestionPublication, mutateNativeCaptureSource } from "./publication.js";
import type { NativeCurrentPublicationBinding } from "./binding.js";
import type { SpeakerSuggestions } from "@lkb/core";

const url = process.env.LKB_NATIVE_PUBLICATION_MONGO_URL;
const base = process.env.LKB_NATIVE_PUBLICATION_MONGO_DB;
const enabled = process.env.LKB_NATIVE_PUBLICATION_MONGO_RUN === "1" && !!url && !!base && /^native_publication_test_[a-z0-9_-]+$/.test(base);
const owner = { tenantId: "tenant-a", sessionId: "session-a", sourceId: "source-a" };
test("real replica-set: complete publication, first review race, revocation and failed batch rollback", { skip: !enabled, timeout: 60000 }, async () => {
  assert.ok(url && base && /^native_publication_test_[a-z0-9_-]+$/.test(base));
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  const name = `${base}_${randomUUID().replaceAll("-", "")}`, db = client.db(name);
  let connected = false;
  try {
    await client.connect(); connected = true;
    const topology = await db.command({ hello: 1 });
    assert.ok(typeof topology.setName === "string", "requires actual replica-set transaction support");
    const f = publicPreservedReviewFixture();
    f.rows("sources")[0]!.captureConsent = { sessionId: owner.sessionId, generation: "capture-a", receiptSha256: "a".repeat(64), sanitizedAudioSha256: f.rows("sources")[0]!.hash };
    await indexSession(owner.tenantId, owner.sessionId, f.deps);
    for (const collection of ["sources", "sessions", "turns", "claims", "chunks", "session_pages", "tree_index", "graph_edges", "topics", "orgs", "gaps", "decisions"]) {
      if (f.rows(collection).length) await db.collection(collection).insertMany(f.rows(collection) as never);
    }
    const attempt = f.rows("sessions")[0]!.indexAttempt as Record<string, string>;
    const binding: NativeCurrentPublicationBinding = { ...owner, generation: attempt.generation!, turnDigest: attempt.turnDigest!,
      reviewRevision: null, captureGeneration: "capture-a", receiptSha256: "a".repeat(64), sourceSha256: "b".repeat(64), sidecarSha256: "c".repeat(64) };
    const doc: SpeakerSuggestions = { _id: "native-test-a", tenantId: owner.tenantId, sessionId: owner.sessionId,
      speakerRef: "spk:0", personId: "person:fixture", displayName: "Synthetic Fixture", status: "suggested",
      provenance: [{ turnId: "t1", evidenceQuote: "Synthetic software fixture", evidenceKind: "tile" }],
      evidence: [{ turnId: "t1", sessionId: owner.sessionId }], suggestedAt: "2026-10-15T00:00:00Z" };
    const publication = createNativeSuggestionPublication(db, binding, async () => {});
    assert.equal(await publication.write(tx => insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, [doc], tx)), 1);
    assert.equal(await publication.write(tx => insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, [doc], tx)), 0);
    await assert.rejects(publication.write(async tx => {
      await insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, [{ ...doc, _id: "rollback" }], tx);
      throw new Error("synthetic batch failure");
    }), /batch failure/);
    assert.equal(await db.collection("speaker_suggestions").countDocuments({ tenantId: owner.tenantId, _id: "rollback" } as never), 0);

    let reached!: () => void, release!: () => void;
    const paused = new Promise<void>(r => { reached = r; }), resume = new Promise<void>(r => { release = r; });
    let once = true;
    const delayed = new Proxy(db, { get(target, property) {
      if (property !== "collection") { const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; }
      return (collection: string) => {
        const raw = target.collection(collection);
        return new Proxy(raw, { get(coll, method) {
          if (method === "findOne" && collection === "transcript_reviews") return async (...args: Parameters<typeof raw.findOne>) => {
            const value = await raw.findOne(...args);
            if (once && args[1]?.session) { once = false; reached(); await resume; }
            return value;
          };
          const value = Reflect.get(coll, method, coll); return typeof value === "function" ? value.bind(coll) : value;
        } });
      };
    } }) as Db;
    const racing = createNativeSuggestionPublication(delayed, binding, async () => {})
      .write(tx => insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, [{ ...doc, _id: "first-review-race" }], tx));
    // Attach rejection handling immediately while another client transaction wins the barrier.
    const raceResult = racing.then(() => false, () => true);
    await paused;
    const head: ReviewHead = { _id: headId(owner.tenantId, owner.sessionId), tenantId: owner.tenantId, sessionId: owner.sessionId,
      revision: "first", parentRevision: "base", overlay: [], audit: { actorRef: "synthetic-test", reviewedAt: "2026-10-15T00:00:00Z", reason: "fixture", changes: [] },
      refresh: { status: "pending", revision: "first", targets: [], completed: [] }, committedAt: "2026-10-15T00:00:00Z" };
    try { assert.equal(await createMongoReviewStore(db).insertHead(owner.tenantId, head), true); } finally { release(); }
    assert.equal(await raceResult, true);
    assert.equal(await db.collection("speaker_suggestions").countDocuments({ tenantId: owner.tenantId, _id: "first-review-race" } as never), 0);
    await mutateNativeCaptureSource(db, owner, async tx => {
      await scopedCollection<any>(tx, "sources")(owner.tenantId).updateOne({ _id: owner.sourceId }, { $set: { "consent.given": false } });
    });
    await assert.rejects(publication.write(tx => insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, [{ ...doc, _id: "revoked" }], tx)));
    assert.equal(await db.collection("speaker_suggestions").countDocuments({ tenantId: owner.tenantId, _id: "revoked" } as never), 0);
  } finally {
    if (connected) { assert.match(name, /^native_publication_test_[a-z0-9_-]+$/); await db.dropDatabase(); }
    await client.close();
  }
});
