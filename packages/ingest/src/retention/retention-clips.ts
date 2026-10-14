/**
 * packages/ingest/src/retention/retention-clips.ts - T-046 / D-008. Evidence-clip extraction that must succeed BEFORE a
 * raw recording is purged: D-008 says a +/-15 s clip per cited turn is retained permanently. The windows come from the
 * planner (`retainWindows`, padding already applied). ffmpeg is spawned without a shell with an argument array, so a
 * file name cannot inject anything. ffmpeg location follows the repo convention: LKB_FFMPEG_PATH (absolute file or
 * directory), else <repo>/.cache/tools/ffmpeg-9.0.2/bin/ffmpeg(.exe) when present, else bare `ffmpeg`; ffprobe is the
 * sibling binary. Clips are stream-copied (no re-encode, so no codec requirement); the cut therefore snaps to the
 * previous keyframe and may start a little EARLIER than the window, never later.
 *
 * Every clip is VALIDATED with ffprobe before it counts: the source is probed first (a window starting at or after the
 * source end fails), ffmpeg writes to <name>.partial<ext>, the result is probed (parseable, has an audio or video
 * stream, duration close to the window clamped to the source length) and only then atomically renamed to its final
 * name. An existing clip is re-probed, never trusted for existing; an invalid one is replaced. An evidence-clips
 * directory that is a symlink/junction (or not a directory) is refused.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import type { EvidenceClipWindow } from "@lkb/core";

const FFMPEG_ENV = "LKB_FFMPEG_PATH";
const CLIP_TIMEOUT_MS = 120_000;
const SAFE = /[^a-zA-Z0-9._-]/g;

export interface ClipRun { code: number | null; error?: string }
export interface ProbeInfo { duration: number; streams: string[] }
export interface ClipIo {
  /** run ffmpeg (no shell); returns exit code */
  run: (command: string, args: readonly string[]) => ClipRun;
  /** ffprobe a file; null = not parseable / probe failed */
  probe: (probeCommand: string, path: string) => ProbeInfo | null;
  mkdirp: (dir: string) => void;
  /** true when the path exists and is a symlink / junction or otherwise not a plain directory */
  isLinkOrNotDir: (dir: string) => boolean;
  /** size in bytes of an existing REGULAR file (links are not followed), else null */
  sizeOf: (path: string) => number | null;
  rename: (from: string, to: string) => void;
  remove: (path: string) => void;
}
export const REAL_CLIP_IO: ClipIo = {
  run: (command, args) => {
    const r = spawnSync(command, [...args], { shell: false, windowsHide: true, stdio: "ignore", timeout: CLIP_TIMEOUT_MS });
    return { code: r.status, ...(r.error ? { error: (r.error as NodeJS.ErrnoException).code ?? "spawn-error" } : {}) };
  },
  probe: (cmd, path) => {
    const r = spawnSync(cmd, ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path],
      { shell: false, windowsHide: true, encoding: "utf8", timeout: 60_000, maxBuffer: 1 << 20 });
    if (r.error || r.status !== 0) return null;
    try {
      const j = JSON.parse(r.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
      const duration = Number(j.format?.duration);
      return Number.isFinite(duration) ? { duration, streams: (j.streams ?? []).map((x) => x.codec_type ?? "") } : null;
    } catch { return null; }
  },
  mkdirp: (d) => { mkdirSync(d, { recursive: true }); },
  isLinkOrNotDir: (d) => { try { const s = lstatSync(d); return s.isSymbolicLink() || !s.isDirectory(); } catch { return false; } },
  sizeOf: (p) => { try { const s = lstatSync(p); return s.isFile() ? s.size : null; } catch { return null; } },
  rename: (a, b) => { renameSync(a, b); },
  remove: (p) => { try { unlinkSync(p); } catch { /* best effort */ } },
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

/** ffprobe sits next to ffmpeg; a bare/unrecognised command falls back to PATH `ffprobe`. */
export function resolveFfprobeCommand(ffmpegCommand: string): string {
  return /(^|[\\/])ffmpeg(\.exe)?$/i.test(ffmpegCommand) ? ffmpegCommand.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace(/ffmpeg/i, "ffprobe")) : "ffprobe";
}

