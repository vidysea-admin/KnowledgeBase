/**
 * scripts/webinar/join-rules-host.ts — T-037 unit `t037-join-rules-api-host`.
 * Production wiring for the join-rules edit API. `.dependency-cruiser.cjs` forbids `apps/* ->
 * packages/meeting-bot`, but only cruises `packages apps workers`, so a script is the one lawful place
 * that may import both `apps/api` (the structural `JoinRulesDeps`) and the real store/validator.
 * Pure helpers only (no listen, no Mongo): the entry point is join-rules-api-host.ts.
 */
import { accessSync, closeSync, constants, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JoinRulesDeps } from "../../apps/api/src/join-rules/deps.js";
import { loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut, recordTenantUnOptOut } from "../../packages/meeting-bot/src/calendar/join-rules-store.js";
import { validateJoinRuleSet } from "../../packages/meeting-bot/src/calendar/join-rules.js";

export const HOST_PID_FILE = "join-rules-host.pid";

/** The real store + engine validator mapped onto the injected seam. Store errors pass through unchanged. */
export function createJoinRulesDeps({ stateDir }: { stateDir: string }): JoinRulesDeps {
  return {
    load: t => loadJoinRules(stateDir, t),
    save: (t, v) => saveJoinRules(stateDir, t, v),
    validateRuleSet: validateJoinRuleSet,
    recordApproval: (t, a) => recordTenantApproval(stateDir, t, a),
    recordOptOut: (t, id, meeting) => recordTenantOptOut(stateDir, t, id, {}, meeting),
    // Un-opt: the store's locked read-modify-write (recordTenantUnOptOut) - load, pure removal and write are ONE critical section per tenant
    // across processes. A no-op writes nothing; a busy lock throws the store's typed `locked` error and nothing is written.
    removeOptOut: (t, id, meeting) => {
      const r = recordTenantUnOptOut(stateDir, t, id, {}, meeting);
      return { state: r.state, removed: { eventId: r.removedEventId, meetings: r.removedMeetings } };
    },
  };
}

/** Exactly the scheduler's rule (schedule-tick.ts DEFAULT_STATE_DIR): `<repo root>/raw/webinars`.
 * The scheduler reads no environment variable for it, so neither does this. */
export function resolveStateDir(moduleUrl: string = import.meta.url): string {
  let here: string;
  try { here = path.dirname(fileURLToPath(moduleUrl)); }
  catch { throw new Error("join-rules host: cannot resolve the repository root (module URL is not a file URL); refusing to start"); }
  return path.join(path.resolve(here, "..", ".."), "raw", "webinars");
}

/** Absolute, created if missing (recursive, as the store does), and writable — or throws a clear message.
 * `fs` is a test seam (OS permission bits behave differently on Windows). */
export function prepareStateDir(
  dir: string,
  fs: { mkdir: (d: string) => void; access: (d: string) => void } = { mkdir: d => void mkdirSync(d, { recursive: true }), access: d => accessSync(d, constants.W_OK) },
): string {
  if (typeof dir !== "string" || dir === "" || !path.isAbsolute(dir))
    throw new Error("join-rules host: state directory must be an absolute path; refusing to start");
  const resolved = path.resolve(dir);
  try { fs.mkdir(resolved); fs.access(resolved); }
  catch (e) { throw new Error(`join-rules host: state directory ${resolved} cannot be created or is not writable (${(e as NodeJS.ErrnoException).code ?? "error"}); refusing to start`); }
  return resolved;
}

/** Reboot test: boot times (ms) further apart than this mean the machine restarted. 120 s tolerates clock
 * steps/NTP slews and uptime rounding; a real reboot after a lock write is almost always further apart. */
export const BOOT_JITTER_MS = 120_000;
/** An unparseable/empty lock file younger than this may be a host mid-write: held. Older: abandoned. */
export const PARTIAL_WRITE_ABANDONED_MS = 60_000;
/** A take-over mutex older than this was left by a crashed taker and is removed once. */
const TAKEOVER_MUTEX_STALE_MS = 30_000;
const RENAME_DEADLINE_MS = 2_000;

export interface LockDeps { kill?: (pid: number, sig: 0) => void; bootTimeMs?: () => number; log?: (m: string) => void }
interface LockRecord { pid: number; token: string; startedAt: number; boot: number }

/** Boot instant in ms, rounded to a whole second. */
export function currentBootTimeMs(): number { return Math.round((Date.now() - os.uptime() * 1000) / 1000) * 1000; }

