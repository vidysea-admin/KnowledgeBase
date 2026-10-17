/** T-035: opt-in lean derivative. Originals are never rewritten or deleted.
 * Optional compression may fall back visibly. Required privacy masking fails
 * closed; the unchanged original is never returned as sanitized media. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, linkSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, statSync, type BigIntStats } from "node:fs";
import path from "node:path";

const TARGET = 400; // decimal MB/hour; equality fails
const MAX_DURATION = 4 * 3600;
const MAX_INPUT_BYTES = 8 * 1024 ** 3;
export interface LeanCommandResult { status: number | null; stdout?: string; stderr?: string; error?: Error }
export type LeanCommand = (command: string, args: string[], timeoutMs: number) => LeanCommandResult;
export interface PrivateMaskWindow { start: number; end: number }
export interface LeanCaptureOptions {
  enabled: boolean; log?: (message: string) => void; run?: LeanCommand; timeoutMs?: number;
  /** Only owner-bound receipt intervals from T011, on the exact source media clock. */
  privateWindows?: readonly PrivateMaskWindow[];
  requirePrivacyMask?: boolean;
}
interface Stream { codec_type?: string; codec_name?: string; nb_read_packets?: string; duration?: string; width?: number; height?: number; avg_frame_rate?: string; channels?: number; sample_rate?: string }
export interface LeanMedia { duration: number; streams: Stream[] }
const execute: LeanCommand = (command, args, timeout) => spawnSync(command, args,
  { encoding: "utf8", timeout, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, windowsHide: true });

/** Inspect every ancestor: a recording alias must not redirect into another source. */
function regularLocalFile(file: string): void {
  if (/^[\\/]{2}/.test(file) || (process.platform === "win32" && (!/^[a-z]:[\\/]$/i.test(path.parse(file).root) ||
      path.parse(file).root.slice(0, 2).toLowerCase() !== path.parse(path.resolve(process.cwd())).root.slice(0, 2).toLowerCase())) ||
    !path.isAbsolute(file) || !/\.(mkv|webm|mp4|mov)$/i.test(file) || /[\x00-\x1f]/.test(file) ||
    (process.platform === "win32" && file.slice(path.parse(file).root.length).includes(":"))) throw new Error("local recording path required");
  for (let current = file; ; current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("recording symlink refused");
    if (path.dirname(current) === current) break;
  }
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  if (canonical(realpathSync(file)) !== canonical(path.resolve(file)) || !statSync(file).isFile() || statSync(file).nlink !== 1) throw new Error("recording alias refused");
  const size = statSync(file).size;
  if (size <= 0 || size > MAX_INPUT_BYTES) throw new Error("recording size outside conversion bounds");
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs;
}
/** Bounded memory; pin the actual encoded bytes, not only their size. */
function sha256(file: string, expectedBytes: number): string {
  const fd = openSync(file, "r"), hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
  try {
    for (let left = expectedBytes; left > 0;) {
      const count = readSync(fd, buffer, 0, Math.min(left, buffer.length), null);
      if (count === 0) throw new Error("derivative shortened during hash");
      hash.update(buffer.subarray(0, count)); left -= count;
    }
    if (readSync(fd, buffer, 0, 1, null) !== 0) throw new Error("derivative grew during hash");
  }
  finally { closeSync(fd); }
  return hash.digest("hex");
}

export function probeLeanMedia(file: string, run: LeanCommand = execute): LeanMedia {
  regularLocalFile(file);
  const result = run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "matroska,webm,mov", "-count_packets",
    "-show_streams", "-show_format", "-of", "json", file], 120_000);
  if (result.error || result.status !== 0 || result.stderr?.trim()) throw new Error("media probe failed");
  const value = JSON.parse(result.stdout ?? "");
  const duration = Number(value.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION || !Array.isArray(value.streams)) throw new Error("media duration/streams outside bounds");
  for (const kind of ["audio", "video"]) {
    if (!value.streams.some((s: Stream) => s.codec_type === kind && s.codec_name && Number.isSafeInteger(Number(s.nb_read_packets)) && Number(s.nb_read_packets) > 0)) throw new Error(`media has no readable ${kind} packets`);
  }
  return { duration, streams: value.streams };
}

