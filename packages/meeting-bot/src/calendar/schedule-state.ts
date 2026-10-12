
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertTenantTag, requireStateTenant } from "./state-tenant-tag.js";
import { acquireLock, lockStillOwned, releaseLock } from "./join-rules-store-lock.js";
import { writeAtomic } from "./skipped-state.js";
import { reconcileWebinarSources, type CalendarEvent, type WebinarReconciliationState } from "./calendar-client.js";
import type { AutoRecordCandidateInput } from "./auto-join.js";
import { projectWebinarInventory, projectWebinarRegistrations, webinarSessionKey, isDirectWebinarJoin, type WebinarRegistrationAttempt } from "./auto-record-policy.js";
export type { WebinarRegistrationAttempt } from "./auto-record-policy.js";

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
    if (row.registration !== undefined) {
      const attempt = validateWebinarRegistration(row.registration, tenantId, checkedAt);
      const source = webinarSessionKey(JSON.stringify(["source", tenantId, "gmail", "candidates", attempt.sourceId, "single"]));
      if (id !== webinarSessionKey(`source-review|${source}`)) invalid();
    }
    if (row.stopDisposition !== undefined) {
      object(row.stopDisposition, ["tenantId", "sessionId", "generation", "reason", "requestedAt", "acknowledged"]);
      const stop = row.stopDisposition;
      if (stop.tenantId !== tenantId || stop.sessionId !== id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(stop.generation) ||
        !["cancelled", "rescheduled", "controller-disconnected"].includes(stop.reason) || !stamp(stop.requestedAt) || stop.requestedAt > checkedAt ||
        (stop.acknowledged !== undefined && !["accepted", "unavailable"].includes(stop.acknowledged))) invalid();
    }
    if (row.monitorGap !== undefined) {
      object(row.monitorGap, ["tenantId", "sessionId", "reason", "checkedAt"]);
      if (row.monitorGap.tenantId !== tenantId || row.monitorGap.sessionId !== id ||
        !["discovery-unavailable", "uncertain-source"].includes(row.monitorGap.reason) || !stamp(row.monitorGap.checkedAt) || row.monitorGap.checkedAt > checkedAt) invalid();
    }
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

export function validateWebinarRegistration(value: unknown, tenantId: string, checkedAt: string): WebinarRegistrationAttempt {
  object(value, ["tenantId", "sourceId", "sourceMessageId", "threadId", "registrationUrl", "organizerEmail", "startTime", "endTime", "attemptId", "attemptedAt", "phase", "confirmationMessageId", "confirmedAt", "meetingUrl", "baselineMessageIds"]);
  const identifier = (id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(id);
  if (value.baselineMessageIds !== undefined && (!Array.isArray(value.baselineMessageIds) || value.baselineMessageIds.length > 20000 ||
      value.baselineMessageIds.some(id => !identifier(id)) || new Set(value.baselineMessageIds).size !== value.baselineMessageIds.length || !value.baselineMessageIds.includes(value.sourceMessageId))) invalid();
  let url: URL; try { url = new URL(value.registrationUrl); } catch { invalid(); }
  if (value.tenantId !== tenantId || typeof value.sourceId !== "string" || !value.sourceId || value.sourceId.length > 1024 || /[\x00-\x1f\x7f]/.test(value.sourceId) ||
      !identifier(value.sourceMessageId) || !identifier(value.threadId) || url!.protocol !== "https:" || url!.username || url!.password ||
      typeof value.organizerEmail !== "string" || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.organizerEmail) ||
      !stamp(value.startTime) || !stamp(value.endTime) || value.endTime <= value.startTime || !stamp(value.attemptedAt) || value.attemptedAt > checkedAt ||
      typeof value.attemptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.attemptId) ||
      !["submitting", "awaiting-confirmation", "uncertain", "action_required", "confirmed"].includes(value.phase)) invalid();
  if (value.phase === "confirmed") {
    if (!value.baselineMessageIds || value.baselineMessageIds.includes(value.confirmationMessageId) || !identifier(value.confirmationMessageId) || value.confirmationMessageId === value.sourceMessageId || !stamp(value.confirmedAt) ||
        value.confirmedAt < value.attemptedAt || value.confirmedAt > checkedAt || !isDirectWebinarJoin(value.meetingUrl, value.startTime)) invalid();
  } else if ([value.confirmationMessageId, value.confirmedAt, value.meetingUrl].some(item => item !== undefined)) invalid();
  return value as WebinarRegistrationAttempt;
}

