/** Capture finalization with current consent, actual source EOF and pre-upload privacy proof. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeLeanCapture } from '../lean-video-ffmpeg.js';
import { readCaptureTags } from "../autojoin/capture-tags.js";
import { prepareRecordFinalizerInput } from './record-consent/finalizer-input.js';
import { readRecordConsent } from './record-consent/receipt-store.js';
import { bindOriginalCapture } from './workspace/original-capture.js';
import { recordConsentSourceFields } from './record-consent/context.js';
import { runPrivateCaptureProvider } from './record-consent/provider-input.js';
import type { NativeFinalizedMedia } from './native/native-media-finalize.js';
import { prepareNativeFinalizerAudio, publishNativeCaptureTurns } from './native/native-capture-runtime.js';
import { sealFinalizedNativeCapture } from './native/native-archive-capture.js';
import type { NativeCaptureSealer } from './native/native-archive-join-types.js';
import type { QualifiedCaptureClock } from './tiles/native-measurement.js';
import { publishPrivateCaptureTurns } from './record-consent/downstream.js';
import { validateCaptureIndexProof } from '../workspace/index-proof-consumer.js';

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

/** Advisory measured MB/hour (decimal MB); undefined for unusable size/duration. */
export function measuredMbPerHour(sizeBytes: number, durationSec: number): number | undefined {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) return undefined;
  return sizeBytes / 1_000_000 / (durationSec / 3600);
}

function defaultExtractAudio(video: string, audioOut: string): void {
  execFileSync("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1",
    "-c:a", "aac", "-b:a", "96k", audioOut], { stdio: "inherit", timeout: 600000 });
}

