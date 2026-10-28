import { test } from "node:test";
import assert from "node:assert/strict";
import { detectWhatsAppReviewCandidates, whatsAppReviewCandidateId, whatsAppReviewContentHash } from "../../apps/api/src/whatsapp/review/detection.js";
import { createMongoWhatsAppReviewRepository } from "../../apps/api/src/whatsapp/review/store.js";
import { assertWhatsAppReviewCandidateSchema } from "../../apps/api/src/whatsapp/review/validation.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "../../apps/api/src/whatsapp/review/test-fixtures.js";

test("exact provenance edits acquire new identities even when duplicate hashes agree", () => {
  const input = reviewInput("Deadline is Friday");
  const original = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  for (const edit of [
    { text: "DEADLINE IS FRIDAY" },
    { text: "Deadline  is Friday" },
    { speakerRef: "person-other" },
    { speakerLabel: "Other speaker" },
    { occurredAt: "2026-10-14T10:01:00.000Z" },
  ]) {
    const changed = detectWhatsAppReviewCandidates("tenant-a", { ...input, turns: [{ ...input.turns[0]!, ...edit }] }, REVIEW_TIME)[0]!;
    assert.notEqual(changed._id, original._id, JSON.stringify(edit));
  }
});

test("failed materialisation removes approval and partial writes; retry preserves siblings", async () => {
  const input = reviewInput("Agenda: deadline. We agreed to submit Friday.");
  const fixture = reviewMongoFixture([input]);
  const proposals = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  const id = proposals[0]!._id;
  const fail = createMongoWhatsAppReviewRepository(fixture.db, { materialize: async ({ candidate, session }) => {
    await fixture.publish(candidate, session);
    throw new Error("materializer exploded after its write");
  } });
  assert.equal(await fail.insert("tenant-a", proposals), 3);
  await assert.rejects(fail.decide("tenant-a", id, "approved", "verified-key"), /exploded/);
  assert.equal((await fail.get("tenant-a", id))!.status, "needs-review");
  assert.equal((await fail.get("tenant-a", id))!.decision, undefined);
  assert.deepEqual(fixture.rows("published"), []);
  const good = createMongoWhatsAppReviewRepository(fixture.db, { materialize: async ({ candidate, session }) => fixture.publish(candidate, session) });
  assert.equal((await good.decide("tenant-a", id, "approved", "verified-key")).result, "ok");
  assert.equal(fixture.rows("published").length, 1);
  assert.equal((await good.list("tenant-a")).length, 2);
  assert.equal(await good.insert("tenant-a", proposals), 0);
  assert.equal((await good.get("tenant-a", id))!.status, "approved");
  assert.equal((await good.decide("tenant-a", id, "rejected", "other-key")).result, "conflict");
  assert.equal(fixture.counts().sessions, fixture.counts().ended);
});

test("missing materializer and excluded source fail closed; rejection remains durable", async () => {
  const input = reviewInput("Personal medical details: password=abc123");
  const fixture = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  let publishes = 0;
  const store = createMongoWhatsAppReviewRepository(fixture.db, { materialize: async () => { publishes++; } });
  await store.insert("tenant-a", [row]);
  assert.equal((await store.decide("tenant-a", row._id, "approved", "verified-key")).result, "excluded");
  assert.equal(publishes, 0);
  assert.equal((await store.decide("tenant-a", row._id, "rejected", "verified-key")).result, "ok");
  assert.equal(await store.insert("tenant-a", [row]), 0);
  assert.equal((await store.get("tenant-a", row._id))!.status, "rejected");
  const publicInput = reviewInput("Public scholarship deadline", "tenant-b");
  const otherFixture = reviewMongoFixture([publicInput]);
  const other = detectWhatsAppReviewCandidates("tenant-b", publicInput, REVIEW_TIME)[0]!;
  const noPublisher = createMongoWhatsAppReviewRepository(otherFixture.db);
  await noPublisher.insert("tenant-b", [other]);
  assert.equal((await noPublisher.decide("tenant-b", other._id, "approved", "verified-key")).result, "publish_unavailable");
  assert.equal((await noPublisher.get("tenant-b", other._id))!.status, "needs-review");
});