export function confirmWebinarRegistration(attempt: WebinarRegistrationAttempt, tenantId: string, candidates: AutoRecordCandidateInput[], checkedAt: string): WebinarRegistrationAttempt | undefined {
  validateWebinarRegistration(attempt, tenantId, checkedAt);
  if (!attempt.baselineMessageIds || attempt.phase === "confirmed" || attempt.phase === "action_required") return undefined;
  const matches = candidates.filter(row => row.threadId === attempt.threadId && !attempt.baselineMessageIds!.includes(row.messageId!) && row.messageId !== attempt.sourceMessageId &&
    typeof row.messageId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(row.messageId) && row.senderEmail === attempt.organizerEmail &&
    row.startTime === attempt.startTime && row.endTime === attempt.endTime && row.status !== "rejected" && !row.cancelled &&
    row.registrationOnly !== true && isDirectWebinarJoin(row.meetingUrl, row.startTime));
  if (matches.length !== 1) return undefined;
  const confirmed: WebinarRegistrationAttempt = {...attempt, phase: "confirmed", confirmationMessageId: matches[0]!.messageId,
    confirmedAt: checkedAt, meetingUrl: matches[0]!.meetingUrl};
  return validateWebinarRegistration(confirmed, tenantId, checkedAt);
}

export function readWebinarOperationState(file: string, tenantId: string, checkedAt: string): WebinarOperationState {
  if (existsSync(file) && statSync(file).size > CAP) invalid();
  const value = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {version: 1, tenantId, operations: {}};
  validateOperations(value, tenantId, checkedAt); return value;
}
export function writeWebinarOperationState(file: string, value: WebinarOperationState): void {
  validateOperations(value, value.tenantId, new Date().toISOString());
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

export function webinarCompletionState(sourceFile: string, tenantId: string, sessionId: string, row: Operation, completedAt: string) {
  let childReason: string | undefined;
  if (existsSync(sourceFile)) {
    for (let current = path.resolve(sourceFile); ; current = path.dirname(current)) {
      if (lstatSync(current).isSymbolicLink()) invalid(); if (path.dirname(current) === current) break;
    }
    if (!statSync(sourceFile).isFile() || statSync(sourceFile).size > CAP) invalid();
    const source = JSON.parse(readFileSync(sourceFile, "utf8"));
    if (source.tenantId !== tenantId || source._id !== `${sessionId}-src` || (source.gaps !== undefined && !Array.isArray(source.gaps))) invalid();
    for (const gap of source.gaps ?? []) {
      if (typeof gap?.reason !== "string" || !gap.reason.startsWith("capture-control-")) continue;
      if (!["capture-control-cancelled", "capture-control-rescheduled", "capture-control-controller-disconnected"].includes(gap.reason) ||
        !stamp(gap.start) || !stamp(gap.end) || gap.end < gap.start || gap.recovered !== false) invalid();
      childReason ??= gap.reason.slice("capture-control-".length);
    }
  }
  const reason = row.stopDisposition?.reason ?? childReason ?? (row.monitorGap ? "coverage-review" : undefined);
  return {status: reason ? "action_required" : "ready", reason, completedAt};
}

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
  projectWebinarRegistrations({registrations: Object.values(previous.operations).map(row => row.registration), previous: previous.source?.reconciliation,
    reconciled, candidates, tenantId: previous.tenantId, checkedAt: requestStartedAt, validate: validateWebinarRegistration, confirm: confirmWebinarRegistration});
  const series = all.filter(row => row.recurrence || (row.cancelled && previous.source?.mirror[row.id]?.some(prior => prior.recurrence)));
  const state: WebinarOperationState = {...JSON.parse(JSON.stringify(previous)), source: {
    coverage: {scope: acquired.scope, baselineComplete: true, continuousSince: acquired.mode === "sync" ? previous.source!.coverage.continuousSince : requestStartedAt,
      requestStartedAt, calendarSyncToken: acquired.syncToken, historicalDeletedReconstruction: "unavailable"}, mirror, reconciliation: reconciled.state},
    operations: projectWebinarInventory(previous.operations, reconciled, previous.tenantId, requestStartedAt, series)};
  validateOperations(state, previous.tenantId, requestStartedAt);
  if (Buffer.byteLength(JSON.stringify(state, null, 2) + "\n") > CAP) invalid();
  return {state, calendarEvents: reconciled.calendarEvents, candidates: reconciled.candidates, transitions: reconciled.transitions, inventory: reconciled.inventory};
}

