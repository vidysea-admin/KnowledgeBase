/**
 * apps/api/src/indexing/types.ts — the shapes `session.ts` and `vector-gap.ts` both need.
 *
 * Exists to break a real import cycle, not for tidiness: `session.ts` calls `recordVectorGap`, and
 * `vector-gap.ts` needs the chunk-outcome type that `session.ts` produces. Defining that type in
 * either file makes them mutually dependent, which `dependency-cruiser`'s `no-circular` rule
 * correctly rejected. A third module owned by neither is the honest resolution.
 */
import type { TileCaptureContext, ReadTileCapture, TileSpeakerSuggestOutcome } from "./tile-speaker-suggest.js";
import type { EmbedJob, EmbedResult } from "@lkb/ai";
import type { Db } from "mongodb";
import type { SummarizeCompleteFn, NoteJudge } from "@lkb/index";

/** Mirrors `SummarizeCompleteFn`: a bound call, so callers never know about routing config. */
export type IndexEmbedFn = (job: EmbedJob) => Promise<EmbedResult>;
export type IndexRetrievalMode = "vectorless" | "vector";

/** Server composition dependency. This snapshot is descriptive; consumers must CAS current state. */
export interface CommittedIndexBinding {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly generation: string;
  readonly turnDigest: string;
  readonly reviewRevision: string | null;
}
export type IndexCommittedHook = (binding: Readonly<CommittedIndexBinding>) => Promise<void>;

/** Why a session ended up with no vectors. `null` means it genuinely got them. */
export type ChunkSkipReason = "no-chunkable-turns" | "embedding-failed" | "no-embedder" | null;

export interface ChunkWriteResult {
  written: number;
  skipped: ChunkSkipReason;
}

/** What `indexSession` observed. Returned so a caller can SEE a silent degradation (ISS-116). */
export interface IndexSessionResult {
  sessionId: string;
  summary?: { degraded: string | null; dropped?: number };
  claims?: { degraded: string | null; dropped?: number };
  /** U2.5: present only when decisions extraction ran (flag on). */
  decisions?: { count: number; degraded: string | null };
  topics?: { pageId: string; degraded: string | null }[];
  completion?: { version: 2; strict: boolean; complete: boolean; generation: string; turnCount: number; treeWritten: boolean;
    retrievalMode?: IndexRetrievalMode; lexicalWritten?: boolean; provenanceValidated?: boolean };
  chunks: ChunkWriteResult;
  /** T-040: present only in grounded-notes mode (strict + dropUnverified): how existing claims were treated and what the judge cost. */
  groundedNotes?: { claims: { preserved: number; replaced: number; inserted: number } | null; judge: { judged: number; kept: number; dropped: number; unsure: number; rulesDropped: number; calls: number; costUsd: number } | null };
  /** U2.4: present only when speaker suggestion was opted into. */
  speakerSuggestions?: { suggested: number; inserted: number; degraded: string | null; error?: string };
  /** T-042 P9: present only when the tile-suggest hook was enabled AND the index attempt committed. Never affects `completion`. */
  tileSpeakerSuggestions?: TileSpeakerSuggestOutcome;
  /** U2.1 entity promotion. `null` when no tree root was produced, so there was nothing to promote
   * — distinct from a promotion that ran and failed, which reports `skipped`. */
  entities: { topics: number; orgs: number; claimsTagged: number; skipped: "promotion-failed" | null } | null;
}

export interface IndexSessionDeps {
  /** Server-only, idempotent consumer. Never called inside a caller-owned transaction. */
  onIndexCommitted?: IndexCommittedHook;
  complete: SummarizeCompleteFn;

  strictWebinar?: boolean;
  /** T-040: with strictWebinar, a proposal that fails strict quote verification or the judge is dropped (and counted) instead of degrading the whole page. */
  dropUnverified?: boolean;
  /** T-040 / D-144 / D-151: injectable note judge (effective only with strictWebinar + dropUnverified). Fails closed per note. */
  noteJudge?: NoteJudge;
  /** Per-session judge cost cap in USD (optional). */
  judgeMaxCostUsd?: number;

  embed?: IndexEmbedFn;
  /** Product default is vectorless; legacy vector publication requires explicit opt-in. */
  retrievalMode?: IndexRetrievalMode;

  /** U2.5: extract + persist decisions. Default (undefined) follows LKB_EXTRACT_DECISIONS, which is off. */
  extractDecisions?: boolean;

  /** U2.4 / D-141: OFF unless true. Writes `speaker_suggestions` rows only (never `speakers`); see ./speaker-suggest.ts. */
  suggestSpeakers?: boolean;

  /** T-042 P9: OFF unless `enabled === true` AND LKB_TILE_SUGGEST=1. Suggestion rows only (never `speakers`); runs only after a committed index. */
  tileSuggest?: { enabled: boolean; context: TileCaptureContext; readCapture: ReadTileCapture };

  db?: Pick<Db, "collection">;
}