test("tenant and stale source evidence cannot become publishable", async () => {
  const input = reviewInput();
  const fixture = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  let publishes = 0;
  const store = createMongoWhatsAppReviewRepository(fixture.db, { materialize: async () => { publishes++; } });
  await store.insert("tenant-a", [row]);
  assert.equal(await store.get("tenant-b", row._id), null);
  assert.equal((await store.decide("tenant-b", row._id, "approved", "foreign-key")).result, "not_found");
  fixture.replaceTurn({ ...input.turns[0]!, speakerLabel: "Changed attribution" });
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "verified-key"), /evidence/);
  assert.equal(publishes, 0);
  // Reads may fail closed when current source evidence changed; direct persisted state stays pending.
  assert.equal(fixture.rows("whatsapp_candidates")[0]!.status, "needs-review");
  assert.ok(fixture.calls.every(call => call.filter.tenantId === "tenant-a" || call.filter.tenantId === "tenant-b"));
});

test("unresolvable batch evidence cannot leave a partial proposal", async () => {
  const input = reviewInput();
  input.turns = [...input.turns, { ...input.turns[0]!, _id: "turn-b", text: "Second source message" }];
  const fixture = reviewMongoFixture([input]);
  const rows = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  fixture.removeTurn("turn-b");
  const store = createMongoWhatsAppReviewRepository(fixture.db);
  await assert.rejects(store.insert("tenant-a", rows), /evidence/);
  assert.deepEqual(fixture.rows("whatsapp_candidates"), []);
});

test("idempotent decision responses refuse source evidence that has subsequently vanished", async () => {
  const input = reviewInput();
  const fixture = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(fixture.db);
  await store.insert("tenant-a", [row]);
  assert.equal((await store.decide("tenant-a", row._id, "rejected", "verified-key")).result, "ok");
  fixture.removeTurn("turn-a");
  await assert.rejects(store.get("tenant-a", row._id), /evidence/);
  await assert.rejects(store.decide("tenant-a", row._id, "rejected", "verified-key"), /evidence/);
  assert.equal(fixture.rows("whatsapp_candidates")[0]!.status, "rejected");
});

test("valid-hash invented content and stripped personal/sensitive exclusions cannot be inserted", async () => {
  const input = reviewInput("Personal medical details: password=abc123");
  const fixture = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(fixture.db);
  await assert.rejects(store.insert("tenant-a", [{ ...row, flags: [] }]), /flag|proposal|source|exclu/i);
  const forged = { ...row, text: "Invented recommendation without any source support", contentHash: whatsAppReviewContentHash("Invented recommendation without any source support") };
  forged._id = whatsAppReviewCandidateId(forged);
  await assert.rejects(store.insert("tenant-a", [forged]), /source|proposal|content/i);
  assert.deepEqual(fixture.rows("whatsapp_candidates"), []);
});

test("canonical lifecycle rejects impossible timestamps and excluded approved candidates", () => {
  const row = detectWhatsAppReviewCandidates("tenant-a", reviewInput("Private medical details"), REVIEW_TIME)[0]!;
  assert.throws(() => assertWhatsAppReviewCandidateSchema({ ...row, createdAt: "2026-02-30T10:00:00Z" }), /schema/);
  assert.throws(() => assertWhatsAppReviewCandidateSchema({ ...row, status: "approved", decision: { action: "approved", actor: "verified-key", at: REVIEW_TIME } }), /schema/);
});

test("invalid injected decision time cannot persist a row outside the canonical lifecycle", async () => {
  const input = reviewInput();
  const fixture = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(fixture.db, { now: () => "2026-02-30T10:00:00Z" });
  await store.insert("tenant-a", [row]);
  await assert.rejects(store.decide("tenant-a", row._id, "rejected", "verified-key"), /time|schema/);
  assert.equal(fixture.rows("whatsapp_candidates")[0]!.status, "needs-review");
});
