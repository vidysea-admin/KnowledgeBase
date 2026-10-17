import { apiFetch } from "../../api/client.js";

export type ExtractionLabel = Record<string, unknown>;
export interface ExtractionAudit {
  revision: number; itemId: string; inputSha256: string; actorId: string; at: string; label: ExtractionLabel; rationale: string;
}
export interface ExtractionReviewItem {
  id: string; caseId: string; inputSha256: string; context: { candidate: string; source: string };
  labelField: "labels" | "factLabels" | "entityLabels"; options: ExtractionLabel[]; revision: number;
  review: null | { label: ExtractionLabel; rationale: string; actorId: string; at: string }; audit: ExtractionAudit[];
}
export interface ExtractionReviewView {
  format: "extraction-review-view-v1"; tenantId: string; packetSha256: string; total: number; reviewedCount: number;
  humanGoldVerified: false; bindingThresholds: null; items: ExtractionReviewItem[];
}
export interface ExtractionReviewExport {
  format: "extraction-authorized-export-v1"; tenantId: string; packetSha256: string; humanGoldVerified: false;
  bindingThresholds: null; reviewedCount: number; total: number; cases: unknown[];
  measurement: { cases: unknown[]; summary: unknown }; remainingGate: string;
}
export const getExtractionReview = (key: string): Promise<ExtractionReviewView> => apiFetch("/extraction-review", key);
export const saveExtractionReview = (key: string, item: ExtractionReviewItem, label: ExtractionLabel, rationale: string): Promise<ExtractionReviewView> =>
  apiFetch(`/extraction-review/items/${encodeURIComponent(item.id)}`, key, { method: "POST", body: {
    expectedRevision: item.revision, inputSha256: item.inputSha256, label, affirmIndividualReview: true, rationale,
  } });
export const exportExtractionReview = (key: string): Promise<ExtractionReviewExport> => apiFetch("/extraction-review/export", key);
