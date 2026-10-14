/** Per-tenant schedule dedup state and one-off scheduled-job files (split verbatim from schedule-state.ts). */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertTenantTag, requireStateTenant } from "./state-tenant-tag.js";
import { acquireLock, lockStillOwned, releaseLock } from "../join-rules/join-rules-store-lock.js";
import { writeAtomic } from "./skipped-state.js";

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
