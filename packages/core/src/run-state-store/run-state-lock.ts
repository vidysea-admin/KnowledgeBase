/**
 * packages/core/src/run-state-store/run-state-lock.ts — unit `t050-run-state-stale-lock-recovery` (ISS-RUNSTORE-001/002).
 * The per-run lock file `<id>.run-state.lock`, with owner evidence and a crash-safe takeover. Re-implementation (core must not
 * import meeting-bot) of the claim-then-rename protocol of meeting-bot's join-rules lock (t037, checker PASS cycle 1).
 *
 * The lock body is `{token,pid,host,at}`: `token` identifies one hold (release and the pre-rename check only act on OUR token),
 * `pid`/`host` are the evidence for the takeover rule, `at` is the acquisition time (ISO).
 *
 * TAKEOVER RULE. A lock is taken over only when the judge says so:
 *   - owner on THIS host and the OS says its pid does not exist (ESRCH)            -> dead: taken over at once, any age;
 *   - owner on this host, pid exists, and it is OUR OWN pid (a leftover of this process) older than `staleMs` -> taken over;
 *   - owner on this host, pid exists (another process), age <= `liveCeilingMs`        -> NEVER taken over (live owner);
 *   - same, age > `liveCeilingMs` (default 1 h; a critical section lasts milliseconds, so this is pid reuse)   -> taken over;
 *   - owner unverifiable (other host, probe says "unknown", empty / unparsable / oversize body) -> taken over only when older
 *     than `staleMs` (default 30 s). Age comes from the recorded `at`, else the file mtime; a future `at` is ignored, never "old".
 * PID REUSE: host+pid alone cannot tell the dead owner from an unrelated process that now has its pid; such a lock reads "alive"
 * and is kept until `liveCeilingMs`, then taken over. Residual: a lock whose owner died and whose pid was reused stays `locked`
 * for up to liveCeilingMs. A live but stalled owner older than the ceiling IS displaced, which is why every save re-checks its
 * token immediately before the data rename (a displaced writer then refuses with `locked`; the check-to-rename gap is one syscall).
 * Valid on this host only (one PID namespace per root); a root shared across hosts or containers falls under "unverifiable".
 *
 * ATOMIC TAKEOVER (two contenders, one winner): the contender creates `<lock>.claim.<key>` with `wx` (key = the dead token, or a
 * hash of the unparsable bytes + mtime); only one creator succeeds. Its body is a complete new lock body. It re-reads the lock
 * (bytes must be unchanged and still judged takeable), then `rename(claim, lock)` atomically replaces the dead lock: the lock
 * is never absent and a live lock is never moved. After the rename it verifies the lock carries its token. A claim abandoned by a
 * dead claimant is judged by the same rules and removed; ownership after any rename is decided by token, never by who thinks it won.
 */
import { createHash } from "node:crypto";
import { hostname as osHostname } from "node:os";
import path from "node:path";
import type { RunStateFsOps } from "./run-state-fs.js";

export type RunStateLiveness = "alive" | "dead" | "unknown";
export interface RunStateLockOptions {
  /** Age after which a lock whose owner cannot be verified (or is our own leftover) is taken over. Default 30 s. */
  staleMs?: number;
  /** Age above which even a live-looking owner is treated as a reused pid and displaced. Default 1 h. */
  liveCeilingMs?: number;
  /** Test seams; production leaves these unset. */
  host?: string; pid?: number; isAlive?: (pid: number) => RunStateLiveness;
}
export const RUN_STATE_LOCK_STALE_MS = 30_000;
export const RUN_STATE_LOCK_LIVE_CEILING_MS = 3_600_000;

/** `process.kill(pid, 0)` sends nothing. Only ESRCH is death; EPERM means the process exists; anything else is "unknown". */
export function defaultRunStateIsAlive(pid: number): RunStateLiveness {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown"; // pid 0 / negatives would signal a process group
  try { process.kill(pid, 0); return "alive"; }
  catch (e) { const c = (e as NodeJS.ErrnoException)?.code; return c === "ESRCH" ? "dead" : c === "EPERM" ? "alive" : "unknown"; }
}

export interface RunStateLockCtx {
  fs: RunStateFsOps; staleMs: number; liveCeilingMs: number; host: string; pid: number; isAlive: (pid: number) => RunStateLiveness;
}
export function runStateLockCtx(fs: RunStateFsOps, o: RunStateLockOptions = {}): RunStateLockCtx {
  return {
    fs, staleMs: o.staleMs ?? RUN_STATE_LOCK_STALE_MS, liveCeilingMs: o.liveCeilingMs ?? RUN_STATE_LOCK_LIVE_CEILING_MS,
    host: o.host ?? osHostname(), pid: o.pid ?? process.pid, isAlive: o.isAlive ?? defaultRunStateIsAlive,
  };
}