function maskWindows(raw: readonly PrivateMaskWindow[] | undefined, duration: number): PrivateMaskWindow[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 128) throw new Error("valid bounded privacy windows required");
  const sorted = raw.map((w) => {
    if (typeof w?.start !== "number" || typeof w?.end !== "number" || !Number.isFinite(w.start) || !Number.isFinite(w.end) ||
      w.start < 0 || w.end <= w.start || w.end > duration) throw new Error("privacy window outside actual media");
    return {start: w.start, end: w.end};
  }).sort((a, b) => a.start - b.start);
  const merged: PrivateMaskWindow[] = [];
  for (const window of sorted) {
    const prior = merged.at(-1);
    if (prior && window.start <= prior.end) prior.end = Math.max(prior.end, window.end);
    else merged.push(window);
  }
  return merged;
}
const number = (value: number) => value.toFixed(6);
function selection(windows: readonly PrivateMaskWindow[], duration: number, padding = 0): string {
  // A private suffix covers decoded EOF, including valid audio beyond stale format duration.
  return windows.map((w) => {
    const start = number(Math.max(0, w.start - padding - 0.000001));
    return w.end === duration ? `gte(t,${start})` : `between(t,${start},${number(Math.min(duration, w.end + padding + 0.000001))})`;
  }).join("+");
}
export function leanFfmpegArgs(input: string, output: string, duration: number, privateWindows?: readonly PrivateMaskWindow[]): string[] {
  const windows = privateWindows?.length ? maskWindows(privateWindows, duration) : [];
  let videoFilter = "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=tv,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=5,format=yuv420p,setparams=range=limited";
  const privacyOptions: string[] = [];
  if (windows.length) {
    // Cover the held 5fps frame and AAC transform boundaries, not only their start timestamps.
    videoFilter += `,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='gt(${selection(windows, duration, 0.2)},0)'`;
    // Independent private frames prevent lossy prediction residue from preceding public images.
    privacyOptions.push("-force_key_frames", `expr:gt(${selection(windows, duration, 0.2)},0)`,
      "-af", `aresample=48000,aformat=channel_layouts=mono,aeval=exprs='if(gt(${selection(windows, duration, 0.1)},0),0,val(0))':channel_layout=mono`);
  }
  return ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_threads", "1", "-filter_complex_threads", "1", "-xerror", "-err_detect", "explode", "-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "matroska,webm,mov", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0", "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1",
    "-vf", videoFilter, ...privacyOptions,
    "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-b:v", "500k", "-maxrate", "500k", "-bufsize", "1000k", "-g", "10",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "48000", "-movflags", "+faststart",
    "-fs", String(Math.ceil(duration * TARGET * 1_000_000 / 3600)), output];
}

