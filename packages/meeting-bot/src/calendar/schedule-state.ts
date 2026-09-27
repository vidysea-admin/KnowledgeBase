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
