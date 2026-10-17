/**
 * packages/core/src/run-state-store/run-state-fs.ts — the only place that touches `node:fs`. Every step of
 * the atomic write is a separate injectable operation so tests can crash the writer at each one.
 */
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface RunStateFsOps {
  mkdirp(dir: string): void;
  /** null = absent; "file" = a regular file; "other" = a directory, symlink or device. Never follows links. */
  kind(path: string): "file" | "other" | null;
  readText(path: string): string;
  /** Modification time in ms of a path (lstat, never follows links); null = absent. Ages a lock file with no readable owner. */
  mtimeMs(path: string): number | null;
  /** Names (not paths) of the entries directly inside a directory; [] when it does not exist. */
  listDir(dir: string): string[];
  /** Exclusive create (throws EEXIST when the path exists). Returns a descriptor. */
  createExclusive(path: string): number;
  write(fd: number, data: string): void;
  fsync(fd: number): void;
  close(fd: number): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
  sleep(ms: number): void;
  now(): number;
  uuid(): string;
}

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

export const realRunStateFs: RunStateFsOps = {
  mkdirp: (d) => { mkdirSync(d, { recursive: true }); },
  kind(p) {
    try { return lstatSync(p).isFile() ? "file" : "other"; }
    catch (e) { if (missing(e)) return null; throw e; }
  },
  readText: (p) => readFileSync(p, "utf8"),
  mtimeMs(p) {
    try { return lstatSync(p).mtimeMs; }
    catch (e) { if (missing(e)) return null; throw e; }
  },
  listDir(d) {
    try { return readdirSync(d); }
    catch (e) { if (missing(e)) return []; throw e; }
  },
  createExclusive: (p) => openSync(p, "wx", 0o600),
  write: (fd, data) => { writeSync(fd, data); },
  fsync: (fd) => { fsyncSync(fd); },
  close: (fd) => { closeSync(fd); },
  rename: (a, b) => { renameSync(a, b); },
  unlink: (p) => { unlinkSync(p); },
  sleep: (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); },
  now: () => Date.now(),
  uuid: () => randomUUID(),
};