function verifyPrivacy(file: string, windows: readonly PrivateMaskWindow[], media: LeanMedia, sourceDuration: number, run: LeanCommand): void {
  const duration = sourceDuration, videoDuration = Number(media.streams.find((s) => s.codec_type === "video")?.duration);
  const common = ["-nostdin", "-hide_banner", "-loglevel", "info", "-filter_threads", "1", "-xerror", "-err_detect", "explode",
    "-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov", "-i", file];
  const video = run("ffmpeg", [...common, "-map", "0:v:0", "-an", "-vf",
    `select='gt(${selection(windows, duration, 0.2)},0)',format=yuv420p`, "-fps_mode", "passthrough", "-threads", "1", "-f", "framemd5", "-"], 120_000);
  if (video.error || video.status !== 0) throw new Error("privacy video verification failed");
  const frame = Buffer.alloc(1280 * 720 * 1.5, 128); frame.fill(16, 0, 1280 * 720);
  const blackHash = createHash("md5").update(frame).digest("hex"), output = video.stdout ?? "";
  const timebase = /#tb\s+0:\s*(\d+)\/(\d+)/.exec(output);
  if (!timebase || Number(timebase[1]) <= 0 || Number(timebase[2]) <= 0) throw new Error("privacy video proof missing timebase");
  const expected = new Set<number>();
  for (let index = 0; index < Math.ceil(videoDuration * 5); index++) {
    const t = index / 5;
    if (windows.some((w) => t >= Math.max(0, w.start - 0.200001) && (w.end === duration || t <= Math.min(duration, w.end + 0.200001)))) expected.add(index);
  }
  const observed = new Set<number>();
  for (const line of output.split(/\r?\n/).filter((s) => s.trim() && !s.startsWith("#"))) {
    const fields = line.split(",").map((s) => s.trim());
    const index = Number(fields[2]) * Number(timebase[1]) / Number(timebase[2]) * 5;
    if (fields.length !== 6 || fields[0] !== "0" || !Number.isInteger(index) || !expected.has(index) || observed.has(index) ||
      Number(fields[4]) !== frame.length || fields[5] !== blackHash) throw new Error("private video is not fully black");
    observed.add(index);
  }
  if (!expected.size || observed.size !== expected.size) throw new Error("private video proof has a frame gap");
  const audio = run("ffmpeg", [...common, "-map", "0:a:0", "-vn", "-af",
    `aresample=48000,aformat=channel_layouts=mono,aeval=exprs='if(gt(${selection(windows, duration)},0),val(0),0)':channel_layout=mono,volumedetect`, "-f", "null", "-"], 120_000);
  const rawPeak = /max_volume:\s*(-?(?:[\d.]+|inf)) dB/.exec(audio.stderr ?? "")?.[1];
  const peak = rawPeak === "-inf" ? -Infinity : Number(rawPeak);
  if (audio.error || audio.status !== 0 || !(peak === -Infinity || (Number.isFinite(peak) && peak <= -80))) throw new Error("private audio is not silent");
}

function verifyDerivative(media: LeanMedia, sourceDuration: number, sizeBytes: number): void {
  const tolerance = 0.25; // one 5-fps frame plus audio padding, never proportional truncation
  if (media.streams.length !== 2 || media.streams.filter((s) => s.codec_type === "audio").length !== 1 ||
    media.streams.filter((s) => s.codec_type === "video").length !== 1) throw new Error("derivative has unexpected streams");
  if (Math.abs(media.duration - sourceDuration) > tolerance) throw new Error("derivative duration differs from original");
  for (const stream of media.streams.filter((s) => s.codec_type === "audio" || s.codec_type === "video")) {
    const duration = Number(stream.duration);
    if (!Number.isFinite(duration) || Math.abs(duration - sourceDuration) > tolerance) throw new Error("derivative track duration differs from original");
  }
  const video = media.streams.find((s) => s.codec_type === "video")!;
  const audio = media.streams.find((s) => s.codec_type === "audio")!;
  const [num, den] = (video.avg_frame_rate ?? "").split("/").map(Number);
  if (video.width !== 1280 || video.height !== 720 || video.codec_name !== "h264" || !(num! > 0 && den! > 0) || num! / den! > 5 ||
    audio.codec_name !== "aac" || audio.channels !== 1 || audio.sample_rate !== "48000") throw new Error("derivative encoder settings not verified");
  if (!(sizeBytes > 0 && sizeBytes / 1_000_000 * 3600 / media.duration < TARGET)) throw new Error("derivative is not under 400 MB/hour");
}

