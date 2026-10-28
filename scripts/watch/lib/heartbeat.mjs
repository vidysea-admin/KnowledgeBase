/**
 * scripts/watch/lib/heartbeat.mjs — U4b/R2 watcher-liveness pure helpers. NO I/O.
 *
 * R2 (docs/features/u4-watch-dashboard/spec.md): "if no watch run has completed within a configured
 * interval, alert." These five functions are the brain of that requirement; the two halves that
 * actually touch the world live elsewhere, in two DIFFERENT processes on purpose:
 *   - WRITER:   scripts/watch/run-watch.mjs calls `buildHeartbeatDoc`/`markHeartbeat` at the end of
 *               each polling phase it completed.
 *   - DETECTOR: apps/api/src/routes/health.ts calls `findStaleHeartbeats` on every /health hit.
 * A detector that ran inside the writer would die with it, which is the exact failure R2 exists to
 * catch (D-048).
 *
 * Moved here verbatim from run-watch.mjs (D-048 items 5 and 6): a new-file cap meant to stop scope
 * creep was blocking their test (ISS-360), which inverted its purpose. `lib/*.mjs` + `lib/*.test.mjs`
 * is the pattern this directory already uses (digest, lock, ingest-chain, session-skeleton).
 */

/** R2: the interval a source's heartbeat must not go stale past, in ms. Configured via
 * WATCH_HEARTBEAT_INTERVAL_MS (same env-var-with-fallback idiom schedule-tick.ts uses for
 * LKB_API_URL) — never hardcoded. The 1-hour fallback is D-048's settled answer, replacing U4b's
 * `[ASSUMPTION]` 2-hour placeholder; it is no longer an assumption. A non-numeric, zero or negative
 * override falls back rather than disabling the check: `intervalMs = 0` would make every heartbeat
 * stale and `-1` is meaningless, so neither is allowed to become the live threshold. */
export function watchHeartbeatIntervalMs(env = process.env) {
  const parsed = env.WATCH_HEARTBEAT_INTERVAL_MS ? Number(env.WATCH_HEARTBEAT_INTERVAL_MS) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 1000;
}

/** R2: true when a source's watch is silently dead. `lastHeartbeatAt` is `null`/`undefined`/
 * unparsable for a source that has NEVER completed a run — treated as maximally stale with no
 * grace period (a source that has never proven it is alive gets no benefit of the doubt, the same
 * safer-default `readDriveWatchState`'s failed-read path in run-watch.mjs already uses). Otherwise
 * stale iff the heartbeat is STRICTLY older than `intervalMs` — a heartbeat exactly `intervalMs` old
 * is still fresh, matching spec.md R2's "no run for LONGER than the configured interval" (not >=). */
export function isHeartbeatStale(lastHeartbeatAt, now, intervalMs) {
  if (!lastHeartbeatAt) return true;
  const last = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > intervalMs;
}

/** R2: evaluates every (tenantId, sourceType) heartbeat row against `isHeartbeatStale` in one
 * pass, returning only the stale ones — so "multiple sources, only one stale" alerts on exactly
 * that one, not all of them. `rows` is whatever read `watch_heartbeat` (today
 * `listHeartbeats(tenantId)` in packages/db/src/collections/watch-heartbeat.ts); pure otherwise. */
export function findStaleHeartbeats(rows, now, intervalMs) {
  return rows.filter((r) => isHeartbeatStale(r.lastHeartbeatAt, now, intervalMs));
}

/** R2: the composite id one heartbeat row uses — `(tenantId, sourceType)`, ONE row per source
 * TYPE run-watch.mjs polls (drive/gmail/calendar), not per individual item like watch_state's
 * `(tenantId, sourceType, sourceId)` (an item id has no meaning for "did this whole phase run").
 * Mirrored — deliberately, one line — by `watchHeartbeatId` in
 * packages/db/src/collections/watch-heartbeat.ts: packages/db may not import from scripts/ (and
 * vice versa is a package-boundary violation), exactly as `watchStateId` is defined on the db side
 * while run-watch.mjs reaches it only through `markWatchState`. */
export function watchHeartbeatId(tenantId, sourceType) {
  return `${tenantId}:${sourceType}`;
}

/** R2: the exact heartbeat document a completed phase upserts into `watch_heartbeat`. "Completed"
 * means the phase's own try/catch in run-watch.mjs's `main()` ran to its end — whether it succeeded
 * or caught and logged an error into `errors[]` — because either way the PROCESS is still alive and
 * made it back to that point. Only a crash/hang BEFORE reaching there (uncaught exception, infinite
 * loop, killed process, a Task Scheduler entry that never fired) skips the write, which is exactly
 * what R2 must detect. */
export function buildHeartbeatDoc(tenantId, sourceType, completedAt) {
  return { _id: watchHeartbeatId(tenantId, sourceType), tenantId, sourceType, lastHeartbeatAt: completedAt };
}
