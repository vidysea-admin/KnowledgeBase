import { apiFetch } from "../../api/client.js";
export type IntegrationKind = "digest" | "sheets";
export interface Schedule {
  kind: IntegrationKind; revision: number; enabled: boolean; intervalHours: 24 | 168;
  nextRunAt: string | null; lastAttemptAt: string | null; lastSuccessAt: string | null;
  lastResult: "never" | "running" | "succeeded" | "failed" | "blocked" | "uncertain";
  lastErrorCode: string | null; runId: string | null;
}
export interface Configuration { schedules: Array<Schedule & { available: boolean }>; exportScope: "session-metadata-only" }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const time = (v: unknown) => v === null || typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function readSchedule(raw: unknown): Schedule {
  if (!object(raw) || typeof raw.kind !== "string" || !["digest", "sheets"].includes(raw.kind) || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 || typeof raw.enabled !== "boolean" || raw.intervalHours !== 24 && raw.intervalHours !== 168 ||
    ![raw.nextRunAt, raw.lastAttemptAt, raw.lastSuccessAt].every(time) || typeof raw.lastResult !== "string" || !["never", "running", "succeeded", "failed", "blocked", "uncertain"].includes(raw.lastResult) ||
    !(raw.lastErrorCode === null || typeof raw.lastErrorCode === "string" && ["configuration", "source-unavailable", "delivery-failed", "write-failed", "lease-expired", "authorization"].includes(raw.lastErrorCode)) ||
    !(raw.runId === null || typeof raw.runId === "string" && /^[a-f0-9]{64}$/.test(raw.runId)) || raw.enabled && raw.nextRunAt === null || raw.lastResult === "succeeded" && (raw.lastSuccessAt === null || raw.runId === null || raw.lastAttemptAt === null) || raw.lastResult === "uncertain" && (raw.enabled || raw.runId === null || raw.lastAttemptAt === null)) throw new Error("Invalid schedule response");
  return { kind: raw.kind as IntegrationKind, revision: Number(raw.revision), enabled: raw.enabled, intervalHours: raw.intervalHours, nextRunAt: raw.nextRunAt as string | null,
    lastAttemptAt: raw.lastAttemptAt as string | null, lastSuccessAt: raw.lastSuccessAt as string | null, lastResult: raw.lastResult as Schedule["lastResult"], lastErrorCode: raw.lastErrorCode as string | null, runId: raw.runId as string | null };
}
export async function loadConfiguration(key: string): Promise<Configuration> {
  const raw = await apiFetch<unknown>("/operations-integrations", key);
  if (!object(raw) || raw.exportScope !== "session-metadata-only" || !Array.isArray(raw.schedules) || raw.schedules.length !== 2) throw new Error("Invalid integrations configuration");
  const schedules = raw.schedules.map(value => { const schedule = readSchedule(value); if (!object(value) || typeof value.available !== "boolean") throw new Error("Invalid capability"); return { ...schedule, available: value.available }; });
  if (new Set(schedules.map(row => row.kind)).size !== 2) throw new Error("Duplicate schedule");
  return { schedules, exportScope: "session-metadata-only" };
}
export async function loadPreview(key: string) {
  const raw = await apiFetch<unknown>("/operations-integrations/preview", key);
  if (!object(raw) || raw.exportScope !== "session-metadata-only" || !Number.isInteger(raw.returned) || Number(raw.returned) < 0 || Number(raw.returned) > 500 || !Number.isInteger(raw.ready) || Number(raw.ready) < 0 || Number(raw.ready) > Number(raw.returned) || typeof raw.truncated !== "boolean" || raw.truncated && raw.returned !== 500) throw new Error("Invalid preview");
  return { returned: Number(raw.returned), ready: Number(raw.ready), truncated: raw.truncated };
}
export async function saveSchedule(key: string, schedule: Schedule, enabled: boolean, intervalHours: 24 | 168): Promise<Schedule> {
  const result = readSchedule(await apiFetch<unknown>(`/operations-integrations/${schedule.kind}`, key, { method: "PUT", body: { revision: schedule.revision, enabled, intervalHours } }));
  if (result.kind !== schedule.kind || result.revision !== schedule.revision + 1) throw new Error("Invalid schedule mutation response"); return result;
}
export async function runSchedule(key: string, schedule: Schedule): Promise<Schedule> {
  const result = readSchedule(await apiFetch<unknown>(`/operations-integrations/${schedule.kind}/run`, key, { method: "POST", body: { revision: schedule.revision, confirm: schedule.kind === "digest" ? "RUN_DIGEST" : "RUN_SHEETS" } }));
  if (result.kind !== schedule.kind || result.revision <= schedule.revision || !["succeeded", "failed", "uncertain"].includes(result.lastResult)) throw new Error("Invalid run response"); return result;
}
export async function reconcileSchedule(key: string, schedule: Schedule): Promise<Schedule> {
  const result = readSchedule(await apiFetch<unknown>(`/operations-integrations/${schedule.kind}/reconcile`, key, { method: "POST", body: { revision: schedule.revision, confirm: schedule.kind === "digest" ? "RECONCILE_DIGEST" : "RECONCILE_SHEETS" } }));
  if (result.kind !== schedule.kind || result.revision < schedule.revision || result.enabled || !["succeeded", "uncertain"].includes(result.lastResult)) throw new Error("Invalid reconciliation response"); return result;
}
