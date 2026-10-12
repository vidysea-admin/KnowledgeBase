/**
 * packages/core/src/keyframes/extract.ts — T-041 slice 3 (UNWIRED; nothing imports this, `summarize.ts` and the
 * live session pipeline are untouched). Recording -> sampled frames -> dHash -> `dedupeKeyframes` -> frame PNGs
 * -> `alignSlidesToTurns`. NO OCR in this slice and NO schema field is added.
 *
 * Sampling = FIXED INTERVAL (default 2 s, `intervalSec`), then hash-based dedupe: the dedupe unit's design
 * (qa/manifests/t041-keyframe-dedup.md) dedupes "over frame hashes" and names no scene-detect filter; ffmpeg's
 * scene score is not used. The 2 s default is a convention, NOT measured on a real recording. Frame i is
 * stamped `i * intervalSec` (ffmpeg's fps filter: first frame at 0, then every interval).
 *
 * Alignment input: with no OCR yet, each kept keyframe becomes a SlideObservation whose `text` is the stand-in
 * `keyframe:<hash>` (so "different slide" == "a different kept keyframe"). Replace with OCR text in the OCR
 * slice; the alignment output carries ids and ranges only, never this text.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeKeyframes, type Keyframe, type KeyframeDedupeOptions } from "../domain/keyframe-dedupe.js";
import type { KeyframeFrame } from "../domain/keyframe-dedupe-validate.js";
import { alignSlidesToTurns, type AlignResult, type AlignTurn, type SlideObservation } from "../domain/slide-turn-alignment.js";
import { FFMPEG_ENV, framePassArgs, hashPassArgs, KeyframeExtractError, resolveFfmpeg } from "./ffmpeg-args.js";
import { ocrKeyframes, type OcrFn, type OcrStageError } from "./ocr-stage.js";
import { dHashRawStream, HASH_FRAME_BYTES } from "./perceptual-hash.js";

export const DEFAULT_INTERVAL_SEC = 2;
const MAX_RAW_BYTES = 64 * 1024 * 1024; // ~900k frames; far above a day of 2 s samples
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export interface ExecResult { code: number | null; stdout: Buffer; stderr: string; spawnError?: NodeJS.ErrnoException; timedOut: boolean; truncated: boolean }
export type ExecFn = (command: string, args: readonly string[], opts: { timeoutMs: number; maxStdoutBytes: number }) => Promise<ExecResult>;

/** Default runner: child_process.spawn, shell:false, bounded stdout and time. */
export const spawnExec: ExecFn = (command, args, opts) => new Promise((done) => {
  const chunks: Buffer[] = [];
  let size = 0, err = "", timedOut = false, truncated = false, spawnError: NodeJS.ErrnoException | undefined;
  const child = spawn(command, [...args], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, opts.timeoutMs);
  child.stdout.on("data", (b: Buffer) => {
    size += b.length;
    if (size > opts.maxStdoutBytes) { truncated = true; child.kill("SIGKILL"); } else chunks.push(b);
  });
  child.stderr.on("data", (b: Buffer) => { if (err.length < 4000) err += b.toString("utf8"); });
  child.on("error", (e) => { spawnError = e as NodeJS.ErrnoException; });
  child.on("close", (code) => { clearTimeout(timer); done({ code, stdout: Buffer.concat(chunks), stderr: err, spawnError, timedOut, truncated }); });
});

export interface ExtractOptions {
  /** Seconds between sampled frames (finite, > 0, <= 3600). Default 2. */
  intervalSec?: number;
  env?: Record<string, string | undefined>;
  /** Repo root for the `.cache/tools` default. Default: this checkout. */
  repoRoot?: string;
  exec?: ExecFn;
  timeoutMs?: number;
}

function checkInput(input: unknown, opts: ExtractOptions): { path: string; interval: number } {
  if (typeof input !== "string" || input === "" || input.includes("\0")) throw new KeyframeExtractError("bad-input", "input must be a non-empty path");
  const interval = opts.intervalSec ?? DEFAULT_INTERVAL_SEC;
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0 || interval > 3600) {
    throw new KeyframeExtractError("bad-input", "intervalSec must be a finite number in (0, 3600]");
  }
  const path = resolve(input);
  if (!existsSync(path)) throw new KeyframeExtractError("input-missing", "recording not found");
  return { path, interval };
}

function ffmpegOf(opts: ExtractOptions): string {
  return resolveFfmpeg(opts.env ?? process.env, opts.repoRoot ?? REPO_ROOT);
}

function failed(r: ExecResult): boolean {
  return r.spawnError !== undefined || r.timedOut || r.truncated || r.code !== 0;
}