function parseRecord(raw: string | null): LockRecord | null {
  if (raw === null) return null;
  try {
    const r = JSON.parse(raw);
    if (r && typeof r === "object" && Number.isInteger(r.pid) && r.pid > 0 && typeof r.token === "string" && /^[0-9a-f]{32}$/.test(r.token)
      && Number.isFinite(r.startedAt) && Number.isFinite(r.boot)) return { pid: r.pid, token: r.token, startedAt: r.startedAt, boot: r.boot };
  } catch { /* unparseable */ }
  return null;
}
function readRaw(file: string): string | null {
  try { return readFileSync(file, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
function ageMs(file: string): number {
  try { return Date.now() - statSync(file).mtimeMs; } catch { return 0; }
}
/** ESRCH = gone. EPERM (other user) and any other error: alive (fail closed). */
function isAlive(pid: number, kill: NonNullable<LockDeps["kill"]>): boolean {
  try { kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== "ESRCH"; }
}
function sleepMs(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/** Exclusive pid file. Normal path: create with `wx`. If it exists, take over ONLY when its owner is provably
 * gone (recorded boot differs from this boot by > BOOT_JITTER_MS, or the pid is not running, or the content is
 * unparseable AND older than PARTIAL_WRITE_ABANDONED_MS). Take-over is serialised by an exclusive
 * `<pid file>.takeover` mutex, re-checks that the file still holds the exact stale bytes, renames our temp file
 * over it and reads back our token. Returns an idempotent release that deletes the file only if it is still ours. */
export function acquireHostLock(stateDir: string, pid: number = process.pid, deps: LockDeps = {}): () => void {
  const file = path.join(stateDir, HOST_PID_FILE);
  const kill = deps.kill ?? ((p, s) => void process.kill(p, s));
  const log = deps.log ?? ((m: string) => console.log(m));
  const rec: LockRecord = { pid, token: randomBytes(16).toString("hex"), startedAt: Date.now(), boot: (deps.bootTimeMs ?? currentBootTimeMs)() };
  const content = `${JSON.stringify(rec)}\n`;
  const held = (who: string) => new Error(`join-rules host: ${file} is held by another host${who}. Not starting.`);
  for (let attempt = 0; attempt < 5; attempt++) {
    let fd: number;
    try { fd = openSync(file, "wx"); }
    catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw new Error(`join-rules host: cannot create ${file} (${code ?? "error"}); refusing to start`);
      const raw = readRaw(file);
      if (raw === null) continue; // vanished between EEXIST and read: try the exclusive create again
      const old = parseRecord(raw);
      let reason: string;
      if (old) {
        if (Math.abs(old.boot - rec.boot) > BOOT_JITTER_MS) reason = "reboot detected since the lock was written";
        else if (!isAlive(old.pid, kill)) reason = "recorded pid is not running";
        else throw held(` (pid ${old.pid}, still running)`);
      } else if (ageMs(file) > PARTIAL_WRITE_ABANDONED_MS) reason = "unreadable lock content, abandoned partial write";
      else throw held(" (lock content unreadable but recent: a host may be starting)");
      takeOver(file, raw, rec, content, held);
      log(`join-rules host: took over stale lock ${file} (${reason}; old pid ${old ? old.pid : "unknown"})`);
      return makeRelease(file, rec.token);
    }
    try { writeSync(fd, content); } finally { closeSync(fd); }
    return makeRelease(file, rec.token);
  }
  throw new Error(`join-rules host: ${file} kept changing during start; refusing to start`);
}

function takeOver(file: string, staleRaw: string, rec: LockRecord, content: string, held: (who: string) => Error): void {
  const mutex = `${file}.takeover`;
  const tmp = `${file}.${rec.token}.tmp`;
  let mfd: number | undefined;
  for (let i = 0; mfd === undefined; i++) {
    try { mfd = openSync(mutex, "wx"); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw new Error(`join-rules host: cannot create ${mutex}; refusing to start`);
      if (i === 0 && ageMs(mutex) > TAKEOVER_MUTEX_STALE_MS) { try { unlinkSync(mutex); } catch { /* raced */ } continue; }
      throw held(" (another host is taking over the stale lock)");
    }
  }
  closeSync(mfd);
  try {
    if (readRaw(file) !== staleRaw) throw held(" (the lock changed during take-over)");
    writeFileSync(tmp, content);
    const deadline = Date.now() + RENAME_DEADLINE_MS;
    for (;;) {
      try { renameSync(tmp, file); break; }
      catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (!["EPERM", "EBUSY", "EACCES"].includes(code ?? "") || Date.now() > deadline)
          throw new Error(`join-rules host: could not replace stale lock ${file} (${code ?? "error"}); refusing to start`);
        sleepMs(25);
      }
    }
    if (parseRecord(readRaw(file))?.token !== rec.token) throw held(" (another starter won the take-over)");
  } finally {
    rmSync(tmp, { force: true });
    try { unlinkSync(mutex); } catch { /* gone */ }
  }
}

function makeRelease(file: string, token: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { if (parseRecord(readRaw(file))?.token === token) unlinkSync(file); } catch { /* already gone */ }
  };
}
