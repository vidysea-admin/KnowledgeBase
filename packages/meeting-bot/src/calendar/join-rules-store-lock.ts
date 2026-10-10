/**
 * packages/meeting-bot/src/calendar/join-rules-store-lock.ts — unit `t037-join-rules-store-lock`.
 * Cross-process exclusive lock for one tenant's join-rules file. Mirrors scripts/qa/ledger-alloc.mjs `acquireLock`
 * (a package cannot import scripts/), with its ISS-ALLOC-005 defect handled.
 *
 *  - The lock is a file created with the `wx` flag. Contents `{token,pid,at}`: `token` identifies OUR hold so release never
 *    deletes someone else's lock; `pid` and `at` are for diagnosis only and never decide anything except the stale REPORT.
 *  - Synchronous. Waiting is a bounded busy-wait that sleeps via `Atomics.wait` (blocking, no CPU spin) with a hard
 *    overall deadline `waitMs`. Never proceeds without the lock; never steals one.
 *  - EEXIST = held by someone else. EACCES / EPERM / EBUSY on create = the same thing seen mid-delete on Windows when a lock file
 *    is present or just vanished: stat afterwards. Gone -> retry at once; present (or stat itself failing mid-delete) -> contention.
 *    Persisting for the whole deadline with no lock file ever present -> "lock-failed" (a real permission problem), not "locked".
 *    Any other create error fails immediately.
 *  - Stale lock (age > staleMs, from the `at` stamp, else mtime) is REPORTED with its path, age and manual clear steps. Not stolen.
 */
import { openSync, writeSync, closeSync, statSync, readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

export const DEFAULT_LOCK_WAIT_MS = 5000;
export const DEFAULT_LOCK_STALE_MS = 30000;
export interface LockOptions { waitMs?: number; staleMs?: number }

export class LockFailure extends Error {
  constructor(public readonly code: "locked" | "lock-failed", message: string) { super(message); this.name = "LockFailure"; }
}

export const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const TRANSITIONAL = ["EEXIST", "EACCES", "EPERM", "EBUSY"];

/** Takes the lock or throws LockFailure. Returns the hold token for `releaseLock`. */
export function acquireLock(lockPath: string, opts: LockOptions = {}): string {
  const waitMs = opts.waitMs ?? DEFAULT_LOCK_WAIT_MS, staleMs = opts.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const start = Date.now(), token = randomUUID();
  let lastCreateErr: any, everPresent = false;
  for (;;) {
    let code: string;
    try {
      const fd = openSync(lockPath, "wx");
      try { writeSync(fd, JSON.stringify({ token, pid: process.pid, at: new Date().toISOString() })); } finally { closeSync(fd); }
      return token;
    } catch (err: any) {
      lastCreateErr = err; code = err?.code ?? "UNKNOWN";
      if (!TRANSITIONAL.includes(code)) throw new LockFailure("lock-failed", `cannot create join-rules lock ${lockPath}: ${code} (${err?.message ?? err}). Not contention; check the directory and its permissions. Nothing was changed.`);
    }
    let mtime: number | undefined;
    try { mtime = statSync(lockPath).mtimeMs; everPresent = true; }
    catch (err: any) {
      if (err?.code === "ENOENT") { // lock gone (released / finished deleting): retry now, still bounded by the deadline
        if (Date.now() - start >= waitMs) throw deadline(lockPath, waitMs, everPresent, lastCreateErr, undefined, "");
        if (code !== "EEXIST") sleep(2); // no spin if the create keeps failing for a non-contention reason
        continue;
      }
      everPresent = true; // stat failing for another reason while a create failed: delete-pending or locked down; treat as held
    }
    let held = ""; try { held = readFileSync(lockPath, "utf8"); } catch { /* mid-delete or unreadable: report without content */ }
    let at = NaN; try { at = Date.parse(JSON.parse(held).at); } catch { /* fall back to mtime */ }
    const stamp = Number.isFinite(at) ? at : mtime;
    const age = stamp === undefined ? 0 : Date.now() - stamp;
    if (age > staleMs) throw new LockFailure("locked", `stale join-rules lock ${lockPath} (age ${Math.round(age / 1000)}s > ${staleMs / 1000}s, content ${held || "unreadable"}). NOT stealing it: confirm the process named in the lock (pid) is no longer running, delete the file ${lockPath} by hand, then retry. Nothing was changed.`);
    if (Date.now() - start >= waitMs) throw deadline(lockPath, waitMs, everPresent, lastCreateErr, age, held);
    sleep(5 + Math.floor(Math.random() * 20));
  }
}

function deadline(lockPath: string, waitMs: number, everPresent: boolean, err: any, age: number | undefined, held: string): LockFailure {
  if (!everPresent && err?.code !== "EEXIST") return new LockFailure("lock-failed", `cannot create join-rules lock ${lockPath}: ${err?.code} (${err?.message}) for ${waitMs}ms with no lock file present. Not contention; check the directory permissions. Nothing was changed.`);
  return new LockFailure("locked", `join-rules lock ${lockPath} still held by someone else after ${waitMs}ms${age === undefined ? "" : ` (age ${Math.round(age / 1000)}s, content ${held || "unreadable"})`}; retry later. Nothing was changed.`);
}

/** Removes the lock only if it is still OURS (token match). A lock someone else now owns is left alone. */
export function releaseLock(lockPath: string, token: string): void {
  try {
    if (JSON.parse(readFileSync(lockPath, "utf8")).token !== token) return;
    unlinkSync(lockPath);
  } catch (err: any) {
    if (err?.code === "ENOENT" || err instanceof SyntaxError) return;
    throw err;
  }
}
