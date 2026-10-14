/**
 * packages/core/src/job-queue/queue-lock.ts — ISS-JOBQUEUE-002 / ISS-JOBQLOST-003. Advisory lock file `job-queue.lock` held across the whole
 * load -> transition -> save of one queue operation, so two writers on the SAME MACHINE (processes or worker threads) are serialised.
 * Acquire = exclusive create (`wx`) of {token,pid,host,thread,at}; release = unlink only if it still holds our token.
 * TAKEOVER RULE (mirrors run-state-store/run-state-lock.ts, which is not imported: the small judge, claim-then-rename and constants are
 * duplicated here on purpose; `at` is wall ms here, ISO there):
 *   - owner on THIS host whose pid does not exist (ESRCH)                      -> dead: taken over at once, any age;
 *   - owner on this host, pid alive (another process OR another thread of this process) -> NEVER taken over until `liveCeilingMs` (1 h),
 *     EXCEPT the two cases below (ISS-JOBQSTALL-002), both only for a lock at least `staleMs` old (a healthy holder keeps it for milliseconds):
 *       (i)  PID REUSE: the process now owning that pid STARTED AFTER the lock was written (start time from the OS, `startTime` seam), so it
 *            cannot be the holder, which died: taken over at once. Looked up lazily, once per call and pid, only for such an old lock
 *            (Windows: one PowerShell spawn, ~0.3 s measured); an unavailable start time = "unknown" = no displacement by this rule.
 *       (ii) DEAD WORKER THREAD: the holder recorded a worker-thread id (> 0) and has held the lock `threadLeaseMs` (60 s): lease expired, taken
 *            over. Threads share the pid, so nothing can tell a terminated worker from one blocked inside the critical section; the lease is the
 *            bound. The main thread (id 0) cannot die while its pid lives, so a main-thread holder keeps the full 1 h protection.
 *   - owner is a leftover of THIS thread (token not held right now, e.g. a failed unlink)  -> taken over once older than `staleMs`;
 *   - owner unverifiable (other host, no pid in the body = legacy lock, probe says "unknown", unparsable body) -> taken over once older than
 *     `staleMs` (30 s); an unparsable body is aged by file mtime and left alone ("conflict") if the fs gives no mtime.
 * A same-thread holder that is still inside its call (nested use from an fs hook) is therefore a live holder: its token is in `heldHere`.
 * ATOMIC TAKEOVER: the contender creates `<lock>.claim.<key>` (key = the judged token, or a hash of the unparsable bytes) with `wx`, so one
 * contender wins; its body is a complete new lock. It re-reads the lock (bytes unchanged and still takeable) and renames claim over lock, so the
 * lock is never absent and a live lock is never moved; then verifies the lock carries its token. Ownership is always decided by token.
 * RESIDUAL, NOT CLOSED (also in the manifest): (a) a holder displaced because its pid is unverifiable (other host / legacy body) and stalled
 * >staleMs, or because it was stalled >liveCeilingMs, can still rename after its last check (saveQueue's token + content check is the narrowed
 * defence: a few instructions, not zero); (b) between the takeover's last re-read and its rename, a lock that was legitimately released and
 * re-created by a third party can be overwritten (same gap as the run-state lock); (c) pid reuse is detected only when the OS start time is available and the lock is >= staleMs old; a LIVE worker thread blocked inside the critical section longer than `threadLeaseMs` is displaced like a dead one and can then clobber after its last check (same window as (a));
 * (d) network filesystems / no exclusive-create guarantee; (e) same-thread callers cannot wait on it, so never nest queue calls.
 * ISS-JOBQLOST-004: on Windows a create/read racing a delete of the lock fails with EPERM/EBUSY/EACCES, not EEXIST. On the LOCK path only that is
 * contention (retry within `waitMs`, then "conflict"); if no lock file exists, 5 such errors in a row mean the directory is unwritable -> "io-error".
 */
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname as osHostname } from "node:os";
import { join } from "node:path";
import { threadId } from "node:worker_threads";
import type { QueueError, QueueResult } from "./queue-types.js";
import type { QueueFs } from "./queue-store.js";

