/**
 * packages/meeting-bot/src/calendar/join-rules-store-lock.ts — units `t037-join-rules-store-lock`, `t037-join-rules-stale-lock-takeover`.
 * Cross-process exclusive lock for one tenant's join-rules file. Mirrors scripts/qa/ledger-alloc.mjs `acquireLock`
 * (a package cannot import scripts/), with its ISS-ALLOC-005 defect handled.
 *
 *  - The lock is a file created with the `wx` flag. Contents `{token,pid,host,at}`: `token` identifies OUR hold so release never
 *    deletes someone else's lock; `pid` + `host` are the evidence for the takeover rule below; `at` is diagnosis only.
 *  - Synchronous. Waiting is a bounded busy-wait that sleeps via `Atomics.wait` (blocking, no CPU spin) with a hard
 *    overall deadline `waitMs`. Never proceeds without the lock.
 *  - EEXIST = held by someone else. EACCES / EPERM / EBUSY on create = the same thing seen mid-delete on Windows when a lock file
 *    is present or just vanished: stat afterwards. Gone -> retry at once; present (or stat itself failing mid-delete) -> contention.
 *    Persisting for the whole deadline with no lock file ever present -> "lock-failed" (a real permission problem), not "locked".
 *    Any other create error fails immediately.
 *
 * STALE TAKEOVER. A lock is taken over ONLY on proof of death, never on age or the clock:
 *   its content parses strictly, its `host` equals this machine's hostname, and the OS says its `pid` does not exist (ESRCH).
 * Anything else (another host, no host field, unparseable / oversized content, pid alive, EPERM, probe failure) -> `locked`, untouched.
 * Wall-clock age never decides; staleMs only expires an abandoned takeover tombstone and words the manual-clear message. Known limit:
 * a dead holder whose pid was reused by an unrelated live process looks alive -> stays `locked` (fails SAFE: availability, not exclusion).
 * Sequence (each step is a compare-and-swap against the exact bytes judged dead):
 *   1 link lock -> `<lock>.stale.<deadToken>`  (hard link: only ONE taker can make that name; the lock itself is not touched yet)
 *   2 tombstone bytes must equal the bytes judged dead (else another taker already replaced the lock: drop the link, start over)
 *   3 rename lock -> `<lock>.gone.<uuid>`  (unique; absent lock = someone else won)
 *   4 gone bytes must still equal the bytes judged dead; if not, put it back with a no-replace link (a live lock was grabbed)
 *   5 drop both names, then create the new lock with `wx` like any acquirer (so a normal acquirer racing us still yields ONE holder).
 */
