// scripts/watch/watch-config.mjs — run-watch-loc-split: module-level configuration moved VERBATIM from
// run-watch.mjs (only `export` added). Sits beside run-watch.mjs (not in lib/) so import.meta.url and every
// relative specifier resolve exactly as they did in the original file.
import { join } from "node:path";
import { resolveWatchRoot } from "./lib/main-tree.mjs";

// u2-fix1: `LKB_MAIN_TREE_ROOT` already existed as a best-effort SECOND read location
// (`loadIngestedDriveIds`) for exactly this reason — `raw/`/`data/` are gitignored per-worktree,
// so a fix branch built in a worktree has none of the real production files a live repair needs
// to act on. Promoted here to a full ROOT override: when set, EVERY path this script touches
// (Recordings/Audio/data/lock/watch digest) resolves against the real tree, not the worktree's
// own copy — the mechanism the u2-fix1-ingest-guards manifest's live repair (ISS-304/305/306)
// runs under, so the FIXED CODE (committed only in the worktree, per this unit's hard rule) can
// still act on production data/raw/Mongo exactly as a normal `--ingest` run would. Unset (the
// default), behavior is identical to before this change.
export const ROOT = resolveWatchRoot(import.meta.url);
export const TENANT = "toc";
export const DRIVE_ROOT_FOLDER_ID = "1STZ-ctQbiy_zV82xbqnbeJRHhmGemewh";
export const RECORDINGS_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Recordings");
export const AUDIO_DIR = join(ROOT, "raw", "TOC", "TOC-Materials", "Audio");
export const CALENDAR_CSV = join(ROOT, "raw", "TOC", "TOC-Materials", "_csv", "calendar1.csv");
export const CALENDAR_FIRST_YEAR = 2026; // the sheet's own first month header (APRIL) — see toc-calendar.ts
export const WATCH_DIR = join(ROOT, "qa", "watch");
export const LOCK_PATH = join(ROOT, "data", ".watch.lock");
import { requireScriptDatabase } from "../lib/transcript-provenance.mjs";
export const DRY_RUN = process.argv.includes("--dry-run");
export const INGEST = process.argv.includes("--ingest");
export const REINGEST_IDX = process.argv.indexOf("--reingest");
export const REINGEST_DRIVE_ID = REINGEST_IDX >= 0 ? process.argv[REINGEST_IDX + 1] : null;
// The db name every OTHER entry point in this repo defaults to (apps/api/src/index.ts,
// scripts/webinar/sync-session.mjs, scripts/seed-toc.mjs, scripts/backfill.mjs, ...) when
// MONGODB_DB isn't set. ISS-305's root cause: this file was the one caller in the whole repo that
// omitted the fallback, so `connect(url, undefined)` fell through to whatever database the
// connection STRING itself defaults to — silently a different database than "lkb", where
// seed-toc.mjs (every other caller's same fallback) had actually written the turns. `indexSession`
// then queried an empty collection and printed "no chunkable turns" for a session that had 27 real
// ones, just in the other database.
// ISS-LEGACYSEED-003: NO lkb default any more. Resolved lazily (import must not throw: --dry-run/tests import this file).
// lkb is reachable only with --i-know-this-is-production + MONGODB_DB=lkb; otherwise an isolated work DB / lkb_staging.
export function watchDbTarget(env = process.env, argv = process.argv) {
  return requireScriptDatabase(env, argv, { allowProduction: true });
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
