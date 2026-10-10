// scripts/watch/watch-sources.mjs — run-watch-loc-split: gws runner + Drive month/manifest helpers, moved VERBATIM
// from run-watch.mjs (only `export` added).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { mainTreeCandidates } from "./lib/main-tree.mjs";
import { ROOT, DRIVE_ROOT_FOLDER_ID, MONTHS } from "./watch-config.mjs";

// --- real gws runner (same shape as apps/api/src/gws-gmail.ts's runGws/parseGwsJson — cannot
// import it: ARCHITECTURE §5 is apps -> packages, never a script depending the OTHER way is fine,
// but gdrive.ts (packages/ingest) importing apps/api would not be; this file is a script, not a
// package, so it MAY import apps/api directly (precedent: scripts/webinar/sync-session.mjs
// dynamically imports apps/api/src/production.ts) — the small runGws copy here is just to hand
// the SAME shape into gdrive.ts's injected `run` without a package boundary violation). ---
export function runGws(args) {
  return new Promise((resolvePromise, reject) => {
    execFile("cmd", ["/c", "gws", ...args], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(err); return; }
      resolvePromise(stdout);
    });
  });
}

export function loadIngestedDriveIds(now) {
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

export async function findCurrentMonthFolder(gdrive, now) {
  const monthName = MONTHS[now.getUTCMonth()];
  const yy = String(now.getUTCFullYear()).slice(-2);
  const subfolders = await gdrive.listDriveSubfolders(DRIVE_ROOT_FOLDER_ID, { run: runGws });
  return gdrive.findMonthFolder(subfolders, monthName, yy);
}
