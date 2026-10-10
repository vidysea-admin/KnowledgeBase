#!/usr/bin/env node
/**
 * scripts/watch/run-watch.mjs — U2 source-watcher (plan §U2, "the core of 'don't remind me'").
 * ONE run that answers "what's new?" across three sources — TOC Drive recordings, work Gmail
 * meeting mail, and TOC's own events calendar CSV — and writes a digest.
 *
 * Same `tsx/esm/api` register() pattern every other script in this repo uses to load
 * packages/*'s TypeScript sources at runtime (seed-toc.mjs, sync-session.mjs) — no separate
 * compile step.
 *
 * Modes:
 *   (no flag)   "watch" — lists findings, writes the digest + a `watch_reports` row, and marks
 *               every Drive file it saw in `watch_state` (status "seen") so a later run's diff
 *               never reports it as new again. Does NOT download or transcribe anything.
 *   --dry-run   Lists findings only. Writes NOTHING — no digest file, no Mongo row, no
 *               `watch_state` write, no download. This is the mode the live-check evidence in
 *               this unit's manifest was produced with.
 *   --ingest    Everything "watch" does, PLUS: for each NEW Drive recording, downloads it,
 *               extracts audio, transcribes it, seeds it into data/toc-migrated/ + Mongo, and
 *               indexes it — the SAME production chain U1 ran by hand (download -> ffmpeg ->
 *               transcribe-*.mjs -> seed-toc.mjs -> buildIndexer). One recording at a time,
 *               guarded by a lock file so two runs never overlap. A failed recording is recorded
 *               as `status: "failed"` in `watch_state` and reported in the digest — never
 *               silently skipped or retried automatically.
 *
 * Idempotence: `watch_state` is the dedup record. A Drive file already present there (any
 * status) is never reported as "new" again — running this script twice finds nothing new and
 * ingests nothing twice (packages/ingest/src/sources/gdrive.ts's `diffNewDriveFiles` is the pure
 * function this claim rests on; this script is a thin composition around it).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { execFile } from "node:child_process";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { ingestOneDriveFile, decideReingestAction, assertIndexed } from "./lib/ingest-chain.mjs";
import { buildHeartbeatDoc } from "./lib/heartbeat.mjs";
import { resolveWatchRoot, mainTreeCandidates } from "./lib/main-tree.mjs";

register(); // let subsequent dynamic import()s of packages/*'s .ts sources resolve

// u2-fix1: `LKB_MAIN_TREE_ROOT` already existed as a best-effort SECOND read location
// (`loadIngestedDriveIds`) for exactly this reason — `raw/`/`data/` are gitignored per-worktree,
// so a fix branch built in a worktree has none of the real production files a live repair needs
// to act on. Promoted here to a full ROOT override: when set, EVERY path this script touches
// (Recordings/Audio/data/lock/watch digest) resolves against the real tree, not the worktree's
// own copy — the mechanism the u2-fix1-ingest-guards manifest's live repair (ISS-304/305/306)
// runs under, so the FIXED CODE (committed only in the worktree, per this unit's hard rule) can
// still act on production data/raw/Mongo exactly as a normal `--ingest` run would. Unset (the
// default), behavior is identical to before this change.
const ROOT = resolveWatchRoot(import.meta.url);
const TENANT = "toc";
const DRIVE_ROOT_FOLDER_ID = "1STZ-ctQbiy_zV82xbqnbeJRHhmGemewh";
const RECORDINGS_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Recordings");
const AUDIO_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Audio");
const CALENDAR_CSV = join(ROOT, "raw", "TOC", "TOC-Materials", "_csv", "calendar1.csv");
const CALENDAR_FIRST_YEAR = 2026; // the sheet's own first month header (APRIL) — see toc-calendar.ts
const WATCH_DIR = join(ROOT, "qa", "watch");
const LOCK_PATH = join(ROOT, "data", ".watch.lock");
const DRY_RUN = process.argv.includes("--dry-run");
const INGEST = process.argv.includes("--ingest");
const REINGEST_IDX = process.argv.indexOf("--reingest");
const REINGEST_DRIVE_ID = REINGEST_IDX >= 0 ? process.argv[REINGEST_IDX + 1] : null;
// The db name every OTHER entry point in this repo defaults to (apps/api/src/index.ts,
// scripts/webinar/sync-session.mjs, scripts/seed-toc.mjs, scripts/backfill.mjs, ...) when
// MONGODB_DB isn't set. ISS-305's root cause: this file was the one caller in the whole repo that
// omitted the fallback, so `connect(url, undefined)` fell through to whatever database the
// connection STRING itself defaults to — silently a different database than "lkb", where
// seed-toc.mjs (every other caller's same fallback) had actually written the turns. `indexSession`
// then queried an empty collection and printed "no chunkable turns" for a session that had 27 real
// ones, just in the other database.
const MONGODB_DB = process.env.MONGODB_DB ?? "lkb";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// --- U4a (u4a-watch-failure-alerts, D-046) pure decision helpers — no I/O, exported so they are
// independently unit-testable the moment a scripts/watch/run-watch.test.mjs exists (this cycle
// did not add one — see this unit's manifest, "What this unit does NOT do"). ---

/** R1 (spec.md): alert only on a genuine transition INTO "failed" — never on a repeat failure of
 * a source that was already failed, which is spec.md's "one alert, then silence until it changes
 * state" throttle, keyed by (tenantId, sourceType, sourceId) via `watch_state`'s own composite
 * `_id`. `priorStatus` is the STATUS FIELD of the `watch_state` row read before this run's write
 * (`undefined` when no row exists yet, e.g. the source's first-ever poll). */
