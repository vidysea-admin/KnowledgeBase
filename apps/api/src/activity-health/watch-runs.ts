/**
 * apps/api/src/activity-health/watch-runs.ts - T-057 D2 (jobs / errors / retries health), the watcher half.
 * `GET /watch-runs`: the caller's own tenant's recent source-watcher runs from the existing `watch_reports`
 * collection (written once per non-dry run by scripts/watch/run-watch.mjs). Scope `jobs`, the same as the
 * sibling `/activity-health` (upload queue: attempts, retries, error class) and `/jobs` (provider audit)
 * routes this completes. Tenant comes only from `req.auth.tenantId`; the store reads through the
 * tenant-scoped `@lkb/db` accessor. Error TEXT and the digest path are never served - only a count.
 */
import { Router } from "express";
import { getDb, listHeartbeats, listWatchReports, scopedCollection } from "@lkb/db";
import { createTelegramAlertSink, type WatchState } from "@lkb/core";
import { requireScope } from "../auth.js";
import type { WatchSilenceDeps } from "../routes/health.js";
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

/** D-048/D-053: health reads only configured WATCH_HEARTBEAT_TENANTS through tenant-scoped
 * DB accessors. The permitted core Telegram sink binds lazily; API cannot import meeting-bot. */
/** U4d (D-047/D-048): the ONE place `WATCH_HEARTBEAT_INTERVAL_MS` is parsed with its 1-hour
 * fallback — extracted out of `createMongoWatchSilenceDeps` (which used to inline this) so
 * `createMongoWatchStateReadDeps` below reads the exact same number instead of re-declaring the
 * fallback a third time (the first two are this file's former inline copy and
 * scripts/watch/lib/heartbeat.mjs's `watchHeartbeatIntervalMs`, pinned equal by
 * `health.test.ts`'s drift test). Writer, detector and now the page must all agree on one number,
 * or a watcher can look alive to one reader and dead to another. */
function watchHeartbeatIntervalMs(): number {
  const parsed = process.env.WATCH_HEARTBEAT_INTERVAL_MS ? Number(process.env.WATCH_HEARTBEAT_INTERVAL_MS) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 1000;
}

export function createMongoWatchSilenceDeps(): WatchSilenceDeps {
  const tenantIds = (process.env.WATCH_HEARTBEAT_TENANTS ?? "toc").split(",").map((t) => t.trim()).filter(Boolean);
  // U4b/R2 (D-053): a real alert transport, not a console sink. Construction reads env only
  // (token/chatId), matching this factory's lazy-binding style and production.test.ts's
  // "constructs without throwing or requiring a live network connection" guarantee -- the
  // actual HTTPS call happens only if/when notifyWatchSilent is invoked.
  const alertSink = createTelegramAlertSink();
  return {
    tenantIds,
    intervalMs: watchHeartbeatIntervalMs(),
    listHeartbeats: (tenantId) => listHeartbeats(tenantId),
    notifyWatchSilent: (tenantId, sourceType, lastHeartbeatAt, intervalMs) =>
      alertSink.notifyWatchSilent(tenantId, sourceType, lastHeartbeatAt, intervalMs),
  };
}

/** Public watcher metadata excludes private staging before the bounded query.
 * The interval stays shared with the watcher-silence detector. */
export function createMongoWatchStateReadDeps() {
  return {
    listWatchState: (tenantId: string) => scopedCollection<WatchState>(getDb(), "watch_state")(tenantId).find({workerSnapshot: {$exists: false}, workerReceipt: {$exists: false}}).sort({seenAt: -1}).limit(200).toArray(),
    listHeartbeats: (tenantId: string) => listHeartbeats(tenantId),
    heartbeatIntervalMs: watchHeartbeatIntervalMs(),
  };
}
