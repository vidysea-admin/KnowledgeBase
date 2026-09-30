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

export interface CalendarReadDeps {
  listUpcoming(tenantId: string): Promise<UpcomingMeeting[]>;
}

export function createCalendarRouter(deps: CalendarReadDeps): Router {
  const router = Router();

  router.get("/calendar/upcoming", requireScope("calendar"), async (req: Request, res: Response) => {
    if (Object.keys(req.query).some(key => key !== "discovery") || (req.query.discovery !== undefined && req.query.discovery !== "1")) {
      res.status(400).json({ error: "invalid_discovery_query" }); return;
    }
    try {
      const meetings = await deps.listUpcoming(req.auth!.tenantId);
      res.status(200).json({ meetings: req.query.discovery === "1" ? meetings : meetings.filter(m =>
        !m.cancelled && Boolean(m.meetingUrl) && Number.isFinite(Date.parse(m.startTime))) });
    } catch {
      res.status(503).json({ error: "discovery_unavailable", message: "Calendar discovery unavailable" });
    }
  });

  return router;
}
