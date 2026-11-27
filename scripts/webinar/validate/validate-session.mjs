#!/usr/bin/env node
/**
 * scripts/webinar/validate/validate-session.mjs — the sanctioned way to re-validate a webinar session whose
 * transcript was produced (or re-produced) AFTER the pipeline wrote validation.json.
 *
 * Why: the pipeline writes `{stage: transcript, status: failed}` when its transcription step throws. A later,
 * successful `scripts/transcribe-long-session.mjs` run replaces turns.json but touches nothing else, so
 * `sync-session.mjs` keeps refusing ("webinar validation has not passed", session-rows.mjs). The only other writer
 * of a passed validation.json is scripts/upload/submit.mjs, for fresh uploads. Hand-writing the file bypasses the
 * gate; this script re-runs the gate's checks and records the evidence.
 *
 * Checks (all reuse existing code, none re-implemented):
 *   - turns.json is exactly what immutableTranscriptTurns() would write (ids/tenant/session identity; hand edits fail)
 *   - validateTurns() against the real audio duration (process-video.mjs, the check submit.mjs and the pipeline use)
 *   - assertTurnTimings() (scripts/lib/turn-timing.mjs)
 *   - internal gaps (findTimeGaps) and tail shortfall, with the thresholds transcribe-long-session.mjs uses
 *   - transcript-qa.json (T-044): present when LKB_TRANSCRIPT_QA=1, matches the turns, no hallucination signals
 *
 * Partial coverage (gap or short tail, e.g. a `--range` run) is recorded explicitly (`partial: true`, `coverage`).
 * It is `failed` unless the operator passes --accept-partial. NOTE: session-rows.mjs only reads `status` and
 * `transcriptValidated`, not `partial`, so an accepted partial session DOES pass the sync gate (policy question).
 *
 * Usage: node scripts/webinar/validate/validate-session.mjs <sessionId> [--accept-partial] [--dry-run] [--root <repoRoot>]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";
import { findAudioFile, transcriptTenant } from "../../lib/find-audio-file.mjs";
import { immutableTranscriptTurns } from "../../lib/transcript-provenance.mjs";
import { assertTurnTimings } from "../../lib/turn-timing.mjs";
import { flagOn, TRANSCRIPT_QA_FLAG, GAP_THRESHOLD_SECONDS, SHORTFALL_THRESHOLD_SECONDS } from "../../lib/transcription-wiring.mjs";
import { validateTurns } from "../process-video.mjs";
import { loadWebinarSession } from "../session-rows.mjs";
import { evaluateTranscriptQaGeneration } from "./transcript-qa-binding.mjs";
import { turnIntegrityReasons } from "./turn-integrity.mjs";
import { loadTrustedRecordingPrivacy, evaluateRecordingCoverage, detectSilentIntervals, verifiedSilenceIntervals } from "../../lib/transcription/private-recording.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round = (n, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
/**
 * Stored silence (producer) vs independent re-detection (validator) may come from different ffmpeg builds whose decoders
 * frame audio differently (AAC 1024 samples ~21 ms, Opus 20 ms, MP3 1152 samples ~26 ms) and round silencedetect
 * boundaries to a frame or two. 0.25 s tolerates ~10 frames of that drift yet is < 1% of the 30 s gap threshold, so even
 * a deliberately stretched claim could hide at most 0.5 s of audio per interval. Count must match exactly; the STORED
 * intervals are what coverage uses, because admission can only read those (identical verdicts on both paths).
 */
export const SILENCE_BOUNDARY_TOLERANCE_SECONDS = 0.25;
export function silenceIntervalsAgree(detected, claimed, tolerance = SILENCE_BOUNDARY_TOLERANCE_SECONDS) {
  return Array.isArray(detected) && Array.isArray(claimed) && detected.length === claimed.length &&
    detected.every((d, i) => Math.abs(d.tStart - claimed[i].tStart) <= tolerance && Math.abs(d.tEnd - claimed[i].tEnd) <= tolerance);
}

export function probeDurationSeconds(audioPath) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
    { encoding: "utf8", timeout: 15000, windowsHide: true });
  const duration = Number(out.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("recording duration unavailable");
  return duration;
}

