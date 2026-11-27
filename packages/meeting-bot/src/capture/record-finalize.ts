/** Capture finalization with current consent, actual source EOF and pre-upload privacy proof. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, lstatSync, openSync, readSync, closeSync, ftruncateSync, writeSync } from "node:fs";
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
import { defaultExtractAudio, defaultMeasureVolume, defaultRunTranscription, defaultProbeMedia, validateTranscript, type SealedCaptureProviderInput } from "./record-finalize-defaults.js";

import { gapsForSourceDoc, type GapWindow } from "./reconnect-gaps.js";
import type { AdmissionInfo } from "./admission-gate.js";
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

export type { SealedCaptureProviderInput } from "./record-finalize-defaults.js";

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
  /** How the bot was admitted (admission-gate). `assumed` + a silent recording = degraded, never a success. */
  admission?: AdmissionInfo;
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
  // ISS-CAPTUREMAKER-002: a private window is anchored to the raw capture's own EOF. A raw->playable remux (or a caller that
  // omitted originalVideo and so offered the remux as its own original) may expose a different, guessed clock; refuse before
  // any probe, extraction, provider or publication.
  if(consent.privateWindows.length&&/\.playable\.webm$/i.test(overrides.originalVideo??video))throw new Error("Private capture requires its raw original, not a remux");
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
    ...(overrides.admission ? { admission: overrides.admission, captureDegraded: overrides.admission.assumed && silent } : {}),
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
    const degraded = overrides.admission?.assumed ? " [degraded: admission was only assumed (no lobby signal) and there is no audio, so the bot may never have been in the call]" : "";
    const error = new Error(`recording is silent (max ${maxDb} dB) — not transcribing; the capture did not hear the bot window${degraded}`);
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
/** Plan A7 (D-257): argv for the --index step. LKB_INDEX_PRODUCTION=1 (exactly) forwards D-204's production flag; the
  * other two parts of that opt-in (MONGODB_DB=lkb_prod, MONGO_WORK_DB=lkb_prod) are still checked by sync-session.mjs itself. */
