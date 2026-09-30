/**
 * apps/api/src/gws-calendar.ts — real upcoming-meetings adapter backed by the `gws` CLI, already
 * OAuth'd as umeshsugara@vidysea.com (the same credential the `doc-polisher` skill's
 * `gws_doc_polisher.py` uses for Docs — `calendar.readonly` is already among its granted scopes,
 * confirmed live via `gws auth status`). No new Google Cloud project or OAuth flow needed.
 *
 * Shells out to `gws calendar events list` via `cmd /c` (the same wrapping
 * `gws_doc_polisher.py`'s `run_gws()` uses — plain `execFile("gws", …)` cannot resolve npm's
 * Windows `.cmd`/`.ps1` shims). Parameters use computed windows, strictly validated canonical
 * change checkpoints and safe opaque page tokens. `gws` always prefixes
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
import type { UpcomingMeeting, CalendarAcquisition, CalendarReadDeps } from "./routes/calendar.js";

interface GwsEventListResponse {
  items?: GwsCalendarEvent[];
  kind?: string;
  nextPageToken?: string;
  nextSyncToken?: string;
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
  recurrence?: string[];
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

export function runGws(args: string[], exec = execFile): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(process.platform === "win32" ? "cmd" : "gws", process.platform === "win32" ? ["/c", "gws", ...args] : args, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        try { const parsed = parseGwsJson(stdout) as {error?: {code?: unknown}};
          if (err.code === 1 && !err.killed && !err.signal && parsed?.error?.code === 410) { reject(Object.assign(new Error("Calendar token expired"), {statusCode: 410})); return; }
        } catch { /* Process errors without structured provider status remain unknown. */ }
        reject(err); return;
      }
      resolve(stdout);
    });
  });
}

