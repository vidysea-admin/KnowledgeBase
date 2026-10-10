/**
 * packages/ai/src/stt/transcript-qa.ts — T-044 transcript QA. Pure functions only — no I/O. Recorded
 * evidence: a Gemini transcription produced "223 s of turns on 186 s of audio" (timestamps drift past
 * the real audio length, and the tail can be hallucinated). `clampAndValidateTurns` enforces one
 * postcondition on its output -- NO TURN ENDS PAST THE AUDIO DURATION -- and reports everything it
 * changed or removed, so nothing is dropped or altered silently. It never reorders and never mutates
 * its input.
 *
 * Edge-case decisions:
 *  - Invalid duration (NaN / Infinity / <= 0): nothing can be validated, so every turn is dropped with
 *    reason `invalid-duration` and `report.durationValid` is false (never returned unchecked).
 *  - Non-finite tStart/tEnd (or non-number): dropped, reason `invalid-timing`.
 *  - Negative tStart: clamped to 0. tEnd < tStart: tEnd raised to tStart (zero-length). Both count as clamped.
 *  - tStart >= duration: dropped, reason `start-at-or-beyond-duration`, and listed as suspected
 *    hallucination. tStart exactly at the duration is dropped too (the turn would be zero-length at the end).
 *  - tEnd > duration: clamped to the duration. Exactly at the duration is untouched. Within
 *    `toleranceSec` above the duration it is snapped to the duration but not counted as clamped.
 *  - Zero-length turns present in the input are kept (point timestamps are legal). Clamping cannot create
 *    one, because only turns with tStart < duration survive.
 *  - Non-monotonic tStart (relative to the previous surviving turn) is reported, never reordered.
 *  - Empty input is valid: empty output, zero counts.
 */
import type { Turn } from "./transcribe.js";

export interface TranscriptQaOptions {
  /** Consecutive turns with identical normalised text that count as a repetition run. Default 3. */
  repeatThreshold?: number;
  /** Floating-point slack in seconds when comparing tEnd to the duration. Default 1e-6. */
  toleranceSec?: number;
}

export type DropReason = "invalid-duration" | "invalid-timing" | "start-at-or-beyond-duration";

export interface DroppedTurn {
  index: number;
  reason: DropReason;
  /** True when the drop is a suspected hallucination (turn starts at/after the audio ended). */
  suspectedHallucination: boolean;
}

export interface RepeatRun {
  /** Normalised text shared by the run. */
  text: string;
  /** Index in the INPUT array of the first turn in the run. */
  startIndex: number;
  length: number;
}

export interface TranscriptQaReport {
  durationSec: number;
  durationValid: boolean;
  inputCount: number;
  outputCount: number;
  clampedCount: number;
  /** Input indices of turns that were modified (tStart/tEnd clamped). */
  clampedIndices: number[];
  dropped: DroppedTurn[];
  /** Sum of (tEnd - tStart) over input turns with valid timing. */
  totalTurnSec: number;
  /** max(0, totalTurnSec - durationSec). 223 s of turns on 186 s of audio -> 37. */
  overshootSec: number;
  /** Largest valid input tEnd, or 0 when there is none. */
  maxInputEndSec: number;
  /** Input indices whose tStart is earlier than the previous surviving turn's tStart. */
  nonMonotonicIndices: number[];
  hallucination: {
    /** Input indices of turns starting at or beyond the audio duration. */
    pastEndIndices: number[];
    repeatThreshold: number;
    repeatedRuns: RepeatRun[];
  };
}

export interface TranscriptQaResult {
  turns: Turn[];
  report: TranscriptQaReport;
}

const DEFAULT_REPEAT_THRESHOLD = 3;
const DEFAULT_TOLERANCE_SEC = 1e-6;

function normaliseText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function isTime(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Finds runs of >= `threshold` consecutive input turns sharing the same non-empty normalised text. */
function findRepeatedRuns(turns: readonly Turn[], threshold: number): RepeatRun[] {
  const runs: RepeatRun[] = [];
  let i = 0;
  while (i < turns.length) {
    const text = normaliseText(turns[i]?.text);
    let j = i + 1;
    if (text !== "") {
      while (j < turns.length && normaliseText(turns[j]?.text) === text) j++;
      if (j - i >= threshold) runs.push({ text, startIndex: i, length: j - i });
    }
    i = j;
  }
  return runs;
}

export function clampAndValidateTurns(
  turns: readonly Turn[],
  durationSec: number,
  options: TranscriptQaOptions = {},
): TranscriptQaResult {
  const repeatThreshold = Math.max(2, Math.floor(options.repeatThreshold ?? DEFAULT_REPEAT_THRESHOLD));
  const tol = options.toleranceSec !== undefined && options.toleranceSec >= 0 ? options.toleranceSec : DEFAULT_TOLERANCE_SEC;
  const durationValid = typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0;

  const out: Turn[] = [];
  const clampedIndices: number[] = [];
  const dropped: DroppedTurn[] = [];
  const nonMonotonicIndices: number[] = [];
  const pastEndIndices: number[] = [];
  let totalTurnSec = 0;
  let maxInputEndSec = 0;
  let prevStart = -Infinity;

  turns.forEach((t, index) => {
    if (!isTime(t?.tStart) || !isTime(t?.tEnd)) {
      dropped.push({ index, reason: durationValid ? "invalid-timing" : "invalid-duration", suspectedHallucination: false });
      return;
    }
    totalTurnSec += Math.max(0, t.tEnd - t.tStart);
    if (t.tEnd > maxInputEndSec) maxInputEndSec = t.tEnd;
    if (!durationValid) {
      dropped.push({ index, reason: "invalid-duration", suspectedHallucination: false });
      return;
    }
    if (t.tStart >= durationSec) {
      dropped.push({ index, reason: "start-at-or-beyond-duration", suspectedHallucination: true });
      pastEndIndices.push(index);
      return;
    }
    let tStart = t.tStart;
    let tEnd = t.tEnd;
    let changed = false;
    if (tStart < 0) { tStart = 0; changed = true; }
    if (tEnd < tStart) { tEnd = tStart; changed = true; }
    if (tEnd > durationSec) {
      tEnd = durationSec;
      if (t.tEnd > durationSec + tol) changed = true;
    }
    if (changed) clampedIndices.push(index);
    if (tStart < prevStart) nonMonotonicIndices.push(index);
    prevStart = tStart;
    out.push({ ...t, tStart, tEnd });
  });

  return {
    turns: out,
    report: {
      durationSec,
      durationValid,
      inputCount: turns.length,
      outputCount: out.length,
      clampedCount: clampedIndices.length,
      clampedIndices,
      dropped,
      totalTurnSec,
      overshootSec: durationValid ? Math.max(0, totalTurnSec - durationSec) : 0,
      maxInputEndSec,
      nonMonotonicIndices,
      hallucination: { pastEndIndices, repeatThreshold, repeatedRuns: findRepeatedRuns(turns, repeatThreshold) },
    },
  };
}
