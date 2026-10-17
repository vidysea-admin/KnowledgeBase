import type { SourceIntakeDeps, SourceIntakeResult } from "../store.js";

export type SourceJobState = "queued" | "running" | "succeeded" | "uncertain";
export interface WatchedJobSnapshot {
  version: 1; watchedSourceId: string; text: string; hash: string;
  fetchedAt: string; previousHash: string | null;
}
export interface SourceJobInput { tenantId: string; actorKeyId: string; url: string; idempotencyKey: string; watchedSnapshot?: WatchedJobSnapshot }
export interface SourceSessionAuthority {
  kind: "onair-account"; tenantId: string; accountId: string; eventId: string; bindingId: string;
  bindingFingerprint: string; sessionFingerprint: string;
}
export interface SourceJobApproval { approvedBy: string; approvalRef: string; sourceAuthority?: SourceSessionAuthority }
export interface SourceJob {
  version: 1; jobId: string; tenantId: string; actorKeyId: string; url: string;
  inputHash: string; approval: SourceJobApproval; state: SourceJobState;
  watchedSnapshot?: WatchedJobSnapshot;
  revision: number; createdAt: string; updatedAt: string;
  attemptId?: string; leaseUntil?: number; result?: SourceIntakeResult;
  reason?: "worker-interrupted" | "execution-unconfirmed" | "indexing-incomplete" | "authorization-unavailable";
}
export interface SourceJobView {
  jobId: string; state: SourceJobState; revision: number; createdAt: string; updatedAt: string;
  result?: { sessionId: string; sourceId: string; turnCount?: number };
  reason?: SourceJob["reason"];
}
export interface SourceJobStore {
  enqueue(input: SourceJobInput, authorize: (input: Readonly<SourceJobInput>) => Promise<SourceJobApproval>): Promise<SourceJobView>;
  poll(tenantId: string, jobId: string): Promise<SourceJobView | null>;
  /** Internal consumer proof; public routes serialize SourceJobView only. */
  completed(tenantId: string, jobId: string): Promise<SourceIntakeResult | null>;
  claim(tenantId: string, workerId: string): Promise<SourceJob | null>;
  renew(tenantId: string, jobId: string, attemptId: string): Promise<boolean>;
  finish(tenantId: string, jobId: string, attemptId: string, result: SourceIntakeResult): Promise<SourceJobView>;
  uncertain(tenantId: string, jobId: string, attemptId: string, reason: NonNullable<SourceJob["reason"]>): Promise<void>;
}
export interface SourceJobWorkerDeps {
  store: SourceJobStore; intake: SourceIntakeDeps;
  /** Recheck current stored identity/approval before any acquisition or provider request. */
  authorizeExecution(job: Readonly<SourceJob>): Promise<boolean>;
  /** Production source-account capability is scoped to this exact immutable approved job. */
  executeJob?(job: Readonly<SourceJob>): Promise<SourceIntakeResult>;
}
export class SourceJobError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}