export function syncSessionIndexArgs(sessionId: string, env: Record<string, string | undefined> = process.env): string[] {
  const args = [path.join(REPO_ROOT, "scripts", "webinar", "sync-session.mjs"), sessionId, "--emit-files", "--index"];
  return env.LKB_INDEX_PRODUCTION === "1" ? [...args, "--i-know-this-is-production"] : args;
}
/** Index-step log: only the tail is kept so a long-lived session dir cannot grow without bound. */
const INDEX_LOG_MAX_BYTES = 200 * 1024;
/** 2 retries after the first attempt (3 total): short backoff, because the observed failure was transient (LLM/Mongo). */
const INDEX_RETRY_BACKOFF_MS = [30_000, 90_000];
const syncSleep = (ms: number): void => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** Strip credentials before child output is persisted: URL userinfo, bearer tokens, KEY/TOKEN/SECRET/PASSWORD=value pairs. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 ***")
    .replace(/\b([A-Za-z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_]*)(\s*[=:]\s*)[^\s"',;]+/gi, "$1$2***");
}

/** Append to the log, then keep only its last INDEX_LOG_MAX_BYTES (UTF-8 boundary tolerated: a split char is replaced, not fatal). */
function appendIndexLog(file: string, text: string): void {
  appendFileSync(file, text);
  const size = statSync(file).size;
  if (size <= INDEX_LOG_MAX_BYTES) return;
  const fd = openSync(file, "r+");
  try {
    const tail = Buffer.alloc(INDEX_LOG_MAX_BYTES);
    readSync(fd, tail, 0, INDEX_LOG_MAX_BYTES, size - INDEX_LOG_MAX_BYTES);
    ftruncateSync(fd, 0);
    writeSync(fd, tail, 0, tail.length, 0);
  } finally { closeSync(fd); }
}

export interface IndexRetryOptions { backoffMs?: number[]; sleep?: (ms: number) => void; }

/** Runs the sync-session --index child with piped output teed to the console AND data/toc-migrated/<id>/index.log, retrying
  * after a failed exit. Retrying is safe: sync-session.mjs is idempotent (generation-swap upserts of this session's turns/edges,
  * upserted source/session/speaker/org rows, $addToSet topics; indexSession rewrites summary/claims/chunks), and a failed run only
  * flips status.index to failed, which the next run sets back to processing. Throws after the last attempt. */
function runIndexWithRetry(run: typeof spawnSync, sessionId: string, dir: string, opts: IndexRetryOptions): void {
  const backoff = opts.backoffMs ?? INDEX_RETRY_BACKOFF_MS;
  const sleep = opts.sleep ?? syncSleep;
  const logFile = path.join(dir, "index.log");
  const attempts = backoff.length + 1;
  let lastDetail = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = new Date().toISOString();
    const indexed = run("node", syncSessionIndexArgs(sessionId), { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024, timeout: 3_600_000 });
    const text = (v: unknown) => (v == null ? "" : String(v));
    const out = redactSecrets(text(indexed.stdout)), err = redactSecrets(text(indexed.stderr));
    const failure = indexed.status === 0 ? "" : `exit ${indexed.status ?? `signal ${indexed.signal ?? "none"}`}${indexed.error ? ` (${redactSecrets(String(indexed.error.message ?? indexed.error))})` : ""}`;
    const nl = (t: string) => (t === "" || t.endsWith("\n") ? t : `${t}\n`);
    if (out) process.stdout.write(nl(out));
    if (err) process.stderr.write(nl(err));
    try {
      appendIndexLog(logFile, `=== index attempt ${attempt}/${attempts} ${started} -> ${failure || "exit 0"} ===\n${nl(out)}${err ? `[stderr]\n${nl(err)}` : ""}`);
    } catch (logError) { console.error(`[bot] index.log write failed: ${String(logError)}`); }
    if (!failure) return;
    lastDetail = failure;
    if (attempt < attempts) { console.error(`[bot] knowledge indexing attempt ${attempt}/${attempts} failed (${failure}); retrying`); sleep(backoff[attempt - 1]!); }
  }
  throw new Error(`knowledge indexing failed after ${attempts} attempts (${lastDetail}); see ${toPosix(path.relative(REPO_ROOT, logFile))}; retry from retained artifacts`);
}

/** `run` is the process seam (tests); production always uses spawnSync. */
export function processRecordingArtifacts(video: string, sessionId: string, rest: string[], run: typeof spawnSync = spawnSync, retry: IndexRetryOptions = {}): void {
  if (!rest.includes("--process-video")) return;
  if (!rest.includes("--transcribe")) throw new Error("--process-video requires --transcribe");
  const state = path.join(REPO_ROOT, "data", "toc-migrated", sessionId, "pipeline-state.json");
  let stage = "screen";
  let proof: Record<string, unknown> | undefined;
  const report = (status: string, error?: string) => writeFileSync(state, JSON.stringify({ ...proof, sessionId, stage, status, error, updatedAt: new Date().toISOString() }) + "\n");
  report("processing");
  try {
    const processed = run("node", [path.join(REPO_ROOT, "scripts", "webinar", "process-video.mjs"),
      sessionId, "--recording", path.relative(REPO_ROOT, video)], { cwd: REPO_ROOT, stdio: "inherit", timeout: 3_600_000 });
    if (processed.status !== 0) throw new Error("screen processing failed; recording retained for retry");
    if (rest.includes("--index")) {
      stage = "index"; report("processing");
      runIndexWithRetry(run, sessionId, path.dirname(state), retry);
      proof = validateIndexProof(path.dirname(state), sessionId);
    }
    report("done");
  } catch (error) { report("failed", String(error)); throw error; }
}
export function validateIndexProof(dir: string, sessionId: string, expectedWorkDb = process.env.MONGO_WORK_DB?.trim()): Record<string, unknown> {
  return validateCaptureIndexProof(dir, sessionId, expectedWorkDb);
}
