/**
 * apps/api/src/indexing/types.ts — the shapes `session.ts` and `vector-gap.ts` both need.
 *
 * Exists to break a real import cycle, not for tidiness: `session.ts` calls `recordVectorGap`, and
 * `vector-gap.ts` needs the chunk-outcome type that `session.ts` produces. Defining that type in
 * either file makes them mutually dependent, which `dependency-cruiser`'s `no-circular` rule
 * correctly rejected. A third module owned by neither is the honest resolution.
 */
import type { EmbedJob, EmbedResult } from "@lkb/ai";

/** Mirrors `SummarizeCompleteFn`: a bound call, so callers never know about routing config. */
export type IndexEmbedFn = (job: EmbedJob) => Promise<EmbedResult>;

/** Why a session ended up with no vectors. `null` means it genuinely got them. */
export type ChunkSkipReason = "no-chunkable-turns" | "embedding-failed" | "no-embedder" | null;

export interface ChunkWriteResult {
  written: number;
  skipped: ChunkSkipReason;
}

/** What `indexSession` observed. Returned so a caller can SEE a silent degradation (ISS-116). */
export interface IndexSessionResult {
  sessionId: string;
  chunks: ChunkWriteResult;
  /** U2.1 entity promotion. `null` when no tree root was produced, so there was nothing to promote
   * — distinct from a promotion that ran and failed, which reports `skipped`. */
  entities: { topics: number; orgs: number; claimsTagged: number; skipped: "promotion-failed" | null } | null;
  /** Whether `recordVectorGap`'s own write landed (ISS-122). `false` means the gap bookkeeping
   * itself faulted (its `catch` never rethrows, so indexing still completed and `status.index`
   * still flipped to "done") — a session can be BOTH missing vectors AND missing the gap row that
   * would have surfaced that, and this is the only surface that distinguishes it from the normal
   * "recorded fine" case. Mirrors `chunks.skipped`/`entities.skipped`, the two other degrade-safe
   * signals this result already carries. */
  gapRecorded: boolean;
}