export const QUEUE_LOCK_FILE = "job-queue.lock";
export type QueueLiveness = "alive" | "dead" | "unknown";
export interface QueueLockOptions {
  waitMs: number; staleMs: number; wallNow: () => number;
  /** Age above which even a live-looking owner is treated as a reused pid and displaced. Default 1 h (as the run-state lock). */
  liveCeilingMs?: number;
  /** Test seams; production leaves these unset. */
  host?: string; pid?: number; thread?: number; isAlive?: (pid: number) => QueueLiveness;
  /** ISS-JOBQSTALL-002. Hold time after which a WORKER-THREAD holder (thread id > 0) is presumed dead. Default 60 s. */
  threadLeaseMs?: number;
  /** ISS-JOBQSTALL-002. OS start time (epoch ms) of a live pid, null if unknown. Default: the real lookup, or "unknown" when `isAlive` is injected. */
  startTime?: (pid: number) => number | null;
}
export const QUEUE_LOCK_WAIT_MS = 2000;
export const QUEUE_LOCK_STALE_MS = 30_000;
export const QUEUE_LOCK_LIVE_CEILING_MS = 3_600_000;
export const QUEUE_LOCK_THREAD_LEASE_MS = 60_000;
/** A holder started before it wrote the lock; allow for OS-clock vs Date.now() rounding before calling a pid "reused". */
export const QUEUE_LOCK_REUSE_SLACK_MS = 1000;

/** `process.kill(pid, 0)` sends nothing. Only ESRCH is death; EPERM means the process exists; anything else is "unknown". */
export function defaultQueueIsAlive(pid: number): QueueLiveness {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown"; // pid 0 / negatives would signal a process group
  try { process.kill(pid, 0); return "alive"; }
  catch (e) { const c = (e as NodeJS.ErrnoException)?.code; return c === "ESRCH" ? "dead" : c === "EPERM" ? "alive" : "unknown"; }
}

