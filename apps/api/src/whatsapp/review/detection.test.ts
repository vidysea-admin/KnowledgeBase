import { test } from "node:test";
import assert from "node:assert/strict";
import { detectWhatsAppReviewCandidates } from "./detection.js";
import { reviewInput, REVIEW_TIME } from "./test-fixtures.js";

test("ordinary source text yields one pending evidence-bearing candidate with stable identity", () => {
  const input = reviewInput(); const [row] = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  assert.equal(row!.status, "needs-review"); assert.equal(row!.kind, "claim"); assert.deepEqual(row!.flags, []);
  assert.equal(row!.evidence[0].quote, input.turns[0]!.text); assert.equal(row!.evidence[0].turnId, "turn-a");
  assert.equal(row!.evidence[0].speakerLabel, "Expert"); assert.equal(row!.evidence[0].occurredAt, input.turns[0]!.occurredAt);
  assert.equal(row!.decision, undefined);
  assert.equal(detectWhatsAppReviewCandidates("tenant-a", input, "2026-10-15T10:00:00Z")[0]!._id, row!._id);
  assert.notEqual(detectWhatsAppReviewCandidates("tenant-b", reviewInput(undefined, "tenant-b"), REVIEW_TIME)[0]!._id, row!._id);
  assert.notEqual(detectWhatsAppReviewCandidates("tenant-a", reviewInput("Changed scholarship deadline"), REVIEW_TIME)[0]!._id, row!._id);
});

test("literal topic/decision cues and real attachment metadata remain separate review candidates", () => {
  const input = reviewInput("Topic: Scholarships. We decided to close submissions Friday.");
  input.attachments = [{ turnId: "turn-a", name: "scholarship.pdf", mimeType: "application/pdf" }];
  const rows = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  assert.deepEqual(rows.map(row => row.kind), ["claim", "topic", "decision", "attachment"]);
  assert.equal(new Set(rows.map(row => row._id)).size, 4);
  assert.deepEqual(rows[3]!.attachment, { name: "scholarship.pdf", mimeType: "application/pdf" });
  for (const row of rows) { assert.equal(row.status, "needs-review"); assert.equal(row.evidence.length, 1); }
  assert.equal(detectWhatsAppReviewCandidates("tenant-a", reviewInput("We discuss scholarship eligibility."), REVIEW_TIME).length, 1);
  assert.equal(detectWhatsAppReviewCandidates("tenant-a", reviewInput("Family visa eligibility and medical college admissions"), REVIEW_TIME)[0]!.flags.length, 0);
});

test("sensitive/personal/duplicate flags include source evidence and never auto-approve", () => {
  const input = reviewInput("Private family detail: password=secret. Contact test@example.org");
  input.knownContent = [{ tenantId: "tenant-a", id: "existing-claim", text: input.turns[0]!.text }];
  const [row] = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  assert.deepEqual(row!.flags.map(flag => flag.kind), ["sensitive", "personal-excluded", "duplicate"]);
  assert.equal(row!.flags[2]!.duplicateOf, "existing-claim");
  for (const flag of row!.flags) { assert.ok(flag.reason.length > 0); assert.equal(flag.turnId, "turn-a"); }
  assert.equal(row!.status, "needs-review");
});

test("same-import and same-tenant duplicates flag but equal foreign-tenant knowledge does not", () => {
  const input = reviewInput(); input.knownContent = [{ tenantId: "tenant-b", id: "foreign", text: input.turns[0]!.text }];
  input.turns = [...input.turns, { ...input.turns[0]!, _id: "turn-b", text: "  SCHOLARSHIP  closes Friday. " }];
  const rows = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME);
  assert.equal(rows[0]!.flags.length, 0); assert.equal(rows[1]!.flags[0]!.kind, "duplicate");
  assert.equal(rows[1]!.flags[0]!.duplicateOf, "turn-a");
});

test("tenant, source/session, exact occurrence and attachment evidence mismatches refuse", () => {
  const input = reviewInput();
  assert.throws(() => detectWhatsAppReviewCandidates("tenant-b", input), /authorization/);
  assert.throws(() => detectWhatsAppReviewCandidates("", input), /tenantId/);
  assert.throws(() => detectWhatsAppReviewCandidates("tenant-a", { ...input, session: { ...input.session, sourceId: "foreign" } }), /authorization/);
  assert.throws(() => detectWhatsAppReviewCandidates("tenant-a", { ...input, turns: [{ ...input.turns[0]!, tenantId: "foreign" }] }), /authorization/);
  assert.throws(() => detectWhatsAppReviewCandidates("tenant-a", { ...input, turns: [{ ...input.turns[0]!, occurredAt: undefined }] }), /occurrence/);
  assert.throws(() => detectWhatsAppReviewCandidates("tenant-a", { ...input, attachments: [{ turnId: "missing", name: "file.pdf" }] }), /evidence/);
});

test("same-name attachment metadata in distinct captions flags a possible duplicate without claiming byte equality", () => {
  const input = reviewInput("Here is the first file.");
  input.turns = [...input.turns, { ...input.turns[0]!, _id: "turn-b", text: "Here is the next file." }];
  input.attachments = [{ turnId: "turn-a", name: "guide.pdf", mimeType: "application/pdf" }, { turnId: "turn-b", name: "guide.pdf", mimeType: "application/pdf" }];
  const attachments = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME).filter(row => row.kind === "attachment");
  assert.equal(attachments[0]!.flags.length, 0); assert.equal(attachments[1]!.flags[0]!.kind, "duplicate");
  assert.match(attachments[1]!.flags[0]!.reason, /file bytes have not been compared/); assert.equal(attachments[1]!.status, "needs-review");
});

test("explicit personal/private medical details are excluded while public educational topics stay reviewable", () => {
  for (const text of ["Personal medical details: password=abc123", "Private medical details", "Private details", "Personal financial information"]) {
    const [candidate] = detectWhatsAppReviewCandidates("tenant-a", reviewInput(text), REVIEW_TIME);
    assert.ok(candidate!.flags.some(flag => flag.kind === "personal-excluded"), text);
  }
  const [publicCandidate] = detectWhatsAppReviewCandidates("tenant-a", reviewInput("Private medical colleges and family visa eligibility"), REVIEW_TIME);
  assert.ok(!publicCandidate!.flags.some(flag => flag.kind === "personal-excluded"));
});
