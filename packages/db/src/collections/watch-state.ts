// packages/db/src/collections/watch-state.ts — U2 source-watcher. `coll(tenantId)` accessor
// matching the sources.ts/watched-sources.ts pattern, plus the two operations run-watch.mjs
// needs: `wasSeen` (the idempotence check — "new file = no row here") and `markSeen` (record it,
// upsert on the composite `<tenantId>:<sourceType>:<sourceId>` id so a re-run never double-writes).
import type { WatchState } from "@lkb/core";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export function watchState(tenantId: string) {
  return scopedCollection<WatchState>(getDb(), "watch_state")(tenantId);
}

export function watchStateId(tenantId: string, sourceType: string, sourceId: string): string {
  return `${tenantId}:${sourceType}:${sourceId}`;
}

/** Every row this tenant has ever recorded for one source type — the idempotence set a diff
 * checks membership against (`seenIds` in gdrive.ts's `diffNewDriveFiles`). */
export async function listSeenIds(tenantId: string, sourceType: WatchState["sourceType"]): Promise<Set<string>> {
  const rows = await watchState(tenantId).find({ sourceType }).toArray();
  return new Set(rows.map((r) => r.sourceId));
}

/** Every `watch_state` row this tenant has, newest-first by `seenAt` — U4d (D-047/ISS-358): the
 * `/watch-state` route (`apps/api/src/routes/watched-sources.ts`) reads THIS shared accessor for
 * the page, so its view of R1's alert-triggering collection can never diverge from what
 * `listSeenIds`/`findWatchState` already read tenant-scoped. Capped at 200 so a tenant with years
 * of Drive/Gmail/Calendar history cannot turn one page load into an unbounded collection scan —
 * the page needs "what happened recently", not the full ledger. Sort/limit run in Mongo, not in
 * JS, for the same reason. */
export async function listWatchState(tenantId: string): Promise<WatchState[]> {
  return watchState(tenantId).find({}).sort({ seenAt: -1 }).limit(200).toArray();
}

/** The row for one (tenantId, sourceType, sourceId), or `null`. Read-only counterpart to
 * `markWatchState` — u2-fix1's `--reingest` needs to recover the `sessionId` a PRIOR ingest wrote
 * for a Drive file (so it knows exactly what to delete), not just the boolean-only membership
 * `listSeenIds` gives a diff. */
export async function findWatchState(
  tenantId: string,
  sourceType: WatchState["sourceType"],
  sourceId: string,
): Promise<WatchState | null> {
  return watchState(tenantId).findOne({ _id: watchStateId(tenantId, sourceType, sourceId) });
}

/** Upserts one row by its composite id — safe to call twice with the same (tenantId,
 * sourceType, sourceId): the second call just refreshes status/timestamps, never duplicates. */
export async function markWatchState(
  tenantId: string,
  doc: Omit<WatchState, "tenantId" | "_id"> & { sourceType: WatchState["sourceType"]; sourceId: string },
): Promise<void> {
  const _id = watchStateId(tenantId, doc.sourceType, doc.sourceId);
  const { ...rest } = doc;
  await watchState(tenantId).updateOne({ _id }, { $set: rest }, { upsert: true });
}