const TRANSIENT = ["EPERM", "EACCES", "EBUSY"];
const MAX_FUTURE_SKEW_MS = 5000;
/** EPERM/EACCES/EBUSY with the path absent = a delete-pending file on Windows; retried this long before it counts as a permission problem. */
const CREATE_RETRY_MS = 1500;
const MAX_LOCK_BYTES = 4096;
const SAFE_TOKEN = /^[A-Za-z0-9-]{1,64}$/;
const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code ?? "";
const quiet = (fn: () => void) => { try { fn(); } catch { /* best effort */ } };

interface Holder { token: string; pid: number; host: string; at: number }
interface Seen { raw: string; mtime: number | null; holder: Holder | null }

function parseHolder(raw: string): Holder | null {
  let j: any;
  try { j = JSON.parse(raw); } catch { return null; }
  if (j === null || typeof j !== "object" || Array.isArray(j)) return null;
  if (typeof j.token !== "string" || !SAFE_TOKEN.test(j.token) || !Number.isSafeInteger(j.pid) || j.pid <= 0) return null;
  if (typeof j.host !== "string" || !j.host || j.host.length > 255) return null;
  return { token: j.token, pid: j.pid, host: j.host, at: typeof j.at === "string" ? Date.parse(j.at) : NaN };
}
const lockBody = (c: RunStateLockCtx, token: string) => JSON.stringify({ token, pid: c.pid, host: c.host, at: new Date(c.fs.now()).toISOString() });

/** Reads a lock-like file once. null = absent. A non-file (directory, junction) or a file that cannot be read right now (EPERM/EACCES/EBUSY:
 *  delete-pending or held open on Windows) is returned unparsable and unaged: never judged old, so the caller reports `locked` and the
 *  next save retries. */
function peek(c: RunStateLockCtx, p: string): Seen | null {
  const unreadable: Seen = { raw: "<not readable>", mtime: null, holder: null };
  try {
    const kind = c.fs.kind(p);
    if (kind === null) return null;
    if (kind === "other") return { raw: "<not a file>", mtime: null, holder: null };
    const raw = c.fs.readText(p);
    if (raw.length > MAX_LOCK_BYTES) return { raw: "<oversize>", mtime: c.fs.mtimeMs(p), holder: null };
    return { raw, mtime: c.fs.mtimeMs(p), holder: parseHolder(raw) };
  } catch (e) {
    if (code(e) === "ENOENT") return null;
    if (TRANSIENT.includes(code(e))) return unreadable;
    throw e;
  }
}
function tokenOf(c: RunStateLockCtx, p: string): string | null {
  try { return peek(c, p)?.holder?.token ?? null; } catch { return null; }
}
function ageOf(s: Seen, now: number): number | undefined {
  if (s.holder && Number.isFinite(s.holder.at) && s.holder.at <= now + MAX_FUTURE_SKEW_MS) return Math.max(0, now - s.holder.at);
  return s.mtime === null ? undefined : Math.max(0, now - s.mtime);
}

/** The takeover rule (see the header). True = the lock may be replaced. */
function judgeRunStateLock(c: RunStateLockCtx, s: Seen): boolean {
  const age = ageOf(s, c.fs.now()), h = s.holder;
  if (!h || h.host !== c.host) return age !== undefined && age > c.staleMs;
  let live: RunStateLiveness;
  try { live = c.isAlive(h.pid); } catch { live = "unknown"; }
  if (live === "dead") return true;
  if (age === undefined) return false;
  if (live === "unknown") return age > c.staleMs;
  return age > c.liveCeilingMs || (h.pid === c.pid && age > c.staleMs);
}

/** Exclusive create + write of `body`. "exists" for EEXIST and for EPERM/EACCES/EBUSY while the path is present (contention);
 *  those codes with the path absent are retried for CREATE_RETRY_MS, then thrown (a real permission problem). A half-written file is removed. */
function createFile(c: RunStateLockCtx, p: string, body: string): "created" | "exists" {
  const start = c.fs.now();
  for (;;) {
    let fd: number;
    try { fd = c.fs.createExclusive(p); }
    catch (e) {
      if (code(e) === "EEXIST") return "exists";
      if (!TRANSIENT.includes(code(e))) throw e;
      let there = true;
      try { there = c.fs.kind(p) !== null; } catch { /* mid-delete: treat as present */ }
      if (there) return "exists";
      if (c.fs.now() - start > CREATE_RETRY_MS) throw e;
      c.fs.sleep(2);
      continue;
    }
    try { c.fs.write(fd, body); c.fs.close(fd); }
    catch (e) { quiet(() => c.fs.close(fd)); quiet(() => c.fs.unlink(p)); throw e; }
    return "created";
  }
}