function fail(r: ExecResult, what: string): never {
  if (r.spawnError !== undefined) {
    const missing = r.spawnError.code === "ENOENT";
    throw new KeyframeExtractError(missing ? "ffmpeg-missing" : "ffmpeg-failed",
      missing ? `ffmpeg could not be started (set ${FFMPEG_ENV} to an absolute path)` : `ffmpeg could not be started: ${r.spawnError.code ?? "error"}`);
  }
  if (r.timedOut) throw new KeyframeExtractError("ffmpeg-timeout", `ffmpeg ${what} timed out`);
  if (r.truncated) throw new KeyframeExtractError("output-too-large", `ffmpeg ${what} output exceeded the cap`);
  throw new KeyframeExtractError("ffmpeg-failed", `ffmpeg ${what} exited with code ${String(r.code)}`, r.stderr.slice(0, 500));
}

/** Pass 1: sampled frames with their dHash. Frame ids are `f0`, `f1`, ... */
export async function extractFrameHashes(input: string, options: ExtractOptions = {}): Promise<KeyframeFrame[]> {
  const { path, interval } = checkInput(input, options);
  const r = await (options.exec ?? spawnExec)(ffmpegOf(options), hashPassArgs(path, interval), { timeoutMs: options.timeoutMs ?? 600_000, maxStdoutBytes: MAX_RAW_BYTES });
  if (failed(r)) fail(r, "hash pass");
  if (r.stdout.length % HASH_FRAME_BYTES !== 0) throw new KeyframeExtractError("bad-output", "ffmpeg output is not whole 9x8 gray frames");
  return dHashRawStream(r.stdout).map((hash, i) => ({ id: `f${i}`, tSec: i * interval, hash }));
}

export interface KeyframeFile extends Keyframe { framePath: string }
export interface SlideAlignmentRun {
  keyframes: KeyframeFile[]; slides: SlideObservation[]; alignment: AlignResult; sampledFrames: number; intervalSec: number;
  /** Per-frame OCR failures (frame id + code only); always [] when no `ocr` option was given. */
  ocrErrors: OcrStageError[];
}
export interface PipelineOptions extends ExtractOptions {
  /** Directory the keyframe PNGs (`kf-0000.png`, ...) are written to; created if absent. */
  outDir: string;
  /** Turns to attach slides to (empty -> nothing attached). */
  turns?: readonly AlignTurn[];
  dedupe?: KeyframeDedupeOptions;
  /** End of the session in seconds; default = last sampled time + intervalSec. */
  endSec?: number;
  /** Optional injected OCR (fake in tests). When given, alignment uses its text instead of the `keyframe:<hash>` stand-in; `slides` keeps the stand-in and no OCR text is returned. */
  ocr?: OcrFn;
}

/** recording -> keyframes (timestamp, hash, PNG path) -> merged dedupe -> slide/turn alignment. */
export async function extractSlideTurnAlignment(input: string, options: PipelineOptions): Promise<SlideAlignmentRun> {
  const { path, interval } = checkInput(input, options);
  const frames = await extractFrameHashes(path, options);
  const end = options.endSec ?? (frames.length > 0 ? frames[frames.length - 1]!.tSec + interval : undefined);
  const dd = dedupeKeyframes(frames, { ...options.dedupe, ...(end === undefined ? {} : { endSec: end }) });
  if (dd.errors.length > 0) throw new KeyframeExtractError("dedupe-failed", "dedupeKeyframes rejected the frames", dd.errors);

  const outDir = resolve(options.outDir);
  const bin = ffmpegOf(options);
  const run = options.exec ?? spawnExec;
  await mkdir(outDir, { recursive: true });
  const keyframes: KeyframeFile[] = [];
  for (const [i, kf] of dd.keyframes.entries()) {
    const framePath = join(outDir, `kf-${String(i).padStart(4, "0")}.png`);
    const r = await run(bin, framePassArgs(path, kf.tSec, framePath), { timeoutMs: options.timeoutMs ?? 600_000, maxStdoutBytes: 1024 });
    if (failed(r)) fail(r, "frame pass");
    keyframes.push({ ...kf, framePath });
  }
  const slides: SlideObservation[] = dd.keyframes.map((k) => ({ id: k.id, tSec: k.tSec, text: `keyframe:${k.hash}` }));
  let alignSlides = slides;
  let ocrErrors: OcrStageError[] = [];
  if (options.ocr) {
    const o = await ocrKeyframes(keyframes, options.ocr);
    alignSlides = o.observations;
    ocrErrors = o.errors;
  }
  const alignment = alignSlidesToTurns(alignSlides, options.turns ?? [], end === undefined ? undefined : { sessionEndSec: end });
  return { keyframes, slides, alignment, sampledFrames: frames.length, intervalSec: interval, ocrErrors };
}