/** QA evidence + failure reasons from transcript-qa.json (T-044). Counts only, never transcript text. */
async function qaEvidence(dir, turns, turnsBytes, durationSec, env, privacy, early) {
  if (!early.exists) {
    return { qa: null, qaSha256: null, reasons: privacy ? ["trusted captured privacy requires generation-bound transcript-qa.json"] :
      flagOn(env, TRANSCRIPT_QA_FLAG) ? [`${TRANSCRIPT_QA_FLAG}=1 but transcript-qa.json is missing`] : [] };
  }
  let proof;
  let qaBytes;
  // The same bytes the silence decision read (one read, so coverage and qaSha256 describe one generation).
  try { qaBytes = early.bytes; if (!qaBytes) throw new Error(); proof = JSON.parse(qaBytes.toString("utf8")); } catch { return { qa: null, qaSha256: null, reasons: ["transcript-qa.json is unreadable"] }; }
  register();
  const { clampAndValidateTurns } = await import("../../../packages/ai/src/stt/transcript-qa.ts");
  return { ...evaluateTranscriptQaGeneration({ proof, turnsBytes, turns, durationSec, clamp: clampAndValidateTurns, privacy }), qaSha256: sha(qaBytes) };
}

/**
 * Re-run the gate's checks for one session and (unless dryRun) write validation.json.
 * @param {{root?: string, sessionId: string, durationSec?: number, acceptPartial?: boolean, dryRun?: boolean,
 *          env?: object, now?: () => Date, findTimeGaps?: Function}} opts  `durationSec` skips the ffprobe of the audio (tests).
 */
