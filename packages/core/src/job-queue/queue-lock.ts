/**
 * packages/core/src/job-queue/queue-lock.ts — closes ISS-JOBQUEUE-002. Advisory lock file `job-queue.lock` held across the whole
 * load -> transition -> save of one queue operation, so two writers on the SAME MACHINE (processes or worker threads) are serialised.
 * Acquire = exclusive create (`wx`) of a file holding {token, at}; release = unlink only if it still holds our token. A lock older than
 * `staleMs` (a crashed holder) is taken over by an atomic rename to a unique name. Residual, NOT closed: (a) a holder paused longer than
 * `staleMs` can have its lock taken over; the pre-rename `stillHeld()` check plus the content re-read shrink that to a few instructions;
 * (b) a lock whose content is unparseable (torn create) is aged by file mtime, and left alone (typed "conflict") only if the fs gives no mtime;
 * (c) network filesystems / no exclusive-create guarantee. Same-process callers wait on it too, so never nest queue calls.
 * ISS-JOBQLOST-004: on Windows a create/read racing a delete of the lock fails with EPERM/EBUSY/EACCES, not EEXIST. On the LOCK path only that is
 * contention (retry within `waitMs`, then "conflict"); if no lock file exists, 5 such errors in a row mean the directory is unwritable -> "io-error".
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { QueueError, QueueResult } from "./queue-types.js";
import type { QueueFs } from "./queue-store.js";

export const QUEUE_LOCK_FILE = "job-queue.lock";
export interface QueueLockOptions { waitMs: number; staleMs: number; wallNow: () => number }
export const QUEUE_LOCK_WAIT_MS = 2000;
export const QUEUE_LOCK_STALE_MS = 30_000;

/** Errors Windows gives an exclusive create that races a delete of the same path. Applies to the lock CREATE only. */
const TRANSIENT_CREATE = new Set(["EPERM", "EBUSY", "EACCES"]);
const ABSENT_RETRIES = 5;
const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const err = (code: QueueError["code"], message: string): { ok: false; error: QueueError } => ({ ok: false, error: { code, message } });
const parseAt = (raw: string): number | null => { try { const a = JSON.parse(raw)?.at; return Number.isFinite(a) ? a : null; } catch { return null; } };

/** Run `body` while holding the queue lock. `stillHeld()` re-checks ownership (call it right before the rename). */
export function withQueueLock<T>(fs: QueueFs, dir: string, o: QueueLockOptions, body: (stillHeld: () => boolean) => QueueResult<T>): QueueResult<T> {
  const path = join(dir, QUEUE_LOCK_FILE);
  const mine = JSON.stringify({ token: randomUUID(), at: o.wallNow() });
  try { fs.mkdirp(dir); } catch (e) { return err("io-error", e instanceof Error ? e.message : String(e)); }
  const started = o.wallNow();
  let absentStreak = 0; // consecutive transient create errors with NO lock file present (unwritable dir looks like this)
  const backoffOrConflict = (): QueueResult<never> | null => {
    if (o.wallNow() - started >= o.waitMs) return err("conflict", "queue is locked by another writer");
    sleep(5 + Math.floor(Math.random() * 15)); return null;
  };
  for (let held = false; !held;) {
    let seen: string | null;
    try { fs.create(path, mine); held = true; continue; }
    catch (e: any) {
      if (e?.code === "EEXIST") {
        // A lock that exists but is delete-pending cannot be opened for reading either (EPERM/EBUSY/EACCES): same contention.
        try { seen = fs.read(path); } catch (e2: any) {
          if (!TRANSIENT_CREATE.has(e2?.code)) return err("io-error", e2 instanceof Error ? e2.message : String(e2));
          const c = backoffOrConflict(); if (c) return c; continue;
        }
      } else if (TRANSIENT_CREATE.has(e?.code)) {
        // Windows reports a create racing a delete (or a delete-pending lock) as EPERM/EBUSY/EACCES, not EEXIST. Tell it apart from a
        // real permission problem by looking at the lock path: present (or itself unreadable for the same transient reason) = contention.
        try { seen = fs.read(path); } catch (e2: any) {
          if (!TRANSIENT_CREATE.has(e2?.code)) return err("io-error", e2 instanceof Error ? e2.message : String(e2));
          absentStreak = 0; const c = backoffOrConflict(); if (c) return c; continue;
        }
        if (seen === null) { // nothing there: a delete finishing, or a directory we cannot write. Bounded, then the real error.
          if (++absentStreak > ABSENT_RETRIES) return err("io-error", e instanceof Error ? e.message : String(e));
          const c = backoffOrConflict(); if (c) return c; continue;
        }
        absentStreak = 0;
      } else return err("io-error", e instanceof Error ? e.message : String(e));
    }
    if (seen === null) continue; // released between our create and our read: try again at once
    let at = parseAt(seen);
    if (at === null) { // torn/garbled lock (crash mid-create): age it by file mtime; without an mtime it is left for the operator
      try { at = fs.mtimeMs?.(path) ?? null; } catch { at = null; }
      if (at === null) return err("conflict", "queue lock file is unreadable; not taken over");
    }
    if (o.wallNow() - at >= o.staleMs) { breakStale(fs, path, seen); continue; }
    const c = backoffOrConflict(); if (c) return c;
  }
  const stillHeld = () => fs.read(path) === mine; // an fs error propagates: saveQueue reports it as io-error
  try { return body(stillHeld); }
  finally { try { if (fs.read(path) === mine) fs.unlink(path); } catch { /* a leftover lock goes stale and is taken over */ } }
}

/** Atomically move a stale lock aside. If what we moved is not what we judged stale (someone re-locked in between), put it back. */
function breakStale(fs: QueueFs, path: string, judged: string): void {
  const aside = `${path}.stale.${randomUUID()}`;
  try { fs.rename(path, aside); } catch { return; } // lost the race: the lock is gone or already replaced
  try {
    const moved = fs.read(aside);
    if (moved !== judged && moved !== null) { try { fs.create(path, moved); } catch { /* the lock was re-taken meanwhile; best effort */ } }
  } catch { /* leave the aside file; harmless debris */ }
  try { fs.unlink(aside); } catch { /* debris */ }
}
