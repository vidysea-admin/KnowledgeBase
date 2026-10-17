import { test } from "node:test";
import assert from "node:assert/strict";
import type { Sources } from "@lkb/core";
import { detectWhatsAppReviewCandidates, whatsAppReviewCandidateId, whatsAppReviewContentHash } from "./detection.js";
import { createMongoWhatsAppReviewRepository } from "./store.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "./test-fixtures.js";

test("actual Mongo adapter persists pending candidates only, then explicit per-candidate atomic publish", async () => {
  const input = reviewInput("Topic: Scholarships. We decided to close Friday."); const f = reviewMongoFixture([input]);
  const store = createMongoWhatsAppReviewRepository(f.db, { now: () => REVIEW_TIME, materialize: async c => { await f.publish(c.candidate, c.session); } });
  const proposals = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  assert.equal(await store.insert("tenant-a", proposals), 3); assert.equal(f.rows("published").length, 0);
  assert.equal((await store.list("tenant-a")).length, 3);
  const decision = await store.decide("tenant-a", proposals[0]!._id, "approved", "verified-reviewer");
  assert.equal(decision.result, "ok"); assert.equal(f.rows("published").length, 1);
  const row = await store.get("tenant-a", proposals[0]!._id);
  assert.equal(row!.status, "approved"); assert.deepEqual(row!.decision, { action: "approved", actor: "verified-reviewer", at: REVIEW_TIME });
  assert.equal((await store.list("tenant-a")).length, 2);
  assert.equal(await store.insert("tenant-a", proposals), 0); assert.equal((await store.get("tenant-a", row!._id))!.status, "approved");
  assert.deepEqual(await store.decide("tenant-a", row!._id, "approved", "other-reviewer"), { result: "ok", changed: false, candidate: row });
  assert.equal(f.rows("published").length, 1); assert.deepEqual(await store.decide("tenant-a", row!._id, "rejected", "reviewer"), { result: "conflict" });
  const update = f.calls.find(c => c.collection === "whatsapp_candidates" && c.operation === "updateOne" && c.filter.status === "needs-review");
  const publish = f.calls.find(c => c.collection === "published"); assert.equal(update!.session, publish!.session); assert.ok(update!.session);
  for (const call of f.calls) assert.equal(call.filter.tenantId, "tenant-a");
  assert.equal(f.counts().sessions, f.counts().ended);
});

test("failed materialisation rolls back decision and every publisher write; retry can then commit", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]); const proposal = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  let fail = true;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => { await f.publish(c.candidate, c.session); if (fail) throw new Error("fixture publisher failed"); } });
  await store.insert("tenant-a", [proposal]);
  await assert.rejects(store.decide("tenant-a", proposal._id, "approved", "reviewer"), /publisher failed/);
  assert.equal((await store.get("tenant-a", proposal._id))!.status, "needs-review"); assert.equal(f.rows("published").length, 0);
  fail = false; assert.equal((await store.decide("tenant-a", proposal._id, "approved", "reviewer")).result, "ok");
  assert.equal(f.rows("published").length, 1);
});

test("concurrent opposite decisions cannot both win; rejection remains a durable tombstone", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]); const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => { await f.publish(c.candidate, c.session); } });
  await store.insert("tenant-a", [row]);
  const results = await Promise.all([store.decide("tenant-a", row._id, "rejected", "reviewer"), store.decide("tenant-a", row._id, "approved", "other")]);
  assert.deepEqual(results.map(result => result.result), ["ok", "conflict"]); assert.equal(f.rows("published").length, 0);
  assert.equal(await store.insert("tenant-a", [row]), 0); assert.equal((await store.get("tenant-a", row._id))!.status, "rejected");
});

test("same natural ids across tenants cannot read, publish or mutate each other's candidates", async () => {
  const a = reviewInput(); const b = reviewInput(undefined, "tenant-b"); const f = reviewMongoFixture([a, b]);
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => { await f.publish(c.candidate, c.session); } });
  const ar = detectWhatsAppReviewCandidates("tenant-a", a, REVIEW_TIME)[0]!; const br = detectWhatsAppReviewCandidates("tenant-b", b, REVIEW_TIME)[0]!;
  await store.insert("tenant-a", [ar]); await store.insert("tenant-b", [br]);
  assert.notEqual(ar._id, br._id); assert.equal(await store.get("tenant-b", ar._id), null);
  assert.deepEqual(await store.decide("tenant-b", ar._id, "approved", "reviewer"), { result: "not_found" });
  await assert.rejects(store.insert("tenant-b", [ar]), /this tenant/);
  assert.equal((await store.get("tenant-a", ar._id))!.status, "needs-review"); assert.equal(f.rows("published").length, 0);
  const before = f.calls.length; await assert.rejects(store.list(" "), /tenantId/); assert.equal(f.calls.length, before);
});

test("excluded material, missing publisher and lost/stale source evidence fail closed", async () => {
  const input = reviewInput("Private family detail"); const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db);
  await store.insert("tenant-a", [row]); assert.deepEqual(await store.decide("tenant-a", row._id, "approved", "reviewer"), { result: "excluded" });
  const other = reviewInput(); const g = reviewMongoFixture([other]); const candidate = detectWhatsAppReviewCandidates("tenant-a", other, REVIEW_TIME)[0]!;
  const plain = createMongoWhatsAppReviewRepository(g.db); await plain.insert("tenant-a", [candidate]);
  assert.deepEqual(await plain.decide("tenant-a", candidate._id, "approved", "reviewer"), { result: "publish_unavailable" });
  g.removeTurn("turn-a"); await assert.rejects(plain.get("tenant-a", candidate._id), /exact turn/);
  await assert.rejects(plain.list("tenant-a"), /exact turn/); await assert.rejects(plain.decide("tenant-a", candidate._id, "rejected", "reviewer"), /exact turn/);
  assert.equal(g.rows("whatsapp_candidates")[0]!.status, "needs-review");
});