function claimKey(s: Seen): string {
  return s.holder ? s.holder.token : `u${createHash("sha1").update(s.raw).digest("hex").slice(0, 20)}-${Math.floor(s.mtime ?? 0)}`;
}

/** One takeover attempt of the lock whose bytes are `seen`. "retry" = state changed, judge again; "busy" = leave it `locked`. */
function takeover(c: RunStateLockCtx, lock: string, seen: Seen, token: string, body: string): "taken" | "retry" | "busy" {
  const claim = `${lock}.claim.${claimKey(seen)}`;
  if (createFile(c, claim, body) === "exists") {
    const other = peek(c, claim);
    if (other === null) return "retry";
    if (!judgeRunStateLock(c, other)) return "busy";
    quiet(() => c.fs.unlink(claim)); // abandoned claim of a dead taker
    return "retry";
  }
  const drop = () => quiet(() => { if (tokenOf(c, claim) === token) c.fs.unlink(claim); });
  const again = peek(c, lock);
  if (again === null || again.raw !== seen.raw || (!seen.holder && again.mtime !== seen.mtime) || !judgeRunStateLock(c, again)) { drop(); return "retry"; }
  for (let i = 0; i < 4; i++) {
    try { c.fs.rename(claim, lock); break; }
    catch (e) { if (!TRANSIENT.includes(code(e)) || i === 3) break; c.fs.sleep(5); }
  }
  if (tokenOf(c, lock) === token) return "taken";
  drop();
  return "busy";
}

const isoOf = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString() : "an unknown time");
const describe = (s: Seen) => (s.holder ? `held by pid ${s.holder.pid} on ${s.holder.host} since ${isoOf(s.holder.at)}` : `owner unreadable (${s.raw.slice(0, 40) || "empty"})`);

export type RunStateLockAcquire = { token: string; takeover: boolean } | { locked: string };

/** Takes the lock, replacing a dead one by the takeover rule. Returns `{locked}` when someone else may hold it. Throws on real I/O errors. */
export function acquireRunStateLock(c: RunStateLockCtx, lock: string): RunStateLockAcquire {
  const token = c.fs.uuid(), body = lockBody(c, token);
  let last = `${lock} is held by another writer`;
  for (let round = 0; round < 4; round++) {
    if (createFile(c, lock, body) === "created") return { token, takeover: false };
    const seen = peek(c, lock);
    if (seen === null) continue;
    last = `${lock} is ${describe(seen)} (remove it only if no writer is running)`;
    if (!judgeRunStateLock(c, seen)) return { locked: last };
    const r = takeover(c, lock, seen, token, body);
    if (r === "taken") return { token, takeover: true };
    if (r === "busy") return { locked: last };
  }
  return { locked: last };
}

/** True while the lock still carries OUR token. Checked immediately before the data rename. */
export const runStateLockOwned = (c: RunStateLockCtx, lock: string, token: string) => tokenOf(c, lock) === token;

/** Removes the lock only if it still carries our token. Returns null, or a message when the unlink failed (never throws). */
export function releaseRunStateLock(c: RunStateLockCtx, lock: string, token: string): string | null {
  let last = "";
  for (let i = 0; i < 20; i++) {
    try {
      const raw = c.fs.readText(lock);
      if (parseHolder(raw)?.token !== token) return null;
      c.fs.unlink(lock);
      return null;
    } catch (e) {
      if (code(e) === "ENOENT") return null;
      last = e instanceof Error ? e.message : String(e);
      if (!TRANSIENT.includes(code(e))) break;
      quiet(() => c.fs.sleep(5));
    }
  }
  return `lock ${lock} could not be removed after a successful save (${last}); a later save recovers it once its owner is gone`;
}

/** Removes `<id>.run-state.json.<uuid>.tmp` files. Only called while holding the lock right after a takeover, when any such file
 *  belongs to the dead owner (a live writer creates its temp file only after taking the lock). Returns the names removed. */
export function reapRunStateTemps(c: RunStateLockCtx, root: string, runId: string): string[] {
  const prefix = `${runId}.run-state.json.`, out: string[] = [];
  let names: string[] = [];
  try { names = c.fs.listDir(root); } catch { return out; }
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".tmp") || !/^[A-Za-z0-9-]+$/.test(name.slice(prefix.length, -4))) continue;
    try { c.fs.unlink(path.join(root, name)); out.push(name); } catch { /* best effort */ }
  }
  return out;
}
