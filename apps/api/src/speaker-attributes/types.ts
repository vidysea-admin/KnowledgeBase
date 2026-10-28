import type { SpeakerAttributes } from "@lkb/core";
import type { RelationshipContext, RelationshipAuthority } from "../speaker-relations/types.js";

export type AttributeRow = SpeakerAttributes;
export type AttributeContext = RelationshipContext;
export interface AttributeAuthority extends RelationshipAuthority {
  /** Exact current turns inside an accepted identity block; supplied by the source snapshot. */
  attributedTurns: { sessionId: string; turnId: string; text: string; speakerRef: string; startTurnIndex: number; endTurnIndex: number }[];
}
export interface AttributeProposal {
  id: string; personId: string; field: "org" | "role"; value: string;
  evidence: AttributeRow["evidence"]; sourceRevisionDigest: string;
}
export interface AttributeReview { id: string; baseRevision: number; requestId: string; decision: "accept" | "reject" | "revoke" }
export interface AttributeReceipt { id: string; revision: number; status: AttributeRow["status"]; replayed: boolean }
export interface AttributeTransaction {
  get(id: string): Promise<AttributeRow | null>;
  insert(row: AttributeRow): Promise<void>;
  replaceCAS(id: string, baseRevision: number, row: AttributeRow): Promise<boolean>;
  list(personId: string, status: AttributeRow["status"]): Promise<AttributeRow[]>;
  authority(personId: string): Promise<AttributeAuthority | null>;
}
export interface SpeakerAttributeStore { transaction<T>(tenantId: string, run: (tx: AttributeTransaction) => Promise<T>): Promise<T> }
export interface AcceptedAttributes {
  fields: Partial<Record<"org" | "role", { value: string; evidence: AttributeRow["evidence"] }>>;
  withheldFields: ("org" | "role")[];
  revision: string;
}
export interface SpeakerAttributeService {
  propose(context: AttributeContext, input: AttributeProposal): Promise<AttributeReceipt>;
  review(context: AttributeContext, input: AttributeReview): Promise<AttributeReceipt>;
  list(context: AttributeContext, personId: string, status: AttributeRow["status"]): Promise<AttributeRow[]>;
  accepted(context: AttributeContext, personId: string): Promise<AcceptedAttributes>;
}
