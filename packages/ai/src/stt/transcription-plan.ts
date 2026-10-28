/**
 * packages/ai/src/stt/transcription-plan.ts — T-048 slice 1. PURE and UNWIRED: decides "one call
 * or chunked" for a recording and, when one call, the chunked plan to fall back to. No I/O, no
 * clock, no model call; every limit arrives in `TranscriptionThresholds` (nothing is hard-coded
 * in the function). Deliberately NOT exported from index.ts until the wiring unit.
 *
 * Rules, in order: invalid thresholds / duration / size -> chunked with a typed reason (the safe
 * path is the one that works today); model not in `singleCallModels` -> chunked; duration over
 * the limit -> chunked; size over the limit -> chunked; else single, carrying `fallback`.
 * A chunked plan with `chunks: []` means "cannot enumerate chunks from this input" (bad
 * duration, bad thresholds, or over `maxChunks`): the caller must probe the real duration.
 */

export interface TranscriptionThresholds {
  /** Longest recording (seconds) allowed one call. */
  maxSingleSeconds: number;
  /** true: a duration exactly equal to the limit still goes single ("up to N"). */
  singleInclusive: boolean;
  /** Largest file (bytes) allowed one call; null = no size limit known/enforced. */
  maxSingleBytes: number | null;
  /** Model ids allowed a single call; null = any model (today's behaviour). */
  singleCallModels: readonly string[] | null;
  chunkSeconds: number;
  overlapSeconds: number;
  /** A final chunk adding fewer NEW seconds than this is merged into the previous chunk. */
  minTailSeconds: number;
  maxChunks: number;
}

export interface TranscriptionPlanInput {
  durationSeconds: number | null | undefined;
  fileBytes?: number | null;
  modelId: string;
  thresholds: TranscriptionThresholds;
}

export interface PlanChunk {
  start: number;
  end: number;
}

export type ChunkedReason =
  | "invalid-thresholds"
  | "invalid-duration"
  | "invalid-size"
  | "model-not-single-call"
  | "duration-over-limit"
  | "size-over-limit"
  | "exceeds-max-chunks"
  | "single-call-failed";

export interface ChunkedPlan {
  kind: "chunked";
  reason: ChunkedReason;
  chunks: PlanChunk[];
  count: number;
  overlapSeconds: number;
}

export interface SinglePlan {
  kind: "single";
  reason: "within-single-call-limits";
  durationSeconds: number;
  /** What to run if the single call fails; the wiring unit must not re-decide this. */
  fallback: ChunkedPlan;
}

export type TranscriptionPlan = SinglePlan | ChunkedPlan;

/** Today's production rule, exactly as the code has it.
 *  - 2400 s: `LONG_SESSION_THRESHOLD_SECONDS = 40 * 60` (scripts/watch/lib/ingest-chain.mjs:26);
 *    routing is `duration > threshold` -> long (ingest-chain.mjs:219), so exactly 40 min is single.
 *  - chunkSeconds 2400: `DEFAULT_CHUNK_SECONDS` (scripts/transcribe-long-session.mjs:43).
 *  - overlap 0: chunks are non-overlapping (packages/ai/src/stt/chunk-audio.ts:17).
 *  - bytes null, models null: today's routing looks at duration only (ingest-chain.mjs:219).
 *  - minTailSeconds 0 (no merge: chunk-audio.ts:23-25 keeps any tail): grounded as "none".
 *  - maxChunks 1000: ASSUMPTION (no bound exists in code). */
export const TODAY_THRESHOLDS: TranscriptionThresholds = {
  maxSingleSeconds: 2400,
  singleInclusive: true,
  maxSingleBytes: null,
  singleCallModels: null,
  chunkSeconds: 2400,
  overlapSeconds: 0,
  minTailSeconds: 0,
  maxChunks: 1000,
};

/** T-048 target: "gemini-3.8-flash single-call ... for recordings <= ~90 min; keep chunking as
 *  fallback" (TASKS.md:140; .goal/goal.json:962-969; D-028, docs/DECISIONS.md:365-366).
 *  - 5400 s = 90 min, inclusive ("<=", TASKS.md:140). The "~" is not modelled: ASSUMPTION that it
 *    means exactly 90 min; the live re-run (not in this slice) should confirm.
 *  - fallback chunking = today's 2400 s / no overlap (D-028: "Chunking stays as the fallback").
 *  - maxSingleBytes null: ASSUMPTION - no per-model byte limit is recorded anywhere.
 *  - minTailSeconds 60 and maxChunks 1000: ASSUMPTIONS (no source). */
