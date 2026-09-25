/**
 * packages/meeting-bot/src/capture/record-finalize.ts — the finalize body split out of
 * record-commands.ts (T-033, ISS-300): adding a test seam there pushed it over the file's own
 * 300-LOC budget (the same reason `cli.ts` was originally split — see record-commands.ts's own
 * header). `finalizeRecording` in record-commands.ts keeps T-030's exact param list
 * (wave/t-030-telegram-alerts, 883c7b2/1649da9) and delegates to `finalizeRecordingWith` here.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Test seam (T-033, ISS-300): every field defaults to REAL production behaviour unchanged, so
 * every in-repo caller (`finalizeRecording`, no overrides arg) is exactly today's code path. */
export interface FinalizeRecordingOverrides {
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
  const root = overrides.repoRoot ?? REPO_ROOT;
  const recordDir = overrides.repoRoot ? path.join(root, "raw", "webinars") : RECORD_DIR;
  const extractAudio = overrides.extractAudio ?? defaultExtractAudio;
  const measureVolume = overrides.measureVolume ?? defaultMeasureVolume;
  const runTranscription = overrides.runTranscription ?? defaultRunTranscription;

  const audio = path.join(recordDir, `${sessionId}.m4a`);
  extractAudio(video, audio);
  console.log(`[bot] audio → ${audio}`);

  const { maxDb, meanDb } = measureVolume(audio);
  const silent = isSilentCapture(maxDb);
  console.log(`[bot] audio level: max ${maxDb} dB, mean ${meanDb} dB${silent ? "  ← SILENT" : ""}`);

  const dataDir = path.join(root, "data", "toc-migrated", sessionId);
  mkdirSync(dataDir, { recursive: true });
  const sourceDoc = {
    _id: `${sessionId}-src`,
    tenantId: "vidysea",
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
    throw new Error(`recording is silent (max ${maxDb} dB) — not transcribing; the capture did not hear the bot window`);
  }
  const turnsPath = path.join(dataDir, "turns.json");
  if (transcribe) {
    runTranscription(sessionId);
  }
  // T-030: finished + transcript-ready summary — no LLM call, turnCount is turns.json's own length.
  telegram.notifyFinished({
    title, sessionId, durationSec: durationSec ?? 0, gapCount: gaps.length,
    transcriptPath: transcribe ? toPosix(path.relative(root, turnsPath)) : undefined,
    turnCount: transcribe ? readTurnCount(turnsPath) : undefined,
  });
}
