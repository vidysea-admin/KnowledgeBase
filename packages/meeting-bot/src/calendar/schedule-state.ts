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
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { reconcileWebinarSources, type CalendarEvent, type WebinarReconciliationState } from "./calendar-client.js";
import type { AutoRecordCandidateInput } from "./auto-join.js";
import { projectWebinarInventory } from "./auto-record-policy.js";

export interface WebinarCalendarAcquisition {
  version: 1; tenantId: string; scope: "available-connected-source-state"; complete: true;
  mode: "baseline" | "sync" | "reset"; checkedAt: string; requestedSyncToken?: string; syncToken: string;
  sourceEvents: (CalendarEvent & {recurrence?: string[]})[]; meetings: CalendarEvent[];
}
type Operation = Record<string, any>;
export interface WebinarOperationState {
  version: 1; tenantId: string; operations: Record<string, Operation>; discovery?: Record<string, any>;
  source?: {
    coverage: {scope: "available-connected-source-state"; baselineComplete: true; continuousSince: string;
      requestStartedAt: string; calendarSyncToken: string; historicalDeletedReconstruction: "unavailable"};
    mirror: Record<string, WebinarCalendarAcquisition["sourceEvents"]>; reconciliation: WebinarReconciliationState;
  };
}
const CAP = 5 * 1024 * 1024, ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
function invalid(): never { throw new Error("Invalid webinar ownership, state or acquisition; inspect before retrying"); }
const stamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const token = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._~+/=-]{1,2048}$/.test(value);
function object(value: unknown, keys?: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    (keys && Object.keys(value).some(key => !keys.includes(key)))) invalid();
}
function calendarRows(rows: unknown): asserts rows is WebinarCalendarAcquisition["sourceEvents"] {
  if (!Array.isArray(rows) || rows.length > 20000) invalid();
  for (const row of rows) {
    object(row);
    if (row.recurrence !== undefined && (!Array.isArray(row.recurrence) || !row.recurrence.length || row.recurrence.length > 32 ||
      row.recurrence.some((rule: unknown) => typeof rule !== "string" || !rule.length || rule.length > 8192 || /[\x00-\x1f\x7f]/.test(rule)))) invalid();
  }
}
/** The native token is accepted only for the requested owner, mode and completed generation. */
export function validateWebinarCalendarAcquisition(value: unknown, tenantId: string, requestedSyncToken?: string, requestStartedAt?: string): WebinarCalendarAcquisition {
  object(value, ["version", "tenantId", "scope", "complete", "mode", "checkedAt", "requestedSyncToken", "syncToken", "sourceEvents", "meetings"]);
  if (value.version !== 1 || value.tenantId !== tenantId || value.scope !== "available-connected-source-state" || value.complete !== true ||
    !stamp(value.checkedAt) || !token(value.syncToken) || (requestedSyncToken !== undefined && !token(requestedSyncToken)) ||
    value.requestedSyncToken !== requestedSyncToken || (requestedSyncToken ? !["sync", "reset"].includes(value.mode) : value.mode !== "baseline") ||
    (requestStartedAt !== undefined && (!stamp(requestStartedAt) || value.checkedAt < requestStartedAt || Date.parse(value.checkedAt) > Date.parse(requestStartedAt) + 60000))) invalid();
  calendarRows(value.sourceEvents); calendarRows(value.meetings);
  if (value.sourceEvents.length + value.meetings.length > 20000 || Buffer.byteLength(JSON.stringify(value)) > CAP ||
    value.meetings.some(row => row.recurrence !== undefined)) invalid();
  reconcileWebinarSources({tenantId, checkedAt: value.checkedAt, acquisition: {complete: true, historyComplete: false}, candidates: [],
    calendarEvents: [...value.sourceEvents, ...value.meetings].map(({recurrence: _series, ...row}) => row)});
  return value as WebinarCalendarAcquisition;
}
function validateOperations(value: unknown, tenantId: string, checkedAt: string): asserts value is WebinarOperationState {
  object(value, ["version", "tenantId", "operations", "discovery", "source"]);
  if (value.version !== 1 || value.tenantId !== tenantId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId) || !stamp(checkedAt)) invalid();
  object(value.operations);
  if (Object.keys(value.operations).length > 20000) invalid();
  for (const [id, row] of Object.entries(value.operations)) {
    object(row);
    if (!ID.test(id) || ["__proto__", "constructor", "prototype"].includes(id) || row.tenantId !== tenantId ||
      !["queued", "recording", "processing", "failed", "ready", "action_required"].includes(row.status) ||
      (row.attempts !== undefined && (!Number.isSafeInteger(row.attempts) || row.attempts < 0)) ||
      (row.priorSessionId !== undefined && (!ID.test(row.priorSessionId) || value.operations[row.priorSessionId]?.tenantId !== tenantId))) invalid();
  }
  if (value.source === undefined) return;
  object(value.source, ["coverage", "mirror", "reconciliation"]); object(value.source.coverage, ["scope", "baselineComplete", "continuousSince", "requestStartedAt", "calendarSyncToken", "historicalDeletedReconstruction"]);
  const coverage = value.source.coverage;
  if (coverage.scope !== "available-connected-source-state" || coverage.baselineComplete !== true || coverage.historicalDeletedReconstruction !== "unavailable" ||
    !token(coverage.calendarSyncToken) || !stamp(coverage.continuousSince) || !stamp(coverage.requestStartedAt) ||
    coverage.continuousSince > coverage.requestStartedAt || coverage.requestStartedAt > checkedAt || value.source.reconciliation?.checkedAt !== coverage.requestStartedAt ||
    value.source.reconciliation?.coverageScope !== coverage.scope) invalid();
  object(value.source.mirror);
  const rows: WebinarCalendarAcquisition["sourceEvents"] = [];
  for (const [id, group] of Object.entries(value.source.mirror)) {
    calendarRows(group); if (!group.length || group.some(row => row.id !== id)) invalid(); rows.push(...group);
  }
  if (rows.length > 20000) invalid();
  reconcileWebinarSources({tenantId, checkedAt, previous: value.source.reconciliation,
    acquisition: {complete: true, historyComplete: false, scope: coverage.scope}, candidates: [],
    calendarEvents: rows.map(({recurrence: _series, ...row}) => row)});
}
/** Strict source history deliberately does not use the legacy corrupt-file reset below. */
export function readWebinarOperationState(file: string, tenantId: string, checkedAt: string): WebinarOperationState {
  if (existsSync(file) && statSync(file).size > CAP) invalid();
  const value = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {version: 1, tenantId, operations: {}};
  validateOperations(value, tenantId, checkedAt); return value;
}
export function writeWebinarOperationState(file: string, value: WebinarOperationState): void {
  validateOperations(value, value.tenantId, value.source?.coverage.requestStartedAt ?? new Date().toISOString());
  const bytes = JSON.stringify(value, null, 2) + "\n"; if (Buffer.byteLength(bytes) > CAP) invalid();
  const temporary = `${file}.${randomUUID()}.tmp`;
  let descriptor: number | undefined, created = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600); created = true;
    writeFileSync(descriptor, bytes); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}
