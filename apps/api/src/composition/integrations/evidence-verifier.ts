import type { Db } from "mongodb";
import type { VerifyEvidence } from "../../answer-policy/answer-records.js";
import { createMongoEvidenceVerifier, verifyPublisherEvidence } from "../../answer-policy/answer-evidence.js";
import { createKnowledgeVisibility } from "../../visibility/knowledge.js";
import type { NativeEvidenceResolver } from "../../native-evidence/resolver.js";

/** The one saved-answer evidence verifier: canonical turn bytes, current knowledge visibility
 * (consent, WhatsApp review provenance, source-kind gating), the native resolver when composed,
 * and a fresh read of the cited publisher page. Used by answer workflow and championship reads. */
export function createComposedEvidenceVerifier(db: Db, native?: NativeEvidenceResolver): VerifyEvidence {
  return createMongoEvidenceVerifier(db, verifyPublisherEvidence, createKnowledgeVisibility(db).eligibleTurn, native);
}
