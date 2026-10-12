/**
 * packages/core/src/job-queue/file-job-queue.ts — T-050 slice 4a. File-backed JobQueue. UNWIRED: nothing imports it.
 * Every operation is lock -> load -> pure transition -> atomic save -> unlock (queue-lock.ts; serialises writers on one machine, ISS-JOBQUEUE-002).
 * The clock is injected; there is no timer, so a lease only expires when the injected `now` passes `leaseExpiresAt`.
 * FIFO key = `seq` (enqueue order, kept across retries). A leased job whose lease expired is claimable again (consuming an attempt) or,
 * when its attempts are exhausted, becomes dead at the next claim. Tenant id is stored verbatim and never altered.
 */
import {
  DEFAULT_LEASE_MS, DEFAULT_MAX_ATTEMPTS, validateQueueId, type EnqueueInput, type JobQueue, type LeaseRef, type QueueError, type QueueJob, type QueueResult,
} from "./queue-types.js";
import { canonicalQueuePayload } from "./queue-payload.js";
import { QUEUE_LOCK_STALE_MS, QUEUE_LOCK_WAIT_MS, withQueueLock, type QueueLiveness } from "./queue-lock.js";
import { loadQueue, realQueueFs, saveQueue, type QueueFileState, type QueueFs } from "./queue-store.js";

export interface FileJobQueueOptions { dir: string; now: () => number; leaseMs?: number; fs?: QueueFs;
  /** Lock wait budget / stale-takeover age (wall ms) and the wall clock used for them; defaults 2,000 / 30,000 / Date.now. */
  lockWaitMs?: number; lockStaleMs?: number; wallNow?: () => number;
  /** Lock takeover judge (ISS-JOBQLOST-003): ceiling above which a live-looking holder is displaced (default 1 h) and test seams for the owner identity / pid probe. */
  lockLiveCeilingMs?: number; lockOwner?: { host?: string; pid?: number; thread?: number }; lockIsAlive?: (pid: number) => QueueLiveness;
  /** ISS-JOBQSTALL-002: worker-thread lease (default 60 s) and the OS start-time source used to detect a reused pid (default: the real lookup). */
  lockThreadLeaseMs?: number; lockStartTime?: (pid: number) => number | null;
  /** ISS-JOBQLOST-001 / ISS-JOBQPRUNE-001: retention for TERMINAL jobs (done/dead), in queue-clock ms. DEFAULT 30 days (DEFAULT_PRUNE_TERMINAL_AFTER_MS; Approver ruling 2026-10-12 (2)):
   *  unset = pruning ON at 30 days. A positive safe integer overrides the value. `null` DISABLES pruning (nothing is stamped or removed; the pre-default behaviour). 0, negatives and non-integers throw RangeError.
   *  Inside the same locked load->save an operation drops the terminal jobs of ITS OWN tenant that have been terminal for >= this long. Pruning forgets the id: re-enqueueing a pruned id
   *  enqueues a NEW job (idempotency only lasts for the retention window). nextSeq never rewinds. */
  pruneTerminalAfterMs?: number | null }
/** Default retention for terminal jobs: 30 days (Approver ruling 2026-10-12 (2)). */
export const DEFAULT_PRUNE_TERMINAL_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const err = (code: QueueError["code"], message: string): { ok: false; error: QueueError } => ({ ok: false, error: { code, message } });
const refError = (r: LeaseRef) => validateQueueId(r?.id, "job id") ?? validateQueueId(r?.workerId, "worker id") ?? (r?.tenantId === undefined ? null : validateQueueId(r.tenantId, "tenant id"));
const expired = (j: QueueJob, now: number) => j.status === "leased" && j.leaseExpiresAt !== null && now >= j.leaseExpiresAt;

