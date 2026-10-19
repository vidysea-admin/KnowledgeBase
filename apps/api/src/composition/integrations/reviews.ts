import type { Db } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { createMongoSpeakerRelationshipStore } from '../../speaker-relations/mongo-store.js';
import { createSpeakerRelationshipService } from '../../speaker-relations/service.js';
import { createMongoSpeakerProfileDeps, readSpeakerKnowledgeAuthority, readSpeakerAttributeAuthority } from '../../speaker-profiles/store.js';
import { readAcceptedSpeakerRelationships } from '../../speaker-profiles/relationship-reader.js';
import { createMongoSpeakerAttributeStore, readAcceptedSpeakerAttributes } from '../../speaker-attributes/mongo-store.js';
import { createSpeakerAttributeService } from '../../speaker-attributes/service.js';
import { createFileExtractionReviewStore } from '../../extraction-review/file-store.js';
import { createFileLabelReviewStore } from '../../label-review/store.js';
import { createReviewPolicyResolver, createReviewAdapters } from '../../review-authority/policy.js';
import { createRegistrationApprovalStore } from '../../registration-approvals/store.js';
import { createHumanApproverLookup } from '../../registration-approvals/router.js';

/** Server-owned identity grants are explicit. Absence denies every human review action.
 * Construction is lazy; source snapshots and durable writes occur only in authenticated routes. */
export function buildReviewIntegrations(db: Db, env: NodeJS.ProcessEnv) {
  const resolver = createReviewPolicyResolver(env.LKB_REVIEW_AUTHORITY_JSON);
  const authority = createReviewAdapters(resolver);
  const store = createMongoSpeakerRelationshipStore(db, readSpeakerKnowledgeAuthority);
  const extractionConfigured = env.LKB_EXTRACTION_REVIEW_DIR !== undefined || env.LKB_EXTRACTION_REVIEW_PACKET !== undefined;
  if (extractionConfigured && (!env.LKB_EXTRACTION_REVIEW_DIR || !env.LKB_EXTRACTION_REVIEW_PACKET)) throw new Error('extraction_review_configuration_unavailable');
  const extractionReview = extractionConfigured ? { contextFor: authority.relationshipContextFor,
    store: createFileExtractionReviewStore({ root: env.LKB_EXTRACTION_REVIEW_DIR!, packetPath: env.LKB_EXTRACTION_REVIEW_PACKET!, projectRoot: fileURLToPath(new URL('../../../../../', import.meta.url)) }) } : undefined;
  // D-183: AI-consensus label review (T-022, U2.2). Reviews are written only under LKB_LABEL_REVIEW_DIR; the sidecars are read-only.
  const labelReview = env.LKB_LABEL_REVIEW_DIR ? { contextFor: authority.relationshipContextFor,
    store: createFileLabelReviewStore({ root: env.LKB_LABEL_REVIEW_DIR, projectRoot: fileURLToPath(new URL('../../../../../', import.meta.url)) }) } : undefined;
  return {
    answerReviewAuthority: authority.answerReviewAuthority,
    // D-180: human-only registration-link approvals; same server-owned identity grants as every human review.
    registrationApprovals: { store: createRegistrationApprovalStore(db), humanFor: createHumanApproverLookup(resolver) },
    extractionReview,
    labelReview,
    speakerProfiles: createMongoSpeakerProfileDeps(db, readAcceptedSpeakerRelationships, readAcceptedSpeakerAttributes),
    speakerAttributes: { service: createSpeakerAttributeService(createMongoSpeakerAttributeStore(db, readSpeakerAttributeAuthority)), contextFor: authority.relationshipContextFor },
    speakerRelations: { service: createSpeakerRelationshipService(store), contextFor: authority.relationshipContextFor },
    speakerRelationSource: { contextFor: authority.relationshipContextFor,
      readAuthority: (tenantId: string, personId: string) => store.transaction(tenantId, tx => tx.authority(personId)) },
  };
}
