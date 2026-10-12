/**
 * packages/core/src/keyframes/ocr-stage.ts — T-041 slice 4 (UNWIRED beyond `extract.ts`'s optional `ocr` option).
 * Turns kept keyframes into `SlideObservation`s via an INJECTED `OcrFn`. No OCR service, model, network or
 * storage lives here; production supplies an OcrFn only after the owner decides storage/retention/redaction of
 * slide text (qa/manifests/t041-slide-turn-alignment.md "Owner decision needed"). Tests use fakes.
 *
 * Policy picked for assumption A5 (flagged for the checker): an OcrFn that throws/rejects or returns a non-string
 * `text` OMITS that frame (the previous slide keeps the screen) and is reported in `errors`; only an OcrFn that
 * returns blank text means "no slide visible". Frames are OCR'd sequentially (bounded CPU). Slide text is never
 * logged or put in `errors` (error entries carry id + code only).
 */
import type { Keyframe } from "../domain/keyframe-dedupe.js";
import type { SlideObservation } from "../domain/slide-turn-alignment.js";

export interface OcrFrame { id: string; tSec: number; framePath: string }
export interface OcrResult { text: string; confidence?: number }
export type OcrFn = (frame: OcrFrame) => Promise<OcrResult>;
export interface OcrStageError { frameId: string; code: "ocr-failed" | "ocr-bad-result" }
export interface OcrStageResult { observations: SlideObservation[]; errors: OcrStageError[] }

export async function ocrKeyframes(frames: readonly (Keyframe & { framePath: string })[], ocr: OcrFn): Promise<OcrStageResult> {
  const observations: SlideObservation[] = [];
  const errors: OcrStageError[] = [];
  for (const f of frames) {
    let r: unknown;
    try { r = await ocr({ id: f.id, tSec: f.tSec, framePath: f.framePath }); }
    catch { errors.push({ frameId: f.id, code: "ocr-failed" }); continue; }
    const o = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : null;
    if (o === null || typeof o.text !== "string") { errors.push({ frameId: f.id, code: "ocr-bad-result" }); continue; }
    const obs: SlideObservation = { id: f.id, tSec: f.tSec, text: o.text };
    if (o.confidence !== undefined) {
      if (typeof o.confidence !== "number" || !(o.confidence >= 0 && o.confidence <= 1)) { errors.push({ frameId: f.id, code: "ocr-bad-result" }); continue; }
      obs.confidence = o.confidence;
    }
    observations.push(obs);
  }
  return { observations, errors };
}
