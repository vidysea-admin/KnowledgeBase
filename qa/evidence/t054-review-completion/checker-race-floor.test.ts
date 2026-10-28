import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "../../../apps/api/src/transcript-review/memdb.testsupport.js";
import { seed, SESSION } from "../../../apps/api/src/transcript-review/persist.testkit.js";
import { commitReview, loadReview, ReviewServiceError } from "../../../apps/api/src/transcript-review/service.js";
import { createMongoReviewStore, type ReviewStore } from "../../../apps/api/src/transcript-review/store.js";

// Independent diagnostic, not a replacement regression or a product PASS. The original
// exact interleaving, fixture values and failing assertion are retained below. The old bytes
// remain at service-test-attempt1-source.txt, SHA256 032748F4E69A2D98E830A8E5BF68D9FEEA8F1EF04BF29AFC1D304C993802747C.
const A0 = `tenant-A-${SESSION}-t0`;
const input = (revision: string, text: string) => ({
  tenantId: "tenant-A", sessionId: SESSION, actorRef: "apikey:tenant-A", now: "2026-10-14T09:00:00.000Z",
  request: { expectedRevision: revision, reason: "Fix transcription error", corrections: [{ turnId: A0, text }] },
});

for (const later of [false, true]) test(`independent archived race floor (${later ? "reviewed" : "initial"})`, async () => {
  const m = memoryDb(); seed(m);
  const original = createMongoReviewStore(m.db);
  let revision = (await loadReview(original, "tenant-A", SESSION)).snapshot.revision;
  if (later) revision = (await commitReview(original, input(revision, "seed"))).revision;
  let intercept = true;
  let winningReceipt: Awaited<ReturnType<typeof commitReview>> | undefined;
  const store: ReviewStore = { ...original, head: async (tenant, id) => {
    const captured = await original.head(tenant, id);
    if (intercept) { intercept = false; winningReceipt = await commitReview(original, input(revision, "winning correction")); }
    return captured;
  } };
  await assert.rejects(commitReview(store, input(revision, "stale overwrite")), (e: unknown) => e instanceof ReviewServiceError && e.code === "conflict");
  assert.equal((await loadReview(original, "tenant-A", SESSION)).snapshot.turns[0]!.text, "winning correction");
  const history = await original.listRevisions("tenant-A", SESSION);
  assert.equal(history.length, later ? 2 : 1);
  let originalAssertion: "PASS" | "RED" = "PASS";
  let oldFailure: { actual?: unknown; expected?: unknown } | undefined;
  try {
    assert.equal(history.at(-1)!.parentRevision, revision);
  } catch (error) {
    assert.ok(error instanceof assert.AssertionError);
    originalAssertion = "RED";
    oldFailure = { actual: error.actual, expected: error.expected };
  }
  // Diagnostic assertions independently distinguish history order from an actual stale write.
  assert.ok(winningReceipt);
  const head = await original.head("tenant-A", SESSION);
  assert.equal(head!.revision, winningReceipt.revision);
  const winningAudit = history.find((row) => row.revision === head!.revision);
  assert.ok(winningAudit);
  assert.equal(winningAudit.parentRevision, revision);
  assert.equal(winningAudit.changes[0]!.after.text, "winning correction");
  assert.equal(history.some((row) => row.changes.some((change) => change.after.text === "stale overwrite")), false);
  if (later) {
    assert.equal(originalAssertion, "RED", "the archived RED assertion must still reproduce, not disappear");
    assert.equal(history[0]!.revision, winningReceipt.revision);
    assert.equal(history[1]!.revision, revision);
    assert.equal(history[0]!.reviewedAt, history[1]!.reviewedAt);
    assert.ok(history[0]!.revision.localeCompare(history[1]!.revision) < 0);
  } else assert.equal(originalAssertion, "PASS");
  process.stdout.write(`${JSON.stringify({ later, originalAssertion, oldFailure, loadedRevision: revision,
    winningRevision: winningReceipt.revision, headRevision: head!.revision,
    history: history.map((row) => ({ revision: row.revision, parentRevision: row.parentRevision, reviewedAt: row.reviewedAt, after: row.changes.map((change) => change.after.text) })),
    staleWriterRefused: true, staleOverwriteAuditAbsent: true })}\n`);
});