type CalendarRun = typeof runGws;
export function listUpcomingGwsMeetings(windowDays?: number, run?: CalendarRun, changedSince?: string): Promise<UpcomingMeeting[]>;
export function listUpcomingGwsMeetings(windowDays: number, run: CalendarRun | undefined, changedSince: undefined, acquisition: {syncToken?: string}): Promise<CalendarAcquisition>;
export async function listUpcomingGwsMeetings(windowDays = 14, run = runGws, changedSince?: string, acquisition?: {syncToken?: string}): Promise<UpcomingMeeting[] | CalendarAcquisition> {
  if (!Number.isFinite(windowDays) || windowDays <= 0 || windowDays > 366) throw new Error("Invalid calendar discovery window");
  if (changedSince !== undefined && (typeof changedSince !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(changedSince) ||
      !Number.isFinite(Date.parse(changedSince)) || new Date(changedSince).toISOString() !== changedSince)) throw new Error("Invalid calendar change checkpoint");
  const safeToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._~+/=-]+$/.test(value) && value.length <= 2048;
  if (acquisition && (changedSince !== undefined || Object.keys(acquisition).some(k => k !== "syncToken") ||
      (acquisition.syncToken !== undefined && !safeToken(acquisition.syncToken)))) throw new Error("Invalid calendar acquisition");
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();
  const params = {
    calendarId: "primary", maxResults: 2500, orderBy: "startTime", singleEvents: true, showDeleted: true, timeMin, timeMax,
  };

  try {
    const events: GwsCalendarEvent[] = [], liveDeltaMasters = new Set<GwsCalendarEvent>();
    const sourceParams = {calendarId: "primary", maxResults: 2500, singleEvents: false, showDeleted: true, showHiddenInvitations: true};
    let syncToken: string | undefined, sourceCount = 0;
    let mode: CalendarAcquisition["mode"] = acquisition?.syncToken ? "sync" : "baseline";
    async function collect(pass: Record<string, unknown>, source = false): Promise<GwsCalendarEvent[]> {
      let pageToken: string | undefined;
      const seen = new Set<string>(), rows: GwsCalendarEvent[] = [];
      for (let page = 0; page < 20; page++) {
        const parsed = parseGwsJson(await run(["calendar", "events", "list", "--params", JSON.stringify({...pass, pageToken}), "--format", "json"])) as GwsEventListResponse;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "error" in parsed &&
            (parsed.error as {code?: unknown})?.code === 410) throw Object.assign(new Error("Expired Calendar token"), {statusCode: 410});
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || "error" in parsed ||
            (!Array.isArray(parsed.items) && !(parsed.items === undefined && parsed.kind === "calendar#events"))) throw new Error("Invalid calendar response");
        rows.push(...(parsed.items ?? []));
        if (rows.length > 50000) throw new Error("Calendar row budget exceeded");
        pageToken = parsed.nextPageToken;
        if (source && (pageToken !== undefined ? parsed.nextSyncToken !== undefined : !safeToken(parsed.nextSyncToken))) throw new Error("Invalid Calendar terminal token");
        if (pageToken === undefined) { if (source) syncToken = parsed.nextSyncToken; return rows; }
        if (!safeToken(pageToken) || seen.has(pageToken) || page === 19) throw new Error("Calendar discovery incomplete");
        seen.add(pageToken);
      }
      throw new Error("Calendar discovery incomplete");
    }
    if (acquisition) {
      let source: GwsCalendarEvent[];
      try { source = await collect({...sourceParams, ...(acquisition.syncToken ? {syncToken: acquisition.syncToken} : {})}, true); }
      catch (error) {
        if (!acquisition.syncToken || (error as {statusCode?: unknown})?.statusCode !== 410) throw error;
        mode = "reset"; source = await collect(sourceParams, true);
      }
      events.push(...source); sourceCount = source.length;
    }
    const passes: Record<string, unknown>[] = [params];
    if (changedSince !== undefined) passes.push({calendarId: "primary", maxResults: 2500, orderBy: "updated", singleEvents: false, showDeleted: true, updatedMin: changedSince});
    for (const pass of passes) {
      const rows = await collect(pass); events.push(...rows);
      if (!pass.singleEvents) for (const event of rows) {
        if (event?.status !== "cancelled" && !event?.recurringEventId && Array.isArray(event?.recurrence) && event.recurrence.length) liveDeltaMasters.add(event);
      }
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
    const mapped = events.map((e, index): UpcomingMeeting & {recurrence?: string[]} => {
      if (!e || typeof e !== "object" || Array.isArray(e) || !text(e.id, 1024) ||
          (e.status !== undefined && !["confirmed", "tentative", "cancelled"].includes(e.status)) ||
          (e.summary !== undefined && (typeof e.summary !== "string" || e.summary.length > 2000)) ||
          !time(e.start) || !time(e.end) || !time(e.originalStartTime) ||
          (e.updated !== undefined && !dateTime(e.updated)) ||
          ((e.recurringEventId === undefined) !== (e.originalStartTime === undefined)) ||
          (e.recurringEventId !== undefined && !text(e.recurringEventId, 1024)) ||
          (e.recurrence !== undefined && (!Array.isArray(e.recurrence) || e.recurrence.length === 0 || e.recurrence.length > 32 || e.recurrence.some(rule => !text(rule, 8192)))) ||
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
      originalStartTime: e.originalStartTime === undefined ? undefined : e.originalStartTime.date !== undefined
        ? {date: e.originalStartTime.date} : {dateTime: e.originalStartTime.dateTime},
      providerUpdated: e.updated,
      ...(acquisition && index < sourceCount && e.recurrence ? {recurrence: e.recurrence} : {}),
    }; });
    // A live recurring master describes a series, not an expanded capture occurrence.
    // Validate it above, then omit it only from delta; deleted masters still drive cancellation.
    if (acquisition) return {version: 1, mode, complete: true, checkedAt: timeMin, scope: "available-connected-source-state",
      ...(acquisition.syncToken ? {requestedSyncToken: acquisition.syncToken} : {}), syncToken: syncToken!,
      sourceEvents: mapped.slice(0, sourceCount), meetings: mapped.slice(sourceCount)};
    return mapped.filter((_row, index) => !liveDeltaMasters.has(events[index]!));
  } catch {
    throw new Error("Calendar discovery unavailable");
  }
}

/** Real `CalendarReadDeps` (routes/calendar.ts) — thin wrapper over the `gws`-backed adapter.
 * The machine's primary calendar belongs only to its explicitly configured operator tenant. */
export function createGwsCalendarReadDeps(owner = process.env.LKB_TENANT_ID,
  load: (days?: number, run?: Parameters<typeof listUpcomingGwsMeetings>[1], changedSince?: string,
    acquisition?: {syncToken?: string}) => Promise<UpcomingMeeting[] | CalendarAcquisition> = listUpcomingGwsMeetings): CalendarReadDeps {
  return {
    async acquire(tenantId, syncToken) {
      if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId) throw new Error("Connected Calendar owner mismatch");
      const result = await load(14, undefined, undefined, {syncToken});
      if (!result || Array.isArray(result) || result.version !== 1 || result.complete !== true ||
          result.scope !== "available-connected-source-state" || !["baseline", "sync", "reset"].includes(result.mode) ||
          !Array.isArray(result.sourceEvents) || !Array.isArray(result.meetings)) throw new Error("Invalid Calendar acquisition result");
      return {...result, tenantId};
    },
    async listUpcoming(tenantId, changedSince) {
      if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId) throw new Error("Connected Calendar owner mismatch");
      const result = await load(14, undefined, changedSince);
      if (!Array.isArray(result)) throw new Error("Invalid Calendar legacy result");
      return result;
    },
  };
}
