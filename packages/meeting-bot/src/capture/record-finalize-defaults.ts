/** Default I/O helpers for record-finalize (ffmpeg/ffprobe/transcription spawns, transcript validation). Moved verbatim to keep record-finalize within the LOC budget. */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");

export function defaultExtractAudio(video: string, audioOut: string): void {
  execFileSync("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1",
    "-c:a", "aac", "-b:a", "96k", audioOut], { stdio: "inherit", timeout: 600000 });
}

export function defaultMeasureVolume(audioPath: string): { maxDb: number; meanDb: number } {
  // Silent captures are never transcribed: the provider can hallucinate turns from silence.
  const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", audioPath, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" });
  const maxDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  const meanDb = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  return { maxDb, meanDb };
}

export interface SealedCaptureProviderInput {
  version: 1; tenantId: string; sessionId: string; audioPath: string; sha256: string;
  receiptSha256: string; sourceSha256: string; generation: string;
}
export function defaultRunTranscription(sessionId: string, input: SealedCaptureProviderInput): void {
  execFileSync('node', [path.join(REPO_ROOT, 'scripts', 'transcribe-long-session.mjs'), sessionId, '--capture-input-fd', '0'],
    { cwd: REPO_ROOT, env: { ...process.env, LKB_TRANSCRIPT_QA: '1' }, input: JSON.stringify(input),
      stdio: ['pipe', 'inherit', 'inherit'], timeout: 2 * 60 * 60 * 1000 });
}

export function defaultProbeMedia(video: string): number {
  const probe = spawnSync("ffprobe", ["-v", "error", "-count_packets", "-show_streams",
    "-show_format", "-of", "json", video], { encoding: "utf8", timeout: 120_000 });
  if (probe.error || probe.status !== 0 || probe.stderr.trim()) throw new Error(`recording probe failed: ${probe.error?.message ?? probe.stderr}`);
  const media = JSON.parse(probe.stdout);
  const duration = Number(media.format?.duration);
  for (const kind of ["audio", "video"]) {
    if (!media.streams?.some((s: { codec_type?: string; nb_read_packets?: string; codec_name?: string }) =>
      s.codec_type === kind && s.codec_name && Number(s.nb_read_packets) > 0)) {
      throw new Error(`recording has no readable ${kind} packets`);
    }
  }
  return duration;
}

export function validateTranscript(turnsPath: string, duration: number): void {
  const turns: unknown = JSON.parse(readFileSync(turnsPath, "utf8"));
  if (!Array.isArray(turns) || turns.length === 0) throw new Error("transcript must contain turns");
  for (const [index, turn] of turns.entries()) {
    const { tStart, tEnd, text } = turn ?? {};
    if (typeof tStart !== "number" || typeof tEnd !== "number" || !Number.isFinite(tStart) ||
      !Number.isFinite(tEnd) || tStart < 0 || tEnd <= tStart || tEnd > duration ||
      typeof text !== "string" || !text.trim()) {
      throw new Error(`transcript turn ${index} has invalid timing/text for ${duration}s media`);
    }
  }
}
