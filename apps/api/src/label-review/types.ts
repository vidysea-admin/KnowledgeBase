import type { RelationshipContext } from '../speaker-relations/types.js';

/** D-183: AI-consensus working labels with optional human review. Nothing here is ever humanGold. */
export type LabelSet = 't022' | 'u22';
export type Confidence = 'high' | 'medium' | 'low';
export type LabelSource = 'ai-consensus' | 'human';
export type U22Label = 'supported' | 'partially_supported' | 'unsupported';
/** T-022 labels are judge scores in [0,1]; U2.2 labels are literal-citation-support classes. */
export type Label = number | U22Label;
export const U22_LABELS: readonly U22Label[] = ['supported', 'partially_supported', 'unsupported'];
export const METRIC_LABEL = 'AI-consensus';

export interface ModelVote { model: string; label: Label | null; rationale: string }
export interface LabelItem {
  id: string; set: LabelSet; tenantId: string; inputSha256: string;
  /** T-022: the question. U2.2: the claim. */
  prompt: string;
  /** T-022: the answer excerpt (node title and summary). U2.2: the cited passage(s). */
  passage: string;
  aiLabel: Label | null; confidence: Confidence; agreement: string; flags: string[]; validVotes: number;
  tally: Record<string, number> | null; rationale: string; perModel: ModelVote[];
}
export interface ReviewRecord {
  revision: number; itemId: string; set: LabelSet; inputSha256: string; action: 'accept' | 'override';
  labelSource: LabelSource; label: Label; aiLabel: Label | null; confidence: Confidence;
  note: string | null; reviewedBy: string; reviewedAt: string;
}
export interface LabelReviewState {
  format: 'label-review-state-v1'; tenantId: string; reviews: Record<string, { revision: number; audit: ReviewRecord[] }>;
}
export interface EffectiveLabel {
  label: Label | null; labelSource: LabelSource; reviewedBy: string | null; reviewedAt: string | null; note: string | null;
}
export interface LabelReviewViewItem extends LabelItem { revision: number; effective: EffectiveLabel; audit: ReviewRecord[] }
export interface LabelReviewView {
  format: 'label-review-view-v1'; tenantId: string; humanGold: false; metricLabel: typeof METRIC_LABEL;
  counts: { total: number; reviewed: number; humanOverrides: number; byConfidence: Record<Confidence, number> };
  items: LabelReviewViewItem[];
}
export interface AcceptInput { expectedRevision: number; inputSha256: string }
export interface OverrideInput extends AcceptInput { label: unknown; note?: unknown }
export interface LabelReviewStore {
  read(context: RelationshipContext): Promise<LabelReviewView>;
  accept(context: RelationshipContext, itemId: string, input: AcceptInput): Promise<LabelReviewView>;
  override(context: RelationshipContext, itemId: string, input: OverrideInput): Promise<LabelReviewView>;
  acceptHighConfidence(context: RelationshipContext, set?: LabelSet): Promise<LabelReviewView & { acceptedCount: number }>;
}
export class LabelReviewError extends Error {
  constructor(readonly status: number, readonly code: string) { super(`label_review_${code}`); }
}
export function insist(ok: unknown, status = 409, code = 'sources_changed'): asserts ok { if (!ok) throw new LabelReviewError(status, code); }
