/**
 * scripts/lib/transcription-wiring.mjs — T-044 / T-048 wiring helpers shared by
 * scripts/transcribe-long-session.mjs and scripts/watch/lib/ingest-chain.mjs (D-162 lifted the D-119 hold).
 * Both behaviours are OFF unless the flag env var is exactly "1"; when off every helper is an
 * identity / null so the callers behave byte-for-byte as before. The pure TS modules
 * (clampAndValidateTurns, chooseTranscriptionPath) are passed in by the caller, never imported here.
 */

/** T-044: clamp turn timestamps to the audio duration and write a QA report. */
export const TRANSCRIPT_QA_FLAG = "LKB_TRANSCRIPT_QA";
/** T-048: try one generateContent call for recordings within the single-call limits; chunking is the fallback. */
export const SINGLE_CALL_FLAG = "LKB_SINGLE_CALL_PATH";

/** Completeness thresholds shared by transcribe-long-session.mjs (its retry/accept logic) and
 * scripts/webinar/validate/validate-session.mjs (the re-validation gate), so the two can never drift. */
export const GAP_THRESHOLD_SECONDS = 30; // normal turn-to-turn silence is much shorter than this
export const SHORTFALL_THRESHOLD_SECONDS = 45; // the last turn must land within this of the audio end

export function flagOn(env, name) {
  return env != null && env[name] === "1";
}

/**
 * T-044. Disabled -> `{ turns }` is the SAME array object, `report` is null (no clamp call).
 * Enabled -> clamps via `clamp(turns, durationSeconds)`; throws if the clamp ever returns a turn
 * that ends past the audio (the roadmap criterion), so a broken clamp can never ship silently.
 */
export function applyTranscriptQa({ enabled, turns, durationSeconds, clamp }) {
  if (!enabled) return { turns, report: null };
  const result = clamp(turns, durationSeconds);
  if (!result.report.durationValid) {
    throw new Error(`transcript QA: invalid audio duration ${durationSeconds}; refusing to emit unchecked turns`);
  }
  for (const t of result.turns) {
    if (!(t.tStart >= 0 && t.tStart <= t.tEnd && t.tEnd <= durationSeconds)) {
      throw new Error(`transcript QA: clamped turn still outside [0, ${durationSeconds}] (tStart=${t.tStart}, tEnd=${t.tEnd})`);
    }
  }
  return { turns: result.turns, report: result.report };
}

/** One-line operator summary of a clamp report (no transcript text, ids and counts only). */
export function summariseQaReport(report) {
  return (
    `transcript QA: in=${report.inputCount} out=${report.outputCount} clamped=${report.clampedCount} ` +
    `dropped=${report.dropped.length} overshoot=${report.overshootSec.toFixed(1)}s ` +
    `pastEnd=${report.hallucination.pastEndIndices.length} repeatedRuns=${report.hallucination.repeatedRuns.length}`
  );
}

/**
 * T-048. Returns null when disabled (caller keeps today's boundaries). Enabled -> the chooser's plan.
 * `modelId` must be the model actually used; an unset override is "" which no single-call allow-list
 * contains, so an unset model chunks (today's behaviour).
 */
export function planTranscriptionPath({ enabled, durationSeconds, fileBytes, modelId, choose, thresholds }) {
  if (!enabled) return null;
  return choose({ durationSeconds, fileBytes, modelId, thresholds });
}

/** Span list for the driver: a single whole-file span when the plan says single, else `chunked`. */
export function boundariesForPlan(plan, durationSeconds, chunked) {
  if (plan && plan.kind === "single") return [{ start: 0, end: durationSeconds }];
  return chunked;
}

/** True when a single-call result is trustworthy: no internal gap and the tail reaches the audio end. */
export function isSingleCallComplete({ turns, durationSeconds, gaps, shortfallThresholdSeconds }) {
  if (!Array.isArray(turns) || turns.length === 0) return false;
  if (gaps.length > 0) return false;
  const lastTEnd = turns[turns.length - 1].tEnd;
  return durationSeconds - lastTEnd <= shortfallThresholdSeconds;
}

/**
 * ingest-chain transcriber choice. Default (flag off, or plan not single) is exactly the existing rule:
 * duration known and > longThresholdSeconds -> the long driver, else the short one. A single plan
 * always uses the long driver (it carries the gap guard and the chunked fallback; the short one has neither).
 */
export function selectTranscriber({ durationSeconds, longThresholdSeconds, plan }) {
  if (plan && plan.kind === "single") return "transcribe-long-session.mjs";
  return durationSeconds !== null && durationSeconds > longThresholdSeconds
    ? "transcribe-long-session.mjs"
    : "transcribe-toc-session.mjs";
}
