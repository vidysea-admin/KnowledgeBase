/**
 * packages/meeting-bot/src/calendar/join-rules-store-lock-steps.ts — unit `t037-join-rules-stale-lock-takeover` (fix cycle 1).
 * The acquire / takeover / release protocol of join-rules-store-lock.ts as GENERATORS that yield before every shared file operation, over an
 * injectable `LockFs`. Production drives them straight through (`drive` in join-rules-store-lock.ts); tests drive several actors one yield at a
 * time to enumerate interleavings against an in-memory or a real directory.
 *
 * TAKEOVER (a dead holder's lock D is replaced; no lock is ever moved, unlinked or absent while it may be live):
 *   judge  : lock parses strictly, host equals ours EXACTLY, lock age (recorded `at` vs the clock) > staleMs, and the OS says pid is ESRCH.
 *   claim  : create `<lock>.claim.<D.token>` with `wx`. Content = OUR OWN lock body {token,pid,host,at:now}. Exactly one contender can create
 *            it; everyone else gets EEXIST -> `locked`. The claim is a separate file, so its age is its own, never the dead lock's.
 *   reread : the lock bytes must still equal the bytes judged dead; the pid is probed again and the age re-checked. Else drop our claim, retry.
 *   replace: rename(claim, lock). The claim already IS a complete new lock body, so one atomic rename replaces the dead lock: there is no
 *            instant without a lock file, no link-back, no temp file.
 *   verify : the lock now carries our token -> we hold it.
 * Why replace is safe while we hold the claim: the lock can only change through (i) its holder, dead by the judge; (ii) a plain acquirer, whose
 * `wx` cannot succeed while the file exists; (iii) another taker, which needs this very claim name. A taker that judged D earlier and creates the
 * claim name after we consumed it fails the reread (the lock no longer holds D's bytes). Residual, outside P1-P3 (ISS-LOCKTAKE-005/007): the
 * holder is really alive (probe lies; age > staleMs makes that a >30 s stall) or an operator deletes the lock inside the one-syscall
 * reread->replace gap and a third process creates a new one there.
 * ABANDONED CLAIM: never removed automatically. It blocks takeover of THAT dead token only (a later dead lock has a new token, hence a new claim
 * name); the `locked` message names it for manual recovery. A claimant dying inside the reread->replace window is microseconds wide.
 */
import { openSync, writeSync, closeSync, statSync, readFileSync, renameSync, unlinkSync } from "node:fs";

export type Liveness = "alive" | "dead" | "unknown";
export interface TakeoverInfo { pid: number; ageMs: number | undefined }
export class LockFailure extends Error {
  constructor(public readonly code: "locked" | "lock-failed", message: string) { super(message); this.name = "LockFailure"; }
}
/** The file operations the protocol uses. `read` returns null for a missing file and throws on other errors; `stat` returns mtimeMs. */
export interface LockFs {
  create(p: string, data: string): void; read(p: string): string | null; stat(p: string): number; rename(a: string, b: string): void; unlink(p: string): void;
}
export const MAX_LOCK_BYTES = 4096;
export const OVERSIZE = "<oversize lock>"; // never parses
export const SAFE_TOKEN = /^[A-Za-z0-9-]{1,64}$/;
export const MAX_FUTURE_SKEW_MS = 5000;
const TRANSITIONAL = ["EEXIST", "EACCES", "EPERM", "EBUSY"];

export const realFs: LockFs = {
  create(p, data) { const fd = openSync(p, "wx"); try { writeSync(fd, data); } finally { closeSync(fd); } },
  read(p) {
    try { if (statSync(p).size > MAX_LOCK_BYTES) return OVERSIZE; return readFileSync(p, "utf8"); }
    catch (err: any) { if (err?.code === "ENOENT") return null; throw err; }
  },
  stat: p => statSync(p).mtimeMs, rename: renameSync, unlink: unlinkSync,
};