export function normalizeLeanCapture(input: string, options: LeanCaptureOptions): string {
  const required = options.requirePrivacyMask === true || (options.privateWindows !== undefined &&
    (!Array.isArray(options.privateWindows) || options.privateWindows.length > 0));
  if (!options.enabled && !required) return input;
  const log = options.log ?? console.warn;
  const run = options.run ?? execute;
  let scratch: string | undefined;
  let scratchIdentity: BigIntStats | undefined;
  const ownedScratch = () => {
    if (!scratch || !scratchIdentity) throw new Error("missing scratch ownership");
    const current = lstatSync(scratch, {bigint: true});
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== scratchIdentity.dev || current.ino !== scratchIdentity.ino) throw new Error("scratch ownership changed");
  };
  const started = Date.now();
  try {
    regularLocalFile(input);
    const original = statSync(input, {bigint: true});
    const output = input.replace(/\.(mkv|webm|mp4|mov)$/i, required ? ".private.lean.mp4" : ".lean.mp4");
    if (output === input || existsSync(output)) throw new Error("lean destination already exists");
    const source = probeLeanMedia(input, run);
    if (source.streams.filter((s) => s.codec_type === "audio" || s.codec_type === "video").length !== 2) throw new Error("single audio/video capture required");
    const windows = required ? maskWindows(options.privateWindows, source.duration) : [];
    scratch = mkdtempSync(path.join(path.dirname(input), ".lean-video-"));
    scratchIdentity = lstatSync(scratch, {bigint: true});
    const candidate = path.join(scratch, "recording.mp4");
    const timeout = Math.min(3_600_000, Math.max(1000, options.timeoutMs ?? 600_000));
    if (!Number.isFinite(timeout)) throw new Error("invalid conversion timeout");
    ownedScratch();
    const result = run("ffmpeg", leanFfmpegArgs(input, candidate, source.duration, windows), timeout);
    if (result.error || result.status !== 0 || result.stderr?.trim()) throw new Error("lean encoder failed or timed out");
    ownedScratch();
    regularLocalFile(candidate);
    const candidateIdentity = statSync(candidate, {bigint: true}), bytes = Number(candidateIdentity.size);
    if (bytes / 1_000_000 * 3600 / source.duration >= TARGET) throw new Error("derivative is not under 400 MB/hour");
    const fingerprint = sha256(candidate, bytes);
    const measured = probeLeanMedia(candidate, run);
    verifyDerivative(measured, source.duration, bytes);
    const decoded = run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-xerror", "-err_detect", "explode",
      "-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov", "-i", candidate, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], 120_000);
    if (decoded.error || decoded.status !== 0 || decoded.stderr?.trim()) throw new Error("derivative decode failed");
    if (required) verifyPrivacy(candidate, windows, measured, source.duration, run);
    ownedScratch(); regularLocalFile(candidate);
    if (!sameFile(candidateIdentity, statSync(candidate, {bigint: true})) || fingerprint !== sha256(candidate, bytes)) throw new Error("derivative changed during verification");
    regularLocalFile(input);
    const after = statSync(input, {bigint: true});
    if (!sameFile(after, original)) throw new Error("original recording changed during conversion");
    // Hard-link creation is exclusive (EEXIST instead of replacing an existing destination).
    linkSync(candidate, output);
    log(`[bot] ${required ? "private masked" : "lean"} derivative verified: ${bytes} bytes, ${measured.duration}s, ${(bytes / 1_000_000 * 3600 / measured.duration).toFixed(1)} MB/h; original ${original.size} bytes retained; encode ${Date.now() - started}ms`);
    return output;
  } catch (error) {
    if (required) {
      log("[bot] required privacy masking failed; original retained privately, publication refused");
      throw new Error(`required privacy masking failed: ${error instanceof Error ? error.message : "conversion failed"}`);
    }
    log(`[bot] lean derivative unavailable; using retained original: ${error instanceof Error ? error.message : "conversion failed"}`);
    return input;
  } finally {
    if (scratch) {
      try {
        ownedScratch();
        const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
        if (path.dirname(scratch) !== path.resolve(path.dirname(input)) || !path.basename(scratch).startsWith(".lean-video-") ||
          lstatSync(scratch).isSymbolicLink() || canonical(realpathSync(scratch)) !== canonical(path.resolve(scratch))) throw new Error("scratch alias refused");
        rmSync(scratch, { recursive: true, force: true });
      } catch { log("[bot] lean scratch cleanup failed; original retained"); }
    }
  }
}
