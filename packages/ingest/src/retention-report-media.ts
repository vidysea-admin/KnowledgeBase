/**
 * packages/ingest/src/retention-report-media.ts - T-046 dry-run report. READ-ONLY media probe:
 * locates one recording's media file under the given media root and reads its size and mtime.
 * Only realpathSync, statSync and lstatSync are used (reads). A path that, after resolution,
 * leaves the media root (absolute stored path, `..`, symlink or junction out) is never stat'd for
 * its size: the evidence is "outside-root".
 */
import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type MediaState = "present" | "not-found" | "outside-root" | "unreadable" | "no-root";

export interface MediaEvidence {
  state: MediaState;
  /** Path relative to the media root, forward slashes; set once the path was resolved inside the root. */
  relPath?: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
}

export const NO_MEDIA: MediaEvidence = { state: "not-found", sizeBytes: null, mtimeMs: null };
const ev = (state: MediaState, relPath?: string, sizeBytes: number | null = null, mtimeMs: number | null = null): MediaEvidence => ({
  state, sizeBytes, mtimeMs, ...(relPath !== undefined ? { relPath } : {}),
});
const escapes = (back: string): boolean => back === "" || back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back);
const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

/** True when `root` exists and is a directory (junction roots are followed on purpose: the owner named it). */
export function mediaRootUsable(root: string): boolean {
  try { return statSync(root).isDirectory(); } catch { return false; }
}

export function probeMedia(mediaRoot: string | undefined, rel: string | undefined): MediaEvidence {
  if (!mediaRoot) return ev("no-root");
  if (!rel) return ev("not-found");
  if (rel.includes("\0") || isAbsolute(rel) || /^[a-z]:/i.test(rel) || rel.startsWith("\\\\")) return ev("outside-root");
  const full = resolve(mediaRoot, rel);
  const back = relative(resolve(mediaRoot), full);
  if (escapes(back)) return ev("outside-root");
  const shown = back.split(sep).join("/");
  let realRoot: string;
  let real: string;
  try { realRoot = realpathSync(mediaRoot); } catch { return ev("unreadable", shown); }
  try { lstatSync(full); real = realpathSync(full); } catch (e) {
    return ev(code(e) === "ENOENT" || code(e) === "ENOTDIR" ? "not-found" : "unreadable", shown);
  }
  if (escapes(relative(realRoot, real))) return ev("outside-root");
  try {
    const st = statSync(real);
    return st.isFile() ? ev("present", shown, st.size, st.mtimeMs) : ev("unreadable", shown);
  } catch { return ev("unreadable", shown); }
}
