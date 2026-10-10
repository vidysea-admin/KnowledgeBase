import { bindDerivedArtifacts } from "../../lib/transcript-provenance.mjs";
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
import { slugSessionId, buildAutoSessionSkeleton, deriveSessionDateAndTitle } from "./session-skeleton.mjs";

// ISS-304: was 55*60. transcribe-long-session.mjs's own DEFAULT_CHUNK_SECONDS is 2400 (40 min) —
// its header names that as "headroom under the observed ~60min failure point" for a SINGLE
// generateContent call. Routing anything past 40 min through it (rather than the single-call
// transcribe-toc-session.mjs, which has no gap/coverage check at all) means the real internal-gap
// guard runs on every long recording, not just ones past 55 min. This unit's own first live file
// was 49 min (2939.6s) and would have kept going through the short, unguarded path at the old
// threshold.
const LONG_SESSION_THRESHOLD_SECONDS = 40 * 60;

// ISS-304: the floor a transcript's last turn must reach, as a fraction of the real (ffprobe)
// audio duration, before this chain will report the recording "ingested" rather than "failed".
// transcribe-long-session.mjs's own internal gap guard is stronger (it checks for INTERNAL gaps,
// not just a trailing shortfall) but only runs on the long path; this check runs after EITHER
// transcriber, so a short-path session that silently stopped early is caught the same way this
// unit's own first live file was (last tEnd 2485s of 2939.6s real audio — 84.5%).
const COVERAGE_THRESHOLD = 0.97;

/** Pure. Throws rather than letting a truncated transcript be reported as a successful ingest. */
export function assertCoverage(sessionId, lastTEndSeconds, audioDurationSecondsValue, threshold = COVERAGE_THRESHOLD) {
  if (audioDurationSecondsValue == null || audioDurationSecondsValue <= 0) return; // ffprobe unavailable — nothing to judge coverage against
  const coverage = lastTEndSeconds / audioDurationSecondsValue;
  if (coverage < threshold) {
    throw new Error(
      `ingest coverage guard: "${sessionId}" transcript covers ${(coverage * 100).toFixed(1)}% ` +
        `(last turn tEnd=${lastTEndSeconds}s of ${audioDurationSecondsValue.toFixed(1)}s real audio) — ` +
        `below the ${(threshold * 100).toFixed(0)}% floor. Refusing to report this ingest as a success.`,
    );
  }
}

/** Pure. Throws when a session that HAS turns ends up with zero searchable chunks (ISS-305): an
 * "ingested" session nobody can find via search/ask is not a real success. `skipped ===
 * "no-embedder"` is the one legitimate zero-chunk outcome — no embedding provider configured for
 * this install at all (see `apps/api/src/indexing/session.ts`'s own doc comment); every other
 * skip reason on a session with real turns is a bug, not a deployment choice. */
export function assertIndexed(sessionId, turnsCount, chunkResult) {
  if (turnsCount === 0) return;
  if (chunkResult.written > 0) return;
  if (chunkResult.skipped === "no-embedder") return;
  throw new Error(
    `ingest index guard: "${sessionId}" has ${turnsCount} turns but 0 chunks (reason: ${chunkResult.skipped}) — ` +
      `refusing to report this ingest as a success for a session that would be unsearchable.`,
  );
}

