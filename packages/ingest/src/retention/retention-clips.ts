/**
 * packages/ingest/src/retention/retention-clips.ts - T-046 / D-008. Evidence-clip extraction that must succeed BEFORE a
 * raw recording is purged: D-008 says a +/-15 s clip per cited turn is retained permanently. The windows come from the
 * planner (`retainWindows`, padding already applied). ffmpeg is spawned without a shell with an argument array, so a
 * file name cannot inject anything. ffmpeg location follows the repo convention: LKB_FFMPEG_PATH (absolute file or
 * directory), else <repo>/.cache/tools/ffmpeg-9.0.2/bin/ffmpeg(.exe) when present, else bare `ffmpeg`.
 * Clips are stream-copied (no re-encode, so no codec requirement); the cut therefore snaps to the previous keyframe
 * and may start a little EARLIER than the window, never later: the cited moment is always inside the clip.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import type { EvidenceClipWindow } from "@lkb/core";

const FFMPEG_ENV = "LKB_FFMPEG_PATH";
const CLIP_TIMEOUT_MS = 120_000;
const SAFE = /[^a-zA-Z0-9._-]/g;

export interface ClipRun { code: number | null; error?: string }
export interface ClipIo {
  /** run ffmpeg (no shell); returns exit code */
  run: (command: string, args: readonly string[]) => ClipRun;
  mkdirp: (dir: string) => void;
  /** size in bytes of an existing regular file, else null */
  sizeOf: (path: string) => number | null;
  remove: (path: string) => void;
}
export const REAL_CLIP_IO: ClipIo = {
  run: (command, args) => {
    const r = spawnSync(command, [...args], { shell: false, windowsHide: true, stdio: "ignore", timeout: CLIP_TIMEOUT_MS });
    return { code: r.status, ...(r.error ? { error: (r.error as NodeJS.ErrnoException).code ?? "spawn-error" } : {}) };
  },
  mkdirp: (d) => { mkdirSync(d, { recursive: true }); },
  sizeOf: (p) => { try { const s = statSync(p); return s.isFile() ? s.size : null; } catch { return null; } },
  remove: (p) => { try { unlinkSync(p); } catch { /* best effort: a partial output is re-checked by size */ } },
};

export function resolveFfmpegCommand(env: Record<string, string | undefined>, repoRoot: string, platform: string = process.platform): string {
  const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const v = env[FFMPEG_ENV];
  if (v !== undefined && v !== "") {
    if (v.includes("\0") || !isAbsolute(v)) throw new Error(`${FFMPEG_ENV} must be an absolute path`);
    try { return statSync(v).isDirectory() ? join(v, exe) : v; } catch { return v; }
  }
  const dflt = join(repoRoot, ".cache", "tools", "ffmpeg-9.0.2", "bin", exe);
  return existsSync(dflt) ? dflt : "ffmpeg";
}

/** Exact ffmpeg argv for one window. Seek before -i (fast), stream copy, overwrite. */
export function clipArgs(input: string, startSec: number, durSec: number, out: string): string[] {
  return ["-hide_banner", "-nostdin", "-loglevel", "error", "-ss", String(startSec), "-i", input, "-t", String(durSec), "-c", "copy", "-y", out];
}

export const clipFileName = (w: EvidenceClipWindow, ext: string): string =>
  `${w.sessionId.replace(SAFE, "_")}__${w.turnId.replace(SAFE, "_")}${ext}`;

export interface ClipOutcome { turnId: string; file: string; status: "extracted" | "exists" | "failed"; why?: string }
export interface ClipResult { ok: boolean; outcomes: ClipOutcome[] }

/**
 * Extracts every window into `outDir`. ok is true only when EVERY window has a non-empty clip on disk afterwards
 * (a pre-existing non-empty clip counts: re-runs are idempotent). Any failure removes its partial output and makes
 * ok false, which the purge executor treats as a veto: the raw media is then kept.
 */
export function extractEvidenceClips(
  mediaAbs: string, windows: readonly EvidenceClipWindow[], outDir: string, command: string, io: ClipIo = REAL_CLIP_IO,
): ClipResult {
  const outcomes: ClipOutcome[] = [];
  if (windows.length === 0) return { ok: false, outcomes };
  const ext = extname(mediaAbs).toLowerCase() || ".bin";
  try { io.mkdirp(outDir); } catch { return { ok: false, outcomes: windows.map((w) => ({ turnId: w.turnId, file: "", status: "failed" as const, why: "mkdir-failed" })) }; }
  for (const w of windows) {
    const file = clipFileName(w, ext);
    const out = join(outDir, file);
    const fail = (why: string): void => { io.remove(out); outcomes.push({ turnId: w.turnId, file, status: "failed", why }); };
    const dur = w.tEnd - w.tStart;
    if (!Number.isFinite(w.tStart) || !Number.isFinite(dur) || w.tStart < 0 || dur <= 0) { fail("bad-window"); continue; }
    if ((io.sizeOf(out) ?? 0) > 0) { outcomes.push({ turnId: w.turnId, file, status: "exists" }); continue; }
    const r = io.run(command, clipArgs(mediaAbs, w.tStart, dur, out));
    if (r.error !== undefined) { fail(r.error === "ENOENT" ? "ffmpeg-missing" : `spawn-${r.error}`); continue; }
    if (r.code !== 0) { fail(`ffmpeg-exit-${r.code ?? "signal"}`); continue; }
    if ((io.sizeOf(out) ?? 0) <= 0) { fail("empty-output"); continue; }
    outcomes.push({ turnId: w.turnId, file, status: "extracted" });
  }
  return { ok: outcomes.every((o) => o.status !== "failed"), outcomes };
}
