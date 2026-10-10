// scripts/watch/watch-reingest.mjs — run-watch-loc-split: the `--reingest` repair path moved VERBATIM from
// run-watch.mjs (only `export` added).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { decideReingestAction, assertIndexed, ingestOneDriveFile } from "./lib/ingest-chain.mjs";
import { ROOT, TENANT, RECORDINGS_DIR, AUDIO_DIR, CALENDAR_FIRST_YEAR, MONTHS, MONGODB_DB } from "./watch-config.mjs";
import { runGws, findCurrentMonthFolder } from "./watch-sources.mjs";
import { markDriveState } from "./watch-store.mjs";

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
export async function runReingest(gdrive, driveFileId, calendarEvents, now) {
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
