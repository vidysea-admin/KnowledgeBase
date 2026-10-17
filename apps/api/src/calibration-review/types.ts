import type { TreeIndexNode } from "@lkb/core";

export interface ReviewAssertion { score: number; rationale: string; approvedBy: "Umesh"; approvedAt: string }
export interface CalibrationItem {
  id: string; batch: number; questionId: string; query: string; sessionId: string;
  node: TreeIndexNode; inputSha256: string;
  humanReview: ReviewAssertion | { score: null; rationale: null; approvedBy: null; approvedAt: null };
}
export interface CalibrationPacket {
  format: "calibration-human-review-v1"; status: string; tenantId: string;
  selection: string; rubric: string; limitations: string[];
  sources: { path: string; bytes: number; sha256: string }[];
  batches: { id: number; itemIds: string[] }[]; items: CalibrationItem[];
}
export interface ReviewAudit {
  revision: number; tenantId: string; itemId: string; authenticatedActor: string;
  identityBasis: "tenant-api-key; Umesh identity is asserted, not verified";
  inputSha256: string; before: ReviewAssertion | null; after: ReviewAssertion; at: string;
}
export interface ReviewState {
  format: "calibration-review-state-v1"; tenantId: string; packetSha256: string;
  reviews: Record<string, { revision: number; assertion: ReviewAssertion; audit: ReviewAudit[] }>;
}
export interface ReviewView {
  packet: CalibrationPacket; packetSha256: string; approvedCount: number; total: number;
  items: (CalibrationItem & { revision: number; audit: ReviewAudit[] })[];
  humanGoldVerified: false; remainingGate: string;
}
export interface ReviewSubmission { expectedRevision: number; inputSha256: string; score: number; rationale: string; affirmIndividualReview: true }
export interface ReviewedExport {
  format: "calibration-reviewed-export-v1"; packet: CalibrationPacket;
  packetSha256: string; tenantId: string; audit: ReviewAudit[];
  humanGoldVerified: false; remainingGate: string;
}
export interface CalibrationReviewStore {
  read(tenantId: string): Promise<ReviewView | null>;
  approve(tenantId: string, itemId: string, submission: ReviewSubmission, actor: string): Promise<ReviewView>;
  export(tenantId: string): Promise<ReviewedExport>;
}
export class CalibrationReviewError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
