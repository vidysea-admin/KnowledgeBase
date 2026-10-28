import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalibrationReviewView } from "./client.js";
import { stageOfflineDraft } from "./offline-transfer.js";

export function syntheticTransferFixture() {
  const packet = { tenantId: "synthetic-t022", rubric: "Explicit synthetic relevance-review fixture", limitations: ["Synthetic judgments are not human gold."],
    items: Array.from({ length: 30 }, (_, i) => ({ id: `synthetic-${i}`, inputSha256: "b".repeat(64) })) };
  const packetSha256 = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
  const view: CalibrationReviewView = { packet, packetSha256, total: 30, approvedCount: 0, humanGoldVerified: false,
    remainingGate: "Synthetic fixture only; genuine human review and calibration remain required.",
    items: packet.items.map((item, i) => ({ ...item, batch: Math.floor(i / 10) + 1, questionId: `synthetic-question-${i}`,
      query: `Synthetic query ${i}`, sessionId: `synthetic-session-${i}`, revision: 7,
      node: { title: `Synthetic title ${i}`, summary: `Synthetic summary ${i}`, node_id: `synthetic-session-${i}` },
      humanReview: { score: null, rationale: null, approvedBy: null, approvedAt: null }, audit: [] })) };
  const draft = { format: "calibration-offline-draft-v1", packet, packetSha256, tenantId: packet.tenantId,
    generatedAt: "2026-10-15T00:00:00.000Z", humanGoldVerified: false, serverAuditAuthoritative: false,
    identityBasis: "Offline personal-review assertions; identity and browser time are not authenticated.", submittedCount: 1, pendingCount: 29, completeAssertions: false,
    items: packet.items.map((item, i) => ({ ...item, localRevision: i === 0 ? 99 : 0, serverExpectedRevision: null,
      score: i === 0 ? 0.375 : null, rationale: i === 0 ? "Explicit synthetic test judgment" : null,
      affirmIndividualReview: i === 0, assertedBy: i === 0 ? "Umesh" : null, assertedAt: i === 0 ? "2026-10-15T00:00:00.000Z" : null })) };
  return { view, draft };
}
afterEach(() => vi.unstubAllGlobals());
describe("offline assertion staging", () => {
  it("checks actual packet bytes and returns only assertion fields, discarding local revisions", async () => {
    vi.stubGlobal("crypto", webcrypto); const { draft, view } = syntheticTransferFixture();
    expect(await stageOfflineDraft(draft, view)).toEqual([{ id: "synthetic-0", inputSha256: "b".repeat(64), score: 0.375, rationale: "Explicit synthetic test judgment" }]);
  });
  it("rejects foreign tenant, source drift, duplicate, provenance and dishonest assertions", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const mutations: ((draft: any) => void)[] = [
      d => { d.tenantId = "foreign"; }, d => { d.packet.tenantId = "foreign"; }, d => { d.packet.items[0].inputSha256 = "c".repeat(64); },
      d => { d.items[0].inputSha256 = "c".repeat(64); }, d => { d.items[1] = d.items[0]; }, d => { d.items[0].serverExpectedRevision = 7; },
      d => { d.serverAuditAuthoritative = true; }, d => { d.humanGoldVerified = true; }, d => { d.items[0].audit = []; },
      d => { d.items[0].score = "0.375"; }, d => { d.items[0].rationale = " "; }, d => { d.items[0].affirmIndividualReview = false; },
      d => { d.items[0].assertedAt = "invalid"; }, d => { d.submittedCount = 30; }, d => { d.items[1].score = 0.8; },
      d => { d.items[0].localRevision = -1; }, d => { d.items[0].score = NaN; }, d => { d.items[0].assertedBy = "other"; },
    ];
    for (const mutate of mutations) { const { draft, view } = syntheticTransferFixture(); mutate(draft); await expect(stageOfflineDraft(draft, view)).rejects.toThrow(); }
  });
  it("refuses mismatched current item sets and unavailable secure hashing", async () => {
    vi.stubGlobal("crypto", webcrypto); const { draft, view } = syntheticTransferFixture();
    view.items[1] = view.items[0]!; await expect(stageOfflineDraft(draft, view)).rejects.toThrow();
    vi.stubGlobal("crypto", {}); await expect(stageOfflineDraft(draft, syntheticTransferFixture().view)).rejects.toThrow();
  });
});
