/**
 * apps/api/src/routes/calendar.ts — `GET /calendar/upcoming`: real upcoming meetings for the
 * Calendar page's "Upcoming" section, previously always an honest-empty state (no calendar-sync
 * source existed). Same injected-deps pattern as brain.ts/graph.ts; the real impl (`gws-calendar.ts`)
 * is Mongo-free, backed by the `gws` CLI's already-authenticated Google Calendar access.
 */
import { Router, type Request, type Response } from "express";
import type { WatchState } from "@lkb/core";
import type { VerifiedKey } from "../auth.js";
import { requireScope } from "../auth.js";
import { createSendNowRouter, unavailableSendNowRouter, type SendNowDeps } from "../join-rules/send-now.js";

export interface UpcomingMeeting {
  id: string;
  title: string;
  /** Private operator data for literal policy matching, never general KB ingestion. */
  description?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  /** ISO datetime. */
  startTime: string;
  /** ISO datetime. */
  endTime: string;
  /** Absent when the event has no joinable video-conference link. */
  meetingUrl?: string;
  /** Watch evidence only: never a bot join URL or approval to capture. Discovery is opt-in. */
  youtubeWatch?: {url: string; videoId: string; source: "location" | "description"};
  youtubeWatchIssue?: "ambiguous";
  /** Set only when a description/location scan found no safe single join link (T-036): the scheduler/UI must not guess. */
  meetingLinkIssue?: "ambiguous" | "registration-only" | "host-start-link";
  /** Where meetingUrl came from (T-036): `conference` = Google's own conference data; `location`/`description` = free text
   * written by whoever sent the invitation, so the scheduler must NOT auto-join it. Present whenever meetingUrl is. */
  meetingUrlSource?: "conference" | "location" | "description";
  organizer?: string;
  cancelled?: boolean;
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  providerUpdated?: string;
}

export interface CalendarAcquisition {
  version: 1; mode: "baseline" | "sync" | "reset"; complete: true; checkedAt: string;
  scope: "available-connected-source-state"; tenantId?: string; requestedSyncToken?: string; syncToken: string;
  sourceEvents: (UpcomingMeeting & {recurrence?: string[]})[]; meetings: UpcomingMeeting[];
  /** Cached provider state, authorized separately at the worker-owner HTTP boundary. */
  snapshot?: {version: 1; kind: "worker-snapshot"; receivedAt: string; servedAt: string; digest: string};
}
/** Persisted envelope is generated from the single schema definition. */
export type CalendarWorkerState = NonNullable<WatchState["workerSnapshot"]>["state"];
export interface CalendarWorkerHealth { status: "fresh" | "stale" | "unavailable"; receivedAt?: string; checkedAt?: string; complete?: boolean }
export interface CalendarWorkerAck { generation: string; sequence: number; digest: string; receivedAt: string; complete: boolean }
export interface CalendarWorkerControl {
  read(principal: VerifiedKey): Promise<{generation: string | null; sequence: number; digest?: string; worker: CalendarWorkerHealth}>;
  begin(principal: VerifiedKey, body: unknown): Promise<{generation: string; sequence: number}>;
  publish(principal: VerifiedKey, body: unknown): Promise<CalendarWorkerAck>;
}
/** Server-derived private operator projection; never accepted in raw worker/acquisition rows. */
export interface CalendarInventoryMeeting extends UpcomingMeeting { attendanceSkipReason?: "office-internal" }
export interface CalendarReadDeps {
  inventory?(tenantId: string): Promise<{meetings: CalendarInventoryMeeting[]; worker: CalendarWorkerHealth}>;
  worker?: CalendarWorkerControl;
  listUpcoming(tenantId: string, changedSince?: string): Promise<UpcomingMeeting[]>;
  acquire?(tenantId: string, syncToken?: string): Promise<CalendarAcquisition>;
  /** T-039 `POST /calendar/send-now`. Optional: absent -> that route answers 503 (fail closed). Real adapter: scripts/webinar/send-now/send-now-host.ts. */
  sendNow?: SendNowDeps;
}

export function createCalendarRouter(deps: CalendarReadDeps): Router {
  const router = Router();
  const privateResponse = (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-LKB-Tenant", req.auth!.tenantId);
  };
  for (const method of ["get", "put", "post"] as const) {
    const route = method === "post" ? "/calendar/worker-state/generation" : "/calendar/worker-state";
    router[method](route, requireScope("calendar"), requireScope("operations:write"), async (req: Request, res: Response) => {
      privateResponse(req, res);
      if (!deps.worker) { res.status(503).json({error: "worker_unavailable"}); return; }
      try {
        const result = method === "get" ? await deps.worker.read(req.auth!) : method === "post"
          ? await deps.worker.begin(req.auth!, req.body) : await deps.worker.publish(req.auth!, req.body);
        res.status(200).json(result);
      } catch (error) {
        const code = (error as {statusCode?: unknown})?.statusCode;
        res.status(typeof code === "number" && [400, 403, 409, 422].includes(code) ? code : 503).json({error: "worker_state_refused"});
      }
    });
  }

  router.get("/calendar/upcoming", requireScope("calendar"), async (req: Request, res: Response) => {
    privateResponse(req, res);
    const changedSince = req.query.changedSince, sync = req.query.sync, syncToken = req.query.syncToken;
    const validToken = typeof syncToken === "string" && /^[A-Za-z0-9._~+/=-]+$/.test(syncToken) && syncToken.length <= 2048;
    const validCheckpoint = typeof changedSince === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(changedSince) &&
      Number.isFinite(Date.parse(changedSince)) && new Date(changedSince).toISOString() === changedSince;
    if (Object.keys(req.query).some(key => !["discovery", "changedSince", "sync", "syncToken"].includes(key)) || (req.query.discovery !== undefined && req.query.discovery !== "1") ||
        (changedSince !== undefined && (req.query.discovery !== "1" || !validCheckpoint || sync !== undefined)) ||
        (sync !== undefined && (sync !== "1" || req.query.discovery !== "1")) ||
        (syncToken !== undefined && (sync !== "1" || !validToken))) {
      res.status(400).json({ error: "invalid_discovery_query" }); return;
    }
    try {
      if (sync === "1") {
        if (!deps.acquire) throw new Error("Calendar acquisition unavailable");
        if (deps.worker) {
          if (req.header("X-LKB-Calendar-Snapshot") !== "worker-v1") throw new Error("Snapshot transport required");
          await deps.worker.read(req.auth!); // exact configured owner/key/scopes, active-key CAS/digest checks
        }
        const acquired = await deps.acquire(req.auth!.tenantId, syncToken as string | undefined);
        if (acquired.snapshot) {
          if (!deps.worker) throw new Error("Snapshot authority unavailable");
          res.setHeader("X-LKB-Calendar-Snapshot", "worker-v1");
        }
        res.status(200).json(acquired); return;
      }
      if (deps.inventory && changedSince === undefined) {
        const inventory = await deps.inventory(req.auth!.tenantId);
        if (req.query.discovery === "1" && inventory.worker.status !== "fresh") throw new Error("Calendar source stale");
        res.status(200).json(inventory); return;
      }
      const meetings = await deps.listUpcoming(req.auth!.tenantId, changedSince as string | undefined);
      res.status(200).json({ meetings });
    } catch {
      res.status(503).json({ error: "discovery_unavailable", message: "Calendar discovery unavailable" });
    }
  });

  router.use(deps.sendNow ? createSendNowRouter(deps.sendNow) : unavailableSendNowRouter());

  return router;
}
