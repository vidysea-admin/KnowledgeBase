/**
 * packages/meeting-bot/src/capture/record-finalize.ts — the finalize body split out of
 * record-commands.ts (T-033, ISS-300): adding a test seam there pushed it over the file's own
 * 300-LOC budget (the same reason `cli.ts` was originally split — see record-commands.ts's own
 * header). `finalizeRecording` in record-commands.ts keeps T-030's exact param list
 * (wave/t-030-telegram-alerts, 883c7b2/1649da9) and delegates to `finalizeRecordingWith` here.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeLeanCapture } from '../lean-video-ffmpeg.js';
import { readCaptureTags } from "../autojoin/capture-tags.js";
import { prepareRecordFinalizerInput } from './record-consent/finalizer-input.js';
import { recordConsentSourceFields } from './record-consent/context.js';
import { runPrivateCaptureProvider } from './record-consent/provider-input.js';
import { publishPrivateCaptureTurns } from './record-consent/downstream.js';

import { gapsForSourceDoc, type GapWindow } from "./reconnect-gaps.js";
import { createTelegramNotifier, readTurnCount, type TelegramNotifier } from "./notify/telegram-alerts.js";
// Deep import: packages/core/src/index.ts does not re-export lean-video yet (ISS-LEANWIRE-001).
import { isWithinLeanTarget, LEAN_TARGET_MB_PER_HOUR } from "@lkb/core/src/domain/lean-video.js";

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

/** T-035: measured MB/hour of a finished recording (MB = 1,000,000 bytes, as lean-video's estimator).
 * undefined when size or duration is unusable — the check is advisory and never fails a finalize. */
export function measuredMbPerHour(sizeBytes: number, durationSec: number): number | undefined {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) return undefined;
  return sizeBytes / 1_000_000 / (durationSec / 3600);
}

function defaultExtractAudio(video: string, audioOut: string): void {
  execFileSync("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1",
    "-c:a", "aac", "-b:a", "96k", audioOut], { stdio: "inherit", timeout: 600000 });
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

export interface SealedCaptureProviderInput {
  version: 1; tenantId: string; sessionId: string; audioPath: string; sha256: string;
  receiptSha256: string; sourceSha256: string; generation: string;
}
function defaultRunTranscription(sessionId: string, input: SealedCaptureProviderInput): void {
  execFileSync('node', [path.join(REPO_ROOT, 'scripts', 'transcribe-long-session.mjs'), sessionId, '--capture-input-fd', '0'],
    { cwd: REPO_ROOT, env: { ...process.env, LKB_TRANSCRIPT_QA: '1' }, input: JSON.stringify(input),
      stdio: ['pipe', 'inherit', 'inherit'], timeout: 2 * 60 * 60 * 1000 });
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
  /** Actual selected slot; global capture tags deliberately use the separate root directory. */
  recordDir?: string;
  probeMedia?: (video: string) => number; // actual container duration in seconds
  extractAudio?: (video: string, audioOut: string) => void;
  measureVolume?: (audioPath: string) => { maxDb: number; meanDb: number };
  runTranscription?: (sessionId: string, input: SealedCaptureProviderInput) => void;
  validateTranscription?: (sessionId: string) => void;
  repoRoot?: string; // a test's temp dir, so nothing is ever written into the real repo tree
  videoSizeBytes?: (video: string) => number; // T-035: defaults to statSync(video).size
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
): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid sessionId");
  const tenantId = overrides.tenantId ?? process.env.LKB_TENANT_ID;
  if (!tenantId) throw new Error('Explicit capture tenant required');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId)) throw new Error("invalid capture tenant");
  const root = overrides.repoRoot ?? REPO_ROOT;
  const tagDir = overrides.repoRoot ? path.join(root, 'raw', 'webinars') : RECORD_DIR;
  const recordDir = overrides.recordDir ?? tagDir;
  const recordRelative = path.relative(root, recordDir);
  if (!path.isAbsolute(recordDir) || !recordRelative || recordRelative.startsWith('..') || path.isAbsolute(recordRelative)) throw new Error('Capture slot must be confined to the configured repository');
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
  const prepared = await prepareRecordFinalizerInput({ video, recordDir, owner: { tenantId, sessionId }, duration: measuredDuration });
  video = prepared.publicVideo;

  // T-035: flag a finished recording that is not under the lean target. Advisory: never throws.
  try {
    const sizeBytes = (overrides.videoSizeBytes ?? ((v: string) => statSync(v).size))(video);
    const mbPerHour = measuredMbPerHour(sizeBytes, measuredDuration);
    if (mbPerHour !== undefined && !isWithinLeanTarget(mbPerHour)) {
      console.log(`[bot] recording size ${mbPerHour.toFixed(1)} MB/h is NOT under the ${LEAN_TARGET_MB_PER_HOUR} MB/h lean target`);
      telegram.notifyOverTarget?.({ title, sessionId, mbPerHour, targetMbPerHour: LEAN_TARGET_MB_PER_HOUR,
        sizeMb: sizeBytes / 1_000_000, durationSec: measuredDuration });
    }
  } catch (error) { console.log(`[bot] lean-target size check skipped: ${String(error)}`); }

  const audio = path.join(recordDir, `${sessionId}.public-${randomUUID()}.m4a`);
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
    ...readCaptureTags(tagDir, sessionId),
    ...recordConsentSourceFields(prepared.receipt),
    captureConsent: { recordDir: toPosix(recordRelative), sessionId, generation: prepared.receipt.generation, meetingHash: prepared.receipt.meetingHash,
      receiptSha256: prepared.receiptSha256, publicVideoSha256: prepared.publicVideoSha256,
      sanitizedAudioSha256: createHash('sha256').update(readFileSync(audio)).digest('hex'),
      originalAudioPath: toPosix(path.relative(root, prepared.originalVideo)) },
    guardedPrivateWindows: { audio: prepared.audioPrivacyWindows, video: prepared.videoPrivacyWindows },
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
      await runPrivateCaptureProvider({ receipt: prepared.receipt, owner: { tenantId, sessionId }, duration: measuredDuration,
        audioPath: audio, originalAudioPath: prepared.originalVideo, sanitizedSha256: sourceDoc.captureConsent.sanitizedAudioSha256 },
        async (audioPath, checked) => {
          const generation = prepared.receipt.generation;
          if (!generation) throw new Error('Current capture generation required before provider dispatch');
          runTranscription(sessionId, { version: 1, tenantId, sessionId, audioPath, sha256: checked.sha256,
            receiptSha256: checked.receiptSha256, sourceSha256: createHash('sha256').update(readFileSync(path.join(dataDir, 'source.json'))).digest('hex'), generation });
        });
      publishPrivateCaptureTurns(turnsPath, prepared.receipt);
      validateTranscript(turnsPath, measuredDuration);
      if (overrides.validateTranscription) overrides.validateTranscription(sessionId);
      else execFileSync('node', [path.join(REPO_ROOT, 'scripts', 'webinar', 'validate', 'validate-session.mjs'), sessionId, '--root', root], { cwd: root, stdio: 'inherit', timeout: 120000 });
    } catch (error) {
      writeFileSync(path.join(dataDir, "validation.json"), JSON.stringify({ stage: "transcript", status: "failed",
        durationSec: measuredDuration, error: String(error) }, null, 2) + "\n");
      throw error;
    }
  }
  if (!transcribe) writeFileSync(path.join(dataDir, 'validation.json'), JSON.stringify({ status: 'passed', durationSec: measuredDuration, transcriptValidated: false }, null, 2) + '\n');
  // T-030: finished + transcript-ready summary — no LLM call, turnCount is turns.json's own length.
  telegram.notifyFinished({
    title, sessionId, durationSec: measuredDuration, gapCount: gaps.length,
    transcriptPath: transcribe ? toPosix(path.relative(root, turnsPath)) : undefined,
    turnCount: transcribe ? readTurnCount(turnsPath) : undefined,
  });
  return video;
}

