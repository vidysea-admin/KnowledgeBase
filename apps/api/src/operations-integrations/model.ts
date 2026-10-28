import { createHash } from "node:crypto";
import type { OperationsSchedules } from "@lkb/core";
import { isValidTenantId } from "../auth.js";
export type Schedule = OperationsSchedules;
export type IntegrationKind = "digest" | "sheets";
export const kinds: IntegrationKind[] = ["digest", "sheets"];
export class OperationsError extends Error {
  constructor(public readonly code: "invalid" | "conflict" | "unavailable" | "unauthorized" | "disabled" | "uncertain") { super(code); }
}
export const scheduleId = (tenant: string, kind: IntegrationKind) => createHash("sha256").update(`${tenant}\0${kind}`).digest("hex");
export function initialSchedule(tenantId: string, kind: IntegrationKind): Schedule {
  if (!isValidTenantId(tenantId) || !kinds.includes(kind)) throw new OperationsError("invalid");
  return { _id: scheduleId(tenantId, kind), tenantId, kind, revision: 0, enabled: false, intervalHours: 24, nextRunAt: null, lastAttemptAt: null, lastSuccessAt: null, lastResult: "never", lastErrorCode: null, runId: null, leaseToken: null, leaseUntil: null, audit: [] };
}
const time = (value: unknown) => value === null || typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function validateSchedule(raw: unknown, tenant: string, kind: IntegrationKind): Schedule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OperationsError("unavailable");
  const row = raw as Record<string, unknown>, keys = Object.keys(initialSchedule(tenant, kind));
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key)) || row._id !== scheduleId(tenant, kind) || row.tenantId !== tenant || row.kind !== kind ||
    !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || typeof row.enabled !== "boolean" || ![24, 168].includes(Number(row.intervalHours)) || typeof row.intervalHours !== "number" ||
    ![row.nextRunAt, row.lastAttemptAt, row.lastSuccessAt, row.leaseUntil].every(time) || typeof row.lastResult !== "string" || !["never", "running", "succeeded", "failed", "blocked", "uncertain"].includes(row.lastResult) ||
    !(row.lastErrorCode === null || typeof row.lastErrorCode === "string" && ["configuration", "source-unavailable", "delivery-failed", "write-failed", "lease-expired", "authorization"].includes(row.lastErrorCode)) ||
    ![row.runId, row.leaseToken].every(value => value === null || typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) ||
    (row.lastResult === "running" ? !(typeof row.leaseToken === "string" && typeof row.leaseUntil === "string" && typeof row.runId === "string" && typeof row.lastAttemptAt === "string") : row.leaseToken !== null || row.leaseUntil !== null) ||
    row.enabled && row.nextRunAt === null || row.lastResult === "succeeded" && (row.lastSuccessAt === null || row.runId === null || row.lastAttemptAt === null) || row.lastResult === "uncertain" && (row.enabled || row.runId === null || row.lastAttemptAt === null) ||
    !Array.isArray(row.audit) || row.audit.length !== row.revision || row.audit.length > 10000 || !row.audit.every((event: unknown, index: number) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) return false;
      const e = event as Record<string, unknown>;
      return Object.keys(e).length === 5 && Object.keys(e).every(key => ["revision", "at", "actorKeyId", "action", "outcome"].includes(key)) && e.revision === index + 1 && typeof e.at === "string" && time(e.at) &&
        typeof e.actorKeyId === "string" && e.actorKeyId.length > 0 && e.actorKeyId.length <= 256 && typeof e.action === "string" && ["config-save", "run-claim", "run-complete", "recover-uncertain"].includes(e.action) &&
        typeof e.outcome === "string" && ["configured", "running", "succeeded", "failed", "blocked", "uncertain"].includes(e.outcome);
    })) throw new OperationsError("unavailable");
  return row as unknown as Schedule;
}
export function publicSchedule(row: Schedule) {
  return { kind: row.kind, revision: row.revision, enabled: row.enabled, intervalHours: row.intervalHours, nextRunAt: row.nextRunAt, lastAttemptAt: row.lastAttemptAt, lastSuccessAt: row.lastSuccessAt, lastResult: row.lastResult, lastErrorCode: row.lastErrorCode, runId: row.runId };
}
export function settingsInput(raw: unknown): { revision: number; enabled: boolean; intervalHours: 24 | 168 } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OperationsError("invalid");
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || Object.keys(row).some(key => !["revision", "enabled", "intervalHours"].includes(key)) || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || typeof row.enabled !== "boolean" || row.intervalHours !== 24 && row.intervalHours !== 168) throw new OperationsError("invalid");
  return { revision: Number(row.revision), enabled: row.enabled, intervalHours: row.intervalHours };
}
