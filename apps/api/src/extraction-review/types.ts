import type { RelationshipContext } from '../speaker-relations/types.js';
import type { ExtractionCase, ExtractionReport } from '../../../../packages/index/src/eval/extraction.js';

export type NativeLabel = Record<string, unknown>;
export type LabelField = 'labels' | 'factLabels' | 'entityLabels';
export interface ReviewItem {
  id: string; caseId: string; inputSha256: string;
  context: { candidate: string; source: string }; labelField: LabelField; options: NativeLabel[];
}
export interface ExtractionSeed { tenantId: string; packetSha256: string; cases: ExtractionCase[]; items: ReviewItem[] }
export interface ExtractionAssertion { label: NativeLabel; rationale: string; actorId: string; at: string }
export interface ExtractionAudit extends ExtractionAssertion { revision: number; itemId: string; inputSha256: string }
export interface ExtractionState {
  format: 'extraction-review-state-v1'; tenantId: string; packetSha256: string;
  reviews: Record<string, { revision: number; audit: ExtractionAudit[] }>;
}
export interface ExtractionReviewView {
  format: 'extraction-review-view-v1'; tenantId: string; packetSha256: string; total: number; reviewedCount: number;
  humanGoldVerified: false; bindingThresholds: null;
  items: (ReviewItem & { revision: number; review: ExtractionAssertion | null; audit: ExtractionAudit[] })[];
}
export interface ExtractionSubmission {
  expectedRevision: number; inputSha256: string; label: NativeLabel; affirmIndividualReview: true; rationale: string;
}
export interface ExtractionExport {
  format: 'extraction-authorized-export-v1'; tenantId: string; packetSha256: string;
  humanGoldVerified: false; bindingThresholds: null; reviewedCount: number; total: number;
  cases: ExtractionCase[]; measurement: { cases: ExtractionReport[]; summary: unknown }; remainingGate: string;
}
export interface ExtractionReviewStore {
  read(context: RelationshipContext): Promise<ExtractionReviewView>;
  approve(context: RelationshipContext, id: string, input: ExtractionSubmission): Promise<ExtractionReviewView>;
  export(context: RelationshipContext): Promise<ExtractionExport>;
}
export class ExtractionReviewError extends Error {
  constructor(readonly status: number, readonly code: string) { super(`extraction_review_${code}`); }
}