/** Prepare a new generation without mutating the committed source, operations or checkpoint. */
export function prepareWebinarSourceState(previous: WebinarOperationState, value: unknown, candidates: AutoRecordCandidateInput[], requestStartedAt: string) {
  validateOperations(previous, previous.tenantId, requestStartedAt);
  const acquired = validateWebinarCalendarAcquisition(value, previous.tenantId, previous.source?.coverage.calendarSyncToken, requestStartedAt);
  if (!Array.isArray(candidates) || acquired.sourceEvents.length + acquired.meetings.length + candidates.length > 20000) invalid();
  const mirror = JSON.parse(JSON.stringify(acquired.mode === "sync" ? previous.source?.mirror ?? {} : {})) as NonNullable<WebinarOperationState["source"]>["mirror"];
  const groups = new Map<string, WebinarCalendarAcquisition["sourceEvents"]>();
  for (const row of acquired.sourceEvents) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
  for (const [id, rows] of groups) {
    const combined = [...(mirror[id] ?? []), ...rows], revised = combined.filter(row => row.providerUpdated !== undefined);
    const newest = Math.max(...revised.map(row => Date.parse(row.providerUpdated!)));
    const accepted = combined.filter(row => !row.providerUpdated || Date.parse(row.providerUpdated) === newest);
    Object.defineProperty(mirror, id, {value: [...new Map(accepted.map(row => [JSON.stringify(row), row])).values()], enumerable: true, configurable: true, writable: true});
  }
  const all = Object.values(mirror).flat(); if (all.length > 20000) invalid();
  const fresh: WebinarCalendarAcquisition["sourceEvents"] = [...acquired.sourceEvents.filter(row => !row.recurrence || row.cancelled), ...acquired.meetings];
  const origin = (row: Partial<CalendarEvent>) => row.originalStartTime?.date ? `date:${row.originalStartTime.date}` :
    row.originalStartTime?.dateTime ? new Date(row.originalStartTime.dateTime).toISOString() : undefined;
  const discontinuousCalendarIds: string[] = [];
  for (const row of Object.values(previous.source?.reconciliation.occurrences ?? {})) {
    if (row.source !== "calendar" || !row.accepted || row.snapshot.cancelled) continue;
    const parent = row.snapshot.recurringEventId;
    const changedParent = parent && acquired.sourceEvents.some(current => current.id === parent && !current.cancelled && current.recurrence &&
      !previous.source?.mirror[parent]?.some(old => JSON.stringify(old) === JSON.stringify(current)));
    const parentCancelled = parent && acquired.sourceEvents.some(current => current.id === parent && current.cancelled);
    const confirmed = fresh.some(current => parent ? current.recurringEventId === parent && origin(current) === origin(row.snapshot) : current.id === row.snapshot.id);
    if ((acquired.mode === "reset" || changedParent) && !confirmed && !parentCancelled) discontinuousCalendarIds.push(row.snapshot.id);
  }
  const reconciled = reconcileWebinarSources({tenantId: previous.tenantId, checkedAt: requestStartedAt, previous: previous.source?.reconciliation,
    acquisition: {complete: true, historyComplete: false, scope: acquired.scope, discontinuousCalendarIds: [...new Set(discontinuousCalendarIds)]},
    calendarEvents: fresh.map(({recurrence: _series, ...row}) => row), candidates});
  const series = all.filter(row => row.recurrence || (row.cancelled && previous.source?.mirror[row.id]?.some(prior => prior.recurrence)));
  const state: WebinarOperationState = {...JSON.parse(JSON.stringify(previous)), source: {
    coverage: {scope: acquired.scope, baselineComplete: true, continuousSince: acquired.mode === "sync" ? previous.source!.coverage.continuousSince : requestStartedAt,
      requestStartedAt, calendarSyncToken: acquired.syncToken, historicalDeletedReconstruction: "unavailable"}, mirror, reconciliation: reconciled.state},
    operations: projectWebinarInventory(previous.operations, reconciled, previous.tenantId, requestStartedAt, series)};
  validateOperations(state, previous.tenantId, requestStartedAt);
  if (Buffer.byteLength(JSON.stringify(state, null, 2) + "\n") > CAP) invalid();
  return {state, calendarEvents: reconciled.calendarEvents, candidates: reconciled.candidates};
}

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

