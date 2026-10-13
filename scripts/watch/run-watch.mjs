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
import "dotenv/config";
import { register } from "tsx/esm/api";
import { ingestOneDriveFile } from "./lib/ingest-chain.mjs";
import {
  ROOT, TENANT, DRIVE_ROOT_FOLDER_ID, RECORDINGS_DIR, AUDIO_DIR, CALENDAR_CSV, CALENDAR_FIRST_YEAR,
  WATCH_DIR, LOCK_PATH, DRY_RUN, INGEST, REINGEST_DRIVE_ID, MONTHS,
} from "./watch-config.mjs";
import { runGws, loadIngestedDriveIds, findCurrentMonthFolder } from "./watch-sources.mjs";
import { markDriveState, loadSeenDriveIds, readDriveWatchState, markHeartbeatFor, recordReport } from "./watch-store.mjs";
import { runReingest } from "./watch-reingest.mjs";

register(); // let subsequent dynamic import()s of packages/*'s .ts sources resolve


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
  const { createTelegramNotifier } = await import("../../packages/meeting-bot/src/capture/notify/telegram-alerts.ts");
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
