import { createHash } from "node:crypto";
import { isAutomationReference } from "../../../../packages/core/src/domain/automation-monitor.js";
import { AutomationError } from "./types.js";
import type { ApplicationOperation, ApplicationRecord, ApplicationTarget } from "./form-types.js";
export const applicationDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const applicationAuditActions = ["configured", "submitted", "fields-revised", "approved", "claimed", "heartbeat", "execution-uncertain", "succeeded", "lease-expired", "operator-cancel", "operator-retry", "operator-reconciled"] as const;
const unpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** Canonical source IDs include an encoded tenant prefix and colon, unlike request/target tokens. */
export function isApplicationDocumentReference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && !/[\s\u0000-\u001f\u007f-\u009f]/.test(value) && !unpairedSurrogate.test(value);
}
export function applicationObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new AutomationError("invalid_request");
  return value as Record<string, unknown>;
}
export function applicationFields(value: unknown): ApplicationOperation["fields"] {
  if (!Array.isArray(value) || value.length > 20) throw new AutomationError("invalid_request");
  const fields = value.map(item => {
    const field = applicationObject(item, ["name", "value", "source"]), source = applicationObject(field.source, ["documentId", "page", "start", "end", "revision"]);
    if (!isAutomationReference(field.name) || typeof field.value !== "string" || !field.value.trim() || field.value.length > 256 || /[\u0000-\u001f\u007f]/.test(field.value) || unpairedSurrogate.test(field.value) || !isApplicationDocumentReference(source.documentId) || !Number.isSafeInteger(source.page) || Number(source.page) < 1 || Number(source.page) > 10000 || !Number.isSafeInteger(source.start) || Number(source.start) < 0 || !Number.isSafeInteger(source.end) || Number(source.end) > 1000000 || Number(source.end) - Number(source.start) !== field.value.length || typeof source.revision !== "string" || !/^[a-f0-9]{64}$/.test(source.revision)) throw new AutomationError("invalid_request");
    return { name: field.name, value: field.value, source: { documentId: source.documentId, page: Number(source.page), start: Number(source.start), end: Number(source.end), revision: source.revision } };
  });
  if (new Set(fields.map(field => field.name)).size !== fields.length) throw new AutomationError("invalid_request");
  return fields.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) as ApplicationOperation["fields"];
}
export function applicationTargetFingerprint(target: ApplicationTarget): string {
  if (!isAutomationReference(target.id) || !isAutomationReference(target.version) || !/^[a-f0-9]{64}$/.test(target.configurationDigest) || target.requiredFields.length < 1 || target.requiredFields.length > 20 || new Set(target.requiredFields).size !== target.requiredFields.length || target.allowedFields.length > 20 || new Set(target.allowedFields).size !== target.allowedFields.length || target.allowedFields.some(name => !isAutomationReference(name)) || target.requiredFields.some(name => !target.allowedFields.includes(name)) || !["none", "operation-id"].includes(target.adapter.duplicateGuarantee)) throw new AutomationError("unavailable");
  return applicationDigest([target.id, target.version, [...target.requiredFields].sort(), [...target.allowedFields].sort(), target.adapter.duplicateGuarantee, target.configurationDigest]);
}
export function validateApplicationRecord(value: unknown, tenantId: string): ApplicationRecord {
  const r = value as ApplicationRecord;
  if (!r || typeof r !== "object" || r.tenantId !== tenantId || !isAutomationReference(r._id) || !isAutomationReference(r.targetId) || !/^[a-f0-9]{64}$/.test(r.targetFingerprint) || !Number.isSafeInteger(r.version) || r.version < 1 || !Number.isSafeInteger(r.updatedAt) || r.updatedAt < 0 || !Number.isInteger(r.maxAttempts) || r.maxAttempts < 1 || r.maxAttempts > 3 || !Number.isInteger(r.timeoutMs) || r.timeoutMs < 100 || r.timeoutMs > 30000 || !Array.isArray(r.history) || r.history.length < 1 || r.history.length > 100 || r.history.some(h => !h || !Number.isSafeInteger(h.at) || h.at < 0 || h.at > r.updatedAt || !isAutomationReference(h.actor) || !(applicationAuditActions as readonly string[]).includes(h.action)) || r.history.at(-1)!.at !== r.updatedAt) throw new AutomationError("unavailable");
  if (r.history.some(h => !h.binding || !Number.isSafeInteger(h.binding.priorVersion) || h.binding.priorVersion < 0 || h.binding.priorVersion >= r.version || !/^[a-f0-9]{64}$/.test(h.binding.targetFingerprint) || h.binding.payloadDigest !== null && !/^[a-f0-9]{64}$/.test(h.binding.payloadDigest))) throw new AutomationError("unavailable");
  if (r.recordType === "definition") { if (typeof r.enabled !== "boolean") throw new AutomationError("unavailable"); return r; }
  if (r.recordType !== "operation" || !["draft", "approved", "running", "waiting-for-operator", "succeeded", "failed", "cancelled"].includes(r.status) || !Number.isSafeInteger(r.createdAt) || r.createdAt < 0 || r.createdAt > r.updatedAt || !Number.isSafeInteger(r.attempts) || r.attempts < 0 || r.attempts > r.maxAttempts || !/^[a-f0-9]{64}$/.test(r.identityDigest) || !/^[a-f0-9]{64}$/.test(r.payloadDigest) || !isAutomationReference(r.definitionId) || r._id !== `form-${r.identityDigest}`) throw new AutomationError("unavailable");
  try { if (applicationDigest(applicationFields(r.fields)) !== r.payloadDigest) throw new Error(); } catch { throw new AutomationError("unavailable"); }
  if (r.status === "running" ? !isAutomationReference(r.ownerToken) || !Number.isSafeInteger(r.leaseUntil) || r.attempts < 1 : r.ownerToken !== null || r.leaseUntil !== null) throw new AutomationError("unavailable");
  if (typeof r.sideEffectUncertain !== "boolean" || r.status === "succeeded" && r.sideEffectUncertain || r.approval !== null && (!r.approval || !isAutomationReference(r.approval.actor) || !Number.isSafeInteger(r.approval.at) || r.approval.payloadDigest !== r.payloadDigest || r.approval.targetFingerprint !== r.targetFingerprint)) throw new AutomationError("unavailable");
  if (["approved", "running", "succeeded"].includes(r.status) && r.approval === null || r.status === "succeeded" && !isAutomationReference(r.receiptId) || r.receiptId !== null && !isAutomationReference(r.receiptId) || r.incident !== null && !["missing-required-fields", "provenance-unavailable", "handler-failed", "handler-timeout", "uncertain-side-effect", "retry-exhausted", "target-changed"].includes(r.incident)) throw new AutomationError("unavailable");
  if (r.status === "draft" && (r.attempts !== 0 || r.approval !== null || r.sideEffectUncertain) || r.status === "running" && !r.sideEffectUncertain || r.status !== "succeeded" && r.receiptId !== null || r.status === "succeeded" && r.attempts < 1 || r.status === "failed" && r.attempts !== r.maxAttempts || r.status === "approved" && r.attempts >= r.maxAttempts || r.approval !== null && (r.approval.at < r.createdAt || r.approval.at > r.updatedAt)) throw new AutomationError("unavailable");
  return r;
}