export function normalizeCapture(video: string, lean = false): string {
  if (!video.endsWith(".webm") || video.endsWith(".playable.webm")) return normalizeLeanCapture(video, { enabled: lean, log: message => console.log(message) });
  const output = video.slice(0, -5) + ".playable.webm";
  if (existsSync(output)) throw new Error('WebM finalization destination already exists; original retained');
  const normalized = spawnSync("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", video,
    "-c", "copy", output], { stdio: "inherit", timeout: 600_000 });
  if (normalized.status !== 0) throw new Error("WebM finalization failed; original stream retained");
  return normalizeLeanCapture(output, { enabled: lean, log: message => console.log(message) });
}
export function processRecordingArtifacts(video: string, sessionId: string, rest: string[]): void {
  if (!rest.includes("--process-video")) return;
  if (!rest.includes("--transcribe")) throw new Error("--process-video requires --transcribe");
  const state = path.join(REPO_ROOT, "data", "toc-migrated", sessionId, "pipeline-state.json");
  let stage = "screen";
  let proof: Record<string, unknown> | undefined;
  const report = (status: string, error?: string) => writeFileSync(state, JSON.stringify({ ...proof, sessionId, stage, status, error, updatedAt: new Date().toISOString() }) + "\n");
  report("processing");
  try {
    const processed = spawnSync("node", [path.join(REPO_ROOT, "scripts", "webinar", "process-video.mjs"),
      sessionId, "--recording", path.relative(REPO_ROOT, video)], { cwd: REPO_ROOT, stdio: "inherit", timeout: 3_600_000 });
    if (processed.status !== 0) throw new Error("screen processing failed; recording retained for retry");
    if (rest.includes("--index")) {
      stage = "index"; report("processing");
      const indexed = spawnSync("node", [path.join(REPO_ROOT, "scripts", "webinar", "sync-session.mjs"),
        sessionId, "--emit-files", "--index"], { cwd: REPO_ROOT, stdio: "inherit", timeout: 3_600_000 });
      if (indexed.status !== 0) throw new Error("knowledge indexing failed; retry from retained artifacts");
      proof = validateIndexProof(path.dirname(state), sessionId);
    }
    report("done");
  } catch (error) { report("failed", String(error)); throw error; }
}
export function validateIndexProof(dir: string, sessionId: string): Record<string, unknown> {
  const read = (name: string) => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
  const proof = read("index-proof.json"), source = read("source.json");
  const inputHash = createHash("sha256").update(readFileSync(path.join(dir, "knowledge-turns.json"))).digest("hex");
  if (proof.version !== 2 || proof.sessionId !== sessionId || proof.tenantId !== source.tenantId || proof.inputHash !== inputHash ||
    !proof.generation || proof.strict !== true || proof.status !== "done" || proof.semanticSupport !== "passed" ||
    !Number.isInteger(proof.turnCount) || proof.turnCount <= 0 || ["summary", "claims", "chunks", "tree"].some((key) => proof[key] !== "done")) {
    throw new Error("required fresh strict index proof unavailable");
  }
  return proof;
}
