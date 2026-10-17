import type { ApplicationOperations, StoredApplicationDefinition, StoredApplicationOperation } from "@lkb/core";
import type { AutomationPrincipal } from "./types.js";
export type ApplicationDefinition = StoredApplicationDefinition;
export type ApplicationOperation = StoredApplicationOperation;
export type ApplicationRecord = ApplicationOperations;
export type ApplicationAudit = ApplicationOperation["history"][number];
export type ApplicationField = ApplicationOperation["fields"][number];
export interface ApplicationAdapter {
  /** Runtime-configured contractual guarantee, never an intake flag. Actual target validation remains required. */
  duplicateGuarantee: "operation-id" | "none";
  submit(input: { operationId: string; tenantId: string; fields: ApplicationField[]; signal: AbortSignal; heartbeat(): Promise<void> }): Promise<{ receiptId: string }>;
  verifyReceipt(input: { operationId: string; tenantId: string; receiptId: string; signal: AbortSignal }): Promise<boolean>;
}
export interface ApplicationTarget {
  id: string; version: string; requiredFields: readonly string[]; allowedFields: readonly string[];
  /** Hash of the trusted destination, credential generation and source authority; changes invalidate approval. */
  configurationDigest: string;
  adapter: ApplicationAdapter;
  /** Must verify exact page/revision/span/value against tenant-owned approved source evidence. */
  verifyField(tenantId: string, field: ApplicationField, signal: AbortSignal): Promise<boolean>;
}
export interface ApplicationStore {
  get(tenantId: string, id: string): Promise<ApplicationRecord | null>;
  insert(tenantId: string, record: ApplicationRecord): Promise<boolean>;
  cas(tenantId: string, previous: ApplicationRecord, next: ApplicationRecord): Promise<boolean>;
  list(tenantId: string, recordType: "definition" | "operation", status?: ApplicationOperation["status"]): Promise<ApplicationRecord[]>;
}
export type ApplicationPrincipal = AutomationPrincipal;
export function applicationOperationView(row: ApplicationOperation) {
  return { id: row._id, targetId: row.targetId, status: row.status, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
    fieldNames: row.fields.map(f => f.name), approved: row.approval !== null, attempts: row.attempts, maxAttempts: row.maxAttempts,
    incident: row.incident, sideEffectUncertain: row.sideEffectUncertain, hasReceipt: row.receiptId !== null, history: row.history.map(({ at, action }) => ({ at, action })) };
}
