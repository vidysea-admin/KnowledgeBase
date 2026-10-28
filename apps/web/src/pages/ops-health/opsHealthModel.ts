/**
 * T-057 D2 (jobs / errors / retries health). Pure figures for the three existing, tenant-scoped sources
 * plus the strict reader for the new GET /watch-runs. Nothing here invents data: a figure the source does
 * not record (provider jobs carry no retry count) is reported as not recorded, never as zero.
 */
import { apiFetch, ApiError } from "../../api/client.js";
import type { ActivitySnapshot } from "../activity-health/activityHealthModel.js";
import type { JobsReadResponse } from "../../api/jobs.js";

export interface WatchRun { id: string; runAt: string; mode: "watch" | "ingest"; driveNewFound: number | null; driveIngested: number | null; driveFailed: number | null; errorCount: number }
export interface WatchRunsResponse { runs: WatchRun[]; limit: number; truncated: boolean;
  summary: { runs: number; runsWithFailures: number; totalDriveFailed: number; totalErrors: number; lastFailureAt: string | null } }

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const natOrNull = (v: unknown): v is number | null => v === null || nat(v);
const time = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

export async function loadWatchRuns(apiKey: string | null, limit = 50): Promise<WatchRunsResponse> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "Invalid watch runs limit.");
  const bad = () => new ApiError(503, "Invalid watch runs response.");
  const raw = await apiFetch<unknown>(`/watch-runs?limit=${limit}`, apiKey);
  if (!obj(raw) || !Array.isArray(raw.runs) || raw.limit !== limit || typeof raw.truncated !== "boolean" || raw.runs.length > limit || !obj(raw.summary)) throw bad();
  for (const r of raw.runs) {
    if (!obj(r) || typeof r.id !== "string" || !time(r.runAt) || (r.mode !== "watch" && r.mode !== "ingest") || !natOrNull(r.driveNewFound) ||
        !natOrNull(r.driveIngested) || !natOrNull(r.driveFailed) || !nat(r.errorCount)) throw bad();
  }
  const s = raw.summary;
  if (!nat(s.runs) || !nat(s.runsWithFailures) || !nat(s.totalDriveFailed) || !nat(s.totalErrors) || !(s.lastFailureAt === null || time(s.lastFailureAt))) throw bad();
  return raw as unknown as WatchRunsResponse;
}

export function queueHealth(snapshot: ActivitySnapshot) {
  const by = { pending: 0, processing: 0, done: 0, failed: 0 };
  const errors: Record<string, number> = {};
  let retried = 0, retries = 0, lastFailureAt: string | null = null;
  for (const j of snapshot.jobs) {
    by[j.status]++;
    if (j.automaticRetryCount > 0) { retried++; retries += j.automaticRetryCount; }
    if (j.status === "failed") {
      const cls = j.errorClass ?? "unknown";
      errors[cls] = (errors[cls] ?? 0) + 1;
      const at = j.updatedAt ?? j.createdAt;
      if (lastFailureAt === null || at > lastFailureAt) lastFailureAt = at;
    }
  }
  return { total: snapshot.jobs.length, by, retried, retries, errors, lastFailureAt, truncated: snapshot.truncated };
}

export function providerJobsHealth(res: JobsReadResponse) {
  const by = { pending: 0, processing: 0, done: 0, failed: 0 };
  let lastFailureAt: string | null = null;
  for (const j of res.jobs) {
    by[j.status]++;
    if (j.status === "failed") { const at = j.updatedAt ?? j.createdAt; if (lastFailureAt === null || at > lastFailureAt) lastFailureAt = at; }
  }
  return { total: res.jobs.length, by, lastFailureAt, truncated: res.truncated };
}
