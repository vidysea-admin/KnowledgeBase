#!/usr/bin/env node
/**
 * scripts/transcribe-long-session.mjs — T-003 long-audio-chunking. For a session whose real
 * audio duration is too long for a single non-streaming generateContent call (checker-caught
 * real data loss on ~100-minute sessions, commit 709c6c0: transcripts silently stopped around
 * the 60-minute mark), splits the audio into chunkSeconds-sized segments via ffmpeg (stream
 * copy, no re-encode), transcribes each chunk independently through the SAME upload/poll/
 * transcribe pipeline transcribe-toc-session.mjs uses, then stitches the results with
 * packages/ai's mergeChunkedTurns (offset-adjusted timestamps). All-or-nothing: turns.json is
 * only written once the merged result has NO internal gaps — a mid-run failure or an
 * unresolved gap leaves the existing file completely untouched, same "never regress real/
 * placeholder data" guard as every prior script.
 *
 * A chunk can stop transcribing early partway through its own assigned span, and real testing
 * showed this is often a DETERMINISTIC stall (identical retries of the identical span produce
 * the identical shortfall, not a random flake) — so retrying the same span verbatim doesn't
 * help. The fix: when a span exhausts its direct retry attempts still incomplete, recursively
 * re-extract and retranscribe just the unresolved TAIL (from where it actually stopped to the
 * span's end) as its own independent request — a different audio boundary breaks the stall in
 * a way identical retries of the same boundary do not.
 *
 * Usage: node scripts/transcribe-long-session.mjs <sessionId> [chunkSeconds=2400] [--allow-partial]
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { Agent, setGlobalDispatcher } from "undici";
import { findAudioFile } from "./lib/find-audio-file.mjs";
import { realUploadTransport } from "./lib/real-upload-transport.mjs";

// 30 min: a single-call transcription of a ~60-min recording can exceed 10 min before headers (2026-09-24).
setGlobalDispatcher(new Agent({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000 }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const AUDIO_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Audio");
const DEFAULT_CHUNK_SECONDS = 2400; // 40 minutes — headroom under the observed ~60min failure point

const sessionId = process.argv[2];
const rawArgs = process.argv.slice(3);
const allowPartial = rawArgs.includes("--allow-partial");
const chunkSeconds = Number(rawArgs.find((a) => !a.startsWith("--"))) || DEFAULT_CHUNK_SECONDS;
if (!sessionId) {
  console.error("usage: node scripts/transcribe-long-session.mjs <sessionId> [chunkSeconds] [--allow-partial]");
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
  ], { encoding: "utf8" });
  return Number(out.trim());
}

function ffmpegExtractChunk(audioPath, start, end, outPath) {
  execFileSync("ffmpeg", [
    "-y", "-ss", String(start), "-t", String(end - start), "-i", audioPath, "-c", "copy", outPath,
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

const GAP_THRESHOLD_SECONDS = 30; // normal turn-to-turn silence is much shorter than this
const MAX_ATTEMPTS_PER_SPAN = 3; // 1 initial + 2 identical retries, before trying a different boundary
const SHORTFALL_THRESHOLD_SECONDS = 45; // a span's own last turn must land within this of its own length
// Real bug found live (2026-09-04): a 180s floor meant a genuine small tail gap right at a
// chunk boundary (54s, reproduced identically across all 3 top-level attempts) never got a
// real recursive retry at all -- the script just gave up and correctly refused to write,
// but the gap was real and resolvable, not a hard limit. Lowered so a small real gap still
// gets one more real, differently-bounded request instead of being accepted as unresolvable.
const MIN_RECURSE_SECONDS = 20;
const MAX_RECURSE_DEPTH = 3;

async function main() {
  const { uploadFile, pollFileState, transcribeUploadedAudio } = await import("../packages/ai/src/stt/gemini-file-upload.ts");
  const { computeChunkBoundaries, mergeChunkedTurns, findTimeGaps } = await import("../packages/ai/src/stt/chunk-audio.ts");

  const { path: audioPath, filename } = findAudioFile(DATA_DIR, AUDIO_DIR, sessionId);
  const mimeType = MIME_BY_EXT[extname(filename).toLowerCase()] ?? "audio/mp4";
  const ext = extname(filename);

  const durationSeconds = ffprobeDurationSeconds(audioPath);
  const boundaries = computeChunkBoundaries(durationSeconds, chunkSeconds);
  console.log(`${filename}: ${(durationSeconds / 60).toFixed(1)} min real duration -> ${boundaries.length} chunk(s) of up to ${chunkSeconds / 60} min`);

  const tmpDir = mkdtempSync(join(tmpdir(), "lkb-chunk-"));

  async function transcribeSpanOnce(bytes, displayName) {
    const { fileUri, name } = await uploadFile(bytes, mimeType, realUploadTransport, apiKey, displayName);
    const MAX_POLLS = 20;
    const POLL_DELAY_MS = 5000;
    let state = "PROCESSING";
    for (let p = 0; p < MAX_POLLS && state === "PROCESSING"; p++) {
      if (p > 0) await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
      state = await pollFileState(name, realUploadTransport, apiKey);
    }
    if (state !== "ACTIVE") {
      throw new Error(`file never became ACTIVE (last state: ${state}) after ${MAX_POLLS} polls`);
    }
    // GEMINI_STT_MODEL overrides the adapter default (e.g. gemini-3.8-flash for single-call long audio).
    return transcribeUploadedAudio(fileUri, realUploadTransport, apiKey, process.env.GEMINI_STT_MODEL || undefined);
  }

  /** Returns turns local to `spanStart` (tStart/tEnd relative to the span itself, not the
   * original audio) — the caller applies its own offset. Recurses on a persistently-incomplete
   * tail; never throws on incompleteness, just returns the best it could get. */
  async function transcribeSpan(spanStart, spanEnd, depth, label) {
    const spanDuration = spanEnd - spanStart;
    const spanPath = join(tmpDir, `span-${label}${ext}`);
    ffmpegExtractChunk(audioPath, spanStart, spanEnd, spanPath);
    const bytes = readFileSync(spanPath);
    console.log(`${"  ".repeat(depth + 1)}span ${label} [${spanStart}s-${spanEnd}s] (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);

    let best = { turns: [], lastTEnd: 0 };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SPAN; attempt++) {
      const { turns, usage } = await transcribeSpanOnce(bytes, `${filename}-${label}-a${attempt}`);
      const localGaps = findTimeGaps(turns, GAP_THRESHOLD_SECONDS);
      const lastTEnd = turns.length > 0 ? turns[turns.length - 1].tEnd : 0;
      const shortfall = spanDuration - lastTEnd;
      const complete = localGaps.length === 0 && shortfall <= SHORTFALL_THRESHOLD_SECONDS;
      console.log(
        `${"  ".repeat(depth + 1)}attempt ${attempt}/${MAX_ATTEMPTS_PER_SPAN}: ${turns.length} turns, ` +
        `lastTEnd=${lastTEnd}s/${spanDuration.toFixed(0)}s (shortfall ${shortfall.toFixed(0)}s), ` +
        `internalGaps=${localGaps.length}, tokens in=${usage.inputTokens} out=${usage.outputTokens} ` +
        `-> ${complete ? "COMPLETE" : "INCOMPLETE"}`,
      );
      if (lastTEnd > best.lastTEnd) best = { turns, lastTEnd };
      if (complete) return turns;
      if (attempt < MAX_ATTEMPTS_PER_SPAN) console.log(`${"  ".repeat(depth + 1)}retrying (fresh call, same span)...`);
    }

    const remainingStart = spanStart + best.lastTEnd;
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

  const chunkResults = [];
  try {
    for (const [i, { start, end }] of boundaries.entries()) {
      console.log(`\n=== chunk ${i + 1}/${boundaries.length} [${start}s-${end}s] ===`);
      const turns = await transcribeSpan(start, end, 0, `c${i}`);
      chunkResults.push({ offsetSeconds: start, turns });
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const mergedTurns = mergeChunkedTurns(chunkResults);
  console.log(`\nmerged ${chunkResults.length} chunk(s) -> ${mergedTurns.length} total turns`);

  const turnsPath = join(DATA_DIR, sessionId, "turns.json");
  const existingTurns = existsSync(turnsPath) ? JSON.parse(readFileSync(turnsPath, "utf8")) : [];

  if (mergedTurns.length === 0 && existingTurns.length > 0) {
    throw new Error(`merged 0 turns for "${sessionId}" but ${existingTurns.length} existing turn(s) are on disk — refusing to overwrite.`);
  }

  const lastTEnd = mergedTurns.length > 0 ? mergedTurns[mergedTurns.length - 1].tEnd : 0;
  const coveragePercent = ((lastTEnd / durationSeconds) * 100).toFixed(1);
  console.log(`coverage (last-turn/duration only -- NOT sufficient alone): last turn tEnd=${lastTEnd}s vs real duration=${durationSeconds.toFixed(0)}s (${coveragePercent}%)`);

  // The real, load-bearing completeness check (last-turn/duration "coverage" alone missed a real
  // 314s internal gap on this unit's own first chunked run). Refuse to overwrite existing data
  // with a result that still has unresolved gaps -- an incomplete transcript silently accepted
  // as "done" is exactly the failure this whole chunking effort exists to prevent. --allow-partial
  // overrides this for a deliberate, explicitly-flagged partial write.
  const gaps = findTimeGaps(mergedTurns, GAP_THRESHOLD_SECONDS);
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

  const realTurns = mergedTurns.map((t, i) => ({
    _id: `${sessionId}-t${String(i + 1).padStart(3, "0")}`,
    tenantId: "toc",
    sessionId,
    speakerRef: t.speakerRef,
    tStart: t.tStart,
    tEnd: t.tEnd,
    text: t.text,
  }));
  writeFileSync(turnsPath, JSON.stringify(realTurns, null, 2) + "\n", "utf8");
  console.log(`wrote ${realTurns.length} real diarized turns -> ${turnsPath} (replaced ${existingTurns.length} placeholder turn(s))`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
