/**
 * apps/api/src/routes/calendar.ts — `GET /calendar/upcoming`: real upcoming meetings for the
 * Calendar page's "Upcoming" section, previously always an honest-empty state (no calendar-sync
 * source existed). Same injected-deps pattern as brain.ts/graph.ts; the real impl (`gws-calendar.ts`)
 * is Mongo-free, backed by the `gws` CLI's already-authenticated Google Calendar access.
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";

export interface UpcomingMeeting {
  id: string;
  title: string;
  /** ISO datetime. */
  startTime: string;
  /** ISO datetime. */
  endTime: string;
  /** Absent when the event has no joinable video-conference link. */
  meetingUrl?: string;
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
}
export interface CalendarReadDeps {
  listUpcoming(tenantId: string, changedSince?: string): Promise<UpcomingMeeting[]>;
  acquire?(tenantId: string, syncToken?: string): Promise<CalendarAcquisition>;
}

export function createCalendarRouter(deps: CalendarReadDeps): Router {
  const router = Router();

  router.get("/calendar/upcoming", requireScope("calendar"), async (req: Request, res: Response) => {
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
        res.status(200).json(await deps.acquire(req.auth!.tenantId, syncToken as string | undefined)); return;
      }
      const meetings = await deps.listUpcoming(req.auth!.tenantId, changedSince as string | undefined);
      res.status(200).json({ meetings: req.query.discovery === "1" ? meetings : meetings.filter(m =>
        !m.cancelled && Boolean(m.meetingUrl) && Number.isFinite(Date.parse(m.startTime))) });
    } catch {
      res.status(503).json({ error: "discovery_unavailable", message: "Calendar discovery unavailable" });
    }
  });

  return router;
}
