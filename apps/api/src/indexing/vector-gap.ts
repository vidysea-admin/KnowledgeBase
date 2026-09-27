/**
 * apps/api/src/vector-gap.ts — the durable record that a session has no vectors (ISS-118).
 *
 * Split out of `indexing.ts` rather than left inline: that file crossed its 300-LOC budget when
 * this landed, and raising the budget to fit a genuinely separate concern would have been the
 * accretion the budget exists to prevent. Gap bookkeeping is not indexing.
 */
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Gaps } from "@lkb/core";
import type { ChunkWriteResult } from "./types.js";

/**
 * The DURABLE record that a session has no vectors (ISS-118).
 *
 * The return value added by U1.0b made the skip observable to a caller, and both ingest paths log
 * it — but the checker proved that surface is not a guarantee: it disabled the `console.warn` on
 * BOTH paths simultaneously and the entire 124-test suite stayed green. A log line nothing asserts
 * is one careless edit from silence, and silence here is exactly the ISS-116 failure (three whole
 * sessions absent from the index while every status field read "done").
 *
 * A `gaps` row is the honest surface: it survives the process, it is queryable by an operator, and
 * `GET /gaps` + the Dashboard already render this collection. `kind: "vector-pending"` is additive
 * — the two existing kinds describe content we never received; this describes content we HAVE and
 * cannot retrieve.
 *
 * IDEMPOTENT BY `_id`, deliberately: a re-index must not accumulate a second row for the same
 * session, and a success must CLEAR a previous failure's row rather than leaving a stale "open" gap
 * that outlives the problem it described. Both directions are one `updateOne` upsert on a derived
 * id, so there is no read-then-write race.
 */
/**
 * The gap row's id.
 *
 * TENANT-NAMESPACED (ISS-121). It was `vector-pending:<sessionId>`, which is globally unique while
 * the *filter* around it is tenant-merged — so a second tenant recording a gap for the same
 * sessionId hit a duplicate-key error instead of getting its own row. That is reachable rather
 * than theoretical: `whatsapp-store.ts` derives `sessionId` from a sha256 of `(groupJid,
 * ownerUserId)` with no tenant in it, so two tenants archiving the same WhatsApp group collide.
 * Isolation never broke — the loser simply could not write — but see the catch below for why that
 * mattered more than it sounds.
 */
export function vectorGapId(tenantId: string, sessionId: string): string {
  return `vector-pending:${tenantId}:${sessionId}`;
}

/**
 * @returns whether the gap bookkeeping write actually landed (ISS-122). The catch below is
 *          deliberately never rethrown (see its comment), which is exactly why a `console.warn`
 *          alone was not a guarantee: ISS-118's own fix disabled that identical warn on both
 *          ingest paths and the whole suite stayed green. A `boolean` return is a surface a test
 *          can assert on without a log-scraping fixture, mirroring `writeSessionChunks`'s
 *          `ChunkWriteResult` and `promoteAndPersistEntities`'s `PromotionResult` — this was the
 *          one degrade-safe function in this file that reported nothing to its caller at all.
 */
export async function recordVectorGap(
  tenantId: string,
  sessionId: string,
  chunks: ChunkWriteResult,
  db: Pick<Db, "collection">,
): Promise<boolean> {
  const gapsColl = scopedCollection<Gaps>(db as never, "gaps");
  const _id = vectorGapId(tenantId, sessionId);
  // NEVER THROWS (ISS-121, the half that actually bit). This runs inside `indexSession` BEFORE the
  // tree_index update and the `status.index` flip, so the duplicate-key error escaped upward and
  // left the session `"pending"` forever while ingest still returned 201 — a silent indexing
  // failure introduced by the unit whose entire purpose was to end a silent indexing failure.
  // Bookkeeping about a degradation must never be able to cause a worse one, so this is the same
  // degrade-safe stance `writeSessionChunks` already takes. Fixing only the id would have left the
  // next unforeseen write error with the same power to strand a session.
  try {
    if (chunks.skipped) {
      await gapsColl(tenantId).updateOne(
        { _id } as never,
        {
          $set: {
            tenantId,
            kind: "vector-pending",
            status: "open",
            sourceRef: sessionId,
            requestedAt: new Date().toISOString(),
            description: `Session ${sessionId} indexed but has no embedding vectors (${chunks.skipped}); it is absent from vector search.`,
          },
        } as never,
        { upsert: true },
      );
      return true;
    }
    // Resolved. `updateOne` without upsert: a session that never failed must not gain a
    // "received" gap row describing a problem it never had.
    await gapsColl(tenantId).updateOne(
      { _id, status: "open" } as never,
      { $set: { status: "received" } } as never,
    );
    return true;
  } catch (err) {
    console.warn(
      `recordVectorGap(${tenantId}/${sessionId}): gap bookkeeping failed, indexing continues: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
