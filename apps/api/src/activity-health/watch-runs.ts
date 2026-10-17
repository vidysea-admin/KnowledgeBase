/**
 * apps/api/src/activity-health/watch-runs.ts - T-057 D2 (jobs / errors / retries health), the watcher half.
 * `GET /watch-runs`: the caller's own tenant's recent source-watcher runs from the existing `watch_reports`
 * collection (written once per non-dry run by scripts/watch/run-watch.mjs). Scope `jobs`, the same as the
 * sibling `/activity-health` (upload queue: attempts, retries, error class) and `/jobs` (provider audit)
 * routes this completes. Tenant comes only from `req.auth.tenantId`; the store reads through the
 * tenant-scoped `@lkb/db` accessor. Error TEXT and the digest path are never served - only a count.
 */
import { Router } from "express";
import { listWatchReports } from "@lkb/db";
import { requireScope } from "../auth.js";
import { queueTimestamp } from "./types.js";

export interface WatchRun {
  id: string;
  runAt: string;
  mode: "watch" | "ingest";
  driveNewFound: number | null;
  driveIngested: number | null;
  driveFailed: number | null;
  /** Number of error strings the run recorded (the strings themselves are not served). */
  errorCount: number;
}
export interface WatchRunsSnapshot {
  runs: WatchRun[];
  limit: number;
  truncated: boolean;
  /** Computed over the returned runs only (a window, not lifetime totals). */
  summary: { runs: number; runsWithFailures: number; totalDriveFailed: number; totalErrors: number; lastFailureAt: string | null };
}
export interface WatchRunsDeps { readWatchRuns(tenantId: string, limit: number): Promise<{ runs: unknown[]; truncated: boolean }> }

export const unavailableWatchRunsDeps: WatchRunsDeps = { async readWatchRuns() { throw new Error("Watch runs unavailable"); } };

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid watch runs limit");
}
const count = (v: unknown): number | null => v === undefined ? null : typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : (() => { throw new Error("Invalid watch run"); })();

export function projectWatchRun(value: unknown): WatchRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid watch run");
  const row = value as Record<string, unknown>;
  if (typeof row._id !== "string" || !row._id || (row.mode !== "watch" && row.mode !== "ingest") ||
      row.errors !== undefined && (!Array.isArray(row.errors) || !row.errors.every((e) => typeof e === "string"))) throw new Error("Invalid watch run");
  return { id: row._id, runAt: queueTimestamp(row.runAt), mode: row.mode, driveNewFound: count(row.driveNewFound),
    driveIngested: count(row.driveIngested), driveFailed: count(row.driveFailed), errorCount: Array.isArray(row.errors) ? row.errors.length : 0 };
}

export function summarizeWatchRuns(runs: WatchRun[]): WatchRunsSnapshot["summary"] {
  const failed = runs.filter((r) => (r.driveFailed ?? 0) > 0 || r.errorCount > 0);
  return { runs: runs.length, runsWithFailures: failed.length, totalDriveFailed: runs.reduce((s, r) => s + (r.driveFailed ?? 0), 0),
    totalErrors: runs.reduce((s, r) => s + r.errorCount, 0),
    lastFailureAt: failed.length ? failed.map((r) => r.runAt).sort().at(-1)! : null };
}

export type WatchReportsReader = (tenantId: string, limit: number) => Promise<unknown[]>;
/** Production reader: `listWatchReports` is tenant-scoped (scopedCollection), newest run first. */
export function createMongoWatchRunsDeps(reader: WatchReportsReader = listWatchReports): WatchRunsDeps {
  return {
    async readWatchRuns(tenantId, limit) {
      assertLimit(limit);
      if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Invalid watch runs tenant");
      const rows = await reader(tenantId, limit + 1);
      if (!Array.isArray(rows) || rows.length > limit + 1) throw new Error("Invalid watch runs result");
      return { runs: rows.slice(0, limit), truncated: rows.length > limit };
    },
  };
}

export function createWatchRunsRouter(deps: WatchRunsDeps): Router {
  const router = Router();
  router.get("/watch-runs", requireScope("jobs"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const params = new URL(req.originalUrl, "http://localhost").searchParams, raw = params.get("limit");
    const body: unknown = req.body;
    if ([...params.keys()].some((k) => k !== "limit") || params.getAll("limit").length > 1 ||
        Object.keys(req.query).some((k) => k !== "limit") || req.query.limit !== undefined && typeof req.query.limit !== "string" ||
        raw !== null && (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100) ||
        body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) {
      res.status(400).json({ error: "invalid_watch_runs_query", message: "Invalid watch runs query" }); return;
    }
    const limit = raw === null ? 50 : Number(raw);
    try {
      if (typeof req.auth?.tenantId !== "string" || !req.auth.tenantId.trim()) throw new Error("Missing verified tenant");
      const result = await deps.readWatchRuns(req.auth.tenantId, limit);
      if (!result || !Array.isArray(result.runs) || typeof result.truncated !== "boolean" || result.runs.length > limit ||
          result.truncated && result.runs.length !== limit) throw new Error("Invalid watch runs response");
      const runs = result.runs.map(projectWatchRun);
      const snapshot: WatchRunsSnapshot = { runs, limit, truncated: result.truncated, summary: summarizeWatchRuns(runs) };
      res.status(200).json(snapshot);
    } catch { res.status(503).json({ error: "watch_runs_unavailable", message: "Watcher run history is unavailable for this tenant" }); }
  });
  return router;
}
