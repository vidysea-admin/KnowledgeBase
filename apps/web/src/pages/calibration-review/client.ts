import { apiFetch } from "../../api/client.js";

export interface CalibrationReviewItem {
  id: string; batch: number; questionId: string; query: string; sessionId: string; inputSha256: string; revision: number;
  node: { title: string; summary: string; node_id: string };
  humanReview: { score: number | null; rationale: string | null; approvedBy: string | null; approvedAt: string | null };
  audit: { revision: number; authenticatedActor: string; identityBasis: string; at: string }[];
}
export interface CalibrationReviewView {
  packet: { tenantId: string; rubric: string; limitations: string[] }; packetSha256: string;
  items: CalibrationReviewItem[]; approvedCount: number; total: number; humanGoldVerified: false; remainingGate: string;
}
export const getCalibrationReview = (key: string): Promise<CalibrationReviewView> => apiFetch("/calibration-review", key);
export const submitCalibrationItem = (key: string, item: CalibrationReviewItem, score: number, rationale: string): Promise<CalibrationReviewView> =>
  apiFetch(`/calibration-review/items/${encodeURIComponent(item.id)}`, key, { method: "POST", body: {
    expectedRevision: item.revision, inputSha256: item.inputSha256, score, rationale, affirmIndividualReview: true,
  } });
export const exportCalibrationReview = (key: string): Promise<unknown> => apiFetch("/calibration-review/export", key);
