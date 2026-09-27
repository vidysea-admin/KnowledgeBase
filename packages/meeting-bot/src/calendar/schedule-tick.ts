/**
 * packages/meeting-bot/src/calendar/schedule-tick.ts — U5 (u5-auto-record-scheduler), backs
 * `cli schedule-tick [--dry-run]`. Loads calendar events + meeting candidates, runs them through
 * `selectAutoRecordItems` (auto-join.ts), and in non-dry-run mode hands each to-schedule item to
 * `scripts/webinar/start-record-detached.ps1` through a one-off Windows Scheduled Task
 * (task-scheduler.ts), recording what it scheduled in `schedule-state.ts`'s dedup state.
 *
 * Candidate loading over HTTP, not `@lkb/db` (dependency-cruiser: `meeting-bot -> ingest, core`
 * only, ARCHITECTURE.md §5 — same reason `cli.ts`'s `defaultTranscribe` hits the whisper worker's
 * wire shape over `fetch` instead of importing `@lkb/ai`). New env keys, documented rather than
 * silently invented (no existing generic-CLI API-key env var was found — see the manifest):
 * `LKB_API_URL` (default `http://localhost:3300`), `LKB_API_KEY` (required for a real, non-empty
 * candidate list — a missing key degrades to "0 candidates" rather than throwing, matching this
 * codebase's "never crash a poller tick" convention, e.g. `gws-gmail.ts`/`gws-calendar.ts`).
 *
 * Calendar events: always `[]` today — `qa/contracts/calendar-auto-join.md`'s own disclosed
 * non-goal is "no live wiring into a scheduled job… blocked on missing [Google OAuth]
 * credentials," which still holds. `loadCalendarEvents` is the seam a real `CalendarClient`
 * plugs into once those credentials exist; nothing here needs to change to wire it up then.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CalendarEvent } from "./calendar-client.js";
import {
  selectAutoRecordItems, loadTrustedSenderConfig, redactJoinLink,
  type AutoRecordCandidateInput, type AutoRecordItem, type SkippedItem,
} from "./auto-join.js";
import { readScheduledKeys, recordScheduled } from "./schedule-state.js";
import { createWindowsTaskScheduler, toLocalHHMM, type TaskScheduler } from "./task-scheduler.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const DEFAULT_STATE_DIR = path.join(REPO_ROOT, "raw", "webinars");
const DEFAULT_LEAD_MINUTES = 5;
const RECORD_LAUNCHER = path.join(REPO_ROOT, "scripts", "webinar", "start-record-detached.ps1");

/** The narrow shape this module needs from a real `GET /meeting-candidates` response row —
 * matches the generated `MeetingCandidates` type's field names so mapping is a straight pick. */
interface MeetingCandidateApiRow {
  _id: string;
  subject: string;
  senderEmail: string;
  senderDomain: string;
  status: "pending" | "approved" | "rejected" | "auto_approved";
  meetingUrl?: string;
  startTime?: string;
  endTime?: string;
  kind?: "past-recording" | "upcoming";
  registrationOnly?: boolean;
}

export interface ScheduleTickDeps {
  loadCalendarEvents: () => Promise<CalendarEvent[]>;
  loadCandidates: () => Promise<AutoRecordCandidateInput[]>;
  now: () => string;
  stateDir: string;
  scheduler: TaskScheduler;
  log: (msg: string) => void;
}

function toCandidateInput(row: MeetingCandidateApiRow): AutoRecordCandidateInput {
  return {
    id: row._id,
    title: row.subject,
    senderEmail: row.senderEmail,
    senderDomain: row.senderDomain,
    status: row.status,
    meetingUrl: row.meetingUrl,
    startTime: row.startTime,
    endTime: row.endTime,
    kind: row.kind,
    registrationOnly: row.registrationOnly,
  };
}

/** Real candidate loader: `GET /meeting-candidates` (existing route, gmail-meeting-candidates-
 * approval.md), filtered client-side to approved/auto_approved (defensive — never assume the
 * server already filtered). Never throws: a missing key, an unreachable API, or a non-2xx all
 * degrade to an empty list with a logged reason, so one tick's networking problem can't crash a
 * poller loop (same failure contract as `gws-gmail.ts`/`gws-calendar.ts`). */
