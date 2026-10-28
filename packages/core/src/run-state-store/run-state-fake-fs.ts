/**
 * packages/core/src/run-state-store/run-state-fake-fs.ts — in-memory RunStateFsOps for tests: counts every
 * operation, can "crash the process" at operation N (that operation does not complete, and every later
 * operation throws, as if the process were dead), can run a hook before an operation, and can fail renames
 * with a Windows-style code a set number of times. Not used by production code.
 */
import path from "node:path";
import type { RunStateFsOps } from "./run-state-fs.js";

export class FakeRunStateCrash extends Error {}
const errno = (code: string) => Object.assign(new Error(code), { code });

export class FakeRunStateFs implements RunStateFsOps {
  files = new Map<string, string>();
  /** Modification time (the fake clock) of every file, set on create and on write. */
  mtimes = new Map<string, number>();
  dirs = new Set<string>();
  opLog: string[] = [];
  crashAt = -1;
  crashed = false;
  renameFailures: Array<{ code: string; times: number }> = [];
  beforeOp: ((n: number, op: string, arg: string) => void) | null = null;
  clock = 0;
  private fds = new Map<number, string>();
  private nextFd = 3;
  private ids = 0;

  private step(op: string, arg = ""): void {
    if (this.crashed) throw new FakeRunStateCrash("process is dead");
    const n = this.opLog.length;
    this.opLog.push(`${op} ${arg}`.trim());
    if (this.beforeOp) this.beforeOp(n, op, arg);
    if (n === this.crashAt) {
      this.crashed = true;
      if (op === "write") { const p = this.fds.get(Number(arg)); if (p !== undefined) this.files.set(p, (this.pending ?? "").slice(0, Math.floor((this.pending ?? "").length / 2))); }
      throw new FakeRunStateCrash(`crash at op ${n} (${op})`);
    }
  }
  private pending: string | undefined;

  mkdirp(dir: string) { this.step("mkdirp", dir); this.dirs.add(dir); }
  kind(p: string) { this.step("kind", p); return this.files.has(p) ? "file" as const : this.dirs.has(p) ? "other" as const : null; }
  mtimeMs(p: string) { this.step("mtime", p); return this.files.has(p) || this.dirs.has(p) ? (this.mtimes.get(p) ?? 0) : null; }
  listDir(d: string) {
    this.step("list", d);
    return [...this.files.keys()].filter((f) => path.normalize(path.dirname(f)) === path.normalize(d)).map((f) => path.basename(f));
  }
  readText(p: string) { this.step("readText", p); const v = this.files.get(p); if (v === undefined) throw errno("ENOENT"); return v; }
  createExclusive(p: string) {
    this.step("create", p);
    if (this.files.has(p) || this.dirs.has(p)) throw errno("EEXIST");
    this.files.set(p, ""); this.mtimes.set(p, this.now()); const fd = this.nextFd++; this.fds.set(fd, p); return fd;
  }
  write(fd: number, data: string) { this.pending = data; this.step("write", String(fd)); const p = this.fds.get(fd)!; this.files.set(p, data); this.mtimes.set(p, this.now()); }
  fsync(fd: number) { this.step("fsync", String(fd)); }
  close(fd: number) { this.step("close", String(fd)); this.fds.delete(fd); }
  rename(from: string, to: string) {
    this.step("rename", `${from} -> ${to}`);
    // A real rename across directories is EXDEV or a copy: the store must always rename within one directory.
    if (path.normalize(path.dirname(from)) !== path.normalize(path.dirname(to))) throw errno("EXDEV");
    const f = this.renameFailures[0];
    if (f && f.times > 0) { f.times--; if (f.times === 0) this.renameFailures.shift(); throw errno(f.code); }
    const v = this.files.get(from); if (v === undefined) throw errno("ENOENT");
    this.files.delete(from); this.files.set(to, v); this.mtimes.set(to, this.mtimes.get(from) ?? this.now()); this.mtimes.delete(from);
  }
  unlink(p: string) { this.step("unlink", p); if (!this.files.delete(p)) throw errno("ENOENT"); this.mtimes.delete(p); }
  sleep(ms: number) { this.clock += ms; }
  now() { return this.clock; }
  uuid() { return `u${this.ids++}`; }

  /** Names of files left in the store directory. */
  names(): string[] { return [...this.files.keys()].sort(); }
}
