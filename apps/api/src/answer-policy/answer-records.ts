/** Persistence DTOs adapt canonical generated collections; field lists are not handwritten. */
import type { AskV2Result } from "@lkb/ask";
import type { StoredAnswerRun, StoredSourceConflict, StoredAnswerEvidence } from "@lkb/core";

export type AnswerState = StoredAnswerRun["state"];
export type EvidenceBinding = StoredAnswerEvidence;
export type AnswerFilters = StoredAnswerRun["filters"];
/** The actual Ask producer supplies its established stronger TreeIndexNode shape. */
export type AnswerRun = Omit<StoredAnswerRun, "_id" | "candidate"> & { candidate: AskV2Result };
export type SourceConflict = Omit<StoredSourceConflict, "_id">;
export interface AnswerRecordStore {
  create(tenantId: string, run: AnswerRun): Promise<void>;
  get(tenantId: string, id: string): Promise<AnswerRun | null>;
  list(tenantId: string, limit: number): Promise<AnswerRun[]>;
  reviewItems(tenantId: string, limit: number): Promise<AnswerRun[]>;
  review(tenantId: string, id: string, digest: string, review: NonNullable<AnswerRun["review"]>): Promise<boolean>;
  feedback(tenantId: string, id: string, item: AnswerRun["feedback"][number]): Promise<boolean>;
  addConflict(tenantId: string, conflict: SourceConflict): Promise<SourceConflict>;
  conflicts(tenantId: string, runId?: string): Promise<SourceConflict[]>;
  getConflict(tenantId: string, id: string): Promise<SourceConflict | null>;
  resolveConflict(tenantId: string, id: string, resolution: NonNullable<SourceConflict["resolution"]>): Promise<boolean>;
}
export type VerifyEvidence = (tenantId: string, evidence: readonly EvidenceBinding[]) => Promise<boolean>;