export function createHttpCandidateLoader(
  apiUrl: string, apiKey: string | undefined, log: (msg: string) => void,
): () => Promise<AutoRecordCandidateInput[]> {
  return async () => {
    if (!apiKey) {
      log("schedule-tick: LKB_API_KEY not set — skipping Gmail candidates this tick (0 candidates)");
      return [];
    }
    try {
      const res = await fetch(`${apiUrl}/meeting-candidates`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        log(`schedule-tick: GET /meeting-candidates -> ${res.status} — skipping this tick (0 candidates)`);
        return [];
      }
      const body = (await res.json()) as { candidates?: MeetingCandidateApiRow[] } | MeetingCandidateApiRow[];
      const rows = Array.isArray(body) ? body : body.candidates ?? [];
      return rows
        .filter((r) => r.status === "approved" || r.status === "auto_approved")
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

export function buildRealScheduleTickDeps(): ScheduleTickDeps {
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiUrl = (process.env.LKB_API_URL ?? "http://localhost:3300").replace(/\/$/, "");
  const log = (msg: string) => console.log(`[bot] ${msg}`);
  return {
    loadCalendarEvents: loadNoCalendarEvents,
    loadCandidates: createHttpCandidateLoader(apiUrl, process.env.LKB_API_KEY, log),
    now: () => new Date().toISOString(),
    stateDir: DEFAULT_STATE_DIR,
    scheduler: createWindowsTaskScheduler(),
    log,
  };
}

function taskNameFor(sessionKey: string): string {
  return `lkb-autorecord-${sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function describeSkip(s: SkippedItem): string {
  const detail = s.detail ? ` (${s.detail})` : "";
  return `  skip [${s.reason}]${detail} — ${s.source}:${s.sourceId} "${s.title}"`;
}

function describeToSchedule(item: AutoRecordItem): string {
  return `  schedule — ${item.source}:${item.sourceId} "${item.title}" ${item.startTime} -> ${item.endTime} ` +
    `join: ${redactJoinLink(item.meetingUrl)}`;
}

/**
 * Runs one tick: load -> select -> (dry-run: print) or (real: schedule a one-off Windows task
 * per item + record it in the dedup state). Returns the selection result so tests/CLI callers
 * can assert on it without re-parsing log lines.
 */
export async function runScheduleTickOnce(deps: ScheduleTickDeps, dryRun: boolean) {
  const [calendarEvents, candidates] = await Promise.all([deps.loadCalendarEvents(), deps.loadCandidates()]);
  const now = deps.now();
  const trustedSenders = loadTrustedSenderConfig();
  const alreadyScheduled = readScheduledKeys(deps.stateDir);

  const result = selectAutoRecordItems({
    calendarEvents, candidates, now, leadMinutes: DEFAULT_LEAD_MINUTES, trustedSenders, alreadyScheduled,
  });

  deps.log(`schedule-tick: ${result.toSchedule.length} to schedule, ${result.skipped.length} skipped ` +
    `(${calendarEvents.length} calendar event(s), ${candidates.length} candidate(s), now=${now})`);
  for (const item of result.toSchedule) deps.log(describeToSchedule(item));
  for (const s of result.skipped) deps.log(describeSkip(s));

  if (dryRun) {
    deps.log("schedule-tick: --dry-run — nothing scheduled, nothing written to state");
    return result;
  }

  for (const item of result.toSchedule) {
    await deps.scheduler.scheduleOnce({
      taskName: taskNameFor(item.sessionKey),
      runAtIso: item.startTime,
      command: "powershell.exe",
      args: [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", RECORD_LAUNCHER,
        "-Url", item.meetingUrl,
        "-Until", toLocalHHMM(item.endTime),
        "-Title", item.title,
        "-SessionId", item.sessionKey,
      ],
    });
    recordScheduled(deps.stateDir, { sessionKey: item.sessionKey, title: item.title, scheduledAt: now });
    deps.log(`  scheduled: ${item.sessionKey} via one-off Windows task`);
  }

  return result;
}

export function parseScheduleTickArgs(rest: string[]): { dryRun: boolean } {
  return { dryRun: rest.includes("--dry-run") };
}

export async function runScheduleTick(rest: string[]): Promise<void> {
  const { dryRun } = parseScheduleTickArgs(rest);
  await runScheduleTickOnce(buildRealScheduleTickDeps(), dryRun);
}