import { openSync, writeSync, closeSync, statSync, readFileSync, unlinkSync, linkSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { hostname as osHostname } from "node:os";

export const DEFAULT_LOCK_WAIT_MS = 5000;
export const DEFAULT_LOCK_STALE_MS = 30000;
export type Liveness = "alive" | "dead" | "unknown";
export interface TakeoverInfo { pid: number; ageMs: number | undefined }
export interface LockOptions {
  waitMs?: number; staleMs?: number;
  /** Test seams (production leaves these unset). */
  now?: () => number; sleep?: (ms: number) => void; hostname?: () => string; isAlive?: (pid: number) => Liveness; step?: (name: string) => void;
  /** Called once, after a dead holder's lock was replaced by ours. Carries no path. */
  onTakeover?: (info: TakeoverInfo) => void;
}

export class LockFailure extends Error {
  constructor(public readonly code: "locked" | "lock-failed", message: string) { super(message); this.name = "LockFailure"; }
}

export const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const TRANSITIONAL = ["EEXIST", "EACCES", "EPERM", "EBUSY"];
const MAX_LOCK_BYTES = 4096;
const SAFE_TOKEN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Node `process.kill(pid, 0)` sends nothing. POSIX: ESRCH = no such process, EPERM = exists (not ours). Windows (libuv): OpenProcess
 * fails with ERROR_INVALID_PARAMETER -> ESRCH for a pid that does not exist; an exited process is detected through
 * GetExitCodeProcess != STILL_ACTIVE -> ESRCH; access denied -> EPERM. Only ESRCH is death; every other outcome keeps the lock.
 */
export function defaultIsAlive(pid: number): Liveness {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown"; // pid 0 / negatives would signal a process GROUP
  try { process.kill(pid, 0); return "alive"; }
  catch (err: any) { return err?.code === "ESRCH" ? "dead" : err?.code === "EPERM" ? "alive" : "unknown"; }
}

interface Holder { token: string; pid: number; host: string; at: number }
/** Strict parse; null for anything not exactly the shape this module writes (garbage is never taken over). */
function parseHolder(raw: string): Holder | null {
  let j: any; try { j = JSON.parse(raw); } catch { return null; }
  if (j === null || typeof j !== "object" || Array.isArray(j)) return null;
  const at = typeof j.at === "string" ? Date.parse(j.at) : NaN;
  if (typeof j.token !== "string" || !SAFE_TOKEN.test(j.token) || !Number.isSafeInteger(j.pid) || j.pid <= 0 || typeof j.host !== "string" || !j.host || j.host.length > 255) return null;
  return { token: j.token, pid: j.pid, host: j.host, at };
}
/** Diagnosis only: the `at` stamp of any JSON-ish lock content, NaN when absent. Never used to decide a takeover. */
function looseAt(raw: string): number { try { return Date.parse(JSON.parse(raw).at); } catch { return NaN; } }
/** Bounded read; null when missing, unreadable or larger than any lock this module writes. */
function readLock(file: string): string | null {
  try { if (statSync(file).size > MAX_LOCK_BYTES) return null; return readFileSync(file, "utf8"); } catch { return null; }
}
const quiet = (fn: () => void) => { try { fn(); } catch { /* best effort */ } };

type Taken = "taken" | "retry" | "busy";
/** One compare-and-swap takeover of the lock whose exact bytes are `raw` (judged dead by the caller). */
function takeOver(lockPath: string, raw: string, holder: Holder, now: () => number, step: (n: string) => void, staleMs: number): Taken {
  const tomb = `${lockPath}.stale.${holder.token}`, gone = `${lockPath}.gone.${randomUUID()}`;
  step("judged");
  try { linkSync(lockPath, tomb); }
  catch (err: any) {
    if (err?.code === "ENOENT") return "retry"; // lock vanished: someone else finished
    if (err?.code === "EEXIST") { // another taker holds this tombstone; reclaim it only if abandoned long ago
      try { if (now() - statSync(tomb).mtimeMs > Math.max(staleMs, 1000)) { unlinkSync(tomb); return "retry"; } } catch { /* raced */ }
    }
    return "busy"; // taker in progress, no hard links on this volume, Windows EPERM...: stay locked
  }
  step("linked");
  if (readLock(tomb) !== raw) { quiet(() => unlinkSync(tomb)); return "retry"; } // lock was replaced after we judged it
  step("verified");
  try { renameSync(lockPath, gone); }
  catch (err: any) { quiet(() => unlinkSync(tomb)); return err?.code === "ENOENT" ? "retry" : "busy"; }
  if (readLock(gone) !== raw) { // we grabbed a lock that is not the dead one: put it back without replacing anything
    step("restored"); quiet(() => linkSync(gone, lockPath)); quiet(() => unlinkSync(gone)); quiet(() => unlinkSync(tomb)); return "busy";
  }
  step("renamed");
  quiet(() => unlinkSync(gone)); quiet(() => unlinkSync(tomb));
  return "taken";
}

/** Takes the lock or throws LockFailure. Returns the hold token for `releaseLock`. */
export function acquireLock(lockPath: string, opts: LockOptions = {}): string {
  const waitMs = opts.waitMs ?? DEFAULT_LOCK_WAIT_MS, staleMs = opts.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const now = opts.now ?? Date.now, nap = opts.sleep ?? sleep, host = (opts.hostname ?? osHostname)(), isAlive = opts.isAlive ?? defaultIsAlive;
  const step = opts.step ?? (() => {});
  const start = now(), token = randomUUID();
  let lastCreateErr: any, everPresent = false, takenOver: TakeoverInfo | undefined;
  for (;;) {
    let code: string;
    try {
      const fd = openSync(lockPath, "wx");
      try { writeSync(fd, JSON.stringify({ token, pid: process.pid, host, at: new Date(now()).toISOString() })); } finally { closeSync(fd); }
      if (takenOver) opts.onTakeover?.(takenOver);
      return token;
    } catch (err: any) {
      lastCreateErr = err; code = err?.code ?? "UNKNOWN";
      if (!TRANSITIONAL.includes(code)) throw new LockFailure("lock-failed", `cannot create join-rules lock ${lockPath}: ${code} (${err?.message ?? err}). Not contention; check the directory and its permissions. Nothing was changed.`);
    }
    let mtime: number | undefined;
    try { mtime = statSync(lockPath).mtimeMs; everPresent = true; }
    catch (err: any) {
      if (err?.code === "ENOENT") { // lock gone (released / finished deleting): retry now, still bounded by the deadline
        if (now() - start >= waitMs) throw deadline(lockPath, waitMs, everPresent, lastCreateErr, undefined, "");
        if (code !== "EEXIST") nap(2); // no spin if the create keeps failing for a non-contention reason
        continue;
      }
      everPresent = true; // stat failing for another reason while a create failed: delete-pending or locked down; treat as held
    }
    const raw = readLock(lockPath), holder = raw === null ? null : parseHolder(raw);
    const deadHere = raw !== null && holder !== null && holder.host === host && isAlive(holder.pid) === "dead";
    if (deadHere) {
      const r = takeOver(lockPath, raw, holder, now, step, staleMs);
      if (r === "taken") { takenOver = { pid: holder.pid, ageMs: Number.isFinite(holder.at) ? now() - holder.at : undefined }; continue; }
      if (r === "retry" && now() - start < waitMs) continue;
    }
    const held = raw ?? "", at = looseAt(held), stamp = Number.isFinite(at) ? at : mtime; // age is only for the report / stale message
    const age = stamp === undefined ? 0 : now() - stamp;
    if (now() - start >= waitMs) throw deadline(lockPath, waitMs, everPresent, lastCreateErr, age, held);
    if (age > staleMs && !deadHere) throw new LockFailure("locked", `stale join-rules lock ${lockPath} (age ${Math.round(age / 1000)}s > ${staleMs / 1000}s, content ${held || "unreadable"}). NOT stealing it: holder is on another host, alive, or its liveness cannot be determined. Confirm the process named in the lock (pid) is no longer running, delete the file ${lockPath} by hand, then retry. Nothing was changed.`);
    nap(5 + Math.floor(Math.random() * 20));
  }
}

function deadline(lockPath: string, waitMs: number, everPresent: boolean, err: any, age: number | undefined, held: string): LockFailure {
  if (!everPresent && err?.code !== "EEXIST") return new LockFailure("lock-failed", `cannot create join-rules lock ${lockPath}: ${err?.code} (${err?.message}) for ${waitMs}ms with no lock file present. Not contention; check the directory permissions. Nothing was changed.`);
  return new LockFailure("locked", `join-rules lock ${lockPath} still held by someone else after ${waitMs}ms${age === undefined ? "" : ` (age ${Math.round(age / 1000)}s, content ${held || "unreadable"})`}; retry later. Nothing was changed.`);
}

/** True while the lock file still carries OUR token. The store checks this immediately before replacing the data file. */
export function lockStillOwned(lockPath: string, token: string): boolean {
  const raw = readLock(lockPath);
  return raw !== null && parseHolder(raw)?.token === token;
}

/**
 * Removes the lock only if it is still OURS (token match). The lock is first renamed to a unique name and checked there, so a
 * check-then-unlink gap cannot delete a lock someone else created after a takeover; a lock that is not ours is put back
 * (no-replace link) and left alone.
 */
export function releaseLock(lockPath: string, token: string): void {
  const gone = `${lockPath}.gone.${randomUUID()}`;
  for (let attempt = 0; ; attempt++) {
    try { renameSync(lockPath, gone); break; }
    catch (err: any) {
      if (err?.code === "ENOENT") return;
      if (!["EPERM", "EACCES", "EBUSY"].includes(err?.code) || attempt >= 50) throw err; // Windows: a reader may hold it open for a moment
      sleep(2 + Math.floor(Math.random() * 8));
    }
  }
  const raw = readLock(gone);
  if (raw !== null && parseHolder(raw)?.token === token) { quiet(() => unlinkSync(gone)); return; }
  quiet(() => linkSync(gone, lockPath)); quiet(() => unlinkSync(gone)); // not ours (or unreadable): restore it untouched
}
