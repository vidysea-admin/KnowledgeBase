import { AutomationError, type AutomationRecord, type AutomationStore } from "./types.js";
import { createHash } from "node:crypto";
import { isAutomationReference, parseApplicationReadiness, applicationDocuments } from "../../../../packages/core/src/domain/automation-monitor.js";

/** Supplied by the packages/db tenant-scoped accessor. No raw Mongo collection may enter this adapter. */
export interface AutomationCollection {
  findOne(filter: object): Promise<unknown>;
  insertOne(record: object): Promise<{ acknowledged: boolean }>;
  replaceOne(filter: object, replacement: object): Promise<{ acknowledged: boolean; matchedCount: number }>;
  find(filter: object): { sort(order: object): { limit(n: number): { toArray(): Promise<unknown[]> } } };
}
const statuses = ["queued", "running", "waiting-for-operator", "succeeded", "failed", "cancelled"];
const actions = ["configured", "submitted", "claimed", "heartbeat", "succeeded", "handler-failed", "handler-timeout", "lease-expired-retry", "lease-expired-exhausted", "reconciliation-required", "operator-retry", "operator-cancel", "operator-reconcile"];
const incidents = [null, "handler-failed", "handler-timeout", "lease-expired", "retry-exhausted", "reconciliation-required"];
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
export function validateAutomationRecord(value: unknown, tenantId: string): AutomationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AutomationError("unavailable");
  const r = value as AutomationRecord;
  if (r.tenantId !== tenantId || !isAutomationReference(r._id) || r.kind !== "application-readiness" || !integer(r.version) || r.version < 1 || !integer(r.updatedAt) || !Number.isInteger(r.maxAttempts) || r.maxAttempts < 1 || r.maxAttempts > 3 || !Number.isInteger(r.timeoutMs) || r.timeoutMs < 100 || r.timeoutMs > 30000 || !Array.isArray(r.history) || r.history.length < 1 || r.history.length > 100 || r.history.some(h => !h || !integer(h.at) || h.at > r.updatedAt || !isAutomationReference(h.actor) || !actions.includes(h.action)) || r.history.at(-1)!.at !== r.updatedAt) throw new AutomationError("unavailable");
  if (r.recordType === "definition") {
    if (typeof r.enabled !== "boolean") throw new AutomationError("unavailable");
  } else if (r.recordType === "run") {
    if (!statuses.includes(r.status) || !integer(r.createdAt) || r.createdAt > r.updatedAt || !integer(r.attempts) || r.attempts > r.maxAttempts || r.status === "running" && r.attempts < 1 || r.status === "failed" && r.attempts !== r.maxAttempts || !isAutomationReference(r.definitionId) || !/^[a-f0-9]{64}$/.test(r.payloadDigest) || !/^[a-f0-9]{64}$/.test(r.identityDigest) || !incidents.includes(r.incident)) throw new AutomationError("unavailable");
    try { parseApplicationReadiness(r.payload); } catch { throw new AutomationError("unavailable"); }
    if (createHash("sha256").update(JSON.stringify([r.kind, parseApplicationReadiness(r.payload)])).digest("hex") !== r.payloadDigest || r._id !== `run-${r.identityDigest}`) throw new AutomationError("unavailable");
    if (r.status === "running" ? !isAutomationReference(r.ownerToken) || !integer(r.leaseUntil) : r.ownerToken !== null || r.leaseUntil !== null) throw new AutomationError("unavailable");
    if (r.outcome !== null && (!r.outcome || typeof r.outcome.ready !== "boolean" || !Array.isArray(r.outcome.missingDocuments) || r.outcome.missingDocuments.length > 3 || new Set(r.outcome.missingDocuments).size !== r.outcome.missingDocuments.length || r.outcome.missingDocuments.some(d => !applicationDocuments.includes(d)) || r.outcome.ready !== (r.outcome.missingDocuments.length === 0))) throw new AutomationError("unavailable");
    if (r.status === "succeeded" ? r.outcome === null : r.outcome !== null) throw new AutomationError("unavailable");
    if (r.outcome !== null) {
      const expectedMissing = r.payload.requiredDocuments.filter(d => !r.payload.availableDocuments.some(available => available === d));
      if (JSON.stringify(r.outcome.missingDocuments) !== JSON.stringify(expectedMissing)) throw new AutomationError("unavailable");
    }
  } else throw new AutomationError("unavailable");
  return r;
}
export function createMongoAutomationStore(collection: (tenantId: string) => AutomationCollection): AutomationStore {
  return {
    async get(tenantId, id) {
      const row = await collection(tenantId).findOne({ _id: id });
      return row === null ? null : validateAutomationRecord(row, tenantId);
    },
    async insert(tenantId, record) {
      validateAutomationRecord(record, tenantId);
      try { const result = await collection(tenantId).insertOne(record); if (!result.acknowledged) throw new AutomationError("unavailable"); return true; }
      catch (error) { if (error && typeof error === "object" && "code" in error && error.code === 11000) return false; throw error; }
    },
    async compareAndSwap(tenantId, previous, next) {
      validateAutomationRecord(previous, tenantId); validateAutomationRecord(next, tenantId);
      if (previous._id !== next._id || next.version !== previous.version + 1) throw new AutomationError("invalid_request");
      const result = await collection(tenantId).replaceOne({ _id: previous._id, version: previous.version, recordType: previous.recordType }, next);
      if (!result.acknowledged) throw new AutomationError("unavailable");
      return result.matchedCount === 1;
    },
    async list(tenantId, recordType, limit, status) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AutomationError("invalid_request");
      const rows = await collection(tenantId).find({ recordType, ...(status ? { status } : {}) }).sort(status ? { leaseUntil: 1, _id: 1 } : { updatedAt: -1, _id: 1 }).limit(limit).toArray();
      if (!Array.isArray(rows) || rows.length > limit) throw new AutomationError("unavailable");
      return rows.map(row => { const value = validateAutomationRecord(row, tenantId); if (value.recordType !== recordType) throw new AutomationError("unavailable"); return value; });
    },
  };
}