export function shouldAlertPollFailed(priorStatus) {
  return priorStatus !== "failed";
}

/** R3 (spec.md): a coarse "is this meeting close enough to alert about now" filter — today or
 * tomorrow (UTC calendar date), evaluated against `now`. Deliberately narrow (not the full
 * 14-day upcoming window `findings.upcoming` itself covers) because nothing in this file persists
 * which upcoming items were already alerted on across separate `run-watch.mjs` process runs, so a
 * wide window would re-alert on the same meeting every tick until its date passed. See this
 * unit's manifest for why that residual repeat-alert risk (within a 2-day window, across ticks)
 * is disclosed rather than fully closed in this cycle. */
export function isImminentDate(dateStr, now) {
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target)) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((target - todayUtc) / 86_400_000);
  return diffDays >= 0 && diffDays <= 1;
}

// --- U4b/R2 heartbeat-liveness helpers MOVED OUT to ./lib/heartbeat.mjs (D-048 items 5+6, closing
// ISS-360: they shipped with no committed test because a test file was itself an unauthorized new
// file). The five pure functions — watchHeartbeatIntervalMs, isHeartbeatStale, findStaleHeartbeats,
// watchHeartbeatId, buildHeartbeatDoc — now live there with lib/heartbeat.test.mjs beside them, the
// same lib/*.mjs + lib/*.test.mjs pair pattern digest/lock/ingest-chain/session-skeleton already use.
// This file keeps only the WRITER half (`markHeartbeat` below); the DETECTOR is
// apps/api/src/routes/health.ts, deliberately a different process — one that lived here would die
// with this script, which is the exact failure R2 exists to catch.

// --- real gws runner (same shape as apps/api/src/gws-gmail.ts's runGws/parseGwsJson — cannot
// import it: ARCHITECTURE §5 is apps -> packages, never a script depending the OTHER way is fine,
// but gdrive.ts (packages/ingest) importing apps/api would not be; this file is a script, not a
// package, so it MAY import apps/api directly (precedent: scripts/webinar/sync-session.mjs
// dynamically imports apps/api/src/production.ts) — the small runGws copy here is just to hand
// the SAME shape into gdrive.ts's injected `run` without a package boundary violation). ---
function runGws(args) {
  return new Promise((resolvePromise, reject) => {
    execFile("cmd", ["/c", "gws", ...args], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(err); return; }
      resolvePromise(stdout);
    });
  });
}

