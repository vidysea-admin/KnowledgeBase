/**
 * packages/core/src/domain/keyframe-dedupe.ts — T-041 slice 2 (UNWIRED, PURE). Collapses an ordered list
 * of frame perceptual hashes into keyframes (the first frame of each run of near-identical frames), each
 * with the time span it covers. No I/O, no hashing of images, no ffmpeg, no logging.
 *
 * VALIDATED ON SYNTHETIC HASHES ONLY. The default threshold (5 bits of a 64-bit hash) is a convention,
 * NOT measured against any real recording; the roadmap names no value.
 *
 * Rules (times are seconds from session start; spans are half-open [from, to)):
 *  - Hash = hex string, every frame the same length (64-bit = 16 hex chars is the expected case).
 *  - near-identical = Hamming distance <= `hammingThreshold` to the last KEPT frame, never to the
 *    previous frame, so slow drift (each step small, total large) cannot chain into one endless run.
 *  - `diff` (optional, precomputed by the caller): with `sceneCutDiff` set, diff >= it forces a new keyframe.
 *  - `minDurationMs`: a run shorter than that is flicker and merges into the PREVIOUS run (a leading
 *    flicker merges forward; the surviving run's `from` moves back to the first input time but its
 *    keyframe id/tSec/hash stay its own). After a merge, a following run within the threshold of the
 *    surviving keyframe (and not a forced cut) joins it, so A,flicker,A is one run. The last run's length
 *    is measured to `endSec` (else to the last frame time), so a final 1-frame run is flicker unless
 *    `endSec` is given. If every run is flicker, the first run is kept covering everything.
 *  - Spans tile [first frame time, endSec ?? last frame time) with no gap or overlap; the last frame time
 *    itself is the closing bound. Only timestamps, ids and hashes present in the input are ever output.
 *  - Fail-closed: invalid input returns { keyframes: [], errors } (never throws). Empty input -> empty.
 *  - Complexity O(n * hashLength), single pass plus one pass over runs.
 *
 * Output feeds slide-turn-alignment as `{ id, tSec }` plus the OCR text a later stage adds.
 */
import {
  isFiniteNumber, validateFrames, validateOptions,
  type KeyframeDedupeError, type KeyframeDedupeOptions, type KeyframeFrame,
} from "./keyframe-dedupe-validate.js";

export type { KeyframeDedupeError, KeyframeDedupeErrorCode, KeyframeDedupeOptions, KeyframeFrame } from "./keyframe-dedupe-validate.js";

export const DEFAULT_KEYFRAME_HAMMING_THRESHOLD = 5;

/** A kept keyframe. `id`/`tSec` are SlideObservation's fields (add `text` once OCR has run). */
export interface Keyframe {
  id: string; tSec: number; hash: string; from: number; to: number; frameIds: string[];
}
export interface KeyframeDedupeResult { keyframes: Keyframe[]; errors: KeyframeDedupeError[] }

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
const nib = (s: string, i: number): number => {
  const c = s.charCodeAt(i);
  return c <= 57 ? c - 48 : (c | 32) - 87;
};

/** Hamming distance in bits between two equal-length hex strings (case-insensitive). */
export function hexHammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[nib(a, i) ^ nib(b, i)]!;
  return d;
}

interface Run { frame: KeyframeFrame; from: number; to: number; ids: string[]; cut: boolean }

export function dedupeKeyframes(frames: readonly KeyframeFrame[], options?: KeyframeDedupeOptions): KeyframeDedupeResult {
  const errors: KeyframeDedupeError[] = [];
  validateOptions(options, errors);
  const valid = validateFrames(frames, isFiniteNumber(options?.endSec) ? options?.endSec : undefined, errors);
  if (valid === null || errors.length > 0 || valid.length === 0) return { keyframes: [], errors };

  const thr = options?.hammingThreshold ?? DEFAULT_KEYFRAME_HAMMING_THRESHOLD;
  const minSec = (options?.minDurationMs ?? 0) / 1000;
  const cutAt = options?.sceneCutDiff;
  const end = options?.endSec ?? valid[valid.length - 1]!.tSec;

  const runs: Run[] = [];
  let cur: Run | null = null;
  for (const f of valid) {
    const cut = cutAt !== undefined && f.diff !== undefined && f.diff >= cutAt;
    if (cur !== null && !cut && hexHammingDistance(cur.frame.hash, f.hash) <= thr) { cur.ids.push(f.id); continue; }
    if (cur !== null) cur.to = f.tSec;
    cur = { frame: f, from: f.tSec, to: end, ids: [f.id], cut };
    runs.push(cur);
  }

  const out: Keyframe[] = [];
  let carryFrom: number | null = null;
  let carryIds: string[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (r.to - r.from < minSec) {
      if (prev !== undefined) { prev.to = r.to; prev.frameIds.push(...r.ids); } else { carryFrom ??= r.from; carryIds.push(...r.ids); }
    } else if (prev !== undefined && !r.cut && hexHammingDistance(prev.hash, r.frame.hash) <= thr) {
      prev.to = r.to; prev.frameIds.push(...r.ids);
    } else {
      out.push({ id: r.frame.id, tSec: r.frame.tSec, hash: r.frame.hash, from: carryFrom ?? r.from, to: r.to, frameIds: [...carryIds, ...r.ids] });
      carryFrom = null; carryIds = [];
    }
  }
  if (out.length === 0) {
    const f = valid[0]!;
    out.push({ id: f.id, tSec: f.tSec, hash: f.hash, from: f.tSec, to: end, frameIds: valid.map((x) => x.id) });
  }
  return { keyframes: out, errors };
}
