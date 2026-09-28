// packages/db/src/collections/watch-heartbeat.ts — U4b/R2 watcher liveness (D-048). `coll(tenantId)`
// accessor in the same shape as watch-state.ts/watch-reports.ts, plus the two operations R2 needs:
// `markHeartbeat` (the WRITER — scripts/watch/run-watch.mjs, at the end of each polling phase it
// completed) and `listHeartbeats` (the DETECTOR's read — apps/api/src/routes/health.ts, deliberately
// a different process, since a detector inside the writer dies with it).
//
// R8: every operation here goes through `scopedCollection()`, which forces a tenantId at the call
// site and merges it into every filter. There is no raw handle to reach around it (ISS-065 removed
// the `raw` escape hatch and none is added back here) — a cross-tenant read of watcher liveness
// would be the ISS-078 class, which this repo never round-caps.
import type { WatchHeartbeat } from "@lkb/core";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export function watchHeartbeat(tenantId: string) {
  return scopedCollection<WatchHeartbeat>(getDb(), "watch_heartbeat")(tenantId);
}

/** The two-part composite id — `(tenantId, sourceType)`, ONE row per source TYPE run-watch.mjs
 * polls (drive/gmail/calendar), not per item like watch_state's three-part key: an item id has no
 * meaning for "did this whole phase run at all". Mirrors `watchHeartbeatId` in
 * scripts/watch/lib/heartbeat.mjs, which is the pure version the script and its tests use. */
export function watchHeartbeatId(tenantId: string, sourceType: string): string {
  return `${tenantId}:${sourceType}`;
}

/** Every heartbeat row this tenant has — the detector's input. Tenant-scoped by construction: the
 * `find` below is `withTenant`-merged, so a caller cannot read another tenant's liveness rows even
 * by passing a crafted filter, and there is no overload that omits the tenantId. */
export async function listHeartbeats(tenantId: string): Promise<WatchHeartbeat[]> {
  return watchHeartbeat(tenantId).find({}).toArray();
}

/** One row for one (tenantId, sourceType), or `null` when that source type has never completed a
 * run. A `null` here is NOT "healthy" — `isHeartbeatStale(null, ...)` is deliberately `true`
 * (scripts/watch/lib/heartbeat.mjs): a source that has never proven it is alive gets no benefit of
 * the doubt. */
export async function findHeartbeat(
  tenantId: string,
  sourceType: WatchHeartbeat["sourceType"],
): Promise<WatchHeartbeat | null> {
  return watchHeartbeat(tenantId).findOne({ _id: watchHeartbeatId(tenantId, sourceType) });
}

/** Upserts one heartbeat row — safe to call on every run: the second call just refreshes
 * `lastHeartbeatAt`, never duplicates. Same `updateOne(..., { upsert: true })` idiom as
 * `markWatchState`, which goes through the scoped accessor's tenant-merged `updateOne` (added for
 * ISS-065) rather than a raw handle.
 *
 * Takes the whole document, so the caller's own `buildHeartbeatDoc`
 * (scripts/watch/lib/heartbeat.mjs — the pure, tested shape function) is what defines the row,
 * rather than this file re-deriving it a second way. `tenantId` is NOT read off `doc`: it is the
 * separate, session/config-derived first argument, and the filter this write lands on is
 * `withTenant`-merged from it, so a `doc` carrying someone else's `_id` prefix still cannot write
 * into another tenant's row. */
export async function markHeartbeat(tenantId: string, doc: WatchHeartbeat): Promise<void> {
  const { sourceType, lastHeartbeatAt } = doc;
  // `doc._id` is deliberately NOT used: the id is recomputed here from the scoped `tenantId`, so a
  // doc built with the wrong prefix lands on this tenant's row or nowhere, never on another's.
  await watchHeartbeat(tenantId).updateOne(
    { _id: watchHeartbeatId(tenantId, sourceType) },
    { $set: { sourceType, lastHeartbeatAt } },
    { upsert: true },
  );
}