/**
 * Writes (or overwrites) the job file for `jobKey`. Creates `<stateDir>/scheduled/` if needed.
 *
 * **ISS-321 collision guard.** `jobKey` is now derived from a hash of the full `sessionKey`
 * (`task-scheduler.ts`'s `deriveJobKey`), so a genuine collision between two DIFFERENT sessions is
 * cryptographically unlikely — but "unlikely" is not "impossible, so never check": before writing,
 * this reads whatever job file already exists at this jobKey's path. If one exists and belongs to
 * a different session (`existing.sessionId !== job.sessionId`), this throws rather than silently
 * overwriting it — the ISS-321 defect was exactly this overwrite happening with no detection at
 * all. Re-scheduling the SAME session (a corrective tick, a retry) is expected and always allowed:
 * the check is keyed on sessionId equality, not "a file is already there."
 */
export function writeScheduledJob(stateDir: string, jobKey: string, job: ScheduledJob): void {
  const existing = readScheduledJob(stateDir, jobKey);
  if (existing && existing.sessionId !== job.sessionId) {
    throw new Error(
      `refusing to schedule '${job.sessionId}': jobKey '${jobKey}' is already scheduled for a ` +
        `different session '${existing.sessionId}' (ISS-321 collision guard) — job file: ` +
        `${scheduledJobFilePath(stateDir, jobKey)}`,
    );
  }
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