export interface ScheduledEntry {
  sessionKey: string;
  title: string;
  
  scheduledAt: string;
}

export type ScheduleState = Record<string, ScheduledEntry>;

export function scheduleStateFilePath(stateDir: string): string {
  return path.join(stateDir, "schedule-state.json");
}

/** On-disk shape (ISS-ALERTID-006): tagged with the tenant that wrote it. An untagged legacy file is a bare map and is refused. */
const STATE_FILE_VERSION = 2;

/** schedule-state.json exists but is not valid JSON / not an object / has a non-object `entries`. Reads never change it. */
export class ScheduleStateCorrupt extends Error {
  constructor(readonly file: string) { super("schedule-state.json is unreadable or corrupt (not valid JSON, or not an object); it was not changed"); this.name = "ScheduleStateCorrupt"; }
}

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Reads the dedup state for ONE tenant. Missing file -> {}. A file with no tenant tag or another tenant's tag is REFUSED
 * (throws StateTenantRefusal) and never read. An unparseable / non-object / malformed-`entries` file throws ScheduleStateCorrupt
 * and is left untouched (ISS-ALERTWHOFIX-001: it used to read as {} and the next write replaced it silently).
 * The tenant is required: there is no untagged read path.
 */
export function readScheduleState(stateDir: string, tenantId: string): ScheduleState {
  requireStateTenant(tenantId);
  const p = scheduleStateFilePath(stateDir);
  if (!existsSync(p)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(p, "utf8")); } catch { throw new ScheduleStateCorrupt(p); }
  if (!isPlain(parsed)) throw new ScheduleStateCorrupt(p);
  const tagged = assertTenantTag(parsed, tenantId, "schedule-state.json");
  const entries = tagged.entries;
  if (entries !== undefined && !isPlain(entries)) throw new ScheduleStateCorrupt(p);
  const out: ScheduleState = {};
  if (entries) {
    for (const [k, v] of Object.entries(entries)) if (k !== "__proto__") Object.defineProperty(out, k, { value: v as ScheduledEntry, enumerable: true, writable: true, configurable: true });
  }
  return out;
}


export function readScheduledKeys(stateDir: string, tenantId: string): Set<string> {
  return new Set(Object.keys(readScheduleState(stateDir, tenantId)));
}

const scheduleStateLockPath = (stateDir: string): string => path.join(stateDir, "schedule-state.lock");

/** Moves a corrupt schedule-state.json aside (never deletes it). Caller holds the lock. Returns the new base name. */
function quarantineScheduleState(stateDir: string): string {
  const file = scheduleStateFilePath(stateDir);
  const aside = `${file}.corrupt-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}-${randomUUID().slice(0, 8)}`;
  renameSync(file, aside);
  return path.basename(aside);
}

export interface LoadScheduledKeysOptions {
  /** Called with the quarantine file name when a corrupt file was moved aside. */
  onQuarantine?: (movedTo: string) => void;
  /** Called when the file is corrupt but could not be moved (dry-run, lock timeout, rename failure). */
  onCorruptUnmoved?: (reason: string) => void;
  /** Dry-run: report corruption but never touch the disk. */
  readOnly?: boolean;
  lockWaitMs?: number;
}

/**
 * The tick's dedup read. A corrupt file must NEVER stop the bot from joining meetings: it is quarantined to
 * schedule-state.json.corrupt-<ts>-<id> (kept byte-for-byte) and the tick proceeds with an EMPTY dedup set, loudly.
 * A tenant refusal still throws (fail closed). An empty set only re-selects sessions that are still in the join window;
 * re-scheduling one is idempotent (same deterministic jobKey, `schtasks /create /f`), and opt-out / join-rules vetoes are
 * enforced later from their own store, not from this file.
 */