function loadIngestedDriveIds(now) {
  // Cross-check against U1's own drive-manifest.json for the current month, if one exists — the
  // first run after a manual catch-up (like U1's) predates any watch_state row for those files.
  // Checked in BOTH this worktree/tree AND (best-effort) a configurable "main tree" root, since
  // Recordings/ is gitignored per-worktree (never shared across git worktrees) — see this unit's
  // manifest for why LKB_MAIN_TREE_ROOT exists.
  const month = MONTHS[now.getUTCMonth()];
  const rel = join("raw", "TOC", "TOC-Materials", "Recordings", month, "_drive-manifest.json");
  const candidates = mainTreeCandidates(ROOT, rel);
  const ids = new Set();
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const arr = JSON.parse(readFileSync(p, "utf8"));
      for (const f of arr) if (f?.id) ids.add(f.id);
    } catch {
      // malformed manifest — ignore, not fatal to a watch run
    }
  }
  return ids;
}

async function findCurrentMonthFolder(gdrive, now) {
  const monthName = MONTHS[now.getUTCMonth()];
  const yy = String(now.getUTCFullYear()).slice(-2);
  const subfolders = await gdrive.listDriveSubfolders(DRIVE_ROOT_FOLDER_ID, { run: runGws });
  return gdrive.findMonthFolder(subfolders, monthName, yy);
}