export interface Holder { token: string; pid: number; host: string; at: number }
/** Strict parse; null for anything not exactly the shape this module writes (garbage is never taken over). */
export function parseHolder(raw: string): Holder | null {
  let j: any; try { j = JSON.parse(raw); } catch { return null; }
  if (j === null || typeof j !== "object" || Array.isArray(j)) return null;
  const at = typeof j.at === "string" ? Date.parse(j.at) : NaN;
  if (typeof j.token !== "string" || !SAFE_TOKEN.test(j.token) || !Number.isSafeInteger(j.pid) || j.pid <= 0 || typeof j.host !== "string" || !j.host || j.host.length > 255) return null;
  return { token: j.token, pid: j.pid, host: j.host, at };
}
/** Diagnosis only: the `at` stamp of any JSON-ish lock content, NaN when absent. */
function looseAt(raw: string): number { try { return Date.parse(JSON.parse(raw).at); } catch { return NaN; } }
/** Age of a lock from its own recorded creation time; undefined (= not old) when unknown or in the future beyond a small skew. Never negative. */
export function ageOf(at: number, nowMs: number): number | undefined {
  if (!Number.isFinite(at) || at > nowMs + MAX_FUTURE_SKEW_MS) return undefined;
  return Math.max(0, nowMs - at);
}
export const claimPathFor = (lockPath: string, deadToken: string) => `${lockPath}.claim.${deadToken}`;
export function readLock(fs: LockFs, file: string): string | null { try { return fs.read(file); } catch { return null; } }
const quiet = (fn: () => void) => { try { fn(); } catch { /* best effort */ } };

export interface Ctx {
  fs: LockFs; waitMs: number; staleMs: number; now: () => number; host: string; pid: number; token: string; isAlive: (pid: number) => Liveness;
}
export const lockBody = (c: Ctx) => JSON.stringify({ token: c.token, pid: c.pid, host: c.host, at: new Date(c.now()).toISOString() });
const isOld = (h: Holder, c: Ctx) => { const a = ageOf(h.at, c.now()); return a !== undefined && a > c.staleMs; };

type Taken = { res: "taken" | "retry" | "busy"; note?: string };
/** One takeover attempt of the lock whose exact bytes are `raw` (judged dead by the caller). */
function* takeoverSteps(lockPath: string, raw: string, dead: Holder, c: Ctx): Generator<string, Taken> {
  const claim = claimPathFor(lockPath, dead.token), mine = lockBody(c);
  yield "claim";
  try { c.fs.create(claim, mine); }
  catch (err: any) { return { res: "busy", note: err?.code === "EEXIST" ? ` A takeover claim ${claim} exists: a taker is working, or it died holding it (then confirm its pid is gone and delete that claim file too).` : undefined }; }
  const drop = () => quiet(() => { const r = c.fs.read(claim); if (r !== null && parseHolder(r)?.token === c.token) c.fs.unlink(claim); });
  yield "reread";
  if (readLock(c.fs, lockPath) !== raw) { yield "unclaim"; drop(); return { res: "retry" }; }
  if (!isOld(dead, c) || dead.host !== c.host || c.isAlive(dead.pid) !== "dead") { yield "unclaim"; drop(); return { res: "busy" }; }
  yield "replace";
  try { c.fs.rename(claim, lockPath); }
  catch { yield "unclaim"; drop(); return { res: "busy" }; }
  yield "verify";
  const after = readLock(c.fs, lockPath);
  return { res: after !== null && parseHolder(after)?.token === c.token ? "taken" : "busy" };
}