export const T048_THRESHOLDS: TranscriptionThresholds = {
  maxSingleSeconds: 5400,
  singleInclusive: true,
  maxSingleBytes: null,
  singleCallModels: ["gemini-3.8-flash"],
  chunkSeconds: 2400,
  overlapSeconds: 0,
  minTailSeconds: 60,
  maxChunks: 1000,
};

const posFinite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function thresholdsOk(t: TranscriptionThresholds): boolean {
  return (
    posFinite(t.maxSingleSeconds) &&
    typeof t.singleInclusive === "boolean" &&
    (t.maxSingleBytes === null || posFinite(t.maxSingleBytes)) &&
    (t.singleCallModels === null || Array.isArray(t.singleCallModels)) &&
    posFinite(t.chunkSeconds) &&
    typeof t.overlapSeconds === "number" &&
    Number.isFinite(t.overlapSeconds) &&
    t.overlapSeconds >= 0 &&
    t.overlapSeconds < t.chunkSeconds &&
    typeof t.minTailSeconds === "number" &&
    Number.isFinite(t.minTailSeconds) &&
    t.minTailSeconds >= 0 &&
    t.minTailSeconds <= t.chunkSeconds &&
    Number.isInteger(t.maxChunks) &&
    t.maxChunks >= 1
  );
}

function chunked(reason: ChunkedReason, chunks: PlanChunk[], overlapSeconds: number): ChunkedPlan {
  return { kind: "chunked", reason, chunks, count: chunks.length, overlapSeconds };
}

/** Chunks covering [0, duration]; consecutive chunks overlap by `overlapSeconds`; the final chunk
 *  is merged into the previous one when it adds fewer than `minTailSeconds` new seconds (a merged
 *  chunk can therefore exceed `chunkSeconds`, by less than `minTailSeconds`). */
function buildChunks(duration: number, t: TranscriptionThresholds): PlanChunk[] | null {
  const stride = t.chunkSeconds - t.overlapSeconds;
  let n = duration <= t.chunkSeconds ? 1 : 1 + Math.ceil((duration - t.chunkSeconds) / stride);
  if (n > t.maxChunks + 1) return null; // cheap guard before any allocation
  const chunks: PlanChunk[] = [];
  for (let k = 0; k < n; k++) {
    const start = k * stride;
    chunks.push({ start, end: Math.min(start + t.chunkSeconds, duration) });
  }
  if (n > 1 && duration - chunks[n - 2]!.end < t.minTailSeconds) {
    chunks.pop();
    chunks[chunks.length - 1]!.end = duration;
    n -= 1;
  }
  return n > t.maxChunks ? null : chunks;
}

export function chooseTranscriptionPath(input: TranscriptionPlanInput): TranscriptionPlan {
  try {
    const t = input?.thresholds;
    if (!t || !thresholdsOk(t)) return chunked("invalid-thresholds", [], 0);
    const d = input.durationSeconds;
    if (typeof d !== "number" || !Number.isFinite(d) || d <= 0) return chunked("invalid-duration", [], t.overlapSeconds);
    const b = input.fileBytes;
    if (b != null && !(typeof b === "number" && Number.isFinite(b) && b >= 0)) {
      return chunked("invalid-size", [], t.overlapSeconds);
    }
    const chunks = buildChunks(d, t);
    if (chunks === null) return chunked("exceeds-max-chunks", [], t.overlapSeconds);
    const plan = (reason: ChunkedReason) => chunked(reason, chunks, t.overlapSeconds);
    if (t.singleCallModels !== null && !t.singleCallModels.includes(input.modelId)) return plan("model-not-single-call");
    if (t.singleInclusive ? d > t.maxSingleSeconds : d >= t.maxSingleSeconds) return plan("duration-over-limit");
    if (t.maxSingleBytes !== null && b != null && b > t.maxSingleBytes) return plan("size-over-limit");
    return { kind: "single", reason: "within-single-call-limits", durationSeconds: d, fallback: plan("single-call-failed") };
  } catch {
    return chunked("invalid-thresholds", [], 0);
  }
}
