// scripts/watch/watch-store.mjs — run-watch-loc-split: watch_state / heartbeat / report Mongo writers moved
// VERBATIM from run-watch.mjs (only `export` added).
import { buildHeartbeatDoc } from "./lib/heartbeat.mjs";
import { TENANT, DRY_RUN, watchDbTarget } from "./watch-config.mjs";

export async function loadSeenDriveIds() {
  const { connect } = await import("../../packages/db/src/client.js");
  const { listSeenIds } = await import("../../packages/db/src/collections/watch-state.js");
  { const t = watchDbTarget(); await connect(t.url, t.dbName); }
  return listSeenIds(TENANT, "drive");
}

/** R1 (spec.md, D-046): the prior `watch_state` row for one Drive source, read BEFORE this run
 * overwrites it — `shouldAlertPollFailed` needs `priorStatus` from the state as it stood before
 * the current failure, never the just-written one. Returns `null` on a first-ever poll (no row
 * yet) or if the read itself fails — a failed READ must never crash the ingest loop it guards; it
 * degrades to "alert" (the safer default: an extra alert beats a silently swallowed one). */
export async function readDriveWatchState(sourceId) {
  try {
    const { findWatchState } = await import("../../packages/db/src/collections/watch-state.js");
    return await findWatchState(TENANT, "drive", sourceId);
  } catch {
    return null;
  }
}

/** R2 WRITE half (D-048). Upserts this run's heartbeat for one source type through the tenant-scoped
 * accessor (`markHeartbeat`, packages/db/src/collections/watch-heartbeat.ts) — never a raw
 * `db.collection()` handle, so R8's tenancy guarantee holds here exactly as it does for watch_state.
 *
 * Called at the END of each phase, whether that phase succeeded or caught and logged into
 * `errors[]`: either way the PROCESS is alive and got back to this point, which is the only thing a
 * liveness heartbeat claims. Only a crash/hang/kill BEFORE reaching here skips the write — precisely
 * what the detector must see.
 *
 * `--dry-run` writes nothing (it writes no watch_state row either), and a FAILED heartbeat write is
 * logged, never thrown: a liveness write must not be the thing that takes down the run it measures.
 * `connect` is idempotent (client.ts returns the existing Db), so calling it here is safe whether or
 * not a phase already connected — needed because step 1 can fail before `loadSeenDriveIds` connects. */
export async function markHeartbeatFor(sourceType, completedAt) {
  if (DRY_RUN) return;
  try {
    const { connect } = await import("../../packages/db/src/client.js");
    { const t = watchDbTarget(); await connect(t.url, t.dbName); }
    const { markHeartbeat } = await import("../../packages/db/src/collections/watch-heartbeat.js");
    await markHeartbeat(TENANT, buildHeartbeatDoc(TENANT, sourceType, completedAt));
  } catch (err) {
    console.error(`heartbeat write failed for ${sourceType}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function markDriveState(sourceId, status, extra) {
  const { markWatchState } = await import("../../packages/db/src/collections/watch-state.js");
  await markWatchState(TENANT, {
    sourceType: "drive",
    sourceId,
    status,
    seenAt: new Date().toISOString(),
    ...(status === "ingested" ? { ingestedAt: new Date().toISOString() } : {}),
    ...(status === "failed" ? { failedAt: new Date().toISOString() } : {}),
    ...extra,
  });
}

export async function recordReport(findings, digestPath, errors) {
  const { recordWatchReport } = await import("../../packages/db/src/collections/watch-reports.js");
  await recordWatchReport(TENANT, {
    _id: `${TENANT}-${findings.runAt}`,
    runAt: findings.runAt,
    mode: findings.mode === "ingest" ? "ingest" : "watch",
    digestPath,
    driveNewFound: findings.driveNew.length,
    driveIngested: findings.driveIngested.length,
    driveFailed: findings.driveFailed.length,
    gmailPastRecordingPending: findings.pastRecordingPending.length,
    upcomingCount: findings.upcoming.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