/** Process start time (epoch ms) of a live pid, or null when it cannot be had (no permission, no tool, timeout). Never throws. Own pid: free. */
export function defaultQueueStartTime(pid: number, probeTimeoutMs = 5000): number | null {
  try {
    if (!Number.isSafeInteger(pid) || pid <= 0) return null;
    if (pid === process.pid) return Date.now() - process.uptime() * 1000;
    if (process.platform === "linux") {
      const st = readFileSync(`/proc/${pid}/stat`, "utf8"), f = st.slice(st.lastIndexOf(")") + 2).split(" "); // field 22 = f[19]
      const ticks = Number(f[19]), bt = /^btime (\d+)/m.exec(readFileSync("/proc/stat", "utf8"));
      return Number.isFinite(ticks) && bt ? Number(bt[1]) * 1000 + (ticks / 100) * 1000 : null; // CLK_TCK is 100 on every Linux we run on
    }
    const run = (exe: string, args: string[]) => spawnSync(exe, args, { encoding: "utf8", timeout: probeTimeoutMs, windowsHide: true, env: { ...process.env, LC_ALL: "C" } });
    let out: string | undefined;
    if (process.platform === "win32") {
      const ps = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      out = run(ps, ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`]).stdout;
    } else if (process.platform === "darwin") out = run("/bin/ps", ["-o", "lstart=", "-p", String(pid)]).stdout;
    const t = out ? Date.parse(out.trim()) : NaN;
    return Number.isFinite(t) ? t : null;
  } catch { return null; }
}

/** Errors Windows gives an exclusive create that races a delete of the same path. Applies to the lock CREATE only. */
const TRANSIENT_CREATE = new Set(["EPERM", "EBUSY", "EACCES"]);
const ABSENT_RETRIES = 5;
const MAX_FUTURE_SKEW_MS = 5000;
const SAFE_TOKEN = /^[A-Za-z0-9-]{1,64}$/;
const heldHere = new Set<string>(); // tokens of calls on THIS thread that are inside withQueueLock right now (acquiring or holding)
const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const err = (code: QueueError["code"], message: string): { ok: false; error: QueueError } => ({ ok: false, error: { code, message } });
const quiet = (fn: () => void) => { try { fn(); } catch { /* best effort */ } };

interface Holder { token: string; pid: number | null; host: string | null; thread: number | null; at: number | null }
function parseHolder(raw: string): Holder | null {
  let j: any; try { j = JSON.parse(raw); } catch { return null; }
  if (j === null || typeof j !== "object" || Array.isArray(j) || typeof j.token !== "string" || !SAFE_TOKEN.test(j.token)) return null;
  return {
    token: j.token, at: Number.isFinite(j.at) ? j.at : null,
    pid: Number.isSafeInteger(j.pid) && j.pid > 0 ? j.pid : null, host: typeof j.host === "string" && j.host && j.host.length <= 255 ? j.host : null,
    thread: Number.isSafeInteger(j.thread) && j.thread >= 0 ? j.thread : null,
  };
}
interface Ctx {
  fs: QueueFs; o: QueueLockOptions; host: string; pid: number; thread: number; staleMs: number; ceilingMs: number; leaseMs: number;
  isAlive: (pid: number) => QueueLiveness; startTime: (pid: number) => number | null; starts: Map<number, number | null>;
}
interface Seen { raw: string; mtime: number | null; holder: Holder | null }

function peek(c: Ctx, p: string): Seen | null {
  const raw = c.fs.read(p); if (raw === null) return null;
  let mtime: number | null = null; try { mtime = c.fs.mtimeMs?.(p) ?? null; } catch { /* no mtime */ }
  return { raw, mtime, holder: parseHolder(raw) };
}
function ageOf(c: Ctx, s: Seen): number | undefined {
  const now = c.o.wallNow();
  if (s.holder && s.holder.at !== null && s.holder.at <= now + MAX_FUTURE_SKEW_MS) return Math.max(0, now - s.holder.at);
  return s.mtime === null ? undefined : Math.max(0, now - s.mtime); // a far-future `at` is never "old"
}
/** ISS-JOBQSTALL-002: true only when the live process owning `h.pid` is KNOWN to have started after the holder wrote the lock (cached per call). */
function pidReused(c: Ctx, h: Holder): boolean {
  if (h.pid === null || h.at === null) return false;
  if (!c.starts.has(h.pid)) { let t: number | null; try { t = c.startTime(h.pid); } catch { t = null; } c.starts.set(h.pid, typeof t === "number" && Number.isFinite(t) ? t : null); }
  const started = c.starts.get(h.pid);
  return typeof started === "number" && started > h.at + QUEUE_LOCK_REUSE_SLACK_MS;
}
/** The takeover rule (see the header). True = the lock may be replaced. */
function judge(c: Ctx, s: Seen): boolean {
  const age = ageOf(c, s), h = s.holder;
  if (!h || h.pid === null || h.host !== c.host) return age !== undefined && age >= c.staleMs;
  let live: QueueLiveness; try { live = c.isAlive(h.pid); } catch { live = "unknown"; }
  if (live === "dead") return true;
  if (age === undefined) return false;
  if (live === "unknown") return age >= c.staleMs;
  if (h.pid === c.pid && (h.thread ?? c.thread) === c.thread && !heldHere.has(h.token)) return age >= c.staleMs; // our own leftover
  const nested = h.pid === c.pid && (h.thread ?? c.thread) === c.thread && heldHere.has(h.token); // a holder inside its call on THIS thread is live by construction
  if (age >= c.staleMs && !nested) { // a healthy holder keeps the lock for milliseconds: only now is the (costly) identity evidence worth having
    if (h.thread !== null && h.thread > 0 && age >= c.leaseMs) return true; // worker-thread lease expired (dead thread, or blocked past the lease)
    if (pidReused(c, h)) return true;
  }
  return age > c.ceilingMs;
}
const claimKey = (s: Seen) => s.holder ? s.holder.token : `u${createHash("sha1").update(s.raw).digest("hex").slice(0, 20)}-${Math.floor(s.mtime ?? 0)}`;

/** One takeover attempt of the lock whose bytes are `seen`. "retry" = state changed, judge again; "busy" = leave it locked. */
function takeover(c: Ctx, lock: string, seen: Seen, token: string, body: string): "taken" | "retry" | "busy" {
  const claim = `${lock}.claim.${claimKey(seen)}`;
  try { c.fs.create(claim, body); }
  catch (e: any) {
    if (e?.code !== "EEXIST" && !TRANSIENT_CREATE.has(e?.code)) throw e;
    let other: Seen | null; try { other = peek(c, claim); } catch { return "busy"; }
    if (other === null) return "retry";
    if (!judge(c, other)) return "busy";
    quiet(() => c.fs.unlink(claim)); // abandoned claim of a dead taker
    return "retry";
  }
  const drop = () => quiet(() => { if (c.fs.read(claim) === body) c.fs.unlink(claim); });
  let again: Seen | null; try { again = peek(c, lock); } catch { drop(); return "busy"; }
  if (again === null || again.raw !== seen.raw || (!seen.holder && again.mtime !== seen.mtime) || !judge(c, again)) { drop(); return "retry"; }
  try { c.fs.rename(claim, lock); } catch { /* verified below by token */ }
  let now: string | null = null; try { now = c.fs.read(lock); } catch { /* unknown: not ours */ }
  if (now === body) return "taken";
  drop();
  return "busy";
}

/** Run `body` while holding the queue lock. `stillHeld()` re-checks ownership (call it right before the rename). */
export function withQueueLock<T>(fs: QueueFs, dir: string, o: QueueLockOptions, body: (stillHeld: () => boolean) => QueueResult<T>): QueueResult<T> {
  const path = join(dir, QUEUE_LOCK_FILE);
  const c: Ctx = {
    fs, o, host: o.host ?? osHostname(), pid: o.pid ?? process.pid, thread: o.thread ?? threadId,
    staleMs: o.staleMs, ceilingMs: o.liveCeilingMs ?? QUEUE_LOCK_LIVE_CEILING_MS, isAlive: o.isAlive ?? defaultQueueIsAlive,
    leaseMs: o.threadLeaseMs ?? QUEUE_LOCK_THREAD_LEASE_MS, starts: new Map(),
    startTime: o.startTime ?? (o.isAlive ? () => null : defaultQueueStartTime), // a test that fakes pids must not probe the real process table
  };
  const token = randomUUID();
  const mine = JSON.stringify({ token, pid: c.pid, host: c.host, thread: c.thread, at: o.wallNow() });
  heldHere.add(token);
  try {
    try { fs.mkdirp(dir); } catch (e) { return err("io-error", e instanceof Error ? e.message : String(e)); }
    const started = o.wallNow();
    let absentStreak = 0; // consecutive transient create errors with NO lock file present (unwritable dir looks like this)
    const backoffOrConflict = (): QueueResult<never> | null => {
      if (o.wallNow() - started >= o.waitMs) return err("conflict", "queue is locked by another writer");
      sleep(5 + Math.floor(Math.random() * 15)); return null;
    };
    for (let held = false; !held;) {
      let seen: Seen | null;
      try { fs.create(path, mine); held = true; continue; }
      catch (e: any) {
        if (e?.code === "EEXIST") {
          // A lock that exists but is delete-pending cannot be opened for reading either (EPERM/EBUSY/EACCES): same contention.
          try { seen = peek(c, path); } catch (e2: any) {
            if (!TRANSIENT_CREATE.has(e2?.code)) return err("io-error", e2 instanceof Error ? e2.message : String(e2));
            const b = backoffOrConflict(); if (b) return b; continue;
          }
        } else if (TRANSIENT_CREATE.has(e?.code)) {
          // Windows reports a create racing a delete (or a delete-pending lock) as EPERM/EBUSY/EACCES, not EEXIST. Tell it apart from a
          // real permission problem by looking at the lock path: present (or itself unreadable for the same transient reason) = contention.
          try { seen = peek(c, path); } catch (e2: any) {
            if (!TRANSIENT_CREATE.has(e2?.code)) return err("io-error", e2 instanceof Error ? e2.message : String(e2));
            absentStreak = 0; const b = backoffOrConflict(); if (b) return b; continue;
          }
          if (seen === null) { // nothing there: a delete finishing, or a directory we cannot write. Bounded, then the real error.
            if (++absentStreak > ABSENT_RETRIES) return err("io-error", e instanceof Error ? e.message : String(e));
            const b = backoffOrConflict(); if (b) return b; continue;
          }
          absentStreak = 0;
        } else return err("io-error", e instanceof Error ? e.message : String(e));
      }
      if (seen === null) continue; // released between our create and our read: try again at once
      if (!seen.holder && ageOf(c, seen) === undefined) return err("conflict", "queue lock file is unreadable; not taken over");
      if (judge(c, seen)) {
        let r: "taken" | "retry" | "busy";
        try { r = takeover(c, path, seen, token, mine); } catch (e2: any) { return err("io-error", e2 instanceof Error ? e2.message : String(e2)); }
        if (r === "taken") break;
        if (r === "retry") continue;
      }
      const b = backoffOrConflict(); if (b) return b;
    }
    const stillHeld = () => fs.read(path) === mine; // an fs error propagates: saveQueue reports it as io-error
    try { return body(stillHeld); }
    finally { try { if (fs.read(path) === mine) fs.unlink(path); } catch { /* a leftover lock goes stale and is taken over */ } }
  } finally { heldHere.delete(token); }
}
