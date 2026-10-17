#!/usr/bin/env node
/**
 * scripts/transcribe-long-session.mjs — T-003 long-audio-chunking. For a session whose real
 * audio exceeds a single request, extracts bounded chunks and recovers incomplete tails.
 * Single-call opt-in attempts once before fallback. Current durable capture receipt and proved
 * immutable public media guard upload; intentional private silence never becomes missing speech.
 * Public turns and original provider-anomaly audits stay generation-bound. No synthetic turns.
 *
 * Usage: node scripts/transcribe-long-session.mjs <sessionId> [chunkSeconds=2400] [--allow-partial] [--range START:END]
 *
 * --range keeps absolute timestamps and uses chunks. Explicit --allow-partial governs genuine
 * missing public speech. Run validate-session afterwards; old validation is invalidated on opt-in writes.
 *
 * Opt-in flags (D-162; both OFF unless the env var is exactly "1", output unchanged when off):
 *   LKB_TRANSCRIPT_QA=1       T-044: clamp merged turns to the real audio duration (no turn ends past the audio),
 *                             log a QA summary, write <session>/transcript-qa.json.
 *   LKB_SINGLE_CALL_PATH=1    T-048: chooseTranscriptionPath may route a recording within the single-call limits
 *                             (GEMINI_STT_MODEL=gemini-3.8-flash, <= 90 min) through ONE span; a failed or incomplete
 *                             single call falls back to the chunked plan.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, statSync, renameSync, copyFileSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { Agent, setGlobalDispatcher } from "undici";
import { findAudioFile, transcriptTenant } from "./lib/find-audio-file.mjs";
import { realUploadTransport } from "./lib/real-upload-transport.mjs";
import { immutableTranscriptTurns, writeTranscriptGeneration } from "./lib/transcript-provenance.mjs";
import { validateTurns } from "./webinar/process-video.mjs";
import { dispatchRecordingTranscription } from "./lib/transcription/recording-dispatch.mjs";
import { buildTranscriptQaGeneration } from "./lib/transcription/transcript-qa-generation.mjs";
import { loadTrustedRecordingPrivacy, recordingSpanCoverage, readSealedCaptureInput, resolveSealedCaptureAudio } from "./lib/transcription/private-recording.mjs";
import {
  SINGLE_CALL_FLAG, TRANSCRIPT_QA_FLAG, flagOn, applyTranscriptQa, summariseQaReport, planTranscriptionPath,
  boundariesForPlan, GAP_THRESHOLD_SECONDS, SHORTFALL_THRESHOLD_SECONDS,
} from "./lib/transcription-wiring.mjs";

// 30 min: a single-call transcription of a ~60-min recording can exceed 10 min before headers (2026-09-24).
setGlobalDispatcher(new Agent({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000 }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const AUDIO_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Audio");
const DEFAULT_CHUNK_SECONDS = 2400; // 40 minutes — headroom under the observed ~60min failure point

const sessionId = process.argv[2];
const rawArgs = process.argv.slice(3);
const allowPartial = rawArgs.includes("--allow-partial");
const rangeAt = rawArgs.indexOf("--range");
const captureAt = rawArgs.indexOf("--capture-input-fd");
if (captureAt >= 0 && (rawArgs[captureAt + 1] !== "0" || rawArgs.filter(a => a === "--capture-input-fd").length !== 1)) throw new Error("Capture input requires one stdin descriptor");
const rangeMatch = rangeAt >= 0 ? /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(rawArgs[rangeAt + 1] ?? "") : null;
const range = rangeMatch ? { start: Number(rangeMatch[1]), end: Number(rangeMatch[2]) } : null;
const positional = rawArgs.filter((a, i) => !a.startsWith("--") && !(rangeAt >= 0 && i === rangeAt + 1) && !(captureAt >= 0 && i === captureAt + 1));
const chunkSeconds = Number(positional[0]) || DEFAULT_CHUNK_SECONDS;
if (!sessionId || (rangeAt >= 0 && (!range || range.end <= range.start))) {
  console.error("usage: node scripts/transcribe-long-session.mjs <sessionId> [chunkSeconds] [--allow-partial] [--range START:END]");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set in environment/.env");
  process.exit(1);
}

register();

const MIME_BY_EXT = { ".m4a": "audio/mp4", ".mp4": "video/mp4", ".mp3": "audio/mpeg" };

function ffprobeDurationSeconds(audioPath) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath,
  ], { encoding: "utf8", timeout: 15000, windowsHide: true });
  const duration = Number(out.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("recording duration unavailable");
  return duration;
}

function ffmpegExtractChunk(audioPath, start, end, outPath) {
  execFileSync("ffmpeg", [
    "-y", "-ss", String(start), "-t", String(end - start), "-i", audioPath, "-c", "copy", outPath,
  ], { stdio: ["ignore", "ignore", "pipe"], timeout: 30 * 60 * 1000, windowsHide: true });
}

const MAX_ATTEMPTS_PER_SPAN = 3; // 1 initial + 2 identical retries, before trying a different boundary
// Preserve small-tail recovery (2026-09-04): differently bounded requests can resolve stalls.
const MIN_RECURSE_SECONDS = 20;
const MAX_RECURSE_DEPTH = 3;
function publishJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); renameSync(temp, path); }
  finally { rmSync(temp, { force: true }); }
}

async function main() {
  const tenantId = transcriptTenant(DATA_DIR, sessionId);
  const { uploadFile, pollFileState, transcribeUploadedAudio } = await import("../packages/ai/src/stt/gemini-file-upload.ts");
  const { computeChunkBoundaries, mergeChunkedTurns, findTimeGaps } = await import("../packages/ai/src/stt/chunk-audio.ts");
  const qaOn = flagOn(process.env, TRANSCRIPT_QA_FLAG);
  const singleOn = flagOn(process.env, SINGLE_CALL_FLAG);
  const clampAndValidateTurns = qaOn ? (await import("../packages/ai/src/stt/transcript-qa.ts")).clampAndValidateTurns : null;

  const source = JSON.parse(readFileSync(join(DATA_DIR, sessionId, "source.json"), "utf8"));
  const sealedInput = captureAt >= 0 ? readSealedCaptureInput({ tenantId, sessionId }) : null;
  if (!sealedInput && (source.captureConsent || source.captureMode === "silent" || source.privateWindows !== undefined || source.guardedPrivateWindows !== undefined)) throw new Error("Captured transcription requires sealed parent input");
  const selectedAudio = sealedInput ? resolveSealedCaptureAudio(ROOT, sealedInput) : null;
  const { path: audioPath, filename } = selectedAudio ? { path: selectedAudio, filename: selectedAudio.split(/[/\\]/).at(-1) } : findAudioFile(DATA_DIR, AUDIO_DIR, sessionId);
  const mimeType = MIME_BY_EXT[extname(filename).toLowerCase()] ?? "audio/mp4";
  const ext = extname(filename);

  const durationSeconds = ffprobeDurationSeconds(audioPath);
  const privacy = await loadTrustedRecordingPrivacy({ root: ROOT, sessionId, source, audioPath, durationSeconds, sealedInput });
  if (sealedInput && !privacy) throw new Error("Sealed input lacks trusted capture source");
  if (privacy && !qaOn) throw new Error("Captured transcription requires explicit LKB_TRANSCRIPT_QA=1 before provider");
  const windowStart = range ? range.start : 0;
  const windowEnd = range ? Math.min(range.end, durationSeconds) : durationSeconds;
  if (windowEnd <= windowStart) throw new Error(`--range ${range?.start}:${range?.end} is outside the ${durationSeconds.toFixed(1)}s recording`);
  const chunkedBoundaries = computeChunkBoundaries(windowEnd - windowStart, chunkSeconds)
    .map((b) => ({ start: b.start + windowStart, end: b.end + windowStart }));
  let plan = null;
  if (singleOn && !range) {
    const { chooseTranscriptionPath, T048_THRESHOLDS } = await import("../packages/ai/src/stt/transcription-plan.ts");
    plan = planTranscriptionPath({
      enabled: true, durationSeconds, fileBytes: statSync(audioPath).size, modelId: process.env.GEMINI_STT_MODEL || "",
      choose: chooseTranscriptionPath, thresholds: T048_THRESHOLDS,
    });
    console.log(`single-call plan: ${plan.kind} (${plan.reason})`);
  }
  const boundaries = boundariesForPlan(plan, durationSeconds, chunkedBoundaries);
  console.log(`${filename}: ${(durationSeconds / 60).toFixed(1)} min real duration -> ${boundaries.length} chunk(s) of up to ${chunkSeconds / 60} min`);

  const tmpDir = mkdtempSync(join(tmpdir(), "lkb-chunk-"));
  const snapshotAudioPath = join(tmpDir, `recording${ext}`);
  let audioSha256;
  const spanQaReports = []; // T-044: per-attempt clamp reports (the merged report no longer sees drift already clamped per span)
  const providerAttempts = [];
  const protocolRequests = { upload: 0, poll: 0, generate: 0 };
  const countedTransport = req => {
    protocolRequests[req.method === "GET" ? "poll" : req.url.includes(":generateContent") ? "generate" : "upload"]++;
    return realUploadTransport(req);
  };
  const coverage = (turns, offsetSeconds, durationSeconds) => recordingSpanCoverage({ privacy, turns, offsetSeconds, durationSeconds, findTimeGaps, gapThresholdSeconds: GAP_THRESHOLD_SECONDS, tailThresholdSeconds: SHORTFALL_THRESHOLD_SECONDS });
  const privacyProof = privacy ? { receiptSha256: privacy.receiptSha256, sanitizedAudioSha256: privacy.sanitizedAudioSha256, publicIntervals: privacy.publicIntervals } : undefined;

  function checkedAttempt(once, mediaDurationSeconds, label, attempt, offsetSeconds) {
    const providerReport = privacy && qaOn ? structuredClone(clampAndValidateTurns(once.turns, mediaDurationSeconds).report) : undefined;
    if (providerReport) for (const run of providerReport.hallucination.repeatedRuns) run.text = "[redacted provider repetition]";
    const filtered = privacy ? privacy.filterSpanTurns(once.turns, offsetSeconds, mediaDurationSeconds) : { turns: once.turns };
    const spanQa = applyTranscriptQa({ enabled: qaOn, turns: filtered.turns, durationSeconds: mediaDurationSeconds, clamp: clampAndValidateTurns });
    if (privacy && spanQa.report) for (const run of spanQa.report.hallucination.repeatedRuns) run.text = "[redacted provider repetition]";
    const audit = spanQa.report ? { id: `${label}-a${attempt}`, label, attempt, accepted: false, offsetSeconds, report: spanQa.report,
      ...(privacy ? { providerReport, privacy: filtered.privacy } : {}) } : null;
    if (audit) spanQaReports.push(audit);
    if (privacy && privacy.filterSpanTurns(spanQa.turns, offsetSeconds, mediaDurationSeconds).turns.length !== spanQa.turns.length) throw new Error("QA-repaired timing overlaps protected capture; publication refused");
    if (audit && (audit.report.clampedCount > 0 || audit.report.dropped.length > 0)) console.log(`span ${label} ${summariseQaReport(audit.report)}`);
    if (spanQa.turns.length) validateTurns(immutableTranscriptTurns(tenantId, sessionId, spanQa.turns), mediaDurationSeconds, { tenantId, sessionId });
    return { turns: spanQa.turns, audit };
  }

  async function transcribeSpanOnce(bytes, displayName, mediaDurationSeconds) {
    const perform = async (guardedPath, proof) => {
    privacy?.verifyCurrent();
    if (privacy && (guardedPath !== privacy.audioPath || proof.sha256 !== audioSha256 || proof.receiptSha256 !== privacy.receiptSha256)) throw new Error("Guarded provider input differs from immutable snapshot");
    if (privacy && createHash("sha256").update(readFileSync(snapshotAudioPath)).digest("hex") !== audioSha256) throw new Error("Immutable public snapshot changed; upload refused");
    const { fileUri, name } = await uploadFile(bytes, mimeType, countedTransport, apiKey, displayName);
    const MAX_POLLS = 20;
    const POLL_DELAY_MS = 5000;
    let state = "PROCESSING";
    for (let p = 0; p < MAX_POLLS && state === "PROCESSING"; p++) {
      if (p > 0) await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
      state = await pollFileState(name, countedTransport, apiKey);
    }
    if (state !== "ACTIVE") {
      throw new Error(`file never became ACTIVE (last state: ${state}) after ${MAX_POLLS} polls`);
    }
    const audit = { id: displayName, durationSeconds: mediaDurationSeconds, status: "failed" };
    providerAttempts.push(audit);
    const result = await transcribeUploadedAudio(fileUri, countedTransport, apiKey, process.env.GEMINI_STT_MODEL || undefined, mediaDurationSeconds);
    audit.status = "returned";
    return result;
    };
    return privacy ? privacy.runProvider(perform) : perform();
  }

  /** Returns turns local to `spanStart` (tStart/tEnd relative to the span itself, not the
   * original audio) — the caller applies its own offset. Recurses on a persistently-incomplete
   * tail; never throws on incompleteness, just returns the best it could get. */
  async function transcribeSpan(spanStart, spanEnd, depth, label) {
    const spanDuration = spanEnd - spanStart;
    if (privacy && !coverage([], spanStart, spanDuration).expectedPublicSeconds) return [];
    const spanPath = join(tmpDir, `span-${label}${ext}`);
    ffmpegExtractChunk(snapshotAudioPath, spanStart, spanEnd, spanPath);
    const mediaDurationSeconds = Math.min(ffprobeDurationSeconds(spanPath), spanDuration);
    const bytes = readFileSync(spanPath);
    console.log(`${"  ".repeat(depth + 1)}span ${label} [${spanStart}s-${spanEnd}s] (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);

    let best = { turns: [], lastTEnd: 0, audit: null };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SPAN; attempt++) {
      let once;
      try { once = await transcribeSpanOnce(bytes, `${label}-a${attempt}`, mediaDurationSeconds); }
      catch (err) {
        if (!singleOn && !privacy) throw err;
        console.log(`span ${label} attempt ${attempt}/${MAX_ATTEMPTS_PER_SPAN}: provider request failed`);
        if (attempt === MAX_ATTEMPTS_PER_SPAN && best.turns.length === 0) throw new Error("chunk provider attempts exhausted; publication refused");
        continue;
      }
      const { usage } = once;
      // T-044 (flag off: same array back, report null): drift past the span is clamped/dropped BEFORE validateTurns would throw on it.
      const { turns, audit } = checkedAttempt(once, mediaDurationSeconds, label, attempt, spanStart);
      const checkedCoverage = coverage(turns, spanStart, spanDuration), localGaps = checkedCoverage.gaps;
      const lastTEnd = turns.length > 0 ? turns[turns.length - 1].tEnd : 0;
      const shortfall = checkedCoverage.tailShortfall, complete = checkedCoverage.complete;
      console.log(
        `${"  ".repeat(depth + 1)}attempt ${attempt}/${MAX_ATTEMPTS_PER_SPAN}: ${turns.length} turns, ` +
        `lastTEnd=${lastTEnd}s/${spanDuration.toFixed(0)}s (shortfall ${shortfall.toFixed(0)}s), ` +
        `internalGaps=${localGaps.length}, tokens in=${usage.inputTokens} out=${usage.outputTokens} ` +
        `-> ${complete ? "COMPLETE" : "INCOMPLETE"}`,
      );
      if (lastTEnd > best.lastTEnd) best = { turns, lastTEnd, audit };
      if (complete) { if (audit) audit.accepted = true; return turns; }
      if (attempt < MAX_ATTEMPTS_PER_SPAN) console.log(`${"  ".repeat(depth + 1)}retrying (fresh call, same span)...`);
    }

    const remainingStart = spanStart + best.lastTEnd;
    if (best.audit) best.audit.accepted = true;
    const remainingSeconds = spanEnd - remainingStart;
    if (depth < MAX_RECURSE_DEPTH && remainingSeconds > MIN_RECURSE_SECONDS) {
      console.log(
        `${"  ".repeat(depth + 1)}span ${label}: still incomplete after ${MAX_ATTEMPTS_PER_SPAN} identical attempts ` +
        `-- splitting off the unresolved tail [${remainingStart}s-${spanEnd}s] as a fresh request`,
      );
      const tailTurns = await transcribeSpan(remainingStart, spanEnd, depth + 1, `${label}t`);
      const offsetTailTurns = tailTurns.map((t) => ({ ...t, tStart: t.tStart + best.lastTEnd, tEnd: t.tEnd + best.lastTEnd }));
      return [...best.turns, ...offsetTailTurns];
    }

    console.log(
      `${"  ".repeat(depth + 1)}span ${label}: giving up on the remaining ${remainingSeconds.toFixed(0)}s ` +
      `(depth=${depth}, min=${MIN_RECURSE_SECONDS}s) -- using best turns found (lastTEnd=${best.lastTEnd}s/${spanDuration.toFixed(0)}s)`,
    );
    return best.turns;
  }

  let dispatch;
  try {
    copyFileSync(audioPath, snapshotAudioPath);
    audioSha256 = createHash("sha256").update(readFileSync(snapshotAudioPath)).digest("hex");
    if (privacy && audioSha256 !== privacy.sanitizedAudioSha256) throw new Error("Immutable audio is not the proved public capture");
    if (ffprobeDurationSeconds(snapshotAudioPath) !== durationSeconds) throw new Error("recording changed before transcription; publication refused");
    dispatch = await dispatchRecordingTranscription({ plan, durationSeconds, chunkedBoundaries, log: console.log,
      singleAttempt: async () => checkedAttempt(await transcribeSpanOnce(readFileSync(snapshotAudioPath), "single-a1", durationSeconds), durationSeconds, "single", 1, 0).turns,
      complete: turns => { const c = coverage(turns, 0, durationSeconds); return c.leadingShortfall <= GAP_THRESHOLD_SECONDS && c.complete; },
      chunkAttempt: (start, end, i) => transcribeSpan(start, end, 0, `c${i}`),
    });
    if (dispatch.provenance.actualPath === "single") {
      const audit = spanQaReports.find(r => r.id === "single-a1");
      if (audit) audit.accepted = true;
    }
    if (createHash("sha256").update(readFileSync(audioPath)).digest("hex") !== audioSha256) throw new Error("recording changed during transcription; publication refused");
    await privacy?.verifyCurrent();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const chunkResults = dispatch.results;
  const qa = applyTranscriptQa({ enabled: qaOn, turns: mergeChunkedTurns(chunkResults), durationSeconds, clamp: clampAndValidateTurns });
  const mergedTurns = qa.turns;
  if (qa.report) console.log(summariseQaReport(qa.report));
  console.log(`\nmerged ${chunkResults.length} chunk(s) -> ${mergedTurns.length} total turns`);

  const turnsPath = join(DATA_DIR, sessionId, "turns.json");
  const existingTurns = existsSync(turnsPath) ? JSON.parse(readFileSync(turnsPath, "utf8")) : [];

  if (mergedTurns.length === 0 && existingTurns.length > 0) {
    throw new Error(`merged 0 turns for "${sessionId}" but ${existingTurns.length} existing turn(s) are on disk — refusing to overwrite.`);
  }

  const lastTEnd = mergedTurns.length > 0 ? mergedTurns[mergedTurns.length - 1].tEnd : 0;
  const coveragePercent = ((lastTEnd / durationSeconds) * 100).toFixed(1);
  console.log(`coverage (last-turn/duration only -- NOT sufficient alone): last turn tEnd=${lastTEnd}s vs real duration=${durationSeconds.toFixed(0)}s (${coveragePercent}%)`);

  // Genuine missing public speech refuses publication; intentional private silence is excluded.
  const finalCoverage = coverage(mergedTurns, 0, durationSeconds), gaps = finalCoverage.gaps;
  if ((singleOn || privacy) && !allowPartial && finalCoverage.leadingShortfall > GAP_THRESHOLD_SECONDS) throw new Error("unresolved transcript leading gap; publication refused");
  if ((singleOn || privacy) && !allowPartial && finalCoverage.tailShortfall > SHORTFALL_THRESHOLD_SECONDS) throw new Error("unresolved transcript tail; publication refused");
  if (gaps.length > 0) {
    console.log(`\n⚠ ${gaps.length} internal gap(s) > ${GAP_THRESHOLD_SECONDS}s remain after all retries/splits -- likely real missing content, NOT just silence:`);
    for (const g of gaps) {
      console.log(`  ${g.gapStart}s to ${g.gapEnd}s (${(g.gapSeconds / 60).toFixed(1)} min missing)`);
    }
    if (!allowPartial) {
      throw new Error(
        `${gaps.length} unresolved internal gap(s) in "${sessionId}" -- refusing to overwrite existing data with a known-incomplete ` +
        `transcript. Re-run with --allow-partial to accept it anyway, or investigate the gap span directly.`,
      );
    }
    console.log("--allow-partial set: writing the incomplete result anyway.");
  } else {
    console.log("no internal gaps found -- transcript coverage is genuinely continuous");
  }

  validateTurns(immutableTranscriptTurns(tenantId, sessionId, mergedTurns), durationSeconds, { tenantId, sessionId });
  // Validate report structure before transcript publication; the final proof uses actual committed bytes below.
  if (qa.report) buildTranscriptQaGeneration({ turnsBytes: Buffer.alloc(0), durationSec: durationSeconds, spans: spanQaReports, merged: qa.report, privacy: privacyProof });
  await privacy?.verifyCurrent();
  if (qaOn || singleOn || privacy) publishJson(join(DATA_DIR, sessionId, "validation.json"), { stage: "transcript", status: "failed", transcriptValidated: false,
    error: "new transcript/QA generation requires independent validation" });
  const realTurns = writeTranscriptGeneration(join(DATA_DIR, sessionId), tenantId, sessionId, mergedTurns);
  console.log(`wrote ${realTurns.length} real diarized turns -> ${turnsPath} (replaced ${existingTurns.length} placeholder turn(s))`);
  const turnsBytes = readFileSync(turnsPath);
  if (qa.report) publishJson(join(DATA_DIR, sessionId, "transcript-qa.json"), buildTranscriptQaGeneration({ turnsBytes, durationSec: durationSeconds, spans: spanQaReports, merged: qa.report, privacy: privacyProof }));
  if (singleOn) publishJson(join(DATA_DIR, sessionId, "transcription-path.json"), { version: 1, tenantId, sessionId,
    ...dispatch.provenance, model: process.env.GEMINI_STT_MODEL || "gemini-3.5-flash", durationSeconds,
    audioSha256,
    turnsSha256: createHash("sha256").update(turnsBytes).digest("hex"), providerAttempts, protocolRequests,
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
