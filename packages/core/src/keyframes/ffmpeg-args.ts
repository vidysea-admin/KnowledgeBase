/**
 * packages/core/src/keyframes/ffmpeg-args.ts — T-041 slice 3 (UNWIRED). Typed errors, ffmpeg location and the
 * EXACT argument arrays for the two ffmpeg runs. Arrays only: ffmpeg is spawned without a shell, so no
 * quoting and no injection through a file name.
 *
 * Location convention (same as packages/ingest youtube.ts and the .cache/tools default of calendar-attendance):
 *  1. LKB_FFMPEG_PATH = ABSOLUTE ffmpeg binary or a directory holding it (relative -> "bad-config");
 *  2. else `<repoRoot>/.cache/tools/ffmpeg-9.0.2/bin/ffmpeg(.exe)` when that file exists;
 *  3. else bare `ffmpeg` (PATH). A binary that cannot be started is "ffmpeg-missing".
 */
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const FFMPEG_ENV = "LKB_FFMPEG_PATH";
export type KeyframeErrorCode =
  | "bad-config" | "bad-input" | "input-missing" | "ffmpeg-missing" | "ffmpeg-failed"
  | "ffmpeg-timeout" | "output-too-large" | "bad-output" | "dedupe-failed";
export class KeyframeExtractError extends Error {
  constructor(readonly code: KeyframeErrorCode, message: string, readonly detail?: unknown) {
    super(message);
    this.name = "KeyframeExtractError";
  }
}

const exe = (platform: string): string => (platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

/** Pure apart from existsSync/statSync. Returns the command to spawn. */
export function resolveFfmpeg(env: Record<string, string | undefined>, repoRoot: string, platform: string = process.platform): string {
  const v = env[FFMPEG_ENV];
  if (v !== undefined && v !== "") {
    if (v.includes("\0") || !isAbsolute(v)) throw new KeyframeExtractError("bad-config", `${FFMPEG_ENV} must be an absolute path`);
    try {
      return statSync(v).isDirectory() ? join(v, exe(platform)) : v;
    } catch {
      return v; // does not exist: the run reports ffmpeg-missing
    }
  }
  const dflt = join(repoRoot, ".cache", "tools", "ffmpeg-9.0.2", "bin", exe(platform));
  return existsSync(dflt) ? dflt : "ffmpeg";
}

const COMMON = ["-hide_banner", "-nostdin", "-loglevel", "error"] as const;

/** Pass 1: one raw 9x8 gray frame (72 bytes) every `intervalSec` seconds to stdout. */
export function hashPassArgs(input: string, intervalSec: number): string[] {
  return [...COMMON, "-i", input, "-an", "-sn", "-vf", `fps=1/${intervalSec},scale=9:8:flags=area,format=gray`,
    "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"];
}

/** Pass 2: one PNG of the frame at `tSec` (fast seek before -i). */
export function framePassArgs(input: string, tSec: number, outPath: string): string[] {
  return [...COMMON, "-ss", String(tSec), "-i", input, "-an", "-frames:v", "1", "-y", outPath];
}
