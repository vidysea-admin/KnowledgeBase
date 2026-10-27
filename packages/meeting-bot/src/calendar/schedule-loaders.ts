/** HTTP acquisition and discovery-health loading for the schedule tick (split verbatim from schedule-tick.ts). */
import type { CalendarEvent } from "./calendar-client.js";
import type { AutoRecordCandidateInput } from "./auto-join.js";
import { validateHttpCalendarSnapshot, validateWebinarCalendarAcquisition, type WebinarCalendarAcquisition } from "./state/schedule-state.js";

/** The loaders `loadWebinarSourcesWithHealth` needs; structurally the same Pick of ScheduleTickDeps it took before. */
export interface WebinarSourceLoaders {
  loadCalendarEvents: () => Promise<CalendarEvent[]>;
  loadCalendarAcquisition?: (syncToken?: string, requestStartedAt?: string) => Promise<WebinarCalendarAcquisition>;
  loadCandidates: (refresh?: boolean) => Promise<AutoRecordCandidateInput[]>;
}

/** The narrow shape this module needs from a real `GET /meeting-candidates` response row —
 * matches the generated `MeetingCandidates` type's field names so mapping is a straight pick. */
interface MeetingCandidateApiRow {
  _id: string;
  subject: string;
  senderEmail: string;
  senderDomain: string;
  senderAuthenticated?: boolean;
  status: "pending" | "approved" | "rejected" | "auto_approved";
  meetingUrl?: string;
  startTime?: string;
  endTime?: string;
  kind?: "past-recording" | "upcoming";
  registrationOnly?: boolean;
  registrationUrl?: string;
  messageId?: string;
  threadId?: string;
  receivedAt?: string;
  youtubeWatch?: AutoRecordCandidateInput['youtubeWatch'];
  youtubeWatchIssue?: AutoRecordCandidateInput['youtubeWatchIssue'];
  meetingLinkIssue?: AutoRecordCandidateInput['meetingLinkIssue'];
  evidenceIssue?: AutoRecordCandidateInput['evidenceIssue'];
}

function toCandidateInput(row: MeetingCandidateApiRow): AutoRecordCandidateInput {
  return {
    id: row._id,
    title: row.subject,
    senderEmail: row.senderEmail,
    senderDomain: row.senderDomain,
    senderAuthenticated: typeof row.senderAuthenticated === "boolean" ? row.senderAuthenticated : undefined, // ISS-376: unknown stays unknown
    status: row.status,
    meetingUrl: row.meetingUrl,
    startTime: row.startTime,
    endTime: row.endTime,
    kind: row.kind,
    registrationOnly: row.registrationOnly,
    registrationUrl: row.registrationUrl,
    messageId: row.messageId,
    threadId: row.threadId,
    receivedAt: row.receivedAt,
    youtubeWatch: row.youtubeWatch,
    youtubeWatchIssue: row.youtubeWatchIssue,
    meetingLinkIssue: row.meetingLinkIssue,
    evidenceIssue: row.evidenceIssue,
  };
}

/** Real candidate loader: `GET /meeting-candidates` (existing route, gmail-meeting-candidates-
 * approval.md), filtered client-side to approved/auto_approved (defensive — never assume the
 * server already filtered). Never throws: a missing key, an unreachable API, or a non-2xx all
 * degrade to an empty list with a logged reason, so one tick's networking problem can't crash a
 * poller loop (same failure contract as `gws-gmail.ts`/`gws-calendar.ts`). */
