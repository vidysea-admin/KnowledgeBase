// scripts/watch/lib/reingest-swap.mjs — iss-309-316-reingest-delete-safety.
// The delete-then-rebuild half of `--reingest`, made recoverable and honest. NO db handle is touched
// directly: every read/write goes through `scoped(collectionName)(tenantId)` — the
// packages/db scopedCollection accessor (tenant merged into every filter) — injected by the caller,
// so tests drive the same code with an in-memory fake and production passes the real accessor.
//
// GUARANTEE (see qa/manifests/iss-309-316-reingest-delete-safety.md): delete-then-rebuild with a
// durable pre-delete snapshot, compensating restore and honest failure. NOT a transaction.
//
// iss-reingestsafe-001-004-typed-snapshot-replay: the snapshot is a type-exact EJSON file (reingest-snapshot.mjs),
// written atomically and verified BEFORE the first delete, marked committed once ingest finishes, and removed on
// success or after a verified restore. A process kill is healed at the next start by reingest-recover.mjs
// (restoreOldRows below is shared by the in-process rollback and that recovery).

import { contentHash, docKey } from "./reingest-snapshot.mjs";

export const SESSION_COLLECTIONS = ["sources", "sessions", "turns", "session_pages", "claims", "chunks"];

/** Per-collection filters for ONE old session (tenantId is merged by the scoped accessor, never here). */
export function oldRowFilters(driveFileId, oldSessionId) {
  return {
    sources: { _id: `gdrive-${driveFileId}` },
    sessions: { _id: oldSessionId },
    turns: { sessionId: oldSessionId },
    session_pages: { sessionId: oldSessionId },
    claims: { "evidence.sessionId": oldSessionId },
    chunks: { sourceRef: oldSessionId },
  };
}

const reasonOf = (err) => (err instanceof Error ? err.message : String(err));

/** ISS-316: run `fn`; on ANY throw record `failed` with the reason (a failing recorder is logged,
 * never allowed to mask the original error), then rethrow the original. */
export async function withFailureRecorded(markFailed, fn) {
  try {
    return await fn();
  } catch (err) {
    try {
      await markFailed(reasonOf(err));
    } catch (markErr) {
      console.error(`could not record failure in watch_state: ${reasonOf(markErr)}`);
    }
    throw err;
  }
}

/** ISS-309: drop the old session's node from the tenant's tree_index ROOT document. The root is ONE
 * document per tenant built from every session, so it is never deleted — only re-derived through the
 * repo's own `regenerate` (which rebuilds the old session's year from the sessions that still exist). */
export async function pruneTreeOfSession({ scoped, tenant, sessionId, rootFilter, regenerate }) {
  const tree = scoped("tree_index")(tenant);
  const root = await tree.findOne(rootFilter);
  if (!root) return { pruned: false, reason: "no tree_index root" };
  const sessions = await scoped("sessions")(tenant).find({}).toArray();
  const pages = await scoped("session_pages")(tenant).find({}).toArray();
  const next = regenerate(root, [sessionId], sessions, pages);
  if (next === root) return { pruned: false, reason: "session not present in tree" };
  await tree.updateOne(rootFilter, { $set: { children: next.children } });
  return { pruned: true };
}

async function snapshotRows(scoped, tenant, filters) {
  const snap = {};
  for (const coll of SESSION_COLLECTIONS) snap[coll] = await scoped(coll)(tenant).find(filters[coll]).toArray();
  return snap;
}

/** Compensating restore. Removes whatever the failed attempt left behind (only rows linked to THIS
 * Drive file's source and absent before we started), then re-inserts the snapshot. Never throws:
 * returns { ok, errors } so the caller can report an incomplete restore instead of masking it. */