function defaultMeasureVolume(audioPath: string): { maxDb: number; meanDb: number } {
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
function defaultRunTranscription(sessionId: string, input: SealedCaptureProviderInput): void {
  execFileSync('node', [path.join(REPO_ROOT, 'scripts', 'transcribe-long-session.mjs'), sessionId, '--capture-input-fd', '0'],
    { cwd: REPO_ROOT, env: { ...process.env, LKB_TRANSCRIPT_QA: '1' }, input: JSON.stringify(input),
      stdio: ['pipe', 'inherit', 'inherit'], timeout: 2 * 60 * 60 * 1000 });
}

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

export interface FinalizeRecordingOverrides {
  nativeArchive?: NativeCaptureSealer;
  nativeSidecarPath?: string;
  /** Process-private verified receiver/finalizer capability; never loaded from source JSON. */
  nativeMedia?: NativeFinalizedMedia;
  nativeMaxTotalBytes?: number;
  nativeCanonicalClock?: QualifiedCaptureClock;
  tenantId?: string;
  lean?: boolean;
  originalVideo?: string;
  recordDir?: string;
  probeMedia?: (video: string) => number; // actual container duration in seconds
  extractAudio?: (video: string, audioOut: string) => void;
  measureVolume?: (audioPath: string) => { maxDb: number; meanDb: number };
  runTranscription?: (sessionId: string, input: SealedCaptureProviderInput) => void;
  validateTranscription?: (sessionId: string) => void;
  repoRoot?: string; // a test's temp dir, so nothing is ever written into the real repo tree
  videoSizeBytes?: (video: string) => number; // T-035: defaults to statSync(video).size
}

/** Media → verified selected audio → silence gate → source.json → optional transcript/notification. */
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
  if(!overrides.nativeMedia&&existsSync(`${overrides.originalVideo??video}.native`))throw new Error("Native recovery requires private archive revalidation; legacy extraction refused");
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
  const consent=readRecordConsent(recordDir,{tenantId,sessionId});
  const {nativeAudio,nativeVideoReserve}=await prepareNativeFinalizerAudio({media:overrides.nativeMedia,maxTotalBytes:overrides.nativeMaxTotalBytes,
    canonicalClock:overrides.nativeCanonicalClock,recordDir,owner:{tenantId,sessionId},receipt:consent,video,probeMedia:overrides.probeMedia??defaultProbeMedia});
  const original=await bindOriginalCapture(overrides.originalVideo??video,video,recordDir);
  // A private source retains its original EOF, never an encoder-padded clock.
  if(consent.privateWindows.length)video=original.file;
  try {
    measuredDuration = nativeAudio?.durationSec ?? (overrides.probeMedia ?? defaultProbeMedia)(video);
    if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) {
      throw new Error(consent.privateWindows.length?"Original private capture timeline unavailable":"recording duration must be finite and positive");
    }
  } catch (error) {
    writeFileSync(path.join(dataDir, "validation.json"), JSON.stringify({ stage: "media", status: "failed",
      error: String(error) }, null, 2) + "\n");
    throw error;
  }
  const prepared = await prepareRecordFinalizerInput({ video, recordDir, owner: { tenantId, sessionId }, duration: measuredDuration,
    lean: overrides.lean, ...(overrides.nativeMedia?{nativeMedia:overrides.nativeMedia,canonicalClock:overrides.nativeCanonicalClock,nativeAudio}:{}) });
  await original.verify();
  if(prepared.receiptSha256!==createHash("sha256").update(JSON.stringify(consent)).digest("hex"))throw new Error("Capture consent changed during original source binding");
  video = prepared.publicVideo;
  if(nativeVideoReserve&&statSync(video).size>nativeVideoReserve)throw new Error("Native video mask exceeds reserved quota");

  try {
    const sizeBytes = (overrides.videoSizeBytes ?? ((v: string) => statSync(v).size))(video);
    const mbPerHour = measuredMbPerHour(sizeBytes, measuredDuration);
    if (mbPerHour !== undefined && !isWithinLeanTarget(mbPerHour)) {
      console.log(`[bot] recording size ${mbPerHour.toFixed(1)} MB/h is NOT under the ${LEAN_TARGET_MB_PER_HOUR} MB/h lean target`);
      telegram.notifyOverTarget?.({ title, sessionId, mbPerHour, targetMbPerHour: LEAN_TARGET_MB_PER_HOUR,
        sizeMb: sizeBytes / 1_000_000, durationSec: measuredDuration });
    }
  } catch (error) { console.log(`[bot] lean-target size check skipped: ${String(error)}`); }

  const audio = nativeAudio?.audioPath ?? path.join(recordDir, `${sessionId}.public-${randomUUID()}.m4a`);
  try { if(!nativeAudio)extractAudio(video, audio); } catch (error) { fail("audio", error); throw error; }
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
    hash: createHash("sha256").update(readFileSync(audio)).digest("hex"),
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
      originalVideoPath:toPosix(path.relative(root,original.file)),originalVideoSha256:original.sha256,
      sanitizedAudioSha256: createHash('sha256').update(readFileSync(audio)).digest('hex'),
      originalAudioPath: toPosix(path.relative(root, nativeAudio?.originalAudioPath??prepared.originalVideo)) },
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
        audioPath: audio, originalAudioPath: nativeAudio?.originalAudioPath??prepared.originalVideo,
        sanitizedSha256: sourceDoc.captureConsent.sanitizedAudioSha256,...(nativeAudio?{nativeAudio}:{}) },
        async (audioPath, checked) => {
          const generation = prepared.receipt.generation;
          if (!generation) throw new Error('Current capture generation required before provider dispatch');
          runTranscription(sessionId, { version: 1, tenantId, sessionId, audioPath, sha256: checked.sha256,
            receiptSha256: checked.receiptSha256, sourceSha256: createHash('sha256').update(readFileSync(path.join(dataDir, 'source.json'))).digest('hex'), generation });
        });
      if(nativeAudio)await publishNativeCaptureTurns(turnsPath,nativeAudio,prepared.receipt);else publishPrivateCaptureTurns(turnsPath,prepared.receipt);
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
  await sealFinalizedNativeCapture({ sealer: overrides.nativeArchive, media: overrides.nativeMedia, providerAudio: nativeAudio,
    maxTotalBytes: overrides.nativeMaxTotalBytes, sidecarPath: overrides.nativeSidecarPath,
    sourcePath: path.join(dataDir, 'source.json'), publicVideoPath: video, recordDir });
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
export function validateIndexProof(dir: string, sessionId: string, expectedWorkDb = process.env.MONGO_WORK_DB): Record<string, unknown> {
  return validateCaptureIndexProof(dir, sessionId, expectedWorkDb);
}