async function main() {
  const now = new Date();
  const { listDriveSubfolders, listDriveFiles, downloadDriveFile, findMonthFolder, diffNewDriveFiles } = await import(
    "../../packages/ingest/src/sources/gdrive.ts"
  );
  const gdrive = { listDriveSubfolders, listDriveFiles, downloadDriveFile, findMonthFolder, diffNewDriveFiles };
  const { parseTocCalendar, upcomingTocEvents } = await import("../../packages/ingest/src/sources/toc-calendar.ts");
  const { buildDigest } = await import("./lib/digest.mjs");
  // U4a (D-046): same construction as record-commands.ts's default — reads
  // TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, degrades to `enabled: false` (never throws) when unset,
  // so a watch tick with no Telegram configured behaves exactly as before this unit.
  const { createTelegramNotifier } = await import("../../packages/meeting-bot/src/capture/telegram-alerts.ts");
  const telegram = createTelegramNotifier();

  // u2-fix1: parsed once, up front, and hoisted (was scoped inside step 3's own try block) so
  // `--ingest`/`--reingest` can hand the SAME calendar rows to `deriveSessionDateAndTitle`
  // (ISS-306) that step 3 below uses for the "upcoming" digest section — one parse, one source of
  // truth, never a second copy that could drift from what a human reading the digest just saw.
  let calendarEvents = [];
  if (existsSync(CALENDAR_CSV)) {
    try {
      calendarEvents = parseTocCalendar(readFileSync(CALENDAR_CSV, "utf8"), CALENDAR_FIRST_YEAR);
    } catch {
      // step 3 below re-attempts the same read/parse and records the error properly; this
      // pre-parse is best-effort only (id derivation degrades to its own createdTime fallback).
    }
  }

  if (REINGEST_DRIVE_ID) {
    await runReingest(gdrive, REINGEST_DRIVE_ID, calendarEvents, now);
    return;
  }

  const findings = {
    runAt: now.toISOString(),
    mode: DRY_RUN ? "dry-run" : INGEST ? "ingest" : "watch",
    driveNew: [],
    driveIngested: [],
    driveFailed: [],
    upcoming: [],
    pastRecordingPending: [],
  };
  const errors = [];

  // --- 1. TOC Drive recordings ---
  let monthFolder;
  let newDriveFiles = [];
  try {
    monthFolder = await findCurrentMonthFolder(gdrive, now);
    if (monthFolder) {
      const files = await gdrive.listDriveFiles(monthFolder.id, { run: runGws });
      const seenIds = DRY_RUN ? new Set() : await loadSeenDriveIds();
      const ingestedIds = loadIngestedDriveIds(now);
      newDriveFiles = gdrive.diffNewDriveFiles(files, seenIds, ingestedIds);
      findings.driveNew = newDriveFiles.map((f) => ({ id: f.id, name: f.name }));
    } else {
      errors.push(`no Drive subfolder found for ${MONTHS[now.getUTCMonth()]} under root ${DRIVE_ROOT_FOLDER_ID}`);
    }
  } catch (err) {
    errors.push(`Drive listing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await markHeartbeatFor("drive", new Date().toISOString()); // R2: phase 1 completed (see markHeartbeatFor)

  // --- 2. Work Gmail ---
  try {
    const { scanGmailForMeetingCandidates } = await import("../../apps/api/src/gws-gmail.ts");
    // 60, not the function's own default of 15: the real inbox has ~200 matches for this query
    // (mostly internal Google Calendar invite noise — the query is sender/host-driven, not a
    // topic filter), and the real CBSE recording mail this unit's live check depends on sat at
    // rank 37 of the newest matches on 2026-09-25 — a smaller cap silently missed it.
    const candidates = await scanGmailForMeetingCandidates(60);
    for (const c of candidates) {
      if (c.kind === "upcoming" && c.startTime) {
        const date = c.startTime.slice(0, 10);
        findings.upcoming.push({
          date,
          agenda: c.subject,
          source: "gmail",
          joinLink: Boolean(c.meetingUrl) && !c.registrationOnly,
          registrationOnly: Boolean(c.registrationOnly),
        });
        // R3 (spec.md, D-046): naming the meeting and why it was surfaced. See isImminentDate's
        // doc comment for why this is narrowed to today/tomorrow rather than the full 14-day
        // upcoming window.
        if (isImminentDate(date, now)) {
          const reason = c.registrationOnly
            ? "Gmail scan found this meeting mail (registration-only)"
            : "Gmail scan found this meeting mail with a join link";
          telegram.notifyUpcomingRecording(c.subject, reason, c.startTime);
        }
      } else if (c.kind === "past-recording") {
        findings.pastRecordingPending.push({ subject: c.subject, senderEmail: c.senderEmail, recordingUrl: c.recordingUrl });
      }
    }
  } catch (err) {
    errors.push(`Gmail scan failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await markHeartbeatFor("gmail", new Date().toISOString()); // R2: phase 2 completed

  // --- 3. TOC calendar CSV ---
  try {
    if (existsSync(CALENDAR_CSV)) {
      // Re-derived only if the pre-parse above (now hoisted `calendarEvents`) came up empty —
      // normally this is just reusing that same array, not a second parse.
      if (calendarEvents.length === 0) {
        calendarEvents = parseTocCalendar(readFileSync(CALENDAR_CSV, "utf8"), CALENDAR_FIRST_YEAR);
      }
      const upcoming = upcomingTocEvents(calendarEvents, now, 14);
      for (const e of upcoming) {
        const membersZoom = (e.mode || "").toLowerCase() === "virtual" && (e.location || "").toLowerCase() === "zoom";
        findings.upcoming.push({ date: e.date, agenda: e.agenda, source: "toc-calendar", membersZoom });
        // R3 (spec.md, D-046) — see the Gmail branch above for why this is imminent-only.
        if (isImminentDate(e.date, now)) {
          const reason = membersZoom
            ? "on the TOC events calendar (members-only Zoom)"
            : "on the TOC events calendar";
          telegram.notifyUpcomingRecording(e.agenda, reason, e.date);
        }
      }
    } else {
      errors.push(`calendar CSV not found at ${CALENDAR_CSV}`);
    }
  } catch (err) {
    errors.push(`calendar parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await markHeartbeatFor("calendar", new Date().toISOString()); // R2: phase 3 completed

  findings.upcoming.sort((a, b) => a.date.localeCompare(b.date));

  // --- 4. --ingest: the download/transcribe/seed/index chain, one at a time under a lock ---
  if (INGEST && newDriveFiles.length > 0) {
    const { acquireLock, releaseLock } = await import("./lib/lock.mjs");
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    const lock = acquireLock(LOCK_PATH);
    if (!lock.acquired) {
      errors.push(`--ingest: another run already holds the lock (held since ${lock.heldSince}) — skipping ingest this run`);
    } else {
      try {
        const monthName = MONTHS[now.getUTCMonth()];
        for (const file of newDriveFiles) {
          try {
            const sessionId = await ingestOneDriveFile(gdrive, runGws, file, monthName, {
              ROOT, RECORDINGS_DIR, AUDIO_DIR, TENANT, calendarEvents, programYearFirstYear: CALENDAR_FIRST_YEAR,
            });
            findings.driveIngested.push({ id: file.id, name: file.name, sessionId });
            await markDriveState(file.id, "ingested", { sessionId });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            // R1 (spec.md, D-046): read the PRIOR watch_state row before overwriting it, so the
            // alert fires only on a genuine transition into "failed" — shouldAlertPollFailed is
            // the (tenantId, sourceType, sourceId)-scoped "one alert, then silence until it
            // changes state" throttle spec.md asks for, not the notifier's own time-based one.
            const priorStatus = (await readDriveWatchState(file.id))?.status;
            findings.driveFailed.push({ id: file.id, name: file.name, reason });
            await markDriveState(file.id, "failed", { failureReason: reason });
            if (shouldAlertPollFailed(priorStatus)) {
              telegram.notifyPollFailed(TENANT, "drive", file.id, new Date().toISOString(), reason);
            }
          }
        }
      } finally {
        releaseLock(LOCK_PATH);
      }
    }
  }

  // --- 5. write outputs ---
  const digest = buildDigest(findings);
  console.log(digest);

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written (no digest file, no Mongo row, no watch_state).");
    return;
  }

  mkdirSync(WATCH_DIR, { recursive: true });
  const digestFileName = `${now.toISOString().slice(0, 10)}.md`;
  const digestPath = join(WATCH_DIR, digestFileName);
  writeFileSync(digestPath, digest);

  // Mark every Drive file this run SAW (not just ingested) as seen, so a re-run's diff excludes
  // it — this is the idempotence guarantee: "running twice finds nothing new".
  for (const f of newDriveFiles) {
    const alreadyHandled = findings.driveIngested.some((d) => d.id === f.id) || findings.driveFailed.some((d) => d.id === f.id);
    if (!alreadyHandled) await markDriveState(f.id, "seen", {});
  }

  await recordReport(findings, `qa/watch/${digestFileName}`, errors);

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s) this run:`);
    for (const e of errors) console.error(`  - ${e}`);
  }
}

async function loadSeenDriveIds() {
  const { connect } = await import("../../packages/db/src/client.js");
  const { listSeenIds } = await import("../../packages/db/src/collections/watch-state.js");
  await connect(process.env.MONGODB_URL, MONGODB_DB);
  return listSeenIds(TENANT, "drive");
}

/** R1 (spec.md, D-046): the prior `watch_state` row for one Drive source, read BEFORE this run
 * overwrites it — `shouldAlertPollFailed` needs `priorStatus` from the state as it stood before
 * the current failure, never the just-written one. Returns `null` on a first-ever poll (no row
 * yet) or if the read itself fails — a failed READ must never crash the ingest loop it guards; it
 * degrades to "alert" (the safer default: an extra alert beats a silently swallowed one). */
async function readDriveWatchState(sourceId) {
  try {
    const { findWatchState } = await import("../../packages/db/src/collections/watch-state.js");
    return await findWatchState(TENANT, "drive", sourceId);
  } catch {
    return null;
  }
}

/** R2 WRITE half (D-048). Upserts this run's heartbeat for one source type through the tenant-scoped
 * accessor (`markHeartbeat`, packages/db/src/collections/watch-heartbeat.ts) — never a raw
 * `db.collection()` handle, so R8's tenancy guarantee holds here exactly as it does for watch_state.
 *
 * Called at the END of each phase, whether that phase succeeded or caught and logged into
 * `errors[]`: either way the PROCESS is alive and got back to this point, which is the only thing a
 * liveness heartbeat claims. Only a crash/hang/kill BEFORE reaching here skips the write — precisely
 * what the detector must see.
 *
 * `--dry-run` writes nothing (it writes no watch_state row either), and a FAILED heartbeat write is
 * logged, never thrown: a liveness write must not be the thing that takes down the run it measures.
 * `connect` is idempotent (client.ts returns the existing Db), so calling it here is safe whether or
 * not a phase already connected — needed because step 1 can fail before `loadSeenDriveIds` connects. */
async function markHeartbeatFor(sourceType, completedAt) {
  if (DRY_RUN) return;
  try {
    const { connect } = await import("../../packages/db/src/client.js");
    await connect(process.env.MONGODB_URL, MONGODB_DB);
    const { markHeartbeat } = await import("../../packages/db/src/collections/watch-heartbeat.js");
    await markHeartbeat(TENANT, buildHeartbeatDoc(TENANT, sourceType, completedAt));
  } catch (err) {
    console.error(`heartbeat write failed for ${sourceType}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function markDriveState(sourceId, status, extra) {
  const { markWatchState } = await import("../../packages/db/src/collections/watch-state.js");
  await markWatchState(TENANT, {
    sourceType: "drive",
    sourceId,
    status,
    seenAt: new Date().toISOString(),
    ...(status === "ingested" ? { ingestedAt: new Date().toISOString() } : {}),
    ...(status === "failed" ? { failedAt: new Date().toISOString() } : {}),
    ...extra,
  });
}

/**
 * `--reingest <driveFileId>` — the u2-fix1 live repair for ISS-304/305/306. NOT the normal
 * `--ingest` diff path (that path's own `watch_state`/manifest exclusion rules would just skip a
 * file already marked "ingested" or already present in U1's drive-manifest — by design, so a
 * daily watch run never re-does old work). This is a deliberate, targeted, idempotent re-run of
 * ONE already-(mis)ingested file: delete its bad rows under the tenant `toc` (scoped to the exact
 * old sessionId only — never a wider tenant purge), remove its `data/toc-migrated/<oldId>` dir,
 * then re-run the SAME `ingestOneDriveFile` chain a normal ingest would, now producing the
 * corrected id/coverage/chunks.
 *
 * Idempotent: if the CORRECT session (by the id this run would derive right now) already exists
 * on disk with real chunks in Mongo, this returns `action: "already-repaired"` and touches
 * NOTHING — no delete, no download, no re-transcription, no Gemini spend. A second run against
 * the same driveFileId after a successful repair is a no-op for exactly this reason.
 */
async function runReingest(gdrive, driveFileId, calendarEvents, now) {
  const { connect } = await import("../../packages/db/src/client.js");
  const { findWatchState } = await import("../../packages/db/src/collections/watch-state.js");
  const db = await connect(process.env.MONGODB_URL, MONGODB_DB);
  console.log(`--reingest ${driveFileId}: connected to Mongo db "${db.databaseName}"`);

  const monthFolder = await findCurrentMonthFolder(gdrive, now);
  if (!monthFolder) throw new Error(`--reingest: no Drive subfolder found for ${MONTHS[now.getUTCMonth()]}`);
  const files = await gdrive.listDriveFiles(monthFolder.id, { run: runGws });
  const file = files.find((f) => f.id === driveFileId);
  if (!file) throw new Error(`--reingest: Drive file ${driveFileId} not found in ${MONTHS[now.getUTCMonth()]}'s folder`);
  console.log(`--reingest: found "${file.name}" (${driveFileId})`);

  const { deriveSessionDateAndTitle, slugSessionId } = await import("./lib/session-skeleton.mjs");
  const { date, title } = deriveSessionDateAndTitle({
    rawName: file.name, createdTime: file.createdTime, calendarEvents, programYearFirstYear: CALENDAR_FIRST_YEAR,
  });
  const correctSessionId = slugSessionId(date, title);
  console.log(`--reingest: corrected id would be "${correctSessionId}" (date=${date}, title="${title}")`);

  const priorRow = await findWatchState(TENANT, "drive", driveFileId);
  console.log(`--reingest: prior watch_state row (in db "${db.databaseName}"): ${priorRow ? JSON.stringify({ status: priorRow.status, sessionId: priorRow.sessionId }) : "none"}`);
  // Prefer the authoritative Mongo link (sources._id -> sessions.sourceId) over watch_state's own
  // sessionId: this unit's own first live run hit ISS-305's SAME root cause a second way — the
  // watch_state row it wrote landed in whatever db `MONGODB_DB` fell through to at the time (not
  // necessarily "lkb", where the real ingested rows live), so a repair that only trusted
  // watch_state could find no row at all and skip the delete phase despite real bad data sitting
  // in "lkb". A session's `sourceId` pointing back at this exact Drive file's source doc is true
  // regardless of which database `watch_state` itself ended up in.
  const oldSource = await db.collection("sources").findOne({ tenantId: TENANT, _id: `gdrive-${driveFileId}` });
  const oldSessionFromMongo = oldSource
    ? (await db.collection("sessions").findOne({ tenantId: TENANT, sourceId: oldSource._id }))?._id ?? null
    : null;
  const oldSessionId = oldSessionFromMongo ?? priorRow?.sessionId ?? null;
  console.log(`--reingest: old sessionId resolved to "${oldSessionId ?? "(none)"}" (via ${oldSessionFromMongo ? "sources->sessions link" : priorRow?.sessionId ? "watch_state fallback" : "neither — nothing found"})`);

  const newDir = join(ROOT, "data", "toc-migrated", correctSessionId);
  const turnsExist = existsSync(join(newDir, "turns.json"));
  let turnCount = 0;
  let chunkCount = 0;
  if (turnsExist) {
    turnCount = await db.collection("turns").countDocuments({ tenantId: TENANT, sessionId: correctSessionId });
    chunkCount = await db.collection("chunks").countDocuments({ tenantId: TENANT, sourceRef: correctSessionId });
    console.log(`--reingest: "${correctSessionId}" already has turns.json on disk — ${turnCount} turns, ${chunkCount} chunks in Mongo.`);
  }

  const decision = decideReingestAction({ turnsExist, turnCount, chunkCount, oldSessionId, correctSessionId });
  console.log(`--reingest: decision = ${decision.action}`);

  if (decision.action === "already-repaired") {
    console.log(`--reingest: "${correctSessionId}" already exists with ${turnCount} turns and ${chunkCount} chunks — nothing to do (idempotent no-op).`);
    return;
  }

  // ISS-314: turns/seed already succeeded under the CORRECT id (oldSessionId === correctSessionId)
  // but indexing didn't (0 chunks) — e.g. a prior run failed/was interrupted between seed-toc and
  // buildIndexer. Re-running the full chain here would hit ingest-chain's own dir-exists guard,
  // which now REFUSES to fork a duplicate id for this exact Drive file (resolveSessionIdForIngest)
  // rather than silently forking + re-transcribing into E11000. So instead of calling
  // ingestOneDriveFile at all, repair narrowly: index the session that is already there, nothing
  // else — no re-download, no re-transcribe, no re-seed, and no rows deleted below.
  if (decision.action === "reindex-only") {
    console.log(
      `--reingest: "${correctSessionId}" has ${turnCount} turns but 0 chunks under its own correct id — ` +
        `repairing by re-indexing only (no re-download/re-transcribe/re-seed).`,
    );
    const { buildIndexer } = await import("../../apps/api/src/composition/production.ts");
    const indexResult = await buildIndexer()(TENANT, correctSessionId);
    assertIndexed(correctSessionId, turnCount, indexResult.chunks);
    await markDriveState(driveFileId, "ingested", { sessionId: correctSessionId, repairedFrom: oldSessionId });
    console.log(
      `--reingest: DONE (reindex-only). driveFileId=${driveFileId} sessionId=${correctSessionId} ` +
        `chunks=${indexResult.chunks.written}`,
    );
    return;
  }

  const before = {};
  const after = {};
  if (oldSessionId) {
    const filters = {
      sources: { tenantId: TENANT, _id: `gdrive-${driveFileId}` },
      sessions: { tenantId: TENANT, _id: oldSessionId },
      turns: { tenantId: TENANT, sessionId: oldSessionId },
      session_pages: { tenantId: TENANT, sessionId: oldSessionId },
      claims: { tenantId: TENANT, "evidence.sessionId": oldSessionId },
      chunks: { tenantId: TENANT, sourceRef: oldSessionId },
    };
    for (const [coll, filter] of Object.entries(filters)) before[coll] = await db.collection(coll).countDocuments(filter);
    // tree_index has no per-session row (one root doc per tenant, built FROM all sessions) —
    // there is nothing scoped to this sessionId to delete here; `indexSession`'s own
    // `regenerate()` call, reached via the re-ingest below, folds the corrected session back into
    // it. Reported for visibility only, never targeted for deletion.
    before.tree_index = await db.collection("tree_index").countDocuments({ tenantId: TENANT });

    console.log(`--reingest: before-delete counts for old sessionId "${oldSessionId}":`, before);
    if (oldSessionId !== correctSessionId) {
      for (const [coll, filter] of Object.entries(filters)) {
        const res = await db.collection(coll).deleteMany(filter);
        after[coll] = before[coll] - res.deletedCount;
      }
      after.tree_index = before.tree_index;
      const oldDir = join(ROOT, "data", "toc-migrated", oldSessionId);
      if (existsSync(oldDir)) {
        const { rmSync } = await import("node:fs");
        rmSync(oldDir, { recursive: true, force: true });
        console.log(`--reingest: removed ${oldDir}`);
      }
    } else {
      for (const coll of Object.keys(filters)) after[coll] = before[coll];
    }
    console.log(`--reingest: after-delete counts:`, after);
  } else {
    console.log("--reingest: no prior watch_state row/sessionId — nothing to delete, proceeding straight to re-ingest.");
  }

  // No intermediate "pending" marker here: `watch_state.schema.json`'s `status` enum is
  // `["seen", "ingested", "failed"]` — a real, deliberate contract other readers (the diff,
  // `listSeenIds`) rely on, and this repair is not the place to widen it for a transient state a
  // single synchronous call doesn't need. The row is only touched again once the outcome is known.
  const monthName = MONTHS[now.getUTCMonth()];
  try {
    const sessionId = await ingestOneDriveFile(gdrive, runGws, file, monthName, {
      ROOT, RECORDINGS_DIR, AUDIO_DIR, TENANT, calendarEvents, programYearFirstYear: CALENDAR_FIRST_YEAR,
    });
    await markDriveState(driveFileId, "ingested", { sessionId, repairedFrom: oldSessionId });
    console.log(`--reingest: DONE. driveFileId=${driveFileId} oldSessionId=${oldSessionId ?? "(none)"} newSessionId=${sessionId}`);
    console.log(`--reingest: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markDriveState(driveFileId, "failed", { failureReason: reason });
    throw err;
  }
}

async function recordReport(findings, digestPath, errors) {
  const { recordWatchReport } = await import("../../packages/db/src/collections/watch-reports.js");
  await recordWatchReport(TENANT, {
    _id: `${TENANT}-${findings.runAt}`,
    runAt: findings.runAt,
    mode: findings.mode === "ingest" ? "ingest" : "watch",
    digestPath,
    driveNewFound: findings.driveNew.length,
    driveIngested: findings.driveIngested.length,
    driveFailed: findings.driveFailed.length,
    gmailPastRecordingPending: findings.pastRecordingPending.length,
    upcomingCount: findings.upcoming.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

// U4a: guarded (same idiom as scripts/lint-loc.mjs) so this module can be `import()`ed — e.g. for
// its exported pure helpers, `shouldAlertPollFailed`/`isImminentDate` — without running `main()`'s
// real Drive/Gmail/Mongo I/O. Behavior when run directly (`node run-watch.mjs ...`, the only way
// this script is invoked today — checked, nothing imports it as a module) is unchanged.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main()
    .then(async () => {
      try {
        const { close } = await import("../../packages/db/src/client.js");
        await close();
      } catch {
        /* never connected (e.g. --dry-run) — nothing to close */
      }
    })
    .catch((err) => {
      console.error("FAIL:", err instanceof Error ? err.stack : err);
      process.exit(1);
    });
}
