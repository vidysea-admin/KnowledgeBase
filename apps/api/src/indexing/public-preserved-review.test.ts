/** Public synthetic acceptance: actual writer/reader, without authentic human semantic gold. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claims, Sessions } from "@lkb/core";
import { runtimeExtractive } from "@lkb/index";
import { indexSession } from "./session.js";
import { indexArtifactRef, verifyIndexGeneration } from "./generation.js";
import { publicPreservedReviewFixture, PUBLIC_REVIEW_CLAIM, PUBLIC_REVIEW_PARAPHRASE } from "./public-preserved-review.fixture.js";

test("public exact T040 reviewed fee paraphrase survives actual grounded writer and current generation reader", async () => {
  const f = publicPreservedReviewFixture();
  const before = structuredClone(PUBLIC_REVIEW_CLAIM);
  const sourceBefore = structuredClone(f.rows("sources")); const turnsBefore = structuredClone(f.rows("turns"));
  const result = await indexSession("tenant-a", "session-a", f.deps);
  assert.equal(result.completion?.complete, true); assert.equal(result.completion?.strict, true);
  assert.equal(result.groundedNotes?.claims?.preserved, 1);
  const stored = f.rows("claims").find(row => row._id === before._id)!;
  assert.equal(stored.text, before.text); assert.equal(stored.status, before.status);
  assert.deepEqual(stored.evidence, before.evidence); assert.equal(stored.indexArtifact, undefined);
  assert.deepEqual(f.rows("sources"), sourceBefore); assert.deepEqual(f.rows("turns"), turnsBefore);
  const session = f.rows("sessions")[0] as unknown as Sessions;
  assert.deepEqual(session.indexAttempt!.manifest!.preservedClaims, [indexArtifactRef(before)]);
  const generated = f.rows("claims").filter(row => row._id !== before._id);
  assert.ok(generated.length > 0); assert.ok(generated.every(row => row.status === "needs-review" && row.text !== before.text));
  const count = f.writes.length;
  assert.deepEqual(await verifyIndexGeneration(f.db, "tenant-a", "session-a", result.completion!.generation), {
    generation: result.completion!.generation, sessionId: "session-a", sourceId: "source-a", strict: true, turnCount: 1, chunkCount: result.chunks.written,
  });
  assert.equal(f.writes.length, count); // receipt reader cannot manufacture a new proof.
});

test("public current-bound invalid reviewed evidence refuses while a detached foreign row stays unconsumed", async () => {
  const evidenceCases = [
    { label: "current invented quote", evidence: [{ turnId: "t1", sessionId: "session-a", quote: "invented quote" }] },
    { label: "current missing quote", evidence: [{ turnId: "t1", sessionId: "session-a" }] },
    { label: "current foreign turn", evidence: [{ turnId: "foreign-turn", sessionId: "session-a", quote: "The fee is 5000 rupees." }] },
    { label: "current plus foreign-session poison", evidence: [
      { turnId: "t1", sessionId: "session-a", quote: "The fee is 5000 rupees." },
      { turnId: "t1", sessionId: "foreign-session", quote: "The fee is 5000 rupees." },
    ] },
  ];
  for (const { label, evidence } of evidenceCases) {
    const f = publicPreservedReviewFixture(); f.rows("claims")[0]!.evidence = evidence;
    const before = structuredClone(f.rows("claims"));
    await assert.rejects(indexSession("tenant-a", "session-a", f.deps), /quote|evidence/, label);
    assert.deepEqual(f.rows("claims"), before);
    for (const name of ["session_pages", "chunks", "tree_index"]) assert.equal(f.rows(name).length, 0);
    assert.equal(await verifyIndexGeneration(f.db, "tenant-a", "session-a"), null);
  }
  // Retain the original RED case. Ownership is evidence.sessionId; this detached
  // row is unrelated to the current session, so aborting its index was a wrong oracle.
  // The mixed case above stays current-bound and cannot conceal a foreign quote.
  const f = publicPreservedReviewFixture();
  f.rows("claims")[0]!.evidence = [{ turnId: "t1", sessionId: "foreign-session", quote: "The fee is 5000 rupees." }];
  const detached = structuredClone(f.rows("claims")[0]!);
  const result = await indexSession("tenant-a", "session-a", f.deps);
  assert.equal(result.completion!.complete, true);
  const stored = f.rows("claims").find(row => row._id === detached._id)!;
  assert.deepEqual(stored, detached); assert.equal(stored.indexArtifact, undefined);
  const session = f.rows("sessions")[0] as unknown as Sessions;
  assert.ok(!session.indexAttempt!.manifest!.preservedClaims.some(ref => ref.id === detached._id));
  assert.ok(!session.indexAttempt!.manifest!.claims.some(ref => ref.id === detached._id));
  assert.ok(await verifyIndexGeneration(f.db, "tenant-a", "session-a", result.completion!.generation));
});

test("public completed reviewed receipt refuses edited canonical digest and changed current source provenance", async () => {
  const f = publicPreservedReviewFixture(); const result = await indexSession("tenant-a", "session-a", f.deps);
  const generation = result.completion!.generation;
  const claim = f.rows("claims").find(row => row._id === "claim1")!;
  const savedClaim = structuredClone(claim); const turn = f.rows("turns")[0]!; const savedTurn = structuredClone(turn);
  for (const patch of [{ text: "Edited canonical paraphrase." }, { status: "conflicting" }, { evidence: [{ turnId: "t1", sessionId: "session-a", quote: "invented quote" }] }]) {
    Object.assign(claim, patch);
    assert.equal(await verifyIndexGeneration(f.db, "tenant-a", "session-a", generation), null);
    Object.assign(claim, structuredClone(savedClaim));
    assert.ok(await verifyIndexGeneration(f.db, "tenant-a", "session-a", generation));
  }
  for (const patch of [{ text: "The fee is 6000 rupees." }, { speakerRef: "person:other" }, { tStart: 13 }, { tEnd: 25 }, { tenantId: "tenant-b" }]) {
    Object.assign(turn, patch);
    assert.equal(await verifyIndexGeneration(f.db, "tenant-a", "session-a", generation), null);
    Object.assign(turn, structuredClone(savedTurn));
    assert.ok(await verifyIndexGeneration(f.db, "tenant-a", "session-a", generation));
  }
  assert.equal(await verifyIndexGeneration(f.db, "tenant-b", "session-a", generation), null);
});

test("public freshly generated fee paraphrase fails the extractive gate despite synthetic same judge", async () => {
  const f = publicPreservedReviewFixture({ preserveReview: false, generatedParaphrase: true });
  assert.throws(() => runtimeExtractive(PUBLIC_REVIEW_PARAPHRASE, PUBLIC_REVIEW_CLAIM.evidence as Parameters<typeof runtimeExtractive>[1]), /adds or changes source facts/);
  await assert.rejects(indexSession("tenant-a", "session-a", f.deps), /strict webinar index incomplete/);
  for (const name of ["session_pages", "claims", "chunks", "tree_index"]) assert.equal(f.rows(name).length, 0);
  assert.ok(!f.rows("claims").some(row => (row as unknown as Claims).text === PUBLIC_REVIEW_PARAPHRASE));
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", "session-a"), null);
});