export async function restoreOldRows({ scoped, tenant, driveFileId, oldSessionId, snapshot, preexistingSessionIds, treeRoot = null, rootFilter = null }) {
  const errors = [];
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      errors.push(`${label}: ${reasonOf(err)}`);
    }
  };
  let partialIds = [];
  await step("find partial new sessions", async () => {
    const linked = await scoped("sessions")(tenant).find({ sourceId: `gdrive-${driveFileId}` }).toArray();
    partialIds = linked.map((s) => s._id).filter((id) => id !== oldSessionId && !preexistingSessionIds.includes(id));
  });
  for (const id of partialIds) {
    for (const [coll, filter] of Object.entries(oldRowFilters(driveFileId, id))) {
      if (coll === "sources") continue; // removed once below
      await step(`remove partial ${coll} of ${id}`, () => scoped(coll)(tenant).deleteMany(filter));
    }
  }
  await step("remove partial source row", () => scoped("sources")(tenant).deleteMany({ _id: `gdrive-${driveFileId}` }));
  for (const coll of SESSION_COLLECTIONS) {
    if (snapshot[coll].length === 0) continue;
    // Clear what is already there for the same filter first so a half-restored run can be re-run.
    await step(`restore ${coll}`, async () => {
      const ids = snapshot[coll].map((d) => d._id);
      await scoped(coll)(tenant).deleteMany({ _id: { $in: ids } });
      await scoped(coll)(tenant).insertMany(snapshot[coll].map(({ tenantId: _t, ...rest }) => rest));
    });
  }
  if (treeRoot && rootFilter) {
    await step("restore tree_index node", async () => {
      const tree = scoped("tree_index")(tenant);
      const current = await tree.findOne(rootFilter);
      if (!current) await tree.insertMany([(({ tenantId: _t, ...rest }) => rest)(treeRoot)]);
      else if (docKey({ c: current.children ?? null }) !== docKey({ c: treeRoot.children ?? null })) await tree.updateOne(rootFilter, { $set: { children: treeRoot.children } });
    });
  }
  // Verify what is now stored against the snapshot: row counts AND content (order/key-order independent).
  const filters = oldRowFilters(driveFileId, oldSessionId);
  for (const coll of SESSION_COLLECTIONS) {
    await step(`verify ${coll}`, async () => {
      const now = await scoped(coll)(tenant).find(filters[coll]).toArray();
      if (now.length !== snapshot[coll].length) throw new Error(`${now.length} rows after restore, snapshot has ${snapshot[coll].length}`);
      if (contentHash({ [coll]: now }) !== contentHash({ [coll]: snapshot[coll] })) throw new Error("content differs from snapshot");
    });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Delete the old session's rows and run `ingest()` (which writes the corrected session). Either:
 *  - success: new data is in, the old session's node is gone from tree_index, returns {...};
 *  - failure after the first delete: the old rows are restored from the snapshot, whatever the
 *    failed attempt wrote is removed, and the thrown error says whether the restore was complete.
 * The snapshot is written (and re-counted against the live counts) BEFORE any delete; if it cannot be
 * written nothing is deleted and the run fails.
 */
export async function replaceSessionRows(deps) {
  const { scoped, tenant, driveFileId, oldSessionId, correctSessionId, ingest, rootFilter, regenerate } = deps;
  const log = deps.log ?? (() => {});
  const filters = oldRowFilters(driveFileId, oldSessionId);

  const before = {};
  for (const coll of SESSION_COLLECTIONS) before[coll] = await scoped(coll)(tenant).countDocuments(filters[coll]);
  log("before-delete counts", before);

  const snapshot = await snapshotRows(scoped, tenant, filters);
  for (const coll of SESSION_COLLECTIONS) {
    if (snapshot[coll].length !== before[coll]) {
      throw new Error(`reingest aborted before any delete: snapshot of ${coll} has ${snapshot[coll].length} rows, count said ${before[coll]}`);
    }
  }
  const preexisting = await scoped("sessions")(tenant).find({ _id: correctSessionId }).toArray();
  const preexistingSessionIds = preexisting.map((s) => s._id);
  const treeRoot = await scoped("tree_index")(tenant).findOne(rootFilter);
  // Durable, verified snapshot BEFORE the first delete (throws -> nothing deleted yet).
  const snapshotRef = await deps.writeSnapshot({ rows: snapshot, treeRoot, meta: { tenant, driveFileId, oldSessionId, correctSessionId, preexistingSessionIds } });

  let sessionId;
  try {
    for (const coll of SESSION_COLLECTIONS) await scoped(coll)(tenant).deleteMany(filters[coll]);
    sessionId = await ingest();
    // From here on new data is complete. The commit marker tells startup recovery never to restore over it;
    // if the marker cannot be written we cannot make that promise, so the old data is restored instead.
    await deps.commitSnapshot?.(snapshotRef);
  } catch (err) {
    const r = await restoreOldRows({ scoped, tenant, driveFileId, oldSessionId, snapshot, preexistingSessionIds, treeRoot, rootFilter });
    let verdict;
    if (r.ok) {
      verdict = `previous data for "${oldSessionId}" was RESTORED from the pre-delete snapshot and verified`;
      try { await deps.discardSnapshot?.(snapshotRef); } catch (e) { verdict += ` (could not remove snapshot ${snapshotRef}: ${reasonOf(e)})`; }
    } else {
      verdict = `RESTORE INCOMPLETE (${r.errors.join("; ")}) — recover from snapshot ${snapshotRef} (kept; startup recovery will retry)`;
    }
    const e = new Error(`reingest FAILED after delete: ${reasonOf(err)}; ${verdict}`);
    e.cause = err;
    e.restored = r.ok;
    e.snapshotRef = snapshotRef;
    throw e;
  }

  // New data is complete from here on: never restore over it.
  const after = {};
  for (const coll of SESSION_COLLECTIONS) after[coll] = await scoped(coll)(tenant).countDocuments(filters[coll]);
  try {
    await pruneTreeOfSession({ scoped, tenant, sessionId: oldSessionId, rootFilter, regenerate });
  } catch (err) {
    const e = new Error(`reingest ingested "${sessionId}" but tree_index still lists "${oldSessionId}": ${reasonOf(err)} (new session is intact; snapshot kept at ${snapshotRef} marked committed — the next start retries the prune and then removes it)`);
    e.cause = err;
    e.phase = "tree-prune";
    e.snapshotRef = snapshotRef;
    throw e;
  }
  // Fully successful: the snapshot has done its job. A failure to remove it is NOT a failed reingest: it stays
  // marked committed and the next start finishes the cleanup safely.
  try { await deps.discardSnapshot?.(snapshotRef); } catch (e) { log("could not remove snapshot", { snapshotRef, reason: reasonOf(e) }); }
  await deps.finish?.(snapshotRef); // remove old local dir; best effort, see caller
  return { sessionId, before, after };
}