/** Yields step names; `nap:<ms>` asks the driver to sleep. Returns our token (and the takeover info when a dead lock was replaced). */
export function* acquireSteps(lockPath: string, c: Ctx): Generator<string, { token: string; takeover?: TakeoverInfo }> {
  const start = c.now();
  let lastErr: any, everPresent = false, note = "", napped = 0;
  // Elapsed time never goes backwards: a clock stepped back must not stretch the wait (the napped time is a floor).
  const elapsed = () => Math.max(c.now() - start, napped);
  const nap = (ms: number) => { napped += ms; return `nap:${ms}`; };
  for (;;) {
    let code: string;
    yield "create";
    try { c.fs.create(lockPath, lockBody(c)); return { token: c.token }; }
    catch (err: any) {
      lastErr = err; code = err?.code ?? "UNKNOWN";
      if (!TRANSITIONAL.includes(code)) throw new LockFailure("lock-failed", `cannot create join-rules lock ${lockPath}: ${code} (${err?.message ?? err}). Not contention; check the directory and its permissions. Nothing was changed.`);
    }
    yield "stat";
    let mtime: number | undefined;
    try { mtime = c.fs.stat(lockPath); everPresent = true; }
    catch (err: any) {
      if (err?.code === "ENOENT") { // lock gone (released / finished deleting): retry now, still bounded by the deadline
        if (elapsed() >= c.waitMs) throw deadline(lockPath, c.waitMs, everPresent, lastErr, undefined, "", note);
        if (code !== "EEXIST") yield nap(2);
        continue;
      }
      everPresent = true; // stat failing for another reason while a create failed: delete-pending or locked down; treat as held
    }
    yield "read";
    const raw = readLock(c.fs, lockPath), holder = raw === null ? null : parseHolder(raw);
    const dead = raw !== null && holder !== null && holder.host === c.host && isOld(holder, c) && c.isAlive(holder.pid) === "dead";
    if (dead) {
      const r = yield* takeoverSteps(lockPath, raw, holder, c);
      if (r.res === "taken") return { token: c.token, takeover: { pid: holder.pid, ageMs: ageOf(holder.at, c.now()) } };
      if (r.res === "retry" && elapsed() < c.waitMs) continue;
      note = r.note ?? note;
    }
    const held = raw ?? "", at = looseAt(held), stamp = Number.isFinite(at) ? at : mtime; // age is only for the report / stale message
    const age = stamp === undefined ? 0 : c.now() - stamp;
    if (elapsed() >= c.waitMs) throw deadline(lockPath, c.waitMs, everPresent, lastErr, age, held, note);
    if (age > c.staleMs && !dead) throw new LockFailure("locked", `stale join-rules lock ${lockPath} (age ${Math.round(age / 1000)}s > ${c.staleMs / 1000}s, content ${held || "unreadable"}). NOT stealing it: holder is on another host, alive, or its liveness cannot be determined. Confirm the process named in the lock (pid) is no longer running, delete the file ${lockPath} by hand, then retry. Nothing was changed.`);
    yield nap(5 + Math.floor(Math.random() * 20));
  }
}

function deadline(lockPath: string, waitMs: number, everPresent: boolean, err: any, age: number | undefined, held: string, note: string): LockFailure {
  if (!everPresent && err?.code !== "EEXIST") return new LockFailure("lock-failed", `cannot create join-rules lock ${lockPath}: ${err?.code} (${err?.message}) for ${waitMs}ms with no lock file present. Not contention; check the directory permissions. Nothing was changed.`);
  return new LockFailure("locked", `join-rules lock ${lockPath} still held by someone else after ${waitMs}ms${age === undefined ? "" : ` (age ${Math.round(age / 1000)}s, content ${held || "unreadable"})`};${note} retry later. Nothing was changed.`);
}

/** Removes the lock only if it still carries OUR token (read, then unlink). A lock that is not ours is never touched, never moved. */
export function* releaseSteps(lockPath: string, token: string, fs: LockFs): Generator<string, void> {
  for (let attempt = 0; ; attempt++) {
    try {
      yield "release-read";
      const raw = fs.read(lockPath);
      if (raw === null || parseHolder(raw)?.token !== token) return;
      yield "release-unlink";
      fs.unlink(lockPath); return;
    } catch (err: any) {
      if (err?.code === "ENOENT") return;
      if (!["EPERM", "EACCES", "EBUSY"].includes(err?.code) || attempt >= 50) throw err; // Windows: a reader may hold it open for a moment
      yield `nap:${2 + Math.floor(Math.random() * 8)}`;
    }
  }
}