test("same-turn edits to exact text or attribution create fresh pending ids without inheriting review", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]); const store = createMongoWhatsAppReviewRepository(f.db);
  const first = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!; await store.insert("tenant-a", [first]);
  await store.decide("tenant-a", first._id, "rejected", "reviewer");
  input.turns = [{ ...input.turns[0]!, text: "  SCHOLARSHIP closes Friday. ", speakerLabel: "Corrected expert" }]; f.replaceTurn(input.turns[0]!);
  const changed = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!; assert.notEqual(first._id, changed._id);
  assert.equal(await store.insert("tenant-a", [changed]), 1); assert.equal((await store.get("tenant-a", changed._id))!.status, "needs-review");
  assert.equal(f.rows("whatsapp_candidates").find(row => row._id === first._id)!.status, "rejected");
});

test("direct store cannot persist forged content or strip mandatory sensitive/exclusion flags", async () => {
  const input = reviewInput("Private family detail: password=hidden"); const f = reviewMongoFixture([input]);
  const store = createMongoWhatsAppReviewRepository(f.db); const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  await assert.rejects(store.insert("tenant-a", [{ ...row, flags: [] }]), /flag missing/);
  const forged = { ...row, text: "An invented scholarship fact", contentHash: whatsAppReviewContentHash("An invented scholarship fact") };
  forged._id = whatsAppReviewCandidateId(forged);
  await assert.rejects(store.insert("tenant-a", [forged]), /not grounded/);
  assert.equal(f.rows("whatsapp_candidates").length, 0);
});

test("idempotent decision retry surfaces lost exact evidence rather than returning a stale candidate", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]); const store = createMongoWhatsAppReviewRepository(f.db);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!; await store.insert("tenant-a", [row]);
  await store.decide("tenant-a", row._id, "rejected", "reviewer"); f.removeTurn("turn-a");
  await assert.rejects(store.decide("tenant-a", row._id, "rejected", "reviewer"), /exact turn/);
});

test("verbatim checker exclusions and impossible audit clock cannot publish or change status", async () => {
  for (const text of ["Personal medical details: password=abc123", "Private medical details"]) {
    const input = reviewInput(text); const fixture = reviewMongoFixture([input]);
    const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!; let publishes = 0;
    const store = createMongoWhatsAppReviewRepository(fixture.db, { materialize: async () => { publishes++; } });
    await store.insert("tenant-a", [row]); assert.deepEqual(await store.decide("tenant-a", row._id, "approved", "verified-key"), { result: "excluded" });
    assert.equal(publishes, 0); assert.equal(fixture.rows("whatsapp_candidates")[0]!.status, "needs-review");
  }
  const input = reviewInput(); const fixture = reviewMongoFixture([input]); const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(fixture.db, { now: () => "2026-02-30T10:00:00Z" });
  await store.insert("tenant-a", [row]); await assert.rejects(store.decide("tenant-a", row._id, "rejected", "verified-key"), /time|schema/);
  assert.equal(fixture.rows("whatsapp_candidates")[0]!.status, "needs-review");
});

test("withdrawn source consent refuses proposal insertion without candidate writes", async () => {
  const input = reviewInput();
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const f = reviewMongoFixture([input]);
  await f.db.collection<Sources>("sources").updateOne({ _id: input.source._id, tenantId: "tenant-a" },
    { $set: { consent: { given: false, recordedBy: "owner" } } });
  const store = createMongoWhatsAppReviewRepository(f.db);
  await assert.rejects(store.insert("tenant-a", [row]), /source\/session evidence unavailable/);
  assert.equal(f.rows("whatsapp_candidates").length, 0);
  assert.equal(f.rows("published").length, 0);
});

test("withdrawal between proposal and approval blocks materialisation and retains pending audit state", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => { await f.publish(c.candidate, c.session); } });
  await store.insert("tenant-a", [row]);
  await f.db.collection<Sources>("sources").updateOne({ _id: input.source._id, tenantId: "tenant-a" },
    { $set: { consent: { given: false, recordedBy: "owner" } } });
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "verified-reviewer"), /source\/session evidence unavailable/);
  await assert.rejects(store.get("tenant-a", row._id), /source\/session evidence unavailable/);
  await assert.rejects(store.list("tenant-a"), /source\/session evidence unavailable/);
  assert.equal(f.rows("whatsapp_candidates")[0]!.status, "needs-review");
  assert.equal(f.rows("whatsapp_candidates")[0]!.decision, undefined);
  assert.equal(f.rows("published").length, 0);
});

test("idempotent approval retry rechecks withdrawn consent instead of confirming old trust", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => { await f.publish(c.candidate, c.session); } });
  await store.insert("tenant-a", [row]);
  assert.equal((await store.decide("tenant-a", row._id, "approved", "reviewer")).result, "ok");
  await f.db.collection<Sources>("sources").updateOne({ _id: input.source._id, tenantId: "tenant-a" },
    { $set: { consent: { given: false, recordedBy: "owner" } } });
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /source\/session evidence unavailable/);
  assert.equal(f.rows("published").length, 1, "historical row is retained; fresh trusted readers enforce withdrawal");
});