/**
 * Pure. Decides what `run-watch.mjs`'s `--reingest` should do next, given only counts/ids it has
 * already read — never touches disk or Mongo itself (ISS-314).
 *
 * `turnsExist` mirrors the caller's own `existsSync(join(newDir, "turns.json"))` check for the
 * CORRECT session id. Outcomes:
 *  - no turns.json under the correct id at all -> "reingest" (normal path: resolve old id,
 *    delete-if-different, run the full ingest chain — unchanged from before this fix).
 *  - turns.json exists, turnCount>0, chunkCount>0 -> "already-repaired" (existing idempotent
 *    no-op — unchanged from before this fix).
 *  - turns.json exists, turnCount>0, chunkCount===0, AND the old and correct session ids are the
 *    SAME -> "reindex-only". This is the ISS-314 case: a prior run already transcribed/seeded
 *    this exact session under its correct id and then failed (or was interrupted) before
 *    indexing. Re-running the full chain would re-download/re-transcribe into a FORKED id
 *    (ingest-chain's own dir-exists check) while the old `sources._id` row is still there, and
 *    seed-toc's insert then hits E11000 on that unchanged _id. The repair here is narrower and
 *    correct: index the session that is already on disk/in Mongo, nothing else.
 *  - turns.json exists, turnCount>0, chunkCount===0, but old/correct ids DIFFER (or there is no
 *    prior row) -> "reingest" (falls through to the normal delete-if-different + full chain;
 *    that 0-chunk session belongs to a stale/wrong id being cleaned up, not the one being kept).
 */
export function decideReingestAction({ turnsExist, turnCount, chunkCount, oldSessionId, correctSessionId }) {
  if (turnsExist && turnCount > 0 && chunkCount > 0) return { action: "already-repaired" };
  if (turnsExist && turnCount > 0 && chunkCount === 0 && oldSessionId === correctSessionId) {
    return { action: "reindex-only" };
  }
  return { action: "reingest" };
}

/**
 * Pure. Resolves the session id `ingestOneDriveFile` should write under, given whether a
 * directory already exists for the naively-derived `sessionId` and (if so) which Drive file the
 * existing directory's `source.json` names.
 *
 * ISS-314: the old rule forked on ANY existing directory, which conflated two different
 * situations — a genuinely different Drive file that happens to share the same date+title (fork
 * IS correct there, and stays exactly as before), and THIS SAME Drive file already sitting on
 * disk under this exact id mid-repair (0 chunks) — forking that one re-transcribes into a new id
 * while the old `sources._id === "gdrive-<fileId>"` row is untouched, and seed-toc's insert then
 * collides on that unchanged _id (E11000). The second case now throws a clear, named error
 * instead of silently forking; `--reingest` (via `decideReingestAction` above) is the intended
 * repair path for it.
 */
export function resolveSessionIdForIngest(sessionId, dirExists, existingDriveFileId, fileId) {
  if (!dirExists) return sessionId;
  if (existingDriveFileId === fileId) {
    throw new Error(
      `ingest id guard: "${sessionId}" already exists on disk for this exact Drive file (${fileId}) — ` +
        `refusing to fork a new id and re-ingest a duplicate. If this session needs repair (e.g. 0 ` +
        `chunks), use --reingest, which detects and repairs an existing same-id session by re-indexing ` +
        `only — no re-download/re-transcribe/re-seed.`,
    );
  }
  return `${sessionId}-${fileId.slice(0, 6).toLowerCase()}`;
}

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim();
}

/** Pure. Strips a file extension the same way `path.extname` would, EXCEPT it leaves a
 * dot-less name (every hand-named TOC Drive title — Drive stores these with no ".mp4"/".m4a"
 * suffix) completely alone. ISS-306 (part 1): the inline version of this used to be
 * `safeName.slice(0, safeName.lastIndexOf("."))`, which for `lastIndexOf === -1` becomes
 * `slice(0, -1)` — silently drops the LAST character of the whole name instead of leaving it
 * untouched. This unit's own first live file went in as "24th Sep - InFocus" and came out as
 * "24th Sep - InFocu" (see the live ingest log's own ffmpeg output path). */
