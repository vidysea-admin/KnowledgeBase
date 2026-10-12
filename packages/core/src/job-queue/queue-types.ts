/**
 * packages/core/src/job-queue/queue-types.ts — T-050 slice 4a. UNWIRED job-queue seam: types and id validation.
 * Job shape follows the planner (domain/pipeline-workflow.ts): `attempt`/`maxAttempts` (StageDef.maxAttempts), a lease that is
 * alive while `now < leaseExpiresAt` (planner leaseAlive: `now - heartbeatAt < leaseMs`), a dead lease consumes an attempt and is
 * terminal when exhausted (planner lines 148-149), an error code per failure (StageState.errorCode).
 */
export type QueueJobStatus = "ready" | "leased" | "done" | "dead";

export interface QueueJob {
  id: string;
  tenantId: string;
  payload: unknown;
  status: QueueJobStatus;
  /** Monotonic enqueue order: the FIFO key (never changes, also across retries). */
  seq: number;
  enqueuedAt: number;
  /** Attempts STARTED (a claim starts one). */
  attempt: number;
  maxAttempts: number;
  workerId: string | null;
  leaseExpiresAt: number | null;
  errorCode: string | null;
  /** ISS-JOBQLOST-001: queue-clock time the job was first seen terminal (done/dead). Written ONLY when pruning is enabled (FileJobQueueOptions.pruneTerminalAfterMs); absent otherwise. */
  terminalAt?: number;
}

/** What a worker holds after a claim; every later call must present it (fences a stale handler of an older attempt). */
/** `tenantId` is optional for compatibility: when present it MUST own the job or the call is refused as "not-found" (BEFORE WIRING: production callers must pass it). */
export interface LeaseRef { id: string; workerId: string; attempt: number; tenantId?: string }

export type QueueErrorCode =
  | "invalid-input" | "corrupt" | "io-error" | "conflict" | "id-conflict" | "payload-mismatch" | "not-found" | "not-leased" | "stale-lease" | "terminal";
export interface QueueError { code: QueueErrorCode; message: string }
export type QueueResult<T> = { ok: true; value: T } | { ok: false; error: QueueError };

export interface EnqueueInput { id: string; tenantId: string; payload: unknown; maxAttempts?: number }

export interface JobQueue {
  /** Idempotent on `id`. Same id + same tenant + equal payload (canonical JSON): "exists". Same id, other tenant: error "id-conflict" (fixed message, same for every job state). Same tenant, different payload: error "payload-mismatch". Never overwrites. */
  enqueue(input: EnqueueInput): QueueResult<"enqueued" | "exists">;
  /** Oldest ready job (or leased job whose lease expired and attempts remain), restricted to `tenantId` when given. null = none. */
  claim(workerId: string, opts?: { tenantId?: string }): QueueResult<QueueJob | null>;
  heartbeat(ref: LeaseRef): QueueResult<QueueJob>;
  complete(ref: LeaseRef): QueueResult<QueueJob>;
  /** Back to ready while attempts remain, else terminal "dead". */
  fail(ref: LeaseRef, errorCode: string): QueueResult<QueueJob>;
}

export const MAX_QUEUE_ID_LENGTH = 64;
export const DEFAULT_LEASE_MS = 120_000; // planner placeholder (WorkflowDef.leaseMs)
export const DEFAULT_MAX_ATTEMPTS = 3;
const RESERVED = /^(con|prn|aux|nul|clock\$|com[0-9]|lpt[0-9])$/i;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Job, tenant and worker ids: ASCII, no separators, no drive letters, no "..", no reserved Windows device names, 1..64 chars. */
export function validateQueueId(value: unknown, what: string): QueueError | null {
  const bad = (m: string): QueueError => ({ code: "invalid-input", message: `${what}: ${m}` });
  if (typeof value !== "string") return bad("must be a string");
  if (value.length === 0) return bad("empty");
  if (value.length > MAX_QUEUE_ID_LENGTH) return bad("too long");
  if (!SAFE.test(value)) return bad("only [A-Za-z0-9._-], starting with a letter or digit");
  if (value.includes("..")) return bad("contains ..");
  if (/[. ]$/.test(value)) return bad("trailing dot");
  if (RESERVED.test(value.split(".")[0] ?? "")) return bad("reserved device name");
  return null;
}
