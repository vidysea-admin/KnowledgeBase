/**
 * packages/core/src/keyframes/ocr-stage.ts — T-041 slice 4 (UNWIRED beyond `extract.ts`'s optional `ocr` option).
 * Turns kept keyframes into `SlideObservation`s via an INJECTED `OcrFn`. No OCR service, model, network or
 * storage lives here; production supplies an OcrFn only after the owner decides storage/retention/redaction of
 * slide text (qa/manifests/t041-slide-turn-alignment.md "Owner decision needed"). Tests use fakes.
 *
 * Policy for assumption A5 (+ D-137 (pending append): "there must be a fallback or retry mechanism"):
 * - RETRYABLE failure = the OcrFn throws/rejects, exceeds `timeoutMs`, or returns a malformed result (non-string
 *   `text`, bad confidence). Each is retried up to `retries` more times with exponential backoff
 *   (`backoffMs * 2^n`, via the injectable `sleep`), then ONE attempt on the optional injected `fallback` OcrFn.
 * - A DEFINITIVE result is a well-formed `{text}`, including blank text: it means "no slide visible", is final,
 *   and is NEVER retried (retrying a correct empty answer would only burn CPU and could flip it).
 * - If every attempt fails the frame is OMITTED from alignment (previous slide keeps the screen) and reported in
 *   `errors` with its total `attempts`. A failure is never converted into blank text.
 * Frames are OCR'd sequentially (bounded CPU). Slide text is never logged or put in `errors` (id + code + count).
 */
import type { Keyframe } from "../domain/keyframe-dedupe.js";
import type { SlideObservation } from "../domain/slide-turn-alignment.js";

export interface OcrFrame { id: string; tSec: number; framePath: string }
export interface OcrResult { text: string; confidence?: number }
export type OcrFn = (frame: OcrFrame) => Promise<OcrResult>;
export interface OcrStageError { frameId: string; code: "ocr-failed" | "ocr-bad-result"; /** Total OCR calls made for this frame (primary tries + fallback try). */ attempts: number }
export interface OcrStageResult { observations: SlideObservation[]; errors: OcrStageError[] }
export interface OcrRetryOptions {
  /** Extra primary attempts after the first. Default 2 (3 primary calls). 0 disables retry. */
  retries?: number;
  /** Base delay in ms; the delay before retry n (0-based) is backoffMs * 2^n. Default 250. */
  backoffMs?: number;
  /** Injectable sleep (tests pass a recording no-op so nothing sleeps). Default: setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional per-attempt timeout in ms; a timed-out attempt counts as a retryable failure. Default: none. */
  timeoutMs?: number;
  /** Optional second engine, tried once after the primary is exhausted. */
  fallback?: OcrFn;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Attempt = { ok: true; obs: SlideObservation } | { ok: false; code: OcrStageError["code"] };

async function attempt(ocr: OcrFn, f: Keyframe & { framePath: string }, timeoutMs: number | undefined): Promise<Attempt> {
  let r: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = Promise.resolve().then(() => ocr({ id: f.id, tSec: f.tSec, framePath: f.framePath }));
    if (timeoutMs !== undefined && timeoutMs > 0) {
      call.catch(() => undefined); // a late rejection after the timeout must not be unhandled
      r = await Promise.race([call, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); })]);
    } else r = await call;
  } catch { return { ok: false, code: "ocr-failed" }; }
  finally { if (timer !== undefined) clearTimeout(timer); }
  const o = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : null;
  if (o === null || typeof o.text !== "string") return { ok: false, code: "ocr-bad-result" };
  const obs: SlideObservation = { id: f.id, tSec: f.tSec, text: o.text };
  if (o.confidence !== undefined) {
    if (typeof o.confidence !== "number" || !(o.confidence >= 0 && o.confidence <= 1)) return { ok: false, code: "ocr-bad-result" };
    obs.confidence = o.confidence;
  }
  return { ok: true, obs };
}

export async function ocrKeyframes(frames: readonly (Keyframe & { framePath: string })[], ocr: OcrFn, retry: OcrRetryOptions = {}): Promise<OcrStageResult> {
  const retries = Number.isInteger(retry.retries) && retry.retries! >= 0 ? retry.retries! : 2;
  const backoffMs = typeof retry.backoffMs === "number" && retry.backoffMs >= 0 ? retry.backoffMs : 250;
  const sleep = retry.sleep ?? defaultSleep;
  const observations: SlideObservation[] = [];
  const errors: OcrStageError[] = [];
  for (const f of frames) {
    let attempts = 0;
    let last: Attempt = { ok: false, code: "ocr-failed" };
    for (let n = 0; n <= retries; n++) {
      if (n > 0) await sleep(backoffMs * 2 ** (n - 1));
      attempts++;
      last = await attempt(ocr, f, retry.timeoutMs);
      if (last.ok) break;
    }
    if (!last.ok && retry.fallback) { attempts++; last = await attempt(retry.fallback, f, retry.timeoutMs); }
    if (last.ok) observations.push(last.obs);
    else errors.push({ frameId: f.id, code: last.code, attempts });
  }
  return { observations, errors };
}
