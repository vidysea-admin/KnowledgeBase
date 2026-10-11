/**
 * packages/ingest/src/retention-report-guards.ts - T-046 dry-run report. DOWNGRADE-ONLY guards.
 * The planner (`planRetentionSweep`) alone decides eligibility. A guard looks at the media file
 * evidence and may turn the planner's "purge-eligible" into KEEP with a named reason. It can never
 * turn a KEEP into eligible: `finalEligible` is `planned eligible AND no guard fired`, and `guard`
 * returns null for any planner verdict other than "purge-eligible". Pure: `now` is injected.
 */
import type { MediaEvidence } from "./retention-report-media.js";

/** A recording whose media file was touched within this window may still be written, finalised or remuxed.
 *  The pipeline's finalise -> transcribe -> process-video -> index steps (scripts/webinar/run-pipeline.mjs)
 *  have no time bound in code, so the window is deliberately a day, not seconds. Not an option: the
 *  planner's inputs have no such notion, and a per-run knob would let one flag lower the safety margin. */
export const QUIET_PERIOD_MS = 24 * 3_600_000;
/** An mtime further ahead of the injected `now` than this is clock evidence we cannot trust. */
export const CLOCK_SKEW_MS = 5 * 60_000;
/** The recording is processed after it is recorded: an mtime later than processedAt by more than this
 *  means the file changed after the state claims it was processed (re-recorded, replaced, copied). */
export const AFTER_PROCESSED_MS = 3_600_000;
/** Largest tolerated relative difference between the size recorded in source.json and the stat'd size. */
export const SIZE_TOLERANCE = 0.01;

export type GuardCode =
  | "media-root-not-given" | "media-not-found" | "media-path-outside-root" | "media-unreadable"
  | "recently-modified" | "clock-skew" | "media-modified-after-processed" | "size-mismatch";

/** Codes meaning "the report could not see or trust the media": counted as NOT ASSESSABLE. */
export const NOT_ASSESSABLE: ReadonlySet<GuardCode> = new Set<GuardCode>([
  "media-root-not-given", "media-not-found", "media-path-outside-root", "media-unreadable", "clock-skew", "size-mismatch",
]);

export interface GuardInput {
  media: MediaEvidence;
  /** size recorded in source.json, if any */
  recordedBytes: number | null;
  /** parsed processedAt (ms), if valid */
  processedAtMs: number | null;
}
export interface GuardHit { code: GuardCode; detail: string }

const STATE_CODE = { "no-root": "media-root-not-given", "not-found": "media-not-found", "outside-root": "media-path-outside-root", unreadable: "media-unreadable" } as const;
const h = (ms: number): string => (ms / 3_600_000).toFixed(2);

/** Null = no objection. Only ever fires on a planner "purge-eligible"; anything else returns null (unchanged). */
export function guard(planned: string, input: GuardInput, now: number): GuardHit | null {
  if (planned !== "purge-eligible") return null;
  const { media, recordedBytes, processedAtMs } = input;
  if (media.state !== "present") return { code: STATE_CODE[media.state], detail: `media file evidence: ${media.state}` };
  const { sizeBytes, mtimeMs } = media;
  if (sizeBytes === null || mtimeMs === null || !Number.isFinite(mtimeMs)) return { code: "media-unreadable", detail: "size or mtime could not be read" };
  if (mtimeMs - now > CLOCK_SKEW_MS) return { code: "clock-skew", detail: `media mtime is ${h(mtimeMs - now)} h in the future (allowed skew ${h(CLOCK_SKEW_MS)} h)` };
  if (now - mtimeMs < QUIET_PERIOD_MS) return { code: "recently-modified", detail: `media modified ${h(now - mtimeMs)} h ago, under the ${h(QUIET_PERIOD_MS)} h quiet period` };
  if (processedAtMs !== null && mtimeMs - processedAtMs > AFTER_PROCESSED_MS) return { code: "media-modified-after-processed", detail: `media mtime is ${h(mtimeMs - processedAtMs)} h after processedAt (allowed ${h(AFTER_PROCESSED_MS)} h)` };
  if (recordedBytes !== null && Math.abs(recordedBytes - sizeBytes) > SIZE_TOLERANCE * Math.max(recordedBytes, sizeBytes)) {
    return { code: "size-mismatch", detail: `state records ${recordedBytes} B but the file is ${sizeBytes} B (tolerance ${SIZE_TOLERANCE * 100}%)` };
  }
  return null;
}

/** The only way a final verdict is formed: eligible requires the planner's eligible AND no guard hit. */
export function finalEligible(planned: string, input: GuardInput, now: number): { eligible: boolean; hit: GuardHit | null } {
  const hit = guard(planned, input, now);
  return { eligible: planned === "purge-eligible" && hit === null, hit };
}