/** Exact ffmpeg argv for one window. Seek before -i (fast), stream copy, overwrite. */
export function clipArgs(input: string, startSec: number, durSec: number, out: string): string[] {
  return ["-hide_banner", "-nostdin", "-loglevel", "error", "-ss", String(startSec), "-i", input, "-t", String(durSec), "-c", "copy", "-y", out];
}

export const clipFileName = (w: EvidenceClipWindow, ext: string): string =>
  `${w.sessionId.replace(SAFE, "_")}__${w.turnId.replace(SAFE, "_")}${ext}`;

export interface ClipOutcome { turnId: string; file: string; status: "extracted" | "exists" | "failed"; why?: string }
export interface ClipResult { ok: boolean; outcomes: ClipOutcome[] }

/** A clip is acceptable only if parseable, has audio/video, and its length is near the (source-clamped) window. */
function clipValid(p: ProbeInfo | null, expected: number): boolean {
  if (p === null || !p.streams.some((t) => t === "audio" || t === "video")) return false;
  const tol = Math.max(1.5, 0.15 * expected);
  return p.duration >= expected - tol && p.duration <= expected + 60;
}

/**
 * Extracts every window into `outDir`. ok is true only when EVERY window has an ffprobe-validated clip on disk
 * afterwards. Any failure removes its partial output and makes ok false, which the purge executor treats as a veto:
 * the raw media is then kept.
 */
export function extractEvidenceClips(
  mediaAbs: string, windows: readonly EvidenceClipWindow[], outDir: string, command: string, io: ClipIo = REAL_CLIP_IO,
  probeCommand: string = resolveFfprobeCommand(command),
): ClipResult {
  const outcomes: ClipOutcome[] = [];
  if (windows.length === 0) return { ok: false, outcomes };
  const failAll = (why: string): ClipResult => ({ ok: false, outcomes: windows.map((w) => ({ turnId: w.turnId, file: "", status: "failed" as const, why })) });
  try { io.mkdirp(outDir); } catch { return failAll("mkdir-failed"); }
  if (io.isLinkOrNotDir(outDir)) return failAll("clips-dir-is-link-or-not-a-directory");
  const src = io.probe(probeCommand, mediaAbs);
  if (src === null || !(src.duration > 0)) return failAll("source-unprobeable");
  const ext = extname(mediaAbs).toLowerCase() || ".bin";
  for (const w of windows) {
    const file = clipFileName(w, ext);
    const out = join(outDir, file);
    const tmp = join(outDir, `${file.slice(0, file.length - ext.length)}.partial${ext}`);
    const fail = (why: string): void => { io.remove(tmp); outcomes.push({ turnId: w.turnId, file, status: "failed", why }); };
    const dur = w.tEnd - w.tStart;
    if (!Number.isFinite(w.tStart) || !Number.isFinite(dur) || w.tStart < 0 || dur <= 0) { fail("bad-window"); continue; }
    if (w.tStart >= src.duration) { fail("window-beyond-media"); continue; }
    const expected = Math.min(w.tEnd, src.duration) - w.tStart;
    if ((io.sizeOf(out) ?? 0) > 0) {
      if (clipValid(io.probe(probeCommand, out), expected)) { outcomes.push({ turnId: w.turnId, file, status: "exists" }); continue; }
      io.remove(out); // an existing but invalid clip is treated as missing
    }
    io.remove(tmp);
    const r = io.run(command, clipArgs(mediaAbs, w.tStart, dur, tmp));
    if (r.error !== undefined) { fail(r.error === "ENOENT" ? "ffmpeg-missing" : `spawn-${r.error}`); continue; }
    if (r.code !== 0) { fail(`ffmpeg-exit-${r.code ?? "signal"}`); continue; }
    if ((io.sizeOf(tmp) ?? 0) <= 0) { fail("empty-output"); continue; }
    if (!clipValid(io.probe(probeCommand, tmp), expected)) { fail("clip-failed-validation"); continue; }
    try { io.rename(tmp, out); } catch { fail("rename-failed"); continue; }
    outcomes.push({ turnId: w.turnId, file, status: "extracted" });
  }
  return { ok: outcomes.every((o) => o.status !== "failed"), outcomes };
}
