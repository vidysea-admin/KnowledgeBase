/**
 * apps/api/src/gws-calendar.ts — real upcoming-meetings adapter backed by the `gws` CLI, already
 * OAuth'd as umeshsugara@vidysea.com (the same credential the `doc-polisher` skill's
 * `gws_doc_polisher.py` uses for Docs — `calendar.readonly` is already among its granted scopes,
 * confirmed live via `gws auth status`). No new Google Cloud project or OAuth flow needed.
 *
 * Shells out to `gws calendar events list` via `cmd /c` (the same wrapping
 * `gws_doc_polisher.py`'s `run_gws()` uses — plain `execFile("gws", …)` cannot resolve npm's
 * Windows `.cmd`/`.ps1` shims). The `--params` JSON is built entirely from values this file
 * computes (a fixed time window) — no caller input ever reaches the shell. `gws` always prefixes
 * its JSON stdout with a "Using keyring backend: …" diagnostic line; `parseGwsJson` skips to the
 * first `{`/`[`, same as `run_gws()` does in Python.
 *
 * Discovery retains cancelled tombstones and incomplete invites. The Calendar route separately
 * projects joinable positive rows for its default UI response.
 *
 * Disclosed limitation: this only works on a machine with the `gws` CLI + its OAuth keyring
 * configured (Umesh's own machine today) — not yet portable to a hosted multi-tenant deployment,
 * and it reads one calendar ("primary"), not a per-tenant mapping. Discovery failures propagate
 * as a sanitized error; an unavailable calendar must never look like successful empty coverage.
 */
import { execFile } from "node:child_process";
import type { UpcomingMeeting } from "./routes/calendar.js";

interface GwsEventListResponse {
  items?: GwsCalendarEvent[];
  kind?: string;
  nextPageToken?: string;
  error?: unknown;
}

interface GwsCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  organizer?: { email?: string };
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
  updated?: string;
}

function parseGwsJson(stdout: string): unknown {
  const lines = stdout.split("\n");
  const startIdx = lines.findIndex((l) => l.trim().startsWith("{") || l.trim().startsWith("["));
  if (startIdx === -1) throw new Error("gws produced no JSON output");
  return JSON.parse(lines.slice(startIdx).join("\n"));
}

function meetingUrlOf(event: GwsCalendarEvent): string | undefined {
  if (event.hangoutLink) return event.hangoutLink;
  return event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
}

function runGws(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.platform === "win32" ? "cmd" : "gws", process.platform === "win32" ? ["/c", "gws", ...args] : args, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(err); return; }
      resolve(stdout);
    });
  });
}

export async function listUpcomingGwsMeetings(windowDays = 14, run = runGws): Promise<UpcomingMeeting[]> {
  if (!Number.isFinite(windowDays) || windowDays <= 0 || windowDays > 366) throw new Error("Invalid calendar discovery window");
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();
  const params = {
    calendarId: "primary", maxResults: 2500, orderBy: "startTime", singleEvents: true, showDeleted: true, timeMin, timeMax,
  };

  try {
    let pageToken: string | undefined;
    const seen = new Set<string>(), events: GwsCalendarEvent[] = [];
    for (let page = 0; page < 20; page++) {
      const parsed = parseGwsJson(await run(["calendar", "events", "list", "--params", JSON.stringify({...params, pageToken}), "--format", "json"])) as GwsEventListResponse;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || "error" in parsed ||
          (!Array.isArray(parsed.items) && !(parsed.items === undefined && parsed.kind === "calendar#events"))) throw new Error("Invalid calendar response");
      events.push(...(parsed.items ?? []));
      pageToken = parsed.nextPageToken;
      if (pageToken === undefined) break;
      if (typeof pageToken !== "string" || !/^[A-Za-z0-9._~+/=-]+$/.test(pageToken) || pageToken.length > 2048 || seen.has(pageToken) || page === 19) throw new Error("Calendar discovery incomplete");
      seen.add(pageToken);
    }
    const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
    const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const dateTime = (value: unknown) => {
      if (!text(value, 64)) return false;
      const match = /^(\d{4}-\d\d-\d\d)T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(?:Z|[+-]([01]\d|2[0-3]):([0-5]\d))$/.exec(value as string);
      return Boolean(match && date(match[1]) && Number.isFinite(Date.parse(value as string)));
    };
    const time = (value: unknown) => {
      if (value === undefined) return true;
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const v = value as { date?: unknown; dateTime?: unknown };
      if ((v.date === undefined) === (v.dateTime === undefined)) return false;
      return v.dateTime !== undefined ? dateTime(v.dateTime) : date(v.date);
    };
    return events.map((e): UpcomingMeeting => {
      if (!e || typeof e !== "object" || Array.isArray(e) || !text(e.id, 1024) ||
          (e.status !== undefined && !["confirmed", "tentative", "cancelled"].includes(e.status)) ||
          (e.summary !== undefined && (typeof e.summary !== "string" || e.summary.length > 2000)) ||
          !time(e.start) || !time(e.end) || !time(e.originalStartTime) ||
          (e.updated !== undefined && !dateTime(e.updated)) ||
          ((e.recurringEventId === undefined) !== (e.originalStartTime === undefined)) ||
          (e.recurringEventId !== undefined && !text(e.recurringEventId, 1024)) ||
          (e.organizer !== undefined && (!e.organizer || typeof e.organizer !== "object" || Array.isArray(e.organizer) || (e.organizer.email !== undefined && !text(e.organizer.email, 320))))) throw new Error("Invalid calendar event");
      const meetingUrl = meetingUrlOf(e);
      if (meetingUrl !== undefined && !text(meetingUrl, 8192)) throw new Error("Invalid calendar link");
      return {
      id: e.id,
      title: e.summary ?? "(untitled)",
      startTime: e.start?.dateTime ?? e.start?.date ?? "",
      endTime: e.end?.dateTime ?? e.end?.date ?? "",
      meetingUrl,
      organizer: e.organizer?.email,
      cancelled: e.status === "cancelled",
      recurringEventId: e.recurringEventId,
      originalStartTime: e.originalStartTime,
      providerUpdated: e.updated,
    }; });
  } catch {
    throw new Error("Calendar discovery unavailable");
  }
}
