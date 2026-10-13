/**
 * packages/ingest/src/retention/retention-report-media.ts - T-046 dry-run report. READ-ONLY media probe:
 * locates one recording's media file under the given media root, reads its size and mtime, derives
 * the file's physical IDENTITY (device + file index, plus the case-folded real path) and proves the
 * file can be opened and read. Only realpathSync, statSync, lstatSync and a literal read-only
 * openSync/readSync/closeSync are used. A path that, after resolution, leaves the media root
 * (absolute stored path, `..`, symlink or junction out) is never stat'd for its size: the
 * evidence is "outside-root". A read-only open cannot create, truncate or change the file or its
 * mtime (it may update atime on volumes that track it).
 */
import { closeSync, lstatSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type MediaState = "present" | "not-found" | "outside-root" | "unreadable" | "no-root";

export interface MediaEvidence {
  state: MediaState;
  /** Path relative to the media root, forward slashes; set once the path was resolved inside the root. */
  relPath?: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
  /** Physical-file identity keys (device:index and case-folded real path); rows sharing ANY key are one file. */
  keys?: string[];
}

/** The only file-system calls the probe makes; injectable so tests can simulate an exclusive lock or a missing file index. */
export interface MediaIo {
  realpathSync: (p: string) => string;
  lstatSync: (p: string) => unknown;
  statSync: (p: string, o?: { bigint: true }) => { size: number | bigint; mtimeMs: number | bigint; dev: number | bigint; ino: number | bigint; isFile(): boolean };
  openSync: (p: string, access: "r") => number;
  readSync: (fd: number, buf: Buffer, off: number, len: number, pos: number) => number;
  closeSync: (fd: number) => void;
}
export const REAL_IO: MediaIo = { realpathSync, lstatSync, statSync: statSync as MediaIo["statSync"], openSync, readSync, closeSync };

export const NO_MEDIA: MediaEvidence = { state: "not-found", sizeBytes: null, mtimeMs: null };
const ev = (state: MediaState, relPath?: string, sizeBytes: number | null = null, mtimeMs: number | null = null, keys?: string[]): MediaEvidence => ({
  state, sizeBytes, mtimeMs, ...(relPath !== undefined ? { relPath } : {}), ...(keys ? { keys } : {}),
});
const escapes = (back: string): boolean => back === "" || back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back);
/**
 * Lexical escape test that does not depend on the platform's separator: BOTH `/` and `\` split segments, so a stored
 * Windows-style `..\..\x` is refused on Linux too (where `\` is an ordinary filename character and the path would
 * otherwise resolve inside the root and report "not found"). An outside-root path is refused whether or not a file exists.
 */
export function climbsOut(rel: string): boolean {
  let depth = 0;
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { depth -= 1; if (depth < 0) return true; } else depth += 1;
  }
  return depth <= 0;
}
const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;
const BLOCK = 4096;

/** Case-folded on Windows, where the file system is case-insensitive; exact elsewhere. */
export const pathKey = (real: string, platform: string = process.platform): string => `path:${platform === "win32" ? real.toLowerCase() : real}`;

/** Identity keys of an existing file: `ino:<dev>:<index>` when the platform gives a file index, plus the real-path key. */
export function fileKeys(io: MediaIo, real: string, platform: string = process.platform): string[] {
  const keys = [pathKey(real, platform)];
  try {
    const st = io.statSync(real, { bigint: true });
    if (BigInt(st.ino) !== 0n) keys.push(`ino:${BigInt(st.dev)}:${BigInt(st.ino)}`);
  } catch { /* the path key alone still groups identical spellings */ }
  return keys;
}

/** True when `root` exists and is a directory (junction roots are followed on purpose: the owner named it). */
export function mediaRootUsable(root: string): boolean {
  try { return statSync(root).isDirectory(); } catch { return false; }
}

/** Opens the file read-only and reads its first and last block: proves this account can really read it. */
function readable(io: MediaIo, real: string, size: number): boolean {
  let fd = -1;
  try {
    fd = io.openSync(real, "r");
    const buf = Buffer.alloc(BLOCK);
    io.readSync(fd, buf, 0, BLOCK, 0);
    if (size > BLOCK) io.readSync(fd, buf, 0, BLOCK, size - BLOCK);
    return true;
  } catch { return false; } finally {
    if (fd >= 0) { try { io.closeSync(fd); } catch { /* nothing to do */ } }
  }
}

export function probeMedia(mediaRoot: string | undefined, rel: string | undefined, io: MediaIo = REAL_IO, platform: string = process.platform): MediaEvidence {
  if (!mediaRoot) return ev("no-root");
  if (!rel) return ev("not-found");
  if (rel.includes("\0") || isAbsolute(rel) || /^[a-z]:/i.test(rel) || rel.startsWith("\\\\")) return ev("outside-root");
  if (climbsOut(rel)) return ev("outside-root");
  const full = resolve(mediaRoot, rel);
  const back = relative(resolve(mediaRoot), full);
  if (escapes(back)) return ev("outside-root");
  const shown = back.split(sep).join("/");
  let realRoot: string;
  let real: string;
  try { realRoot = io.realpathSync(mediaRoot); } catch { return ev("unreadable", shown); }
  try { io.lstatSync(full); real = io.realpathSync(full); } catch (e) {
    return ev(code(e) === "ENOENT" || code(e) === "ENOTDIR" ? "not-found" : "unreadable", shown);
  }
  if (escapes(relative(realRoot, real))) return ev("outside-root");
  try {
    const st = io.statSync(real);
    if (!st.isFile()) return ev("unreadable", shown);
    const size = Number(st.size);
    if (!readable(io, real, size)) return ev("unreadable", shown);
    return ev("present", shown, size, Number(st.mtimeMs), fileKeys(io, real, platform));
  } catch { return ev("unreadable", shown); }
}
