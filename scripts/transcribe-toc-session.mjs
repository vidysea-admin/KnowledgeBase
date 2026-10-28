#!/usr/bin/env node
/**
 * scripts/transcribe-toc-session.mjs — T-003 C2. Real CLI: uploads a TOC session's audio file to
 * Gemini's File API, polls until ACTIVE, transcribes+diarizes via generateContent, and writes the
 * parsed turns into data/toc-migrated/<sessionId>/turns.json (replacing T-002's placeholder
 * `speakerRef: "unknown"` entries). Same `tsx/esm/api` register() pattern as seed-toc.mjs for
 * loading packages/ai's TS sources at runtime. REAL network calls, REAL API cost -- not a dry run.
 *
 * Usage: node scripts/transcribe-toc-session.mjs <sessionId>
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { Agent, setGlobalDispatcher } from "undici";
import { findAudioFile, transcriptTenant } from "./lib/find-audio-file.mjs";
import { realUploadTransport } from "./lib/real-upload-transport.mjs";
import { writeTranscriptGeneration } from "./lib/transcript-provenance.mjs";

// Real audio transcription (generateContent processing a large uploaded file server-side) can
// legitimately take several minutes to return headers — undici's default headersTimeout (300s)
// tripped on a real 35MB file during this unit's own first test run. Widen it for this script
// only (a real, long-running CLI tool), not for the library code (packages/ai's fetch calls stay
// on Node's default via apps/api's production transport).
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const AUDIO_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Audio");

const sessionId = process.argv[2];
if (!sessionId) {
  console.error("usage: node scripts/transcribe-toc-session.mjs <sessionId>");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set in environment/.env");
  process.exit(1);
}

register();

const MIME_BY_EXT = { ".m4a": "audio/mp4", ".mp4": "video/mp4", ".mp3": "audio/mpeg" };

async function main() {
  const tenantId = transcriptTenant(DATA_DIR, sessionId);
  const { uploadFile, pollFileState, transcribeUploadedAudio } = await import("../packages/ai/src/stt/gemini-file-upload.ts");

  const { path: audioPath, filename } = findAudioFile(DATA_DIR, AUDIO_DIR, sessionId);
  const mimeType = MIME_BY_EXT[extname(filename).toLowerCase()] ?? "audio/mp4";
  const bytes = readFileSync(audioPath);
  console.log(`uploading ${filename} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, ${mimeType})...`);

  const { fileUri, name } = await uploadFile(bytes, mimeType, realUploadTransport, apiKey, filename);
  console.log(`uploaded: ${name}`);

  const MAX_POLLS = 20;
  const POLL_DELAY_MS = 5000;
  let state = "PROCESSING";
  for (let i = 0; i < MAX_POLLS && state === "PROCESSING"; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
    state = await pollFileState(name, realUploadTransport, apiKey);
    console.log(`poll ${i + 1}/${MAX_POLLS}: ${state}`);
  }
  if (state !== "ACTIVE") {
    throw new Error(`file never became ACTIVE (last state: ${state}) after ${MAX_POLLS} polls`);
  }

  console.log("transcribing...");
  const { turns, usage } = await transcribeUploadedAudio(fileUri, realUploadTransport, apiKey);
  console.log(`got ${turns.length} turns. usage: inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens}`);

  const turnsPath = join(DATA_DIR, sessionId, "turns.json");
  const existingTurns = existsSync(turnsPath) ? JSON.parse(readFileSync(turnsPath, "utf8")) : [];

  // Defense in depth (belt-and-braces alongside gemini-file-upload.ts's own empty-response
  // guard): never overwrite existing turns with an empty result, regardless of why parsing came
  // up empty. A real session already known to have content must never regress to zero turns.
  if (turns.length === 0 && existingTurns.length > 0) {
    throw new Error(
      `transcribeUploadedAudio parsed 0 turns for "${sessionId}" but ${existingTurns.length} ` +
      `existing turn(s) are on disk — refusing to overwrite. Investigate the raw response before retrying.`,
    );
  }
  const realTurns = writeTranscriptGeneration(join(DATA_DIR, sessionId), tenantId, sessionId, turns);
  console.log(`wrote ${realTurns.length} real diarized turns -> ${turnsPath} (replaced ${existingTurns.length} placeholder turn(s))`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
