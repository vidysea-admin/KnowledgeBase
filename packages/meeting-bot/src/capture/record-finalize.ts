/**
 * packages/meeting-bot/src/capture/record-finalize.ts — the finalize body split out of
 * record-commands.ts (T-033, ISS-300): adding a test seam there pushed it over the file's own
 * 300-LOC budget (the same reason `cli.ts` was originally split — see record-commands.ts's own
 * header). `finalizeRecording` in record-commands.ts keeps T-030's exact param list
 * (wave/t-030-telegram-alerts, 883c7b2/1649da9) and delegates to `finalizeRecordingWith` here.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { gapsForSourceDoc, type GapWindow } from "./reconnect-gaps.js";
import { createTelegramNotifier, readTurnCount, type TelegramNotifier } from "./telegram-alerts.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const RECORD_DIR = path.join(REPO_ROOT, "raw", "webinars");
/** Below this peak level the capture heard nothing (digital silence measured at -91 dB). */
const SILENCE_MAX_DB = -50;

const toPosix = (p: string) => p.split(path.sep).join("/");

/** Strictly-below-threshold predicate the finalize path applies to ffmpeg's measured max_volume.
 * Exported for tests (T-033): AT the boundary (-50) is not silent, below it (-50.1) is. */
export function isSilentCapture(maxDb: number): boolean {
  return maxDb < SILENCE_MAX_DB;
}

function defaultExtractAudio(video: string, audioOut: string): void {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1",
    "-c:a", "aac", "-b:a", "96k", audioOut], { stdio: "inherit" });
}

function defaultMeasureVolume(audioPath: string): { maxDb: number; meanDb: number } {
  // Silence gate. Measured 2026-09-24: a silent (-91 dB) capture sent to Gemini came back as 18
  // fluent, invented turns. A KB must never ingest that, so silent audio is never transcribed.
  const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", audioPath, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" });
  const maxDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  const meanDb = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  return { maxDb, meanDb };
}

function defaultRunTranscription(sessionId: string): void {
  execFileSync("node", [path.join(REPO_ROOT, "scripts", "transcribe-long-session.mjs"), sessionId],
    { cwd: REPO_ROOT, stdio: "inherit" });
}

