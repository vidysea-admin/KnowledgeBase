/**
 * packages/core/src/job-queue/queue-store.ts — T-050 slice 4a. File store for the queue: one JSON file, strict decode, atomic write.
 * Write = temp file in the SAME directory + fsync + rename (pattern of meeting-bot join-rules-store `writeAtomic`/`renameReplacing`,
 * re-implemented here: core must not import from meeting-bot). Immediately before the rename the file is re-read and must still
 * equal what this operation read ("conflict" otherwise): that narrows, but does not close, the window against another process.
 * A read never writes, renames or deletes. A file that fails strict decode is the typed error "corrupt" and is left untouched.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { QueueError, QueueJob, QueueResult } from "./queue-types.js";

/** Injected filesystem. `read` returns null for a missing file. `create` must fail if the path exists. */
export interface QueueFs {
  mkdirp(dir: string): void;
  read(path: string): string | null;
  create(path: string, data: string): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
}
export const QUEUE_FILE = "job-queue.json";
export interface QueueFileState { version: 1; nextSeq: number; jobs: QueueJob[] }

const wait = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
export const realQueueFs: QueueFs = {
  mkdirp: d => { mkdirSync(d, { recursive: true }); },
  read: p => { try { return readFileSync(p, "utf8"); } catch (e: any) { if (e?.code === "ENOENT") return null; throw e; } },
  create: (p, data) => { const fd = openSync(p, "wx", 0o600); try { writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); } },
  rename(from, to) { // Windows refuses a rename over a file a reader has open at that instant: transient, bounded retry
    for (let i = 0; ; i++) {
      try { renameSync(from, to); return; }
      catch (e: any) { if (!["EPERM", "EACCES", "EBUSY"].includes(e?.code) || i >= 40) throw e; wait(5 + (i % 5) * 5); }
    }
  },
  unlink: p => { unlinkSync(p); },
};

const isInt = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
function validJob(j: any): j is QueueJob {
  if (j === null || typeof j !== "object" || Array.isArray(j)) return false;
  if (typeof j.id !== "string" || typeof j.tenantId !== "string" || !("payload" in j)) return false;
  if (!["ready", "leased", "done", "dead"].includes(j.status)) return false;
  if (!isInt(j.seq) || !isInt(j.enqueuedAt) || !isInt(j.attempt) || !isInt(j.maxAttempts) || j.maxAttempts < 1 || j.attempt > j.maxAttempts) return false;
  if (!isStrOrNull(j.workerId) || !isStrOrNull(j.errorCode) || !(j.leaseExpiresAt === null || isInt(j.leaseExpiresAt))) return false;
  return j.status === "leased" ? j.workerId !== null && j.leaseExpiresAt !== null : j.workerId === null && j.leaseExpiresAt === null;
}
export function decodeQueue(raw: string): QueueResult<QueueFileState> {
  const corrupt = (m: string): QueueResult<QueueFileState> => ({ ok: false, error: { code: "corrupt", message: m } });
  let j: any; try { j = JSON.parse(raw); } catch { return corrupt("queue file is not valid JSON"); }
  if (j === null || typeof j !== "object" || j.version !== 1 || !isInt(j.nextSeq) || !Array.isArray(j.jobs)) return corrupt("queue file has the wrong shape");
  const ids = new Set<string>();
  for (const job of j.jobs) {
    if (!validJob(job) || ids.has(job.id) || job.seq >= j.nextSeq) return corrupt("queue file holds an invalid or duplicate job");
    ids.add(job.id);
  }
  return { ok: true, value: j as QueueFileState };
}

export interface QueueLoaded { raw: string | null; state: QueueFileState }
const fail = (code: QueueError["code"], e: unknown): { ok: false; error: QueueError } =>
  ({ ok: false, error: { code, message: e instanceof Error ? e.message : String(e) } });

export function loadQueue(fs: QueueFs, dir: string): QueueResult<QueueLoaded> {
  let raw: string | null;
  try { raw = fs.read(join(dir, QUEUE_FILE)); } catch (e) { return fail("io-error", e); }
  if (raw === null) return { ok: true, value: { raw, state: { version: 1, nextSeq: 0, jobs: [] } } };
  const d = decodeQueue(raw);
  return d.ok ? { ok: true, value: { raw, state: d.value } } : d;
}

/** Atomic replace; `loaded.raw` is the content this operation read. Never leaves a half-written queue file. */
export function saveQueue(fs: QueueFs, dir: string, loaded: QueueLoaded, next: QueueFileState): QueueResult<true> {
  const file = join(dir, QUEUE_FILE), tmp = join(dir, `${QUEUE_FILE}.${randomUUID()}.tmp`);
  let created = false;
  try {
    fs.mkdirp(dir);
    fs.create(tmp, JSON.stringify(next)); created = true;
    if (fs.read(file) !== loaded.raw) return fail("conflict", "queue file changed since it was read");
    fs.rename(tmp, file); created = false;
    return { ok: true, value: true };
  } catch (e) { return fail("io-error", e); }
  finally { if (created) { try { fs.unlink(tmp); } catch { /* an orphaned .tmp is harmless; the queue file is never touched here */ } } }
}
