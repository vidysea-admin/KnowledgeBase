import test from "node:test";
import assert from "node:assert/strict";
import type { SpeakerSuggestions } from "@lkb/core";
import { insertSuggestionsIfAbsent, scopedCollection } from "@lkb/db";
import { indexSession } from "../session.js";
import { publicPreservedReviewFixture } from "../public-preserved-review.fixture.js";
import { transactionalFixture } from "../../transcript-review/refresh-testkit.js";
import { createMongoReviewStore, headId, type ReviewHead } from "../../transcript-review/store.js";
import { createNativeSuggestionPublication, mutateNativeCaptureSource } from "./publication.js";
import type { NativeCurrentPublicationBinding } from "./binding.js";

const owner = { tenantId: "tenant-a", sessionId: "session-a", sourceId: "source-a" };
const doc: SpeakerSuggestions = { _id: "tile-a", ...owner, speakerRef: "spk:0", personId: "person:example",
  displayName: "Synthetic Example", status: "suggested", provenance: [{ turnId: "t1", evidenceQuote: "Synthetic tile fixture", evidenceKind: "tile" }],
  evidence: [{ turnId: "t1", sessionId: owner.sessionId }], suggestedAt: "2026-10-15T00:00:00Z" };
const firstHead = (): ReviewHead => ({ _id: headId(owner.tenantId, owner.sessionId), tenantId: owner.tenantId, sessionId: owner.sessionId,
  revision: "review-1", parentRevision: "base", overlay: [], audit: { actorRef: "synthetic-test", reviewedAt: "2026-10-15T00:00:00Z", reason: "fixture", changes: [] },
  refresh: { status: "pending", revision: "review-1", targets: ["claims", "session-page", "chunks", "tree", "graph"], completed: [] }, committedAt: "2026-10-15T00:00:00Z" });

async function fixture() {
  const f = publicPreservedReviewFixture();
  f.rows("sources")[0]!.captureConsent = { sessionId: owner.sessionId, generation: "capture-a", receiptSha256: "a".repeat(64), sanitizedAudioSha256: f.rows("sources")[0]!.hash };
  await indexSession(owner.tenantId, owner.sessionId, f.deps);
  const h = transactionalFixture();
  for (const name of ["sources", "sessions", "turns", "claims", "chunks", "session_pages", "tree_index", "graph_edges", "topics", "orgs", "gaps", "decisions"]) {
    for (const row of f.rows(name)) h.seed(name, row);
  }
  const attempt = h.rows("sessions")[0]!.indexAttempt;
  const binding: NativeCurrentPublicationBinding = { ...owner, generation: attempt.generation, turnDigest: attempt.turnDigest,
    reviewRevision: null, captureGeneration: "capture-a", receiptSha256: "a".repeat(64), sourceSha256: "b".repeat(64), sidecarSha256: "c".repeat(64) };
  const publication = createNativeSuggestionPublication(h.db, binding, async () => {});
  const publish = (docs = [doc]) => publication.write(tx => insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, docs, tx));
  return { h, binding, publication, publish };
}

test("real batch accessor commits a stamped suggestion and a real session increment; duplicate leaves row intact", async () => {
  const f = await fixture();
  assert.equal(await f.publish(), 1);
  assert.equal(f.h.rows("sessions")[0]!.nativePublicationRevision, 1);
  assert.equal(f.h.rows("speaker_suggestions")[0]!.nativePublication.generation, f.binding.generation);
  const before = structuredClone(f.h.rows("speaker_suggestions"));
  assert.equal(await f.publish(), 0);
  assert.deepEqual(f.h.rows("speaker_suggestions"), before);
  assert.equal(f.h.rows("speakers").length, 0);
  assert.ok(f.h.calls.filter(c => c.collection === "speaker_suggestions").every(c => c.transaction));
});

test("concurrent actual first review insert wins; entire publication rolls back", async () => {
  const f = await fixture();
  f.h.onBeforeCommit(async () => { assert.equal(await createMongoReviewStore(f.h.db).insertHead(owner.tenantId, firstHead()), true); });
  await assert.rejects(f.publish(), /WriteConflict/);
  assert.equal(f.h.rows("speaker_suggestions").length, 0);
  assert.equal(f.h.rows("transcript_reviews").length, 1);
  assert.equal(f.h.rows("sessions")[0]!.nativePublicationRevision, 1);
});

