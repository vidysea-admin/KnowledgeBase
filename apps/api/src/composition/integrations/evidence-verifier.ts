import type { Db } from "mongodb";
import type { VerifyEvidence } from "../../answer-policy/answer-records.js";
import { createMongoEvidenceVerifier } from "../../answer-policy/answer-evidence.js";
import { createKnowledgeVisibility } from "../../visibility/knowledge.js";
import type { NativeEvidenceResolver } from "../../native-evidence/resolver.js";

/** The one saved-answer evidence verifier: canonical turn bytes, current knowledge visibility
 * (consent, WhatsApp review provenance, source-kind gating) and the native resolver when composed.
 * Web evidence stays refused: no trusted web freshness capability exists. Every saved-answer path
 * (answer workflow, championship reads) must build its verifier here so they cannot drift. */
export function createComposedEvidenceVerifier(db: Db, native?: NativeEvidenceResolver): VerifyEvidence {
  return createMongoEvidenceVerifier(db, undefined, createKnowledgeVisibility(db).eligibleTurn, native);
}
