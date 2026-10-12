/**
 * apps/api/src/activity-health/notifications.ts - T-057 D5 (in-app notification center), read-only.
 * `GET /notifications`: the caller's own tenant's recent operator-facing failures, AGGREGATED at request
 * time from three EXISTING tenant-scoped sources (no new collection, no schema): upload-queue failed jobs
 * (activity-health), provider audit failed jobs (jobs) and source-watcher runs with failures (watch-runs).
 * Scope `jobs`, as for those siblings. Tenant comes only from `req.auth.tenantId`. Titles and details are
 * built here from fixed templates, enums and numbers; stored error text, digest paths and free text are
 * never served. A source that fails is reported as `unavailable` (never silently empty); 503 only if all do.
 * NOT persisted anywhere: r1 attention alerts, join-rules skips and capture failures reach operators by
 * Telegram only, so they cannot appear here (see qa/manifests/t057-notification-center.md).
 */
import { Router } from "express";
import { requireScope } from "../auth.js";
import { projectJobSummary, type JobsReadDeps } from "../jobs/router.js";
import { projectActivitySnapshot, queueTimestamp, type ActivityHealthDeps } from "./types.js";
import { projectWatchRun, type WatchRunsDeps } from "./watch-runs.js";

export const notificationSources = ["upload-queue", "provider-jobs", "watcher"] as const;
export type NotificationSource = typeof notificationSources[number];
export interface Notification {
  id: string;
  source: NotificationSource;
  severity: "error";
  title: string;
  detail: string | null;
  occurredAt: string;
}
export type SourceState = "ok" | "unavailable";
export interface NotificationsResponse {
  notifications: Notification[];
  limit: number;
  /** True when any source had older rows than its window, or more failures than `limit` were found. */
  truncated: boolean;
  sources: { uploadQueue: SourceState; providerJobs: SourceState; watcher: SourceState };
}
export interface NotificationsDeps { activityHealth: ActivityHealthDeps; jobs: JobsReadDeps; watchRuns: WatchRunsDeps }

const safeWord = (v: unknown): string | null => typeof v === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(v) ? v : null;
const safeId = (source: NotificationSource, id: string): string => {
  if (!id || id.length > 200) throw new Error("Invalid notification id");
  return `${source}:${id}`;
};
interface Part { items: Notification[]; truncated: boolean }

async function fromQueue(deps: NotificationsDeps, tenantId: string, limit: number): Promise<Part> {
  const snap = projectActivitySnapshot(await deps.activityHealth.readActivityHealth(tenantId, limit), limit);
  const items = snap.jobs.filter((j) => j.status === "failed").map((j): Notification => ({
    id: safeId("upload-queue", j.id), source: "upload-queue", severity: "error", title: "Upload transcription job failed",
    detail: `Failure class: ${j.errorClass ?? "unknown"}; attempts ${j.attempts} of ${j.maxAttempts}`, occurredAt: queueTimestamp(j.updatedAt ?? j.createdAt) }));
  return { items, truncated: snap.truncated };
}
async function fromProviderJobs(deps: NotificationsDeps, tenantId: string, limit: number): Promise<Part> {
  const res = await deps.jobs.listJobs(tenantId, limit);
  if (!res || res.limit !== limit || typeof res.truncated !== "boolean" || !Array.isArray(res.jobs) || res.jobs.length > limit ||
      res.truncated && res.jobs.length !== limit) throw new Error("Invalid jobs response");
  const items = res.jobs.map(projectJobSummary).filter((j) => j.status === "failed").map((j): Notification => {
    const kind = safeWord(j.kind), provider = safeWord(j.provider);
    return { id: safeId("provider-jobs", j._id), source: "provider-jobs", severity: "error", title: "Provider job failed",
      detail: [kind && `Kind: ${kind}`, provider && `Provider: ${provider}`].filter(Boolean).join("; ") || null, occurredAt: queueTimestamp(j.updatedAt ?? j.createdAt) };
  });
  return { items, truncated: res.truncated };
}
async function fromWatcher(deps: NotificationsDeps, tenantId: string, limit: number): Promise<Part> {
  const res = await deps.watchRuns.readWatchRuns(tenantId, limit);
  if (!res || !Array.isArray(res.runs) || typeof res.truncated !== "boolean" || res.runs.length > limit || res.truncated && res.runs.length !== limit) throw new Error("Invalid watch runs response");
  const items = res.runs.map(projectWatchRun).filter((r) => (r.driveFailed ?? 0) > 0 || r.errorCount > 0).map((r): Notification => ({
    id: safeId("watcher", r.id), source: "watcher", severity: "error", title: "Source watcher run reported failures",
    detail: `${r.mode} run: ${r.driveFailed ?? 0} drive recordings failed; ${r.errorCount} errors recorded`, occurredAt: r.runAt }));
  return { items, truncated: res.truncated };
}

export async function collectNotifications(deps: NotificationsDeps, tenantId: string, limit: number): Promise<NotificationsResponse> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid notifications limit");
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Missing verified tenant");
  const settled = await Promise.allSettled([fromQueue(deps, tenantId, limit), fromProviderJobs(deps, tenantId, limit), fromWatcher(deps, tenantId, limit)]);
  const state = (i: number): SourceState => settled[i]!.status === "fulfilled" ? "ok" : "unavailable";
  const sources = { uploadQueue: state(0), providerJobs: state(1), watcher: state(2) };
  if (settled.every((s) => s.status === "rejected")) throw new Error("All notification sources unavailable");
  const all = settled.flatMap((s) => s.status === "fulfilled" ? s.value.items : [])
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const anyTruncated = settled.some((s) => s.status === "fulfilled" && s.value.truncated);
  return { notifications: all.slice(0, limit), limit, truncated: anyTruncated || all.length > limit, sources };
}

export function createNotificationsRouter(deps: NotificationsDeps): Router {
  const router = Router();
  router.get("/notifications", requireScope("jobs"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const params = new URL(req.originalUrl, "http://localhost").searchParams, raw = params.get("limit");
    const body: unknown = req.body;
    if ([...params.keys()].some((k) => k !== "limit") || params.getAll("limit").length > 1 ||
        Object.keys(req.query).some((k) => k !== "limit") || req.query.limit !== undefined && typeof req.query.limit !== "string" ||
        raw !== null && (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100) ||
        body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) {
      res.status(400).json({ error: "invalid_notifications_query", message: "Invalid notifications query" }); return;
    }
    const limit = raw === null ? 50 : Number(raw);
    try {
      res.status(200).json(await collectNotifications(deps, req.auth?.tenantId as string, limit));
    } catch { res.status(503).json({ error: "notifications_unavailable", message: "Notifications are unavailable for this tenant" }); }
  });
  return router;
}