export function computeStem(safeName) {
  const dotIdx = safeName.lastIndexOf(".");
  return dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
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
  const { ROOT, RECORDINGS_DIR, AUDIO_DIR, TENANT, calendarEvents, programYearFirstYear } = deps;
  const safeName = safeFileName(file.name);
  const videoPath = join(RECORDINGS_DIR, monthName, safeName);
  mkdirSync(dirname(videoPath), { recursive: true });
  await gdrive.downloadDriveFile(file.id, videoPath, { run: gwsRun });

  // ISS-306 (part 1): `safeName.lastIndexOf(".")` is -1 for a Drive title with no extension
  // (every hand-named TOC recording — Drive stores these as e.g. "24th Sep : InFocus", no
  // ".mp4"). `slice(0, -1)` then drops the LAST CHARACTER of the whole name instead of leaving it
  // alone — this unit's own first live file downloaded fine but landed as
  // "24th Sep - InFocu.m4a" (see the live log), one letter short, because `-1` was treated as "no
  // dot" AND "index -1" by the same expression. `dotIdx > 0` (not just `!== -1`) also guards a
  // theoretical leading-dot name from being stripped to nothing.
  const stem = computeStem(safeName);
  const audioPath = join(AUDIO_DIR, `${stem}.m4a`);
  mkdirSync(AUDIO_DIR, { recursive: true });
  // Same extraction shape U1 used (matched to an inspected existing file — see its manifest):
  // AAC, 48kHz, stereo, ~96k.
  execFileSync("ffmpeg", ["-y", "-i", videoPath, "-vn", "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "2", audioPath], { timeout: 30 * 60 * 1000 });

  // ISS-306 (part 2): date/title now come from `file.name` itself (the Drive title, e.g. "24th
  // Sep : InFocus"), cross-checked against the TOC calendar — NOT from `file.createdTime` (the
  // Drive upload timestamp, one day late on this unit's own first live file) or from the
  // filesystem-mangled `stem` above (which exists only to name the downloaded audio file, and
  // should never have doubled as the semantic title source).
  const { date, title } = deriveSessionDateAndTitle({
    rawName: file.name,
    createdTime: file.createdTime,
    calendarEvents,
    programYearFirstYear,
  });
  let sessionId = slugSessionId(date, title);
  const candidateDir = join(ROOT, "data", "toc-migrated", sessionId);
  const dirExists = existsSync(candidateDir);
  let existingDriveFileId = null;
  if (dirExists) {
    const existingSourcePath = join(candidateDir, "source.json");
    if (existsSync(existingSourcePath)) {
      try {
        const existingSource = JSON.parse(readFileSync(existingSourcePath, "utf8"));
        existingDriveFileId =
          typeof existingSource?._id === "string" && existingSource._id.startsWith("gdrive-")
            ? existingSource._id.slice("gdrive-".length)
            : null;
      } catch {
        existingDriveFileId = null; // unreadable/corrupt source.json — treat as unknown, fall through to fork below
      }
    }
  }
  sessionId = resolveSessionIdForIngest(sessionId, dirExists, existingDriveFileId, file.id);
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
  // ISS-304: refuse to report success on a transcript that stops well short of the real audio.
  const lastTEnd = turns.length > 0 ? turns[turns.length - 1].tEnd : 0;
  assertCoverage(sessionId, lastTEnd, durationSeconds);

  const skeleton = buildAutoSessionSkeleton({ sessionId, tenantId: TENANT, title, date, driveFileId: file.id, audioPath: relAudioPath, turns });
  writeFileSync(join(finalDataDir, "source.json"), JSON.stringify(skeleton.source, null, 2));
  writeFileSync(join(finalDataDir, "session.json"), JSON.stringify(skeleton.session, null, 2));
  writeFileSync(join(finalDataDir, "session_page.json"), JSON.stringify(skeleton.sessionPage, null, 2));
  writeFileSync(join(finalDataDir, "claims.json"), JSON.stringify(skeleton.claims, null, 2));
  bindDerivedArtifacts(finalDataDir);

  execFileSync("node", [join(ROOT, "scripts", "seed-toc.mjs"), "--sessions", sessionId], { timeout: 5 * 60 * 1000, stdio: "inherit" });

  const { buildIndexer } = await import("../../../apps/api/src/composition/production.ts");
  const indexResult = await buildIndexer()(TENANT, sessionId);
  // ISS-305: refuse to report success on a session that indexed with zero searchable chunks.
  assertIndexed(sessionId, turns.length, indexResult.chunks);

  return sessionId;
}
