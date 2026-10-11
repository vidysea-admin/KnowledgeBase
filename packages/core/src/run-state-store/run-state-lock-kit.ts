/**
 * Test world for the run-state lock (not used by production code): several simulated processes, each with its own pid and its
 * own FakeRunStateFs view, share ONE in-memory directory and ONE clock. A process can be crashed (every later op throws) and is
 * then reported dead to the liveness probe, as the OS would.
 */
import path from "node:path";
import { FakeRunStateFs } from "./run-state-fake-fs.js";
import { createRunStateStore, type RunStateStore } from "./run-state-store.js";
import type { RunStateLockOptions, RunStateLiveness } from "./run-state-lock.js";

export const LOCK_TEST_HOST = "test-host";
export const LOCK_TEST_ROOT = "/r";
export const LOCK_FILE = path.join(LOCK_TEST_ROOT, "r1.run-state.lock");
export const norm = (p: string) => p.replace(/\\/g, "/");

export interface SimProc { pid: number; fs: FakeRunStateFs; store: RunStateStore }

export class LockWorld {
  files = new Map<string, string>();
  mtimes = new Map<string, number>();
  dirs = new Set<string>();
  clock = 1_000_000;
  dead = new Set<number>();
  /** What the liveness probe answers for a pid that is not in `dead`; tests set "unknown" to model an unverifiable owner. */
  probeForLive: RunStateLiveness = "alive";
  private seq = 0;

  advance(ms: number) { this.clock += ms; }
  probe = (pid: number): RunStateLiveness => (this.dead.has(pid) ? "dead" : this.probeForLive);

  spawn(pid: number, lock: RunStateLockOptions = {}): SimProc {
    const fs = new FakeRunStateFs();
    fs.files = this.files; fs.mtimes = this.mtimes; fs.dirs = this.dirs;
    fs.now = () => this.clock;
    fs.sleep = (ms: number) => { this.clock += ms; };
    fs.uuid = () => `p${pid}-${this.seq++}`;
    return { pid, fs, store: createRunStateStore(LOCK_TEST_ROOT, fs, { host: LOCK_TEST_HOST, pid, isAlive: this.probe, ...lock }) };
  }
  /** The process dies where it stands: its fs view throws from now on and the OS reports its pid dead. */
  kill(p: SimProc) { p.fs.crashed = true; this.dead.add(p.pid); }

  names(): string[] { return [...this.files.keys()].map(norm).sort(); }
  lockBytes(): string | undefined { return this.files.get(LOCK_FILE); }
  /** Writes a lock body as a given owner would have (for staging a crashed holder without running it). */
  stageLock(owner: { pid: number; host?: string; at?: number; token?: string }, mtime?: number) {
    const body = JSON.stringify({ token: owner.token ?? "staged-1", pid: owner.pid, host: owner.host ?? LOCK_TEST_HOST, at: new Date(owner.at ?? this.clock).toISOString() });
    this.dirs.add(LOCK_TEST_ROOT);
    this.files.set(LOCK_FILE, body); this.mtimes.set(LOCK_FILE, mtime ?? this.clock);
    return body;
  }
}

/** An independent copy of the directory, clock and death records (processes are not copied: spawn new ones on the fork). */
export function forkWorld(w: LockWorld): LockWorld {
  const f = new LockWorld();
  f.files = new Map(w.files); f.mtimes = new Map(w.mtimes); f.dirs = new Set(w.dirs); f.clock = w.clock; f.dead = new Set(w.dead);
  f.probeForLive = w.probeForLive;
  return f;
}

/** Reports every lock-relevant rename to `onRename(procPid, from, to)` so tests can assert "never two holders" at the moment it matters. */
export function observeRenames(p: SimProc, onRename: (pid: number, from: string, to: string) => void, then?: (n: number, op: string, arg: string) => void) {
  p.fs.beforeOp = (n, op, arg) => {
    if (op === "rename") { const [from, to] = arg.split(" -> "); onRename(p.pid, from!, to!); }
    then?.(n, op, arg);
  };
}

/** The pid recorded in a lock-shaped file, or undefined. */
export function ownerPid(w: LockWorld, file: string): number | undefined {
  try { return JSON.parse(w.files.get(file) ?? "").pid; } catch { return undefined; }
}
