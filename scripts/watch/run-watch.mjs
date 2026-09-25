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
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { ingestOneDriveFile } from "./lib/ingest-chain.mjs";

register(); // let subsequent dynamic import()s of packages/*'s .ts sources resolve

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const candidates = [join(ROOT, rel), join(process.env.LKB_MAIN_TREE_ROOT || "D:/KnowledgeBase", rel)];
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
        findings.upcoming.push({
          date: c.startTime.slice(0, 10),
          agenda: c.subject,
          source: "gmail",
          joinLink: Boolean(c.meetingUrl) && !c.registrationOnly,
          registrationOnly: Boolean(c.registrationOnly),
        });
      } else if (c.kind === "past-recording") {
        findings.pastRecordingPending.push({ subject: c.subject, senderEmail: c.senderEmail, recordingUrl: c.recordingUrl });
      }
    }
  } catch (err) {
    errors.push(`Gmail scan failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- 3. TOC calendar CSV ---
  try {
    if (existsSync(CALENDAR_CSV)) {
      const csvText = readFileSync(CALENDAR_CSV, "utf8");
      const events = parseTocCalendar(csvText, CALENDAR_FIRST_YEAR);
      const upcoming = upcomingTocEvents(events, now, 14);
      for (const e of upcoming) {
        findings.upcoming.push({ date: e.date, agenda: e.agenda, source: "toc-calendar", membersZoom: (e.mode || "").toLowerCase() === "virtual" && (e.location || "").toLowerCase() === "zoom" });
      }
    } else {
      errors.push(`calendar CSV not found at ${CALENDAR_CSV}`);
    }
  } catch (err) {
    errors.push(`calendar parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

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
            const sessionId = await ingestOneDriveFile(gdrive, runGws, file, monthName, { ROOT, RECORDINGS_DIR, AUDIO_DIR, TENANT });
            findings.driveIngested.push({ id: file.id, name: file.name, sessionId });
            await markDriveState(file.id, "ingested", { sessionId });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            findings.driveFailed.push({ id: file.id, name: file.name, reason });
            await markDriveState(file.id, "failed", { failureReason: reason });
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
  await connect(process.env.MONGODB_URL, process.env.MONGODB_DB);
  return listSeenIds(TENANT, "drive");
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