export function createHttpCandidateLoader(
  apiUrl: string, apiKey: string | undefined, log: (msg: string) => void,
  everyWebinar = false,
): () => Promise<AutoRecordCandidateInput[]> {
  return async () => {
    if (!apiKey) {
      log("schedule-tick: LKB_API_KEY not set — skipping Gmail candidates this tick (0 candidates)");
      return [];
    }
    try {
      const res = await fetch(`${apiUrl}/meeting-candidates`, {
        headers: { authorization: `Bearer ${apiKey}` }, redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        log(`schedule-tick: GET /meeting-candidates -> ${res.status} — skipping this tick (0 candidates)`);
        return [];
      }
      const body = (await res.json()) as { candidates?: MeetingCandidateApiRow[] } | MeetingCandidateApiRow[];
      const rows = Array.isArray(body) ? body : body?.candidates;
      if (!Array.isArray(rows)) throw new Error("Invalid Gmail candidate response");
      return rows
        .filter((r) => everyWebinar || r.status === "approved" || r.status === "auto_approved")
        .map(toCandidateInput);
    } catch (err) {
      log(`schedule-tick: /meeting-candidates fetch failed (${err instanceof Error ? err.message : String(err)}) ` +
        "— skipping this tick (0 candidates)");
      return [];
    }
  };
}

/** No real Google Calendar credentials exist yet (calendar-auto-join.md's own disclosed
 * non-goal) — this is the seam a real `CalendarClient.listUpcomingEvents(...)` call plugs into. */
export async function loadNoCalendarEvents(): Promise<CalendarEvent[]> {
  return [];
}

export interface WebinarFeedHealth {
  status: "healthy" | "failed";
  checkedAt: string;
  lastSuccessAt?: string;
  notification?: { acknowledged?: string; fingerprint?: string; status?: string; retryable?: boolean; updatedAt?: string };
}
/** Load both connected feeds without converting a failed source into a healthy empty schedule. */
export async function loadWebinarSourcesWithHealth(
  deps: WebinarSourceLoaders,
  checkedAt: string,
  previous?: Partial<Record<"calendar" | "gmail", WebinarFeedHealth>>,
  refresh = false,
  native?: {syncToken?: string},
) {
  if (previous !== undefined && (!previous || typeof previous !== "object" || Array.isArray(previous) ||
    Object.keys(previous).some((key) => !["calendar", "gmail"].includes(key)))) throw new Error("Invalid discovery health state");
  for (const row of Object.values(previous ?? {})) {
    if (!row || !["healthy", "failed"].includes(row.status) || typeof row.checkedAt !== "string" || !Number.isFinite(Date.parse(row.checkedAt)) ||
      (row.lastSuccessAt !== undefined && (typeof row.lastSuccessAt !== "string" || !Number.isFinite(Date.parse(row.lastSuccessAt))))) throw new Error("Invalid discovery health state");
  }
  const results = await Promise.allSettled([Promise.resolve().then(async (): Promise<CalendarEvent[] | WebinarCalendarAcquisition> => {
    if (!native) return deps.loadCalendarEvents();
    if (!deps.loadCalendarAcquisition) throw new Error("Native Calendar acquisition required");
    return deps.loadCalendarAcquisition(native.syncToken, checkedAt);
  }), Promise.resolve().then(() => deps.loadCandidates(refresh))]);
  const calendarValue = results[0]!.status === "fulfilled" ? results[0]!.value : undefined;
  const calendarAcquisition = native && calendarValue ? calendarValue as WebinarCalendarAcquisition : undefined;
  const health = Object.fromEntries((["calendar", "gmail"] as const).map((feed, i) => [feed, {
    status: results[i]!.status === "fulfilled" ? "healthy" : "failed", checkedAt,
    lastSuccessAt: results[i]!.status === "fulfilled" ? checkedAt : previous?.[feed]?.lastSuccessAt,
    notification: previous?.[feed]?.notification,
  }])) as Record<"calendar" | "gmail", WebinarFeedHealth>;
  return { health, failed: results.some((result) => result.status === "rejected"),
    calendarAcquisition,
    calendarEvents: calendarAcquisition ? calendarAcquisition.meetings : calendarValue as CalendarEvent[] ?? [],
    candidates: results[1]!.status === "fulfilled" ? results[1]!.value as AutoRecordCandidateInput[] : [] };
}

/** Reuses the authenticated Calendar route; failed discovery never looks like a healthy empty feed. */
export function createHttpCalendarLoader(apiUrl: string, apiKey: string | undefined, checkpoint?: () => string | undefined): () => Promise<CalendarEvent[]>;
export function createHttpCalendarLoader(apiUrl: string, apiKey: string | undefined, checkpoint: undefined, native: {tenantId: string}): (syncToken?: string, requestStartedAt?: string) => Promise<WebinarCalendarAcquisition>;
export function createHttpCalendarLoader(apiUrl: string, apiKey: string | undefined, checkpoint?: () => string | undefined, native?: {tenantId: string}): (syncToken?: string, requestStartedAt?: string) => Promise<CalendarEvent[] | WebinarCalendarAcquisition> {
  return async (syncToken, requestStartedAt) => {
    if (!apiKey) throw new Error("Calendar discovery requires LKB_API_KEY");
    const query = new URLSearchParams({ discovery: "1" });
    const startedAt = requestStartedAt ?? new Date().toISOString();
    if (native) {
      if (checkpoint || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(native.tenantId) ||
          (syncToken !== undefined && (typeof syncToken !== "string" || !/^[A-Za-z0-9._~+/=-]+$/.test(syncToken) || syncToken.length > 2048)) ||
          typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) throw new Error("Invalid native Calendar request");
      query.set("sync", "1"); if (syncToken !== undefined) query.set("syncToken", syncToken);
    }
    const changedSince = checkpoint?.();
    if (changedSince !== undefined) {
      if (typeof changedSince !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(changedSince) ||
          !Number.isFinite(Date.parse(changedSince)) || new Date(changedSince).toISOString() !== changedSince) throw new Error("Invalid calendar change checkpoint");
      query.set("changedSince", changedSince);
    }
    const res = await fetch(`${apiUrl}/calendar/upcoming?${query}`, {
      headers: { authorization: `Bearer ${apiKey}`, ...(native ? {"X-LKB-Calendar-Snapshot": "worker-v1"} : {}) }, redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) { if (native) await res.body?.cancel(); throw new Error(`Calendar discovery failed: HTTP ${res.status}`); }
    if (native) {
      if (!res.body) throw new Error("Native Calendar response requires a stream");
      const reader = res.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const {done, value} = await reader.read(); if (done) break;
          bytes += value.byteLength; if (bytes > 5 * 1024 * 1024) throw new Error("Native Calendar response exceeds byte budget");
          chunks.push(value);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        return body?.snapshot !== undefined || res.headers.has("X-LKB-Calendar-Snapshot")
          ? validateHttpCalendarSnapshot(body, native.tenantId, syncToken, startedAt, res.headers)
          : validateWebinarCalendarAcquisition(body, native.tenantId, syncToken, startedAt);
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
    }
    const body = await res.json() as { meetings?: CalendarEvent[] };
    if (!Array.isArray(body.meetings)) throw new Error("Calendar discovery returned an invalid response");
    return body.meetings;
  };
}
export { dedupeWhatsappCandidates } from "./whatsapp-discovery/whatsapp-merge.js";
