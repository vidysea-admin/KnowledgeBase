// packages/db/src/collections/watch-reports.ts — U2 source-watcher. `coll(tenantId)` accessor
// matching the sources.ts pattern; one write per run-watch.mjs run (never a dry-run — see that
// script's mode table).
import type { WatchReports } from "@lkb/core";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export function watchReports(tenantId: string) {
  return scopedCollection<WatchReports>(getDb(), "watch_reports")(tenantId);
}

export async function recordWatchReport(tenantId: string, doc: Omit<WatchReports, "tenantId">): Promise<void> {
  await watchReports(tenantId).insertOne(doc);
}

/** Most recent report first — what a future dashboard (U4) reads for "last watcher run". */
export async function listWatchReports(tenantId: string, limit = 20): Promise<WatchReports[]> {
  return watchReports(tenantId).find({}).sort({ runAt: -1 }).limit(limit).toArray();
}
