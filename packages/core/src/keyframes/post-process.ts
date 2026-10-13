/**
 * packages/core/src/keyframes/post-process.ts — T-041 wiring. The ONE call the recording post-processing path
 * makes: keyframes -> OCR (retry + fallback, D-137) -> slide/turn alignment, behind the `LKB_KEYFRAME_OCR`
 * flag (OFF unless exactly "1"). Flag off => returns `{status:"disabled"}` having touched nothing (no ffmpeg,
 * no OCR, no files). Output carries ids and ranges only; slide text is never returned or persisted
 * (storage/retention of slide text is still an owner decision). Never throws for stage failures: a failed
 * stage is returned as `{status:"failed", code}` so the main post-processing result is unaffected.
 */
import type { AlignTurn } from "../domain/slide-turn-alignment.js";
import { extractSlideTurnAlignment, type PipelineOptions, type SlideAlignmentRun } from "./extract.js";
import type { OcrFn, OcrRetryOptions, OcrStageError } from "./ocr-stage.js";

export const KEYFRAME_OCR_FLAG = "LKB_KEYFRAME_OCR";
export function keyframeOcrEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[KEYFRAME_OCR_FLAG] === "1";
}

export type KeyframeOcrOutcome =
  | { status: "disabled" }
  | { status: "skipped"; reason: "no-ocr-provider" }
  | { status: "failed"; code: string }
  | { status: "done"; keyframeCount: number; sampledFrames: number; alignment: SlideAlignmentRun["alignment"]; ocrErrors: OcrStageError[] };

export interface KeyframeOcrInput {
  env?: Record<string, string | undefined>;
  /** Recording to sample. */
  video: string;
  /** Directory for the temporary keyframe PNGs. */
  outDir: string;
  turns: readonly AlignTurn[];
  /** Injected OCR; absent => skipped (flag on but provider not configured). */
  ocr?: OcrFn;
  ocrRetry?: OcrRetryOptions;
  /** Test seam: replaces extractSlideTurnAlignment. */
  extract?: (video: string, options: PipelineOptions) => Promise<SlideAlignmentRun>;
  pipeline?: Omit<PipelineOptions, "outDir" | "turns" | "ocr" | "ocrRetry">;
}

export async function runKeyframeOcrPostProcess(input: KeyframeOcrInput): Promise<KeyframeOcrOutcome> {
  if (!keyframeOcrEnabled(input.env)) return { status: "disabled" };
  if (!input.ocr) return { status: "skipped", reason: "no-ocr-provider" };
  try {
    const run = await (input.extract ?? extractSlideTurnAlignment)(input.video, {
      ...input.pipeline, outDir: input.outDir, turns: input.turns, ocr: input.ocr, ocrRetry: input.ocrRetry,
    });
    return { status: "done", keyframeCount: run.keyframes.length, sampledFrames: run.sampledFrames, alignment: run.alignment, ocrErrors: run.ocrErrors };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { status: "failed", code: typeof code === "string" ? code : "stage-failed" };
  }
}
