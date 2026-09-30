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
  summary?: { degraded: string | null };
  claims?: { degraded: string | null };
  completion?: { version: 2; strict: boolean; complete: boolean; generation: string; turnCount: number; treeWritten: boolean };
  chunks: ChunkWriteResult;
  /** U2.1 entity promotion. `null` when no tree root was produced, so there was nothing to promote
   * — distinct from a promotion that ran and failed, which reports `skipped`. */
  entities: { topics: number; orgs: number; claimsTagged: number; skipped: "promotion-failed" | null } | null;
}
