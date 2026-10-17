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

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round = (n, places = 3) => Math.round(n * 10 ** places) / 10 ** places;

export function probeDurationSeconds(audioPath) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
    { encoding: "utf8", timeout: 15000, windowsHide: true });
  const duration = Number(out.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("recording duration unavailable");
  return duration;
}

/** QA evidence + failure reasons from transcript-qa.json (T-044). Counts only, never transcript text. */
async function qaEvidence(dir, turns, turnsBytes, durationSec, env) {
  const path = join(dir, "transcript-qa.json");
  if (!existsSync(path)) {
    return { qa: null, qaSha256: null, reasons: flagOn(env, TRANSCRIPT_QA_FLAG) ? [`${TRANSCRIPT_QA_FLAG}=1 but transcript-qa.json is missing`] : [] };
  }
  let proof;
  let qaBytes;
  try { qaBytes = readFileSync(path); proof = JSON.parse(qaBytes.toString("utf8")); } catch { return { qa: null, qaSha256: null, reasons: ["transcript-qa.json is unreadable"] }; }
  register();
  const { clampAndValidateTurns } = await import("../../../packages/ai/src/stt/transcript-qa.ts");
  return { ...evaluateTranscriptQaGeneration({ proof, turnsBytes, turns, durationSec, clamp: clampAndValidateTurns }), qaSha256: sha(qaBytes) };
}

/**
 * Re-run the gate's checks for one session and (unless dryRun) write validation.json.
 * @param {{root?: string, sessionId: string, durationSec?: number, acceptPartial?: boolean, dryRun?: boolean,
 *          env?: object, now?: () => Date, findTimeGaps?: Function}} opts  `durationSec` skips the ffprobe of the audio (tests).
 */
export async function validateSession({ root = DEFAULT_ROOT, sessionId, durationSec, acceptPartial = false, dryRun = false, env = process.env, now = () => new Date(), findTimeGaps } = {}) {
  const dataDir = join(root, "data", "toc-migrated"), dir = join(dataDir, sessionId);
  const tenantId = transcriptTenant(dataDir, sessionId); // validates the sessionId shape too
  const duration = durationSec ?? probeDurationSeconds(findAudioFile(dataDir, join(root, "raw", "TOC", "TOC-Materials", "Audio"), sessionId).path);
  if (!findTimeGaps) { register(); findTimeGaps = (await import("../../../packages/ai/src/stt/chunk-audio.ts")).findTimeGaps; }

  const reasons = [];
  let turns = [];
  let turnsBytes = Buffer.alloc(0);
  try { turnsBytes = readFileSync(join(dir, "turns.json")); turns = JSON.parse(turnsBytes.toString("utf8")); } catch (e) { reasons.push(`turns.json unreadable: ${e.message}`); }
  if (!Array.isArray(turns) || !turns.length) { reasons.push("turns.json has no turns"); turns = []; }
  const step = (fn) => { try { fn(); } catch (e) { reasons.push(e.message); } };
  if (turns.length) {
    step(() => { if (JSON.stringify(immutableTranscriptTurns(tenantId, sessionId, turns)) !== JSON.stringify(turns)) throw new Error("turns.json does not match its canonical transcript identity (not written by the transcription pipeline?)"); });
    step(() => validateTurns(turns, duration, { tenantId, sessionId }));
    step(() => assertTurnTimings(turns, sessionId));
  }
  const lastTEnd = turns.length ? Math.max(...turns.map((t) => (Number.isFinite(t.tEnd) ? t.tEnd : 0))) : 0;
  const gaps = turns.length ? findTimeGaps(turns, GAP_THRESHOLD_SECONDS) : [];
  const shortfallSec = duration - lastTEnd;
  const coverage = round(Math.min(lastTEnd / duration, 1), 4);
  const partial = turns.length > 0 && (gaps.length > 0 || shortfallSec > SHORTFALL_THRESHOLD_SECONDS);
  if (partial && !acceptPartial) {
    reasons.push(`partial coverage ${(coverage * 100).toFixed(1)}% (${gaps.length} internal gap(s) > ${GAP_THRESHOLD_SECONDS}s, tail shortfall ${round(shortfallSec, 1)}s > ${SHORTFALL_THRESHOLD_SECONDS}s); re-run with --accept-partial to record it as accepted`);
  }
  const { qa, qaSha256, reasons: qaReasons } = await qaEvidence(dir, turns, turnsBytes, duration, env);
  reasons.push(...qaReasons);

  const passed = reasons.length === 0;
  const evidence = { durationSec: duration, turnCount: turns.length, lastTEnd, coverage, partial, shortfallSec: round(shortfallSec, 3),
    gaps: gaps.map((g) => ({ start: g.gapStart, end: g.gapEnd })), qa, qaSha256, turnsSha256: turns.length ? sha(turnsBytes) : null,
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