test("replacement and every refresh state update participate in the same session fence", async () => {
  const f = await fixture(), store = createMongoReviewStore(f.h.db);
  assert.equal(await store.insertHead(owner.tenantId, firstHead()), true);
  const next = { ...firstHead(), revision: "review-2" };
  assert.equal(await store.replaceHead(owner.tenantId, "review-1", next), true);
  assert.equal(await store.setRefresh(owner.tenantId, owner.sessionId, "review-2", { status: "failed", revision: "review-2", targets: [], completed: [] }), true);
  assert.equal(f.h.rows("sessions")[0]!.nativePublicationRevision, 3);
  assert.equal(await store.replaceHead(owner.tenantId, "review-1", firstHead()), false);
  assert.equal(f.h.rows("sessions")[0]!.nativePublicationRevision, 3, "losing CAS must roll back increment");
});

test("DB-first consent revocation conflicts with in-flight publication; callback failure restores prior source", async () => {
  const f = await fixture();
  f.h.onBeforeCommit(() => mutateNativeCaptureSource(f.h.db, owner, async tx => {
    await scopedCollection<any>(tx, "sources")(owner.tenantId).updateOne({ _id: owner.sourceId }, { $set: { "consent.given": false } });
  }));
  await assert.rejects(f.publish(), /WriteConflict/);
  assert.equal(f.h.rows("sources")[0]!.consent.given, false);
  assert.equal(f.h.rows("sessions")[0]!.status.index, "pending");
  assert.equal(f.h.rows("speaker_suggestions").length, 0);
  const sourceBefore = structuredClone(f.h.rows("sources"));
  await assert.rejects(mutateNativeCaptureSource(f.h.db, owner, async tx => {
    await scopedCollection<any>(tx, "sources")(owner.tenantId).updateOne({ _id: owner.sourceId }, { $set: { hash: "changed" } });
    throw new Error("swap failed");
  }), /swap failed/);
  assert.deepEqual(f.h.rows("sources"), sourceBefore);
});

test("second batch insert failure, stale binding, malformed/overflow fence, shared owner and unsupported transaction refuse", async () => {
  const f = await fixture();
  await assert.rejects(f.publication.write(async tx => {
    await insertSuggestionsIfAbsent(owner.tenantId, owner.sessionId, [doc], tx);
    throw new Error("second insert failed");
  }), /second insert failed/);
  assert.equal(f.h.rows("speaker_suggestions").length, 0);
  for (const counter of [-1, "forged", Number.MAX_SAFE_INTEGER]) {
    f.h.rows("sessions")[0]!.nativePublicationRevision = counter;
    await assert.rejects(f.publish());
  }
  delete f.h.rows("sessions")[0]!.nativePublicationRevision;
  f.h.seed("sessions", { ...f.h.rows("sessions")[0], _id: "other-owner" });
  await assert.rejects(f.publish());
  const standalone = await fixture(); standalone.h.refuseTransactions();
  await assert.rejects(standalone.publish(), /unsupported/i);
  assert.equal(standalone.h.rows("speaker_suggestions").length, 0);
});

test("caller-forged reserved publication metadata is refused before insertion", async () => {
  const f = await fixture();
  await assert.rejects(f.publish([{ ...doc, nativePublication: { sourceId: "forged" } } as never]));
  assert.equal(f.h.rows("speaker_suggestions").length, 0);
});

test("source swap refuses caller reset of server-owned revision and rolls back", async () => {
  const f = await fixture();
  await assert.rejects(mutateNativeCaptureSource(f.h.db, owner, async tx => {
    await scopedCollection<any>(tx, "sessions")(owner.tenantId).updateOne({ _id: owner.sessionId }, { $set: { nativePublicationRevision: 0 } });
  }));
  assert.equal(f.h.rows("sessions")[0]!.nativePublicationRevision, undefined);
  assert.equal(f.h.rows("sessions")[0]!.status.index, "done");
});
