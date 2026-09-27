/**
 * packages/meeting-bot/src/calendar/schedule-state.ts — U5 (u5-auto-record-scheduler). Persisted
 * dedup state: which `sessionKey`s `cli schedule-tick` has already handed to the Windows
 * scheduler, so a later tick (run every few minutes per docs/plan.md U6, not yet built) never
 * re-schedules the same session twice.
 *
 * A local JSON file, not a new Mongo collection — same "real-by-default, no new infra unless
 * needed" precedent as `capture/controller-state.ts` (which this file's shape deliberately
 * mirrors: read/write/remove, never throws on a missing or corrupt file). [ASSUMPTION] a file
 * fits here because dedup state is local-machine, single-poller-instance data (like the record
 * controller's own state), not something another tenant/service needs to query — unlike
 * `meeting_candidates`, which genuinely needed a shared, queryable Mongo collection. If a second
 * poller instance or a cross-machine view is ever needed, this should move to Mongo (a schema +
 * migration, per repo convention) — flagged here rather than silently built that way.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface ScheduledEntry {
  sessionKey: string;
  title: string;
  /** ISO timestamp of when this tick scheduled it — never the meetingUrl (never persist a join
   * token to disk any more than to a log). */
  scheduledAt: string;
}

export type ScheduleState = Record<string, ScheduledEntry>;

export function scheduleStateFilePath(stateDir: string): string {
  return path.join(stateDir, "schedule-state.json");
}

/** Never throws — a missing or corrupt file is treated as "nothing scheduled yet," matching
 * `readControllerState`'s conservative-on-read-failure convention. */
export function readScheduleState(stateDir: string): ScheduleState {
  const p = scheduleStateFilePath(stateDir);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as ScheduleState) : {};
  } catch {
    return {};
  }
}

/** The set of sessionKeys already scheduled — the shape `selectAutoRecordItems`'
 * `alreadyScheduled` input expects. */
export function readScheduledKeys(stateDir: string): Set<string> {
  return new Set(Object.keys(readScheduleState(stateDir)));
}

/** Records one newly-scheduled session, upserting the state file. Creates `stateDir` if it
 * doesn't exist yet (mirrors `controller-state.ts` callers' `New-Item -Force`-style tolerance). */
export function recordScheduled(stateDir: string, entry: ScheduledEntry): void {
  mkdirSync(stateDir, { recursive: true });
  const state = readScheduleState(stateDir);
  state[entry.sessionKey] = entry;
  writeFileSync(scheduleStateFilePath(stateDir), JSON.stringify(state, null, 2) + "\n");
}

// ---------------------------------------------------------------------------------------------
// ISS-317 fix (cycle 2): per-job JSON files under `<stateDir>/scheduled/<jobKey>.json`. The
// sensitive fields (url with its join token, full end datetime, title, sessionId) used to be
// interpolated straight into the Scheduled Task's `/tr` command line — now they are persisted
// here instead, and `start-record-detached.ps1 -Job <jobKey>` reads this file at launch time.
// Keyed by `jobKey` (task-scheduler.ts's `deriveJobKey`), never the raw `sessionKey` — sessionKey
// can contain a `:` (`gmail:<id>`), which is not a safe/legal Windows filename character.
// ---------------------------------------------------------------------------------------------

export interface ScheduledJob {
  /** The real join URL (with its join token) — never persisted to the Task Scheduler command
   * line, only here (this file lives under the gitignored `raw/webinars/` tree). */
  url: string;
  /** Full ISO end datetime (ISS-319 fix) — NOT a bare local `HH:mm`, so a session crossing
   * midnight still resolves to a stop time after its own start, not ~24h in the past. */
  until: string;
  title: string;
  /** The original sessionKey (`gmail:<id>` / `cal:<id>`), kept for logging/debugging — never
   * used as a filesystem path component itself (that's `jobKey`'s job). */
  sessionId: string;
}

function scheduledJobDir(stateDir: string): string {
  return path.join(stateDir, "scheduled");
}

export function scheduledJobFilePath(stateDir: string, jobKey: string): string {
  return path.join(scheduledJobDir(stateDir), `${jobKey}.json`);
}

/** Writes (or overwrites) the job file for `jobKey`. Creates `<stateDir>/scheduled/` if needed. */
export function writeScheduledJob(stateDir: string, jobKey: string, job: ScheduledJob): void {
  mkdirSync(scheduledJobDir(stateDir), { recursive: true });
  writeFileSync(scheduledJobFilePath(stateDir, jobKey), JSON.stringify(job, null, 2) + "\n");
}

/** Never throws — a missing or corrupt job file returns `null` (mirrors `readScheduleState`'s
 * conservative-on-read-failure convention). */
export function readScheduledJob(stateDir: string, jobKey: string): ScheduledJob | null {
  const p = scheduledJobFilePath(stateDir, jobKey);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as ScheduledJob) : null;
  } catch {
    return null;
  }
}
