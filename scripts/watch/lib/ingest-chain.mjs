/**
 * scripts/watch/lib/ingest-chain.mjs — U2 source-watcher `--ingest`. The full auto-ingest chain
 * for ONE new Drive recording: download -> ffmpeg -> transcribe -> skeleton -> seed-toc -> index.
 * Mirrors U1's own by-hand sequence exactly (see this unit's manifest for the precedent
 * citation) — the only NEW piece is `buildAutoSessionSkeleton` (session-skeleton.mjs), because
 * U1 hand-authored its session/session_page files against a human-read transcript, which an
 * unattended watcher cannot do. Split out of run-watch.mjs to keep that file under the repo's
 * own LOC budget (structure.config.json `loc.max`).
 *
 * Throws on any failure; the caller (run-watch.mjs) records `watch_state` status "failed" with
 * the thrown message — this module never swallows an error or marks anything itself.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { slugSessionId, buildAutoSessionSkeleton } from "./session-skeleton.mjs";

const LONG_SESSION_THRESHOLD_SECONDS = 55 * 60;

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim();
}

/** ffprobe duration in seconds, or null if ffprobe fails/unavailable — caller falls back to the
 * short-session transcriber in that case (same default transcribe-toc-session.mjs always was). */
function audioDurationSeconds(path) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], {
      encoding: "utf8",
      timeout: 30_000,
    });
    const seconds = Number.parseFloat(out.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} deps injected paths + the gdrive module (never real I/O baked in directly —
 *   ROOT/RECORDINGS_DIR/AUDIO_DIR/TENANT come from the caller, same shape as every other
 *   Source adapter in this repo).
 */
export async function ingestOneDriveFile(gdrive, gwsRun, file, monthName, deps) {
  const { ROOT, RECORDINGS_DIR, AUDIO_DIR, TENANT } = deps;
  const safeName = safeFileName(file.name);
  const videoPath = join(RECORDINGS_DIR, monthName, safeName);
  mkdirSync(dirname(videoPath), { recursive: true });
  await gdrive.downloadDriveFile(file.id, videoPath, { run: gwsRun });

  const stem = safeName.slice(0, safeName.lastIndexOf(".")) || safeName;
  const audioPath = join(AUDIO_DIR, `${stem}.m4a`);
  mkdirSync(AUDIO_DIR, { recursive: true });
  // Same extraction shape U1 used (matched to an inspected existing file — see its manifest):
  // AAC, 48kHz, stereo, ~96k.
  execFileSync("ffmpeg", ["-y", "-i", videoPath, "-vn", "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "2", audioPath], { timeout: 30 * 60 * 1000 });

  const date = (file.createdTime || new Date().toISOString()).slice(0, 10);
  const title = stem.replace(/^\d+(st|nd|rd|th)?\s*(sep|sept|september)?\s*[-:]?\s*/i, "").trim() || stem;
  let sessionId = slugSessionId(date, title);
  if (existsSync(join(ROOT, "data", "toc-migrated", sessionId))) sessionId = `${sessionId}-${file.id.slice(0, 6).toLowerCase()}`;
  const finalDataDir = join(ROOT, "data", "toc-migrated", sessionId);
  mkdirSync(finalDataDir, { recursive: true });

  // Minimal source.json BEFORE transcription — findAudioFile's direct-match branch (source.json
  // `audioPath`) is what the transcribe scripts need to locate this file, same as a meeting-bot
  // capture ("Bot-captured recordings ... name their audio explicitly, repo-relative — no TOC
  // basename matching needed").
  const relAudioPath = `raw/TOC/TOC-Materials/Audio/${stem}.m4a`;
  const stubSource = { _id: `gdrive-${file.id}`, tenantId: TENANT, kind: "recording", captureMode: "provided", audioPath: relAudioPath, hash: `gdrive-${file.id}`, consent: { given: true, recordedBy: "u2-source-watcher", note: "auto-detected" }, createdAt: new Date().toISOString() };
  writeFileSync(join(finalDataDir, "source.json"), JSON.stringify(stubSource, null, 2));

  const durationSeconds = audioDurationSeconds(audioPath);
  const transcriber = durationSeconds !== null && durationSeconds > LONG_SESSION_THRESHOLD_SECONDS ? "transcribe-long-session.mjs" : "transcribe-toc-session.mjs";
  execFileSync("node", [join(ROOT, "scripts", transcriber), sessionId], { timeout: 2 * 60 * 60 * 1000, stdio: "inherit" });

  const turns = JSON.parse(readFileSync(join(finalDataDir, "turns.json"), "utf8"));
  const skeleton = buildAutoSessionSkeleton({ sessionId, tenantId: TENANT, title, date, driveFileId: file.id, audioPath: relAudioPath, turns });
  writeFileSync(join(finalDataDir, "source.json"), JSON.stringify(skeleton.source, null, 2));
  writeFileSync(join(finalDataDir, "session.json"), JSON.stringify(skeleton.session, null, 2));
  writeFileSync(join(finalDataDir, "session_page.json"), JSON.stringify(skeleton.sessionPage, null, 2));
  writeFileSync(join(finalDataDir, "claims.json"), JSON.stringify(skeleton.claims, null, 2));

  execFileSync("node", [join(ROOT, "scripts", "seed-toc.mjs"), "--sessions", sessionId], { timeout: 5 * 60 * 1000, stdio: "inherit" });

  const { buildIndexer } = await import("../../../apps/api/src/production.ts");
  await buildIndexer()(TENANT, sessionId);

  return sessionId;
}