export function loadScheduledKeysForTick(stateDir: string, tenantId: string, opts: LoadScheduledKeysOptions = {}): Set<string> {
  try { return readScheduledKeys(stateDir, tenantId); }
  catch (e) {
    if (!(e instanceof ScheduleStateCorrupt)) throw e;
    if (opts.readOnly) { opts.onCorruptUnmoved?.("dry-run: file left in place"); return new Set(); }
    try {
      mkdirSync(stateDir, { recursive: true });
      const lockPath = scheduleStateLockPath(stateDir);
      const token = acquireLock(lockPath, { waitMs: opts.lockWaitMs });
      try {
        try { return readScheduledKeys(stateDir, tenantId); } // another process may have healed it while we waited
        catch (e2) {
          if (!(e2 instanceof ScheduleStateCorrupt)) throw e2;
          opts.onQuarantine?.(quarantineScheduleState(stateDir));
        }
      } finally { releaseLock(lockPath, token); }
    } catch (e3) {
      if (e3 instanceof Error && e3.name === "StateTenantRefusal") throw e3;
      opts.onCorruptUnmoved?.(e3 instanceof Error ? e3.message : String(e3));
    }
    return new Set();
  }
}

export interface RecordScheduledOptions {
  onQuarantine?: (movedTo: string) => void;
  lockWaitMs?: number;
  /** Test seam (production leaves unset). */
  rename?: typeof renameSync;
}

/**
 * Adds one entry. Atomic (temp+fsync+rename), the read-modify-write runs under <stateDir>/schedule-state.lock, and a corrupt
 * file is quarantined (never silently reset). A foreign/untagged file is refused BEFORE anything is written.
 */
export function recordScheduled(stateDir: string, entry: ScheduledEntry, tenantId: string, opts: RecordScheduledOptions = {}): void {
  requireStateTenant(tenantId);
  mkdirSync(stateDir, { recursive: true });
  const lockPath = scheduleStateLockPath(stateDir);
  const token = acquireLock(lockPath, { waitMs: opts.lockWaitMs });
  try {
    let entries: ScheduleState;
    try { entries = readScheduleState(stateDir, tenantId); }
    catch (e) {
      if (!(e instanceof ScheduleStateCorrupt)) throw e;
      opts.onQuarantine?.(quarantineScheduleState(stateDir));
      entries = {};
    }
    entries[entry.sessionKey] = entry;
    writeAtomic(scheduleStateFilePath(stateDir), JSON.stringify({ version: STATE_FILE_VERSION, tenantId, entries }, null, 2) + "\n", opts.rename ?? renameSync,
      () => { if (!lockStillOwned(lockPath, token)) throw new Error("schedule-state lock was lost before the write; nothing written"); });
  } finally { releaseLock(lockPath, token); }
}

export interface ScheduledJob {
  
  url: string;
  
  until: string;
  title: string;
  
  sessionId: string;
}

function scheduledJobDir(stateDir: string): string {
  return path.join(stateDir, "scheduled");
}

export function scheduledJobFilePath(stateDir: string, jobKey: string): string {
  return path.join(scheduledJobDir(stateDir), `${jobKey}.json`);
}


export function writeScheduledJob(stateDir: string, jobKey: string, job: ScheduledJob, tenantId: string): void {
  const existing = readScheduledJob(stateDir, jobKey, tenantId); // throws on an untagged / other-tenant file at this key
  if (existing && existing.sessionId !== job.sessionId) {
    throw new Error(
      `refusing to schedule '${job.sessionId}': jobKey '${jobKey}' is already scheduled for a ` +
        `different session '${existing.sessionId}' (ISS-321 collision guard) — job file: ` +
        `${scheduledJobFilePath(stateDir, jobKey)}`,
    );
  }
  mkdirSync(scheduledJobDir(stateDir), { recursive: true });
  writeFileSync(scheduledJobFilePath(stateDir, jobKey), JSON.stringify({ ...job, tenantId }, null, 2) + "\n");
}


/** Null when absent or unparseable (as before). Throws StateTenantRefusal for a job file that is untagged or tagged for another tenant. */
export function readScheduledJob(stateDir: string, jobKey: string, tenantId: string): ScheduledJob | null {
  requireStateTenant(tenantId);
  const p = scheduledJobFilePath(stateDir, jobKey);
  if (!existsSync(p)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const { tenantId: _tag, ...job } = assertTenantTag(parsed, tenantId, `scheduled/${jobKey}.json`);
  return job as unknown as ScheduledJob;
}
