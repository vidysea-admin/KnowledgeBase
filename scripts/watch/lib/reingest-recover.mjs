// scripts/watch/lib/reingest-recover.mjs — iss-reingestsafe-001-004-typed-snapshot-replay.
// Startup recovery for `--reingest` after a killed run, the snapshot hooks the caller injects into
// replaceSessionRows, and the single-run lock wrapper. Every read/write goes through the injected
// `scoped(name)(tenant)` accessor (scopedCollection in production); no db handle, no hand-built filter.
import {
  acquireReingestLock, isCommitted, listSnapshots, markCommitted, readSnapshotFile, removeSnapshot, snapshotPaths, writeSnapshotFile,
} from "./reingest-snapshot.mjs";
import { pruneTreeOfSession, restoreOldRows } from "./reingest-swap.mjs";

const reasonOf = (err) => (err instanceof Error ? err.message : String(err));

/** The three hooks replaceSessionRows takes, bound to one tenant + Drive file. */
export function snapshotHooks({ dir, hook }) {
  return {
    writeSnapshot: async ({ rows, treeRoot, meta }) => writeSnapshotFile({ dir, ...meta, rows, treeRoot, hook }),
    commitSnapshot: async (file) => markCommitted(file),
    discardSnapshot: async (file) => removeSnapshot(file),
  };
}

/** Run `fn` while holding the per-tenant, per-file lock; a live holder is refused, a dead one is taken over (ISS-REINGESTSAFE-005). */
export async function withReingestLock({ dir, tenant, driveFileId, lockOpts }, fn) {
  const lock = acquireReingestLock(snapshotPaths(dir, tenant, driveFileId).lock, lockOpts);
  if (!lock.acquired) {
    throw new Error(`another reingest of ${driveFileId} (tenant ${tenant}) is already running${lock.holder ? ` (pid ${lock.holder.pid} since ${lock.holder.startedAt})` : ""}; not starting a second one`);
  }
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

/**
 * Recover ONE leftover snapshot.
 *  - marked committed (ingest had finished): never restore over the new data; retry the tree prune, then remove.
 *  - otherwise: remove rows of the sessions this run created (ids recorded in the manifest; never by sourceId), re-insert the snapshot rows, restore the
 *    tree_index node, verify counts + content hash against the snapshot, and only then remove the snapshot.
 * Any failure throws an error naming the snapshot path and leaves the snapshot untouched.
 */
export async function recoverSnapshot({ scoped, tenant, path, rootFilter, regenerate, log = () => {} }) {
  const { manifest, rows, treeRoot } = readSnapshotFile(path);
  if (manifest.tenant !== tenant) throw new Error(`snapshot ${path} belongs to tenant ${manifest.tenant}, not ${tenant}; refusing to touch it`);
  try {
    if (isCommitted(path)) {
      await pruneTreeOfSession({ scoped, tenant, sessionId: manifest.oldSessionId, rootFilter, regenerate });
      removeSnapshot(path);
      log(`recovery: ${manifest.driveFileId} was already ingested; tree prune finished, snapshot removed`);
      return { driveFileId: manifest.driveFileId, action: "finished-committed" };
    }
    const r = await restoreOldRows({
      scoped, tenant, driveFileId: manifest.driveFileId, oldSessionId: manifest.oldSessionId, snapshot: rows,
      preexistingSessionIds: manifest.preexistingSessionIds, plannedNewSessionIds: manifest.plannedNewSessionIds ?? [manifest.correctSessionId], treeRoot, rootFilter,
    });
    if (!r.ok) throw new Error(r.errors.join("; "));
    removeSnapshot(path);
    log(`recovery: restored ${manifest.driveFileId} (${JSON.stringify(manifest.counts)}) from snapshot, verified, snapshot removed`);
    return { driveFileId: manifest.driveFileId, action: "restored", counts: manifest.counts };
  } catch (err) {
    throw new Error(`RECOVERY FAILED for ${manifest.driveFileId}: ${reasonOf(err)}; the snapshot is KEPT at ${path} — fix the cause and start watch-reingest again, or replay it by hand with EJSON`, { cause: err });
  }
}

/** Recover every leftover snapshot of `tenant` (startup). A snapshot whose file lock is held by a live run is skipped. */
export async function recoverAll({ scoped, tenant, dir, rootFilter, regenerate, log = () => {}, lockOpts }) {
  const results = [];
  for (const entry of listSnapshots(dir, tenant)) {
    const lock = acquireReingestLock(snapshotPaths(dir, tenant, entry.driveFileId).lock, lockOpts);
    if (!lock.acquired) {
      log(`recovery: ${entry.driveFileId} is being reingested by pid ${lock.holder?.pid}; skipped`);
      results.push({ driveFileId: entry.driveFileId, action: "skipped-locked" });
      continue;
    }
    try {
      results.push(await recoverSnapshot({ scoped, tenant, path: entry.path, rootFilter, regenerate, log }));
    } finally {
      lock.release();
    }
  }
  return results;
}
