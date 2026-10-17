import type { AutomationRuns, StoredAutomationDefinition, StoredAutomationRun } from "@lkb/core";
import type { ApplicationReadinessInput, ApplicationReadinessOutcome, AutomationStatus } from "../../../../packages/core/src/domain/automation-monitor.js";
export type AutomationDefinition = StoredAutomationDefinition;
export type AutomationRun = StoredAutomationRun;
export type AutomationRecord = AutomationRuns;
export type AutomationAudit = AutomationRun["history"][number];
export interface AutomationStore {
  get(tenantId: string, id: string): Promise<AutomationRecord | null>;
  insert(tenantId: string, record: AutomationRecord): Promise<boolean>;
  compareAndSwap(tenantId: string, previous: AutomationRecord, next: AutomationRecord): Promise<boolean>;
  list(tenantId: string, recordType: "definition" | "run", limit: number, status?: AutomationStatus): Promise<AutomationRecord[]>;
}
export interface AutomationPrincipal { tenantId: string; actorId: string }
export interface AutomationHandler {
  /** True only for read-only routines or adapters with a durable external idempotency guarantee. */
  retrySafe: boolean;
  execute(input: ApplicationReadinessInput, context: { operationId: string; tenantId: string; signal: AbortSignal; heartbeat(): Promise<void> }): Promise<ApplicationReadinessOutcome>;
}
export class AutomationError extends Error {
  constructor(public readonly code: "invalid_request" | "not_found" | "conflict" | "unavailable" | "forbidden") { super(code); }
}
/** Client view excludes payload/reference, digests, actor identifiers, leases/tokens and upstream errors. */
export function automationRunView(run: AutomationRun) {
  return { id: run._id, kind: run.kind, status: run.status, version: run.version, createdAt: run.createdAt, updatedAt: run.updatedAt,
    attempts: run.attempts, maxAttempts: run.maxAttempts, incident: run.incident, outcome: run.outcome,
    history: run.history.map(({ at, action }) => ({ at, action })) };
}