export async function validateSession({ root = DEFAULT_ROOT, sessionId, durationSec, acceptPartial = false, dryRun = false, env = process.env, now = () => new Date(), findTimeGaps,
  detectSilence = detectSilentIntervals } = {}) {
  const dataDir = join(root, "data", "toc-migrated"), dir = join(dataDir, sessionId);
  const tenantId = transcriptTenant(dataDir, sessionId); // validates the sessionId shape too
  const probedAudioPath = durationSec === undefined ? findAudioFile(dataDir, join(root, "raw", "TOC", "TOC-Materials", "Audio"), sessionId).path : undefined;
  const duration = durationSec ?? probeDurationSeconds(probedAudioPath);
  if (!findTimeGaps) { register(); findTimeGaps = (await import("../../../packages/ai/src/stt/chunk-audio.ts")).findTimeGaps; }

  const reasons = [];
  let source, sourceBytes, privacy = null;
  try {
    sourceBytes = readFileSync(join(dir, "source.json")); source = JSON.parse(sourceBytes.toString("utf8"));
    register();
    privacy = await loadTrustedRecordingPrivacy({ root, sessionId, source, audioPath: probedAudioPath, durationSeconds: duration });
    if (privacy && privacy.sourceSha256 !== sha(sourceBytes)) throw new Error("Capture source snapshot changed during validation");
  } catch (e) { reasons.push(`recording privacy evidence: ${e.message}`); }
  let turns = [];
  let turnsBytes = Buffer.alloc(0);
  try { turnsBytes = readFileSync(join(dir, "turns.json")); turns = JSON.parse(turnsBytes.toString("utf8")); } catch (e) { reasons.push(`turns.json unreadable: ${e.message}`); }
  if (!Array.isArray(turns) || !turns.length) { reasons.push("turns.json has no turns"); turns = []; }
  const step = (fn) => { try { fn(); } catch (e) { reasons.push(e.message); } };
  if (turns.length) {
    step(() => { if (JSON.stringify(immutableTranscriptTurns(tenantId, sessionId, turns)) !== JSON.stringify(turns)) throw new Error("turns.json does not match its canonical transcript identity (not written by the transcription pipeline?)"); });
    step(() => validateTurns(turns, duration, { tenantId, sessionId }));
    step(() => assertTurnTimings(turns, sessionId));
    if (privacy) step(() => {
      if (turns.some(t => !t || !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) ||
          !(0 <= t.tStart && t.tStart <= t.tEnd && t.tEnd <= duration))) throw new Error("private recording transcript outside exact audio bounds");
      if (privacy.filterSpanTurns(turns, 0, duration).privacy.excludedIndices.length) throw new Error("turns.json includes intentionally protected recording content");
    });
  }
  const lastTEnd = turns.length ? Math.max(...turns.map((t) => (Number.isFinite(t.tEnd) ? t.tEnd : 0))) : 0;
  // Silence-aware coverage (2026-11-27), agreeing with transcribe time and admission:
  //  - stored QA silence evidence is used only if this validator independently re-detects matching intervals (silenceIntervalsAgree) from
  //    the hashed audio (privacy: the receipt-bound sanitized audio, re-hashed by verifyCurrent below); else refuse;
  //  - provided audio without stored evidence uses a fresh detection; captured audio without it uses none, because
  //    admission (verifyTrustedRecordingPrivacyAdmission) can only read the qaSha256-bound evidence;
  //  - any detection failure means no silence: exactly the previous, stricter guard.
  const qaPath = join(dir, "transcript-qa.json"), early = { exists: existsSync(qaPath), bytes: null };
  let claimedSilence;
  if (early.exists) { try { early.bytes = readFileSync(qaPath); const p = JSON.parse(early.bytes.toString("utf8")); if (p && typeof p === "object") claimedSilence = p.silence; } catch { /* reported by qaEvidence */ } }
  const silenceAudio = privacy ? privacy.audioPath : probedAudioPath;
  let detected = null, silentIntervals = [], silenceApplied = false;
  if (silenceAudio) { try { detected = detectSilence(silenceAudio, { durationSeconds: duration }); } catch { detected = null; } }
  if (claimedSilence !== undefined) {
    step(() => {
      const claimed = verifiedSilenceIntervals(claimedSilence, privacy ? privacy.sanitizedAudioSha256 : silenceAudio ? sha(readFileSync(silenceAudio)) : null);
      if (!silenceIntervalsAgree(detected, claimed)) throw new Error("QA silence evidence differs from the independently detected silence of the hashed audio");
      silentIntervals = claimed; silenceApplied = true;
    });
  } else if (!privacy && detected) { silentIntervals = detected; silenceApplied = true; }
  const silenceAware = !privacy && silentIntervals.length > 0;
  const publicCoverage = privacy || silenceAware ? evaluateRecordingCoverage({ privacy: privacy ?? { publicIntervals: [{ tStart: 0, tEnd: duration }] }, turns, durationSeconds: duration,
    gapThresholdSeconds: GAP_THRESHOLD_SECONDS, tailThresholdSeconds: SHORTFALL_THRESHOLD_SECONDS, silentIntervals, requireTurns: true }) : null;
  const gaps = publicCoverage ? publicCoverage.gaps : turns.length ? findTimeGaps(turns, GAP_THRESHOLD_SECONDS) : [];
  const shortfallSec = publicCoverage ? publicCoverage.tailShortfall : duration - lastTEnd;
  const coverage = round(publicCoverage ? (publicCoverage.expectedPublicSeconds > 0 ? publicCoverage.coveredPublicSeconds / publicCoverage.expectedPublicSeconds : 1) : Math.min(lastTEnd / duration, 1), 4);
  const partial = turns.length > 0 && (publicCoverage ? !publicCoverage.complete : gaps.length > 0 || shortfallSec > SHORTFALL_THRESHOLD_SECONDS);
  if (partial && !acceptPartial) {
    reasons.push(`partial coverage ${(coverage * 100).toFixed(1)}% (${gaps.length} internal gap(s) > ${GAP_THRESHOLD_SECONDS}s, tail shortfall ${round(shortfallSec, 1)}s > ${SHORTFALL_THRESHOLD_SECONDS}s); re-run with --accept-partial to record it as accepted`);
  }
  if (turns.length) { // fail closed without relying on transcript-qa.json: ordering, overlap and repeated runs come from turns.json itself
    register();
    reasons.push(...turnIntegrityReasons({ turns, durationSec: duration, qa: await import("../../../packages/ai/src/stt/transcript-qa.ts") }));
  }
  const { qa, qaSha256, reasons: qaReasons } = await qaEvidence(dir, turns, turnsBytes, duration, env, privacy, early);
  reasons.push(...qaReasons);
  if (privacy) { try { await privacy.verifyCurrent(); } catch (e) { reasons.push(`recording privacy evidence changed: ${e.message}`); } }
  if (sourceBytes) step(() => {
    if (!readFileSync(join(dir, "source.json")).equals(sourceBytes)) throw new Error("source.json changed during validation");
  });

  const passed = reasons.length === 0;
  const evidence = { durationSec: duration, turnCount: turns.length, lastTEnd, coverage, partial, shortfallSec: round(shortfallSec, 3),
    gaps: gaps.map((g) => ({ start: g.gapStart, end: g.gapEnd, ...(g.gapSeconds === undefined ? {} : { unprotectedSeconds: g.gapSeconds }) })),
    qa, qaSha256, turnsSha256: turns.length ? sha(turnsBytes) : null, sourceSha256: sourceBytes ? sha(sourceBytes) : null,
    ...(privacy ? { privacy: { receiptSha256: privacy.receiptSha256, sanitizedAudioSha256: privacy.sanitizedAudioSha256,
      publicIntervals: privacy.publicIntervals }, privacyCoverage: publicCoverage } : {}),
    silence: silenceApplied ? { intervals: silentIntervals.length, silentSeconds: round(silentIntervals.reduce((s, w) => s + w.tEnd - w.tStart, 0), 3) } : null,
    validatedAt: now().toISOString(), validator: "scripts/webinar/validate/validate-session.mjs" };
  const report = passed
    ? { status: "passed", transcriptValidated: true, ...evidence, ...(partial ? { partialAccepted: true } : {}) }
    : { stage: "transcript", status: "failed", transcriptValidated: false, error: reasons.join("; "), reasons, ...evidence };

  const path = join(dir, "validation.json");
  if (!dryRun) {
    if (existsSync(path)) { // keep the previous verdict, like .transcript-history keeps previous turns
      const previous = readFileSync(path), history = join(dir, ".validation-history");
      mkdirSync(history, { recursive: true });
      const archive = join(history, `${sha(previous)}.json`);
      if (!existsSync(archive)) writeFileSync(archive, previous);
    }
    const temp = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`); renameSync(temp, path); } finally { rmSync(temp, { force: true }); }
  }
  let gate;
  if (!dryRun) { try { loadWebinarSession(dir, sessionId); gate = "accepts"; } catch (e) { gate = `refuses: ${e.message}`; } }
  return { report, passed, gate, path, written: !dryRun };
}

/** CLI parsing: the session id is the first positional (not a flag, not the value of --root), wherever it sits. */
export function parseCliArgs(args, defaultRoot = DEFAULT_ROOT) {
  const at = args.indexOf("--root");
  const rootValue = at >= 0 ? args[at + 1] : undefined;
  const rootMissing = at >= 0 && (!rootValue || rootValue.startsWith("--"));
  const positionals = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--root");
  const rootCount = args.filter((a) => a === "--root").length;
  const error = positionals.length > 1 ? `more than one session id given: ${positionals.join(", ")}` : rootCount > 1 ? "--root given more than once" : undefined;
  return { sessionId: positionals[0], root: at >= 0 && !rootMissing ? resolve(rootValue) : defaultRoot, rootMissing, error,
    acceptPartial: args.includes("--accept-partial"), dryRun: args.includes("--dry-run") };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { sessionId, root, rootMissing, error, acceptPartial, dryRun } = parseCliArgs(process.argv.slice(2));
  if (!sessionId || rootMissing || error) {
    if (error) console.error(`error: ${error}`);
    console.error("usage: node scripts/webinar/validate/validate-session.mjs <sessionId> [--accept-partial] [--dry-run] [--root <repoRoot>]");
    process.exit(1);
  }
  import("dotenv/config").then(() => validateSession({ root, sessionId, acceptPartial, dryRun }))
    .then((r) => {
      console.log(JSON.stringify(r.report, null, 2));
      console.log(`${r.written ? "wrote" : "dry-run, not written:"} ${r.path}`);
      if (r.gate) console.log(`sync gate (loadWebinarSession): ${r.gate}`);
      process.exitCode = r.passed ? 0 : 2;
    }).catch((e) => { console.error(`validation could not run: ${e.message}`); process.exitCode = 1; });
}
