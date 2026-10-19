import { apiFetch } from "../../api/client.js";

export type LabelSet = "t022" | "u22";
export type Confidence = "high" | "medium" | "low";
export type LabelSource = "ai-consensus" | "human";
export type Label = number | "supported" | "partially_supported" | "unsupported";
export const U22_LABELS = ["supported", "partially_supported", "unsupported"] as const;

export interface LabelAudit {
  revision: number; action: "accept" | "override"; labelSource: LabelSource; label: Label; aiLabel: Label | null;
  note: string | null; reviewedBy: string; reviewedAt: string;
}
export interface LabelRow {
  id: string; set: LabelSet; tenantId: string; inputSha256: string; prompt: string; passage: string;
  aiLabel: Label | null; confidence: Confidence; agreement: string; flags: string[]; validVotes: number;
  tally: Record<string, number> | null; rationale: string; perModel: { model: string; label: Label | null; rationale: string }[];
  revision: number; audit: LabelAudit[];
  effective: { label: Label | null; labelSource: LabelSource; reviewedBy: string | null; reviewedAt: string | null; note: string | null };
}
export interface LabelReviewView {
  format: "label-review-view-v1"; tenantId: string; humanGold: false; metricLabel: "AI-consensus";
  counts: { total: number; reviewed: number; humanOverrides: number; byConfidence: Record<Confidence, number> };
  items: LabelRow[];
}
const path = (row: LabelRow, action: "accept" | "override"): string => `/label-review/items/${encodeURIComponent(row.id)}/${action}`;

export const getLabelReview = (key: string): Promise<LabelReviewView> => apiFetch("/label-review", key);
/** The body carries only the revision and input hash: the server owns the label source, reviewer and time. */
export const acceptAiLabel = (key: string, row: LabelRow): Promise<LabelReviewView> =>
  apiFetch(path(row, "accept"), key, { method: "POST", body: { expectedRevision: row.revision, inputSha256: row.inputSha256 } });
export const overrideLabel = (key: string, row: LabelRow, label: Label, note: string): Promise<LabelReviewView> =>
  apiFetch(path(row, "override"), key, { method: "POST", body: { expectedRevision: row.revision, inputSha256: row.inputSha256, label, ...(note.trim() ? { note: note.trim() } : {}) } });
export const acceptHighConfidence = (key: string, set?: LabelSet): Promise<LabelReviewView & { acceptedCount: number }> =>
  apiFetch("/label-review/accept-high-confidence", key, { method: "POST", body: set ? { set } : {} });
