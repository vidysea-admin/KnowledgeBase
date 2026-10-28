import type { SpeakerRelationships } from "@lkb/core";
import type { SpeakerKnowledgeView, SpeakerKnowledgeRelation } from "../../../../packages/index/src/graph/speaker-knowledge.js";

export type RelationshipRow = SpeakerRelationships;
export type RelationshipCommand = "accept" | "reject" | "revoke";
/** Derived exclusively from authenticated server policy, never copied from a request body. */
export interface RelationshipContext {
  tenantId: string; actorId: string; canPropose: boolean; canReview: boolean; reviewerKind: "human" | "automation";
}
export interface RelationshipAuthority {
  /** Current metadata-visible, confirmed-attribution graph from the same transaction snapshot. */
  view: SpeakerKnowledgeView;
  transcriptHashes: Readonly<Record<string, string>>;
}
export interface RelationshipProposal {
  id: string; personId: string; fromClaimId: string; toClaimId: string;
  type: RelationshipRow["type"]; evidence: RelationshipRow["evidence"];
  sourceRevisionDigest: string;
}
export interface RelationshipReview { id: string; baseRevision: number; requestId: string; decision: RelationshipCommand }
export interface RelationshipReceipt { id: string; revision: number; status: RelationshipRow["status"]; replayed: boolean }
export interface RelationshipTransaction {
  get(id: string): Promise<RelationshipRow | null>;
  insert(row: RelationshipRow): Promise<void>;
  replaceCAS(id: string, baseRevision: number, row: RelationshipRow): Promise<boolean>;
  /** Refuse more than 100 rows, never silently truncate a relationship inventory. */
  list(personId: string, status: RelationshipRow["status"]): Promise<RelationshipRow[]>;
  authority(personId: string): Promise<RelationshipAuthority | null>;
}
export interface SpeakerRelationshipStore {
  transaction<T>(tenantId: string, run: (tx: RelationshipTransaction) => Promise<T>): Promise<T>;
}
export interface SpeakerRelationshipService {
  propose(context: RelationshipContext, proposal: RelationshipProposal): Promise<RelationshipReceipt>;
  review(context: RelationshipContext, review: RelationshipReview): Promise<RelationshipReceipt>;
  list(context: RelationshipContext, personId: string, status: RelationshipRow["status"]): Promise<RelationshipRow[]>;
  accepted(context: RelationshipContext, personId: string): Promise<SpeakerKnowledgeRelation[]>;
}
