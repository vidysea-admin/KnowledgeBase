/**
 * packages/core/src/domain/keyframe-dedupe-validate.ts — input/option validation for keyframe-dedupe.ts
 * (T-041 slice 2, PURE, UNWIRED). Fail-closed: any problem yields errors and NO keyframes, because
 * dropping single frames would silently open gaps in the covered time range.
 */
export type KeyframeDedupeErrorCode =
  | "invalid-input" | "invalid-id" | "duplicate-id" | "invalid-time" | "negative-time"
  | "unsorted-time" | "duplicate-time" | "invalid-hash" | "mixed-hash-length" | "invalid-diff"
  | "invalid-option";
export interface KeyframeDedupeError { index: number; id?: string; code: KeyframeDedupeErrorCode }

/** One sampled frame: capture time (seconds from session start), perceptual hash (hex), optional score. */
export interface KeyframeFrame { id: string; tSec: number; hash: string; diff?: number }
export interface KeyframeDedupeOptions {
  /** Max Hamming distance (bits) to the last KEPT frame for "near-identical". Default 5 (unvalidated). */
  hammingThreshold?: number;
  /** Runs shorter than this many ms are flicker and merge into the previous run. Default 0 (off). */
  minDurationMs?: number;
  /** A frame whose precomputed `diff` is >= this starts a new keyframe regardless of its hash. Default off. */
  sceneCutDiff?: number;
  /** Close the last span at this time (seconds) instead of the last frame's time. Must be >= last frame time. */
  endSec?: number;
}

const HEX = /^[0-9a-fA-F]+$/u;
export const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateOptions(o: KeyframeDedupeOptions | undefined, errors: KeyframeDedupeError[]): void {
  if (o === undefined) return;
  const bad = (): void => { errors.push({ index: -1, code: "invalid-option" }); };
  if (typeof o !== "object" || o === null) return bad();
  if (o.hammingThreshold !== undefined && !(Number.isInteger(o.hammingThreshold) && o.hammingThreshold >= 0)) bad();
  if (o.minDurationMs !== undefined && !(isFiniteNumber(o.minDurationMs) && o.minDurationMs >= 0)) bad();
  if (o.sceneCutDiff !== undefined && !isFiniteNumber(o.sceneCutDiff)) bad();
  if (o.endSec !== undefined && !isFiniteNumber(o.endSec)) bad();
}

/** Returns the frames when valid, otherwise pushes typed errors (all of them) and returns null. */
export function validateFrames(raw: unknown, endSec: number | undefined, errors: KeyframeDedupeError[]): KeyframeFrame[] | null {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) errors.push({ index: -1, code: "invalid-input" });
    return null;
  }
  const seenIds = new Set<string>();
  let prevT = -Infinity;
  let len = -1;
  const before = errors.length;
  for (let index = 0; index < raw.length; index++) {
    const f = raw[index] as unknown;
    if (typeof f !== "object" || f === null) { errors.push({ index, code: "invalid-input" }); continue; }
    const r = f as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id !== "" ? r.id : undefined;
    if (id === undefined) errors.push({ index, code: "invalid-id" });
    else if (seenIds.has(id)) errors.push({ index, id, code: "duplicate-id" });
    else seenIds.add(id);
    if (!isFiniteNumber(r.tSec)) errors.push({ index, id, code: "invalid-time" });
    else if (r.tSec < 0) errors.push({ index, id, code: "negative-time" });
    else {
      if (r.tSec === prevT) errors.push({ index, id, code: "duplicate-time" });
      else if (r.tSec < prevT) errors.push({ index, id, code: "unsorted-time" });
      prevT = r.tSec;
    }
    if (typeof r.hash !== "string" || !HEX.test(r.hash)) errors.push({ index, id, code: "invalid-hash" });
    else if (len < 0) len = r.hash.length;
    else if (r.hash.length !== len) errors.push({ index, id, code: "mixed-hash-length" });
    if (r.diff !== undefined && !(isFiniteNumber(r.diff) && r.diff >= 0)) errors.push({ index, id, code: "invalid-diff" });
  }
  if (endSec !== undefined && raw.length > 0 && !(endSec >= prevT)) errors.push({ index: -1, code: "invalid-option" });
  return errors.length === before ? (raw as KeyframeFrame[]) : null;
}
