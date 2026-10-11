/**
 * packages/meeting-bot/src/calendar/join-rules-store-lock.ts — units `t037-join-rules-store-lock`, `t037-join-rules-stale-lock-takeover`.
 * Cross-process exclusive lock for one tenant's join-rules file. Mirrors scripts/qa/ledger-alloc.mjs `acquireLock` (a package cannot
 * import scripts/), with its ISS-ALLOC-005 defect handled. The protocol itself lives in join-rules-store-lock-steps.ts (generators).
 *
 *  - The lock is a file created with the `wx` flag. Contents `{token,pid,host,at}`: `token` identifies OUR hold so release never
 *    deletes someone else's lock; `pid` + `host` + `at` are the evidence for the takeover rule below.
 *  - Synchronous. Waiting is a bounded busy-wait that sleeps via `Atomics.wait` (blocking, no CPU spin) with a hard
 *    overall deadline `waitMs`. Never proceeds without the lock.
 *  - EEXIST = held by someone else. EACCES / EPERM / EBUSY on create = the same thing seen mid-delete on Windows when a lock file
 *    is present or just vanished: stat afterwards. Gone -> retry at once; present (or stat itself failing mid-delete) -> contention.
 *    Persisting for the whole deadline with no lock file ever present -> "lock-failed" (a real permission problem), not "locked".
 *    Any other create error fails immediately.
 *
 * STALE TAKEOVER. A lock is taken over ONLY when ALL hold: its content parses strictly; its `host` equals this machine's hostname
 * EXACTLY; its recorded creation time is more than `staleMs` old by the (injectable) clock (age is an ADDITIONAL condition: it can only
 * delay a takeover, never cause one; a clock stepped back or a time in the future never makes a lock look old); AND the OS says its
 * `pid` does not exist (ESRCH). Anything else (another host, no host field, unparseable / empty / oversized content, pid alive, EPERM,
 * probe failure, too young) -> `locked`, untouched. Known limits, all failing toward `locked`: pid reuse (ISS-LOCKTAKE-001), other host
 * (002), empty lock from a crash between create and write (006: manual recovery). Deployment preconditions P1-P3 are in the contract;
 * P1 (one PID namespace per lock directory) is the one the age rule cannot fully replace (ISS-LOCKTAKE-005).
 * The takeover is a claim-then-rename protocol with no hard links and no moved lock; see join-rules-store-lock-steps.ts.
 */
import { randomUUID } from "node:crypto";
import { hostname as osHostname } from "node:os";
import {
  realFs, parseHolder, readLock, acquireSteps, releaseSteps, LockFailure, type Ctx, type Liveness, type TakeoverInfo,
} from "./join-rules-store-lock-steps.js";

export { LockFailure, type Liveness, type TakeoverInfo };
export const DEFAULT_LOCK_WAIT_MS = 5000;
export const DEFAULT_LOCK_STALE_MS = 30000;
export interface LockOptions {
  waitMs?: number; staleMs?: number;
  /** Test seams (production leaves these unset). */
  now?: () => number; sleep?: (ms: number) => void; hostname?: () => string; isAlive?: (pid: number) => Liveness; step?: (name: string) => void;
  /** Called once, after a dead holder's lock was replaced by ours. Carries no path. */
  onTakeover?: (info: TakeoverInfo) => void;
}

export const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

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

/** Runs a protocol generator to completion: `nap:<ms>` sleeps, every other yield is reported to `step`. */
function drive<T>(g: Generator<string, T>, step: (name: string) => void, nap: (ms: number) => void): T {
  for (;;) {
    const n = g.next();
    if (n.done) return n.value;
    if (n.value.startsWith("nap:")) nap(Number(n.value.slice(4))); else step(n.value);
  }
}

/** Takes the lock or throws LockFailure. Returns the hold token for `releaseLock`. */
export function acquireLock(lockPath: string, opts: LockOptions = {}): string {
  const ctx: Ctx = {
    fs: realFs, waitMs: opts.waitMs ?? DEFAULT_LOCK_WAIT_MS, staleMs: opts.staleMs ?? DEFAULT_LOCK_STALE_MS, now: opts.now ?? Date.now,
    host: (opts.hostname ?? osHostname)(), pid: process.pid, token: randomUUID(), isAlive: opts.isAlive ?? defaultIsAlive,
  };
  const r = drive(acquireSteps(lockPath, ctx), opts.step ?? (() => {}), opts.sleep ?? sleep);
  if (r.takeover) opts.onTakeover?.(r.takeover);
  return r.token;
}

/** True while the lock file still carries OUR token. The store checks this immediately before replacing the data file. */
export function lockStillOwned(lockPath: string, token: string): boolean {
  const raw = readLock(realFs, lockPath);
  return raw !== null && parseHolder(raw)?.token === token;
}

/** Removes the lock only if it still carries OUR token (read, verify, unlink); a lock that is not ours is left untouched. */
export function releaseLock(lockPath: string, token: string): void {
  drive(releaseSteps(lockPath, token, realFs), () => {}, sleep);
}