export class FileJobQueue implements JobQueue {
  private readonly fs: QueueFs; private readonly leaseMs: number; private readonly keepTerminalMs: number | null;
  constructor(private readonly o: FileJobQueueOptions) {
    this.fs = o.fs ?? realQueueFs; this.leaseMs = o.leaseMs ?? DEFAULT_LEASE_MS;
    if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs <= 0) throw new RangeError("leaseMs must be a positive integer");
    const p = o.pruneTerminalAfterMs;
    if (p !== undefined && p !== null && (!Number.isSafeInteger(p) || p <= 0)) throw new RangeError("pruneTerminalAfterMs must be a positive integer or null (disabled)");
    this.keepTerminalMs = p === undefined ? DEFAULT_PRUNE_TERMINAL_AFTER_MS : p;
  }
  private time(): QueueResult<number> {
    let n: unknown; try { n = this.o.now(); } catch { return err("invalid-input", "clock threw"); }
    return Number.isSafeInteger(n) && (n as number) >= 0 ? { ok: true, value: n as number } : err("invalid-input", "clock returned a bad time");
  }
  /** ISS-JOBQLOST-001 (no-op when pruning is disabled with pruneTerminalAfterMs: null). Stamps every terminal job not yet stamped (incl. ones written by an older build) with `now`, then removes the
   *  terminal jobs of `tenantId` (none when the operation names no tenant) whose stamp is >= the retention old. ready/leased jobs are never touched; a clock that went backwards prunes nothing. */
  private prune(s: QueueFileState, now: number, tenantId: string | undefined): void {
    const keep = this.keepTerminalMs; if (keep === null) return;
    for (const j of s.jobs) if ((j.status === "done" || j.status === "dead") && j.terminalAt === undefined) j.terminalAt = now;
    if (tenantId === undefined) return;
    s.jobs = s.jobs.filter(j => !((j.status === "done" || j.status === "dead") && j.tenantId === tenantId && j.terminalAt !== undefined && now - j.terminalAt >= keep));
  }
  /** load -> `change(state, now)` on a private copy -> save only if the copy changed (a failed/no-op change writes nothing). */
  private run<T>(change: (s: QueueFileState, now: number) => QueueResult<T>, tenantId?: string): QueueResult<T> {
    const t = this.time(); if (!t.ok) return t;
    const lk = { waitMs: this.o.lockWaitMs ?? QUEUE_LOCK_WAIT_MS, staleMs: this.o.lockStaleMs ?? QUEUE_LOCK_STALE_MS, wallNow: this.o.wallNow ?? Date.now,
      liveCeilingMs: this.o.lockLiveCeilingMs, host: this.o.lockOwner?.host, pid: this.o.lockOwner?.pid, thread: this.o.lockOwner?.thread, isAlive: this.o.lockIsAlive,
      threadLeaseMs: this.o.lockThreadLeaseMs, startTime: this.o.lockStartTime };
    return withQueueLock(this.fs, this.o.dir, lk, stillHeld => {
      const l = loadQueue(this.fs, this.o.dir); if (!l.ok) return l;
      const state: QueueFileState = structuredClone(l.value.state), before = JSON.stringify(state);
      const r = change(state, t.value);
      if (r.ok) this.prune(state, t.value, tenantId);
      if (JSON.stringify(state) === before) return r;
      const s = saveQueue(this.fs, this.o.dir, l.value, state, stillHeld);
      return s.ok ? r : s;
    });
  }
  enqueue(input: EnqueueInput): QueueResult<"enqueued" | "exists"> {
    const bad = validateQueueId(input?.id, "job id") ?? validateQueueId(input?.tenantId, "tenant id");
    if (bad) return { ok: false, error: bad };
    const max = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isSafeInteger(max) || max < 1 || max > 100) return err("invalid-input", "maxAttempts must be an integer 1..100");
    let payload: unknown; try { payload = JSON.parse(JSON.stringify(input.payload ?? null)); } catch { return err("invalid-input", "payload is not JSON-serialisable"); }
    return this.run((s, now) => {
      const prior = s.jobs.find(j => j.id === input.id);
      if (prior) {
        if (prior.tenantId !== input.tenantId) return err("id-conflict", "job id is not available"); // fixed text: nothing about the other job
        if (canonicalQueuePayload(prior.payload) !== canonicalQueuePayload(payload)) return err("payload-mismatch", "job id exists with a different payload");
        return { ok: true, value: "exists" as const };
      }
      s.jobs.push({ id: input.id, tenantId: input.tenantId, payload, status: "ready", seq: s.nextSeq++, enqueuedAt: now, attempt: 0, maxAttempts: max, workerId: null, leaseExpiresAt: null, errorCode: null });
      return { ok: true, value: "enqueued" as const };
    }, input.tenantId);
  }
  claim(workerId: string, opts: { tenantId?: string } = {}): QueueResult<QueueJob | null> {
    const bad = validateQueueId(workerId, "worker id") ?? (opts.tenantId === undefined ? null : validateQueueId(opts.tenantId, "tenant id"));
    if (bad) return { ok: false, error: bad };
    return this.run((s, now) => {
      for (const j of s.jobs) if (expired(j, now) && j.attempt >= j.maxAttempts) { // exhausted dead worker: terminal, never re-run
        j.status = "dead"; j.workerId = null; j.leaseExpiresAt = null; j.errorCode = "lease-expired";
      }
      const ready = s.jobs.filter(j => (j.status === "ready" || expired(j, now)) && (opts.tenantId === undefined || j.tenantId === opts.tenantId));
      ready.sort((a, b) => a.seq - b.seq);
      const j = ready[0];
      if (!j) return { ok: true, value: null };
      j.status = "leased"; j.workerId = workerId; j.attempt += 1; j.leaseExpiresAt = now + this.leaseMs; j.errorCode = null;
      return { ok: true, value: structuredClone(j) };
    }, opts.tenantId);
  }
  private owned(s: QueueFileState, ref: LeaseRef): QueueResult<QueueJob> {
    const j = s.jobs.find(x => x.id === ref.id);
    if (!j || (ref.tenantId !== undefined && j.tenantId !== ref.tenantId)) return err("not-found", "no such job"); // another tenant's job is indistinguishable from a missing one
    if (j.status === "done" || j.status === "dead") return err("terminal", `job is ${j.status}`);
    if (j.status !== "leased") return err("not-leased", "job is not leased");
    if (j.workerId !== ref.workerId || j.attempt !== ref.attempt) return err("stale-lease", "lease belongs to another worker or attempt");
    return { ok: true, value: j };
  }
  heartbeat(ref: LeaseRef): QueueResult<QueueJob> {
    const bad = refError(ref); if (bad) return { ok: false, error: bad };
    return this.run((s, now) => {
      const o = this.owned(s, ref); if (!o.ok) return o;
      o.value.leaseExpiresAt = now + this.leaseMs; return { ok: true, value: structuredClone(o.value) };
    }, ref.tenantId);
  }
  complete(ref: LeaseRef): QueueResult<QueueJob> {
    const bad = refError(ref); if (bad) return { ok: false, error: bad };
    return this.run(s => {
      const o = this.owned(s, ref); if (!o.ok) return o;
      Object.assign(o.value, { status: "done", workerId: null, leaseExpiresAt: null, errorCode: null }); return { ok: true, value: structuredClone(o.value) };
    }, ref.tenantId);
  }
  fail(ref: LeaseRef, errorCode: string): QueueResult<QueueJob> {
    const bad = refError(ref) ?? validateQueueId(errorCode, "error code"); if (bad) return { ok: false, error: bad };
    return this.run(s => {
      const o = this.owned(s, ref); if (!o.ok) return o;
      const j = o.value;
      Object.assign(j, { status: j.attempt >= j.maxAttempts ? "dead" : "ready", workerId: null, leaseExpiresAt: null, errorCode });
      return { ok: true, value: structuredClone(j) };
    }, ref.tenantId);
  }
}
