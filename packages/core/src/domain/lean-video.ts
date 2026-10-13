/**
 * packages/core/src/domain/lean-video.ts — T-035 slice 1 (UNWIRED). Pure builder for "lean video"
 * recording settings, a size estimator, and a mapping to the OBS websocket request shapes. No I/O.
 * Nothing imports this yet: the recorder (meeting-bot capture/obs/obs-windows.ts) is unchanged and
 * never calls it. Applying settings to a live OBS is a later unit.
 *
 * Source of numbers: TASKS.md T-035 "720p, low fps, under 400 MB per hour"; the live run measured
 * ~2.7 GB/hour. MB = 1,000,000 bytes (decimal, matching the 2.7 GB figure).
 * Convention: NEVER throws. Invalid input is clamped or defaulted and each change is reported in
 * `adjustments` (the same fail-closed-to-default style as the other pure policy builders).
 */
export type ContentHint = "slides" | "talking-head";
export interface LeanVideoInput {
  targetHeight?: number; aspectWidth?: number; aspectHeight?: number; fps?: number;
  contentHint?: ContentHint; videoBitrateKbps?: number; audioBitrateKbps?: number; audioChannels?: number;
}
export interface LeanVideoSettings {
  width: number; height: number; fps: number; videoBitrateKbps: number; videoCodec: "h264";
  keyframeIntervalSec: number; audioCodec: "aac"; audioBitrateKbps: number; audioChannels: 1 | 2;
  audioSampleRate: 48000; contentHint: ContentHint; adjustments: string[];
}

export const LEAN_TARGET_MB_PER_HOUR = 400;
/** Container (mp4/mkv) muxing overhead on top of the elementary streams: 2%. */
export const CONTAINER_OVERHEAD_FACTOR = 1.02;
export const MIN_HEIGHT = 240;
export const MAX_HEIGHT = 1080;
export const MIN_FPS = 1;
export const MAX_FPS = 30;
/** Below 100 kbps H.264 slides turn to mush; the cap keeps a typo (x10) from busting the target. */
export const MIN_VIDEO_KBPS = 100;
export const MAX_VIDEO_KBPS = 4000;
/** AAC under 32 kbps makes speech smeared/unintelligible; transcription depends on the audio. */
export const MIN_AUDIO_KBPS = 32;
export const MAX_AUDIO_KBPS = 192;
const DEFAULT_HEIGHT = 720;
const HINT_DEFAULTS: Record<ContentHint, { fps: number; videoKbps: number }> = {
  slides: { fps: 5, videoKbps: 500 },
  "talking-head": { fps: 15, videoKbps: 700 },
};
const DEFAULT_AUDIO_KBPS = 64;

function clampNum(v: unknown, lo: number, hi: number, dflt: number, name: string, adj: string[]): number {
  if (v === undefined) return dflt;
  if (typeof v !== "number" || !Number.isFinite(v)) { adj.push(`${name}: not a finite number, default ${dflt}`); return dflt; }
  if (v < lo) { adj.push(`${name}: ${v} below ${lo}, clamped`); return lo; }
  if (v > hi) { adj.push(`${name}: ${v} above ${hi}, clamped`); return hi; }
  return v;
}
const evenDown = (n: number): number => Math.max(2, 2 * Math.floor(n / 2));

