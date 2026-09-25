/**
 * packages/ingest/src/sources/gdrive.ts — U2 source-watcher. Lists files in a shared Google
 * Drive folder (TOC's members recordings folder) via the local `gws` CLI, and diffs the result
 * against what a watch run has already seen. No `gws` call is baked in here — `run` is injected
 * (same shape as `apps/api/src/gws-gmail.ts`'s `runGws`/`parseGwsJson` pair, but this module
 * cannot import that file: ARCHITECTURE §5's dependency rule is `apps → packages`, never the
 * reverse, so the tiny JSON-in-stdout parse is its own copy here, not a shared import).
 *
 * This is deliberately NOT a `Source` adapter (source.ts's detect/fetch/toTurns interface) — it
 * answers "what's out there and what's new", not "turn this one thing into turns". The actual
 * download + transcribe + seed chain composes this module's output with the SAME production
 * pipeline U1 used by hand (scripts/transcribe-*.mjs, scripts/seed-toc.mjs, buildIndexer);
 * scripts/watch/run-watch.mjs is where that composition happens.
 */

export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  mimeType?: string;
}

/** Injected `gws` runner — real impl shells out to `gws <args>`; tests pass a fake returning
 * canned stdout, so no real Drive call is required to exercise this module's logic. */
export type GwsRunner = (args: string[]) => Promise<string>;

export interface DriveListDeps {
  run: GwsRunner;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Same "find the first JSON value in stdout" tolerance as `gws-gmail.ts`'s `parseGwsJson` —
 * `gws` can print a banner line before its JSON payload. */
function parseGwsJson(stdout: string): unknown {
  const lines = stdout.split("\n");
  const startIdx = lines.findIndex((l) => l.trim().startsWith("{") || l.trim().startsWith("["));
  if (startIdx === -1) throw new Error("gws produced no JSON output");
  return JSON.parse(lines.slice(startIdx).join("\n"));
}

interface GwsDriveListResponse {
  files?: DriveFile[];
}

/** Lists the immediate subfolders of a Drive folder — used to find the current month's folder
 * under TOC's recordings root (folders named like "September 26"). */
export async function listDriveSubfolders(parentFolderId: string, deps: DriveListDeps): Promise<DriveFile[]> {
  const params = JSON.stringify({
    q: `'${parentFolderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id,name,createdTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const stdout = await deps.run(["drive", "files", "list", "--params", params, "--format", "json"]);
  const parsed = parseGwsJson(stdout) as GwsDriveListResponse;
  return parsed.files ?? [];
}

/** Lists the non-folder files directly inside one Drive folder. */
export async function listDriveFiles(folderId: string, deps: DriveListDeps): Promise<DriveFile[]> {
  const params = JSON.stringify({
    q: `'${folderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
    fields: "files(id,name,size,createdTime,mimeType)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const stdout = await deps.run(["drive", "files", "list", "--params", params, "--format", "json"]);
  const parsed = parseGwsJson(stdout) as GwsDriveListResponse;
  return parsed.files ?? [];
}

/** Downloads one Drive file's media bytes to `outPath` via `gws drive files get ... -o <path>`.
 * The real `gws` CLI writes the file itself; this just shells the command through the same
 * injected `run`. */
export async function downloadDriveFile(fileId: string, outPath: string, deps: DriveListDeps): Promise<void> {
  const params = JSON.stringify({ fileId, alt: "media", supportsAllDrives: true });
  await deps.run(["drive", "files", "get", "--params", params, "-o", outPath]);
}

/** Finds a month subfolder by exact "<Month> <YY>" name match first (TOC's real naming,
 * e.g. "September 26"), falling back to a prefix match on the month name alone so a
 * differently-suffixed folder ("September 2026", "September") is still found. */
export function findMonthFolder(subfolders: DriveFile[], monthName: string, yy: string): DriveFile | undefined {
  const exact = `${monthName} ${yy}`.trim().toLowerCase();
  return (
    subfolders.find((f) => f.name.trim().toLowerCase() === exact) ??
    subfolders.find((f) => f.name.trim().toLowerCase().startsWith(monthName.trim().toLowerCase()))
  );
}

/**
 * Pure diff: a Drive file counts as "new" iff its id is in neither `seenIds` (this tenant's
 * `watch_state` rows for sourceType "drive" — anything a prior run already recorded, seen or
 * ingested) nor `ingestedIds` (a secondary cross-check against files already known to be
 * downloaded, e.g. U1's `_drive-manifest.json`, for the first run after a manual catch-up that
 * predates `watch_state` entirely). Kept as a standalone pure function — same shape as
 * `watched/schedule.ts`'s `isDueForCheck` — so run-watch.mjs's own "did it list the right 0/4
 * files" claim is falsifiable without a real Drive call.
 */
export function diffNewDriveFiles(
  files: DriveFile[],
  seenIds: ReadonlySet<string>,
  ingestedIds: ReadonlySet<string> = new Set(),
): DriveFile[] {
  return files.filter((f) => !seenIds.has(f.id) && !ingestedIds.has(f.id));
}
