/** Canonical persisted shapes come only from generated schema types. */
import type { StoredPolicyRevision, StoredPolicyReviewItem } from "@lkb/core";
import policySchema from "../../../../schema/answer_policy_revisions.schema.json" with { type: "json" };
export type PolicyRevision = Omit<StoredPolicyRevision, "_id">;
export type PolicyBody = Pick<PolicyRevision, "questionClass" | "mode" | "style" | "onInsufficient" | "citations">;
export type PolicyMode = PolicyRevision["mode"];
export type PolicyStyle = PolicyRevision["style"];
export type OnInsufficient = PolicyRevision["onInsufficient"];
export const POLICY_MODES = policySchema.properties.mode.enum as readonly PolicyMode[];
export const POLICY_STYLES = policySchema.properties.style.enum as readonly PolicyStyle[];
export const ON_INSUFFICIENT = policySchema.properties.onInsufficient.enum as readonly OnInsufficient[];

/** actor is verified tenant/key attribution; claimedBy remains an explicitly unverified label. */
export type Actor = PolicyRevision["changedBy"];
export type ConflictFinding = NonNullable<StoredPolicyReviewItem["conflict"]>;
export type ConflictDimension = ConflictFinding["dimension"];
export type ConflictSide = ConflictFinding["a"];
export type ReviewStatus = StoredPolicyReviewItem["status"];
/** Mongo stores _id; the HTTP/test seam exposes its detached string identity as id. */
export type ReviewItem = Omit<StoredPolicyReviewItem, "_id"> & { id: string };