export function buildLeanVideoSettings(input: LeanVideoInput = {}): LeanVideoSettings {
  const adj: string[] = [];
  const i = (input && typeof input === "object" ? input : {}) as LeanVideoInput;
  let hint: ContentHint = "slides";
  if (i.contentHint !== undefined) {
    if (i.contentHint === "slides" || i.contentHint === "talking-head") hint = i.contentHint;
    else adj.push("contentHint: unknown, default slides");
  }
  const d = HINT_DEFAULTS[hint];
  const height = evenDown(Math.round(clampNum(i.targetHeight, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT, "targetHeight", adj)));
  let aw = i.aspectWidth, ah = i.aspectHeight;
  const okDim = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
  if (aw === undefined && ah === undefined) { aw = 16; ah = 9; }
  else if (!okDim(aw) || !okDim(ah) || aw / ah < 0.25 || aw / ah > 4) { adj.push("aspect: invalid or outside 1:4..4:1, default 16:9"); aw = 16; ah = 9; }
  const width = evenDown(Math.round((height * (aw as number)) / (ah as number)));
  const fps = Math.round(clampNum(i.fps, MIN_FPS, MAX_FPS, d.fps, "fps", adj));
  const videoBitrateKbps = Math.round(clampNum(i.videoBitrateKbps, MIN_VIDEO_KBPS, MAX_VIDEO_KBPS, d.videoKbps, "videoBitrateKbps", adj));
  const audioBitrateKbps = Math.round(clampNum(i.audioBitrateKbps, MIN_AUDIO_KBPS, MAX_AUDIO_KBPS, DEFAULT_AUDIO_KBPS, "audioBitrateKbps", adj));
  let audioChannels: 1 | 2 = 1;
  if (i.audioChannels !== undefined) {
    if (i.audioChannels === 1 || i.audioChannels === 2) audioChannels = i.audioChannels;
    else adj.push("audioChannels: must be 1 or 2, default 1");
  }
  // ISS-T035LEAN-001: in-range overrides may still blow the target. Report it, never rewrite the caller's values.
  const mb = estimateSizeMbPerHour({ videoBitrateKbps, audioBitrateKbps });
  if (!isWithinLeanTarget(mb)) adj.push(`estimate ${mb.toFixed(1)} MB/h is not under the ${LEAN_TARGET_MB_PER_HOUR} MB/h target, settings kept as given`);
  return {
    width, height, fps, videoBitrateKbps, videoCodec: "h264", keyframeIntervalSec: 2,
    audioCodec: "aac", audioBitrateKbps, audioChannels, audioSampleRate: 48000, contentHint: hint, adjustments: adj,
  };
}

/** "Under 400 MB per hour" (TASKS.md T-035): strictly below the target; exactly 400, NaN and Infinity are NOT within. */
export function isWithinLeanTarget(mbPerHour: number): boolean {
  return typeof mbPerHour === "number" && Number.isFinite(mbPerHour) && mbPerHour < LEAN_TARGET_MB_PER_HOUR;
}

export interface LeanVideoAssessment { settings: LeanVideoSettings; estimateMbPerHour: number; withinTarget: boolean; targetMbPerHour: number }
/** Builder result plus the verdict on the target, from the same estimator and the FINAL (post-clamp) settings. */
export function assessLeanVideoSettings(input: LeanVideoInput = {}): LeanVideoAssessment {
  const settings = buildLeanVideoSettings(input);
  const estimateMbPerHour = estimateSizeMbPerHour(settings);
  return { settings, estimateMbPerHour, withinTarget: isWithinLeanTarget(estimateMbPerHour), targetMbPerHour: LEAN_TARGET_MB_PER_HOUR };
}

/** (video + audio kbps) * 1000 * overhead * 3600 s / 8 / 1e6. Monotonic in both bitrates. */
export function estimateSizeMbPerHour(s: Pick<LeanVideoSettings, "videoBitrateKbps" | "audioBitrateKbps">): number {
  const bps = (s.videoBitrateKbps + s.audioBitrateKbps) * 1000 * CONTAINER_OVERHEAD_FACTOR;
  return (bps * 3600) / 8 / 1_000_000;
}

export interface ObsLeanRequests {
  videoSettings: { baseWidth: number; baseHeight: number; outputWidth: number; outputHeight: number; fpsNumerator: number; fpsDenominator: number };
  profileParameters: Array<{ parameterCategory: string; parameterName: string; parameterValue: string }>;
}
/**
 * OBS websocket v5 request payloads (SetVideoSettings; SetProfileParameter for the SimpleOutput
 * VBitrate/ABitrate keys). base == output so the existing "fit window to baseWidth/baseHeight"
 * transform (obs-windows.ts) needs no rescale. Not sent anywhere; key names unverified on live OBS.
 */
export function toObsRequests(s: LeanVideoSettings): ObsLeanRequests {
  return {
    videoSettings: { baseWidth: s.width, baseHeight: s.height, outputWidth: s.width, outputHeight: s.height, fpsNumerator: s.fps, fpsDenominator: 1 },
    profileParameters: [
      { parameterCategory: "SimpleOutput", parameterName: "VBitrate", parameterValue: String(s.videoBitrateKbps) },
      { parameterCategory: "SimpleOutput", parameterName: "ABitrate", parameterValue: String(s.audioBitrateKbps) },
    ],
  };
}
