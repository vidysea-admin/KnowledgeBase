import test from "node:test";
import assert from "node:assert/strict";
import type { Sources } from "@lkb/core";
import { createNativeArchiveBindingReader, type NativeCurrentCaptureSnapshot } from "./native-archive-binding.js";
import { publicPreservedReviewFixture } from "./public-preserved-review.fixture.js";
import { indexSession } from "./session.js";
import { notifyIndexCommitted } from "./post-commit.js";
import { headId } from "../transcript-review/store.js";

const owner = { tenantId: "tenant-a", sessionId: "session-a", sourceId: "source-a" };
async function fixture() {
  const f = publicPreservedReviewFixture();
  const source = f.rows("sources")[0]!;
  source.captureConsent = { sessionId: owner.sessionId, generation: "capture-generation",
    receiptSha256: "a".repeat(64), sanitizedAudioSha256: source.hash };
  const capture: NativeCurrentCaptureSnapshot = { source: structuredClone(source) as unknown as Sources,
    binding: { ...owner, captureGeneration: "capture-generation", receiptSha256: "a".repeat(64),
      sourceSha256: "b".repeat(64), sidecarSha256: "c".repeat(64) } };
  await indexSession(owner.tenantId, owner.sessionId, f.deps);
  return { ...f, capture };
}
test("actual index and post-commit readback join source/effective transcript/current capture", async () => {
  const f = await fixture();
  const reader = createNativeArchiveBindingReader(f.db, async () => structuredClone(f.capture));
  let calls = 0;
  assert.equal(await notifyIndexCommitted(f.db, owner.tenantId, owner.sessionId, async binding => {
    calls++;
    const result = await reader.read(binding);
    assert.ok(result);
    assert.equal(result.binding.generation, binding.generation);
    assert.equal(result.binding.turnDigest, binding.turnDigest);
    assert.equal(result.binding.reviewRevision, null);
    assert.equal(result.turns.length, 1);
  }), "notified");
  assert.equal(calls, 1);
  assert.equal(await reader.read({ ...owner, tenantId: "foreign" }), null);
  assert.equal(await reader.read({ ...owner, sourceId: "missing" }), null);
});
test("missing source remains pending and changed receipt/generation never gains read authority", async () => {
  for (const change of ["receipt", "capture-generation", "index-generation", "source", "effective-turn"] as const) {
    const f = await fixture();
    const reader = createNativeArchiveBindingReader(f.db, async () => structuredClone(f.capture));
    assert.ok(await reader.read(owner));
    if (change === "receipt") f.capture.binding.receiptSha256 = "d".repeat(64);
    if (change === "capture-generation") f.capture.binding.captureGeneration = "changed";
    if (change === "index-generation") (f.rows("sessions")[0]!.indexAttempt as Record<string, unknown>).state = "running";
    if (change === "source") f.rows("sources").splice(0);
    if (change === "effective-turn") f.rows("turns")[0]!.text = "changed effective transcript";
    assert.equal(await reader.read(owner), null, change);
  }
});
test("capture readback race and incomplete review refuse after a valid index", async () => {
  const f = await fixture(); let reads = 0;
  const reader = createNativeArchiveBindingReader(f.db, async () => {
    const capture = structuredClone(f.capture);
    if (++reads > 1) capture.binding.sidecarSha256 = "d".repeat(64);
    return capture;
  });
  assert.equal(await reader.read(owner), null);
  f.rows("transcript_reviews").push({ _id: headId(owner.tenantId, owner.sessionId), tenantId: owner.tenantId,
    sessionId: owner.sessionId, revision: "new", refresh: { status: "pending", revision: "new", targets: [], completed: [] }, overlay: [] });
  assert.equal(await createNativeArchiveBindingReader(f.db, async () => f.capture).read(owner), null);
});
