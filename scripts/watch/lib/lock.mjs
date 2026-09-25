/**
 * scripts/watch/lib/lock.mjs — U2 source-watcher. A plain exclusive-create lock file so two
 * `--ingest` runs never overlap (task brief: "a lock file so two runs never overlap"). Not a
 * distributed lock (single-machine, single Windows Task Scheduler job per the plan's U6) — an
 * atomic `wx`-flag file create is enough here, same primitive `node:fs`'s own docs recommend for
 * this exact "single machine, single writer" case.
 *
 * A lock older than `staleMs` is treated as abandoned (a crashed prior run) and stolen rather
 * than blocking forever — mirrors D-020's own "never leave a run silently stuck" concern, just
 * applied to a lock instead of a mutation.
 */
import { openSync, closeSync, writeSync, rmSync, statSync, existsSync } from "node:fs";

const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000; // 6h — far longer than any real ingest chain takes

/** Attempts to acquire the lock at `lockPath`. Returns `{ acquired: true }` on success, or
 * `{ acquired: false, heldSince }` if another run genuinely holds it. Steals (deletes + retries
 * once) a lock older than `staleMs`. */
export function acquireLock(lockPath, { staleMs = DEFAULT_STALE_MS, now = () => new Date() } = {}) {
  try {
    const fd = openSync(lockPath, "wx");
    writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: now().toISOString() }));
    closeSync(fd);
    return { acquired: true };
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    const ageMs = now().getTime() - statSync(lockPath).mtimeMs;
    if (ageMs > staleMs) {
      rmSync(lockPath, { force: true });
      return acquireLock(lockPath, { staleMs, now });
    }
    let heldSince = null;
    try {
      heldSince = statSync(lockPath).mtime.toISOString();
    } catch {
      /* lock vanished between the stat above and here — treat as unknown */
    }
    return { acquired: false, heldSince };
  }
}

export function releaseLock(lockPath) {
  if (existsSync(lockPath)) rmSync(lockPath, { force: true });
}