/** Read packets as well as headers: an empty stream declaration is not a capture. */
function defaultProbeMedia(video: string): number {
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

function validateTranscript(turnsPath: string, duration: number): void {
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

/** Test seam (T-033, ISS-300): every field defaults to REAL production behaviour unchanged, so
 * every in-repo caller (`finalizeRecording`, no overrides arg) is exactly today's code path. */
export interface FinalizeRecordingOverrides {
  tenantId?: string;
  probeMedia?: (video: string) => number; // actual container duration in seconds
  extractAudio?: (video: string, audioOut: string) => void;
  measureVolume?: (audioPath: string) => { maxDb: number; meanDb: number };
  runTranscription?: (sessionId: string) => void;
  repoRoot?: string; // a test's temp dir, so nothing is ever written into the real repo tree
}

/** Recording file → m4a → silence gate → source.json → (optional) transcript → T-030 Telegram
 * "finished" summary. Shared by `record` and `finalize` (the recovery path when the controlling
 * process died mid-run). `finalizeRecording` (record-commands.ts) is a thin pass-through with
 * today's defaults, kept param-list-stable for T-030 (see `FinalizeRecordingOverrides` above). */
export async function finalizeRecordingWith(
  overrides: FinalizeRecordingOverrides,
  video: string, sessionId: string, title: string, platform: string, transcribe: boolean,
  gaps: GapWindow[] = [], // T-029: [] on the `finalize` recovery path — no live event stream to draw from there
  // T-030: defaults to a fresh notifier when called from the `finalize` recovery path (runFinalize
  // never builds its own — record-commands.ts loads TELEGRAM_* from .env before either call).
  // A test never sets TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, so the default notifier is `enabled:
  // false` and every call below is a guaranteed no-op — never a live send (contract C6).
  telegram: TelegramNotifier = createTelegramNotifier(),
  durationSec?: number, // T-030: unknown (0) on the `finalize` recovery path — no live startedAt there
): Promise<void> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid sessionId");
  const tenantId = overrides.tenantId ?? "vidysea";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId)) throw new Error("invalid capture tenant");
  const root = overrides.repoRoot ?? REPO_ROOT;
  const recordDir = overrides.repoRoot ? path.join(root, "raw", "webinars") : RECORD_DIR;
  const extractAudio = overrides.extractAudio ?? defaultExtractAudio;
  const measureVolume = overrides.measureVolume ?? defaultMeasureVolume;
  const runTranscription = overrides.runTranscription ?? defaultRunTranscription;

  const dataDir = path.join(root, "data", "toc-migrated", sessionId);
  const priorSource = path.join(dataDir, "source.json");
  if (existsSync(priorSource)) {
    for (let current = path.resolve(priorSource); ; current = path.dirname(current)) {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Prior capture source symlink refused");
      if (path.dirname(current) === current) break;
    }
    if (!statSync(priorSource).isFile() || statSync(priorSource).size > 5 * 1024 * 1024) throw new Error("Prior capture source exceeds bounds");
    const prior = JSON.parse(readFileSync(priorSource, "utf8"));
    if (prior.tenantId !== tenantId) throw new Error("Existing capture belongs to a different tenant");
    if (prior._id !== `${sessionId}-src` || (prior.gaps !== undefined && !Array.isArray(prior.gaps))) throw new Error("Prior capture source identity invalid");
    const canonical = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    const retained: GapWindow[] = [];
    for (const gap of prior.gaps ?? []) {
      if (typeof gap?.reason !== "string" || !gap.reason.startsWith("capture-control-")) continue;
      if (!["capture-control-cancelled", "capture-control-rescheduled", "capture-control-controller-disconnected"].includes(gap.reason) ||
        !canonical(gap.start) || !canonical(gap.end) || gap.end < gap.start || gap.recovered !== false) throw new Error("Prior capture control evidence invalid");
      retained.push({start: Date.parse(gap.start) / 1000, end: Date.parse(gap.end) / 1000, reason: gap.reason, recovered: false});
    }
    gaps = [...new Map([...retained, ...gaps].map(gap => [JSON.stringify([gap.start, gap.end, gap.reason, gap.recovered]), gap])).values()];
  }
  mkdirSync(dataDir, { recursive: true });
  const validationPath = path.join(dataDir, "validation.json");
  const fail = (stage: string, error: unknown) => writeFileSync(validationPath,
    JSON.stringify({ stage, status: "failed", error: String(error) }, null, 2) + "\n");
  writeFileSync(validationPath, JSON.stringify({ stage: "media", status: "processing" }, null, 2) + "\n");
  let measuredDuration: number;
  try {
    measuredDuration = (overrides.probeMedia ?? defaultProbeMedia)(video);
    if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) {
      throw new Error("recording duration must be finite and positive");
    }
  } catch (error) {
    writeFileSync(path.join(dataDir, "validation.json"), JSON.stringify({ stage: "media", status: "failed",
      error: String(error) }, null, 2) + "\n");
    throw error;
  }

  const audio = path.join(recordDir, `${sessionId}.m4a`);
  try { extractAudio(video, audio); } catch (error) { fail("audio", error); throw error; }
  console.log(`[bot] audio → ${audio}`);

  let volume: { maxDb: number; meanDb: number };
  try {
    volume = measureVolume(audio);
    if (!Number.isFinite(volume.maxDb) || !Number.isFinite(volume.meanDb)) throw new Error("invalid audio volume measurement");
  } catch (error) { fail("audio", error); throw error; }
  const { maxDb, meanDb } = volume;
  const silent = isSilentCapture(maxDb);
  console.log(`[bot] audio level: max ${maxDb} dB, mean ${meanDb} dB${silent ? "  ← SILENT" : ""}`);

  const sourceDoc = {
    _id: `${sessionId}-src`,
    tenantId,
    kind: "recording",
    // schema/sources.schema.json requires hash (unique index {tenantId, hash}).
    hash: createHash("sha256").update(readFileSync(audio)).digest("hex"),
    captureMode: "silent",
    title,
    platform,
    path: toPosix(path.relative(root, video)),
    audioPath: toPosix(path.relative(root, audio)),
    audioLevel: { maxDb, meanDb, silent },
    gaps: gapsForSourceDoc(gaps), // T-029: forced-disconnect windows recovered mid-run, if any
    consent: {
      given: true,
      recordedBy: "Umesh Sugara (registered attendee) via LKB bot",
      note: "attendee-side capture for internal KB use; organizer recording not available to attendees",
      confirmedNoAlternative: true,
    },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dataDir, "source.json"), JSON.stringify(sourceDoc, null, 2) + "\n");
  console.log(`[bot] registered session ${sessionId}`);

  if (silent) {
    const error = new Error(`recording is silent (max ${maxDb} dB) — not transcribing; the capture did not hear the bot window`);
    fail("audio", error);
    throw error;
  }
  const turnsPath = path.join(dataDir, "turns.json");
  if (transcribe) {
    try {
      runTranscription(sessionId);
      validateTranscript(turnsPath, measuredDuration);
    } catch (error) {
      writeFileSync(path.join(dataDir, "validation.json"), JSON.stringify({ stage: "transcript", status: "failed",
        durationSec: measuredDuration, error: String(error) }, null, 2) + "\n");
      throw error;
    }
  }
  writeFileSync(path.join(dataDir, "validation.json"), JSON.stringify({ status: "passed",
    durationSec: measuredDuration, transcriptValidated: transcribe }, null, 2) + "\n");
  // T-030: finished + transcript-ready summary — no LLM call, turnCount is turns.json's own length.
  telegram.notifyFinished({
    title, sessionId, durationSec: measuredDuration, gapCount: gaps.length,
    transcriptPath: transcribe ? toPosix(path.relative(root, turnsPath)) : undefined,
    turnCount: transcribe ? readTurnCount(turnsPath) : undefined,
  });
}

export function normalizeCapture(video: string): string {
  if (!video.endsWith(".webm") || video.endsWith(".playable.webm")) return video;
  const output = video.slice(0, -5) + ".playable.webm";
  const normalized = spawnSync("ffmpeg", ["-y", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", video,
    "-c", "copy", output], { stdio: "inherit", timeout: 600_000 });
  if (normalized.status !== 0) throw new Error("WebM finalization failed; original stream retained");
  return output;
}
