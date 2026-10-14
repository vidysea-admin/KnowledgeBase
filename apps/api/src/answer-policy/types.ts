/** T-056 persistent answer policies: shared types. Policies shape guidance only; citations are never optional. */
export type PolicyMode = "internal-only" | "internal-and-web";
export type PolicyStyle = "concise" | "detailed";
export type OnInsufficient = "review" | "refuse";
export const POLICY_MODES: readonly PolicyMode[] = ["internal-only", "internal-and-web"];
export const POLICY_STYLES: readonly PolicyStyle[] = ["concise", "detailed"];
export const ON_INSUFFICIENT: readonly OnInsufficient[] = ["review", "refuse"];

export interface PolicyBody {
  questionClass: string;
  mode: PolicyMode;
  style: PolicyStyle;
  onInsufficient: OnInsufficient;
  /** Fixed literal: a policy cannot relax citations. */
  citations: "required";
}
export interface Actor {
  /** Derived from the verified key (never client supplied). */
  actor: string;
  /** Free-text label asserted by the caller; recorded but NOT verified. */
  claimedBy?: string;
}
export interface PolicyRevision extends PolicyBody {
  tenantId: string;
  policyId: string;
  version: number;
  action: "save" | "retire";
  retired: boolean;
  changedBy: Actor;
  changedAt: string;
  note: string;
  previousVersion: number | null;
}
export type ConflictDimension = "mode" | "style" | "onInsufficient";
export interface ConflictSide { policyId: string; version: number; value: string }
export interface ConflictFinding {
  key: string;
  questionClass: string;
  dimension: ConflictDimension;
  severity: "high" | "medium";
  a: ConflictSide;
  b: ConflictSide;
  explanation: string;
}
export type ReviewStatus = "open" | "approved" | "rejected" | "acknowledged" | "dismissed" | "superseded";
export interface ReviewItem {
  id: string;
  tenantId: string;
  kind: "conflict" | "change";
  status: ReviewStatus;
  createdAt: string;
  /** conflict items: dedupe key; change items: policyId@version. */
  key: string;
  summary: string;
  conflict?: ConflictFinding;
  change?: { policyId: string; version: number; previousVersion: number | null; changedFields: string[] };
  resolution?: { decision: ReviewStatus; note: string; by: Actor; at: string };
}
