import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertWhatsAppReviewCandidateSchema } from "./validation.js";
import { detectWhatsAppReviewCandidates } from "./detection.js";
import { reviewInput, REVIEW_TIME } from "./test-fixtures.js";

test("schema-backed validation accepts canonical fixture/proposals and rejects canonical invalid fixture", () => {
  const valid = JSON.parse(readFileSync(new URL("../../../../../schema/fixtures/whatsapp_candidates/valid.json", import.meta.url), "utf8"));
  const invalid = JSON.parse(readFileSync(new URL("../../../../../schema/fixtures/whatsapp_candidates/invalid.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => assertWhatsAppReviewCandidateSchema(valid)); assert.throws(() => assertWhatsAppReviewCandidateSchema(invalid), /canonical schema/);
  for (const candidate of detectWhatsAppReviewCandidates("tenant-a", reviewInput("Topic: Scholarships. We decided Friday."), REVIEW_TIME)) assert.doesNotThrow(() => assertWhatsAppReviewCandidateSchema(candidate));
});

test("collection shape/lifecycle errors cannot cross the candidate persistence boundary", () => {
  const row = detectWhatsAppReviewCandidates("tenant-a", reviewInput(), REVIEW_TIME)[0]!;
  for (const invalid of [
    { ...row, unknown: "extra" }, { ...row, evidence: [] }, { ...row, text: "" }, { ...row, tenantId: "" },
    { ...row, status: "approved" }, { ...row, createdAt: "tomorrow" },
    { ...row, decision: { action: "rejected", actor: "reviewer", at: REVIEW_TIME } },
    { ...row, status: "approved", decision: { action: "rejected", actor: "reviewer", at: REVIEW_TIME } },
    { ...row, flags: [{ kind: "unknown", reason: "x", turnId: "turn-a" }] },
    { ...row, createdAt: "2026-02-30T10:00:00Z" }, { ...row, createdAt: "2026-01-01T25:00:00Z" },
  ]) assert.throws(() => assertWhatsAppReviewCandidateSchema(invalid), /canonical schema/);
  assert.doesNotThrow(() => assertWhatsAppReviewCandidateSchema({ ...row, status: "rejected", decision: { action: "rejected", actor: "reviewer", at: REVIEW_TIME } }));
});
