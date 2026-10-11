/** Test kit: in-memory QueueFs with an atomic rename, call counting and crash injection at any call (optionally with a torn temp write). */
import type { QueueFs } from "./queue-store.js";

const norm = (p: string) => p.split("\\").join("/");
export class SimulatedCrash extends Error { constructor(at: number) { super(`simulated crash at fs call ${at}`); this.name = "SimulatedCrash"; } }

export class MemQueueFs implements QueueFs {
  files = new Map<string, string>();
  calls = 0;
  log: string[] = [];
  /** Throw (before the call takes effect) when the call counter reaches this value. */
  crashAt: number | null = null;
  /** When the crash lands on a `create`, first write half of the data (a torn temp file). */
  torn = false;
  private tick(op: string, path = ""): void {
    const n = this.calls++;
    this.log.push(`${op} ${path}`);
    if (this.crashAt === n) throw new SimulatedCrash(n);
  }
  mkdirp(dir: string): void { this.tick("mkdirp", norm(dir)); }
  read(path: string): string | null { path = norm(path); this.tick("read", path); return this.files.get(path) ?? null; }
  create(path: string, data: string): void {
    path = norm(path);
    try { this.tick("create", path); } catch (e) { if (this.torn) this.files.set(path, data.slice(0, Math.floor(data.length / 2))); throw e; }
    if (this.files.has(path)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    this.files.set(path, data);
  }
  rename(from: string, to: string): void {
    from = norm(from); to = norm(to); this.tick("rename", from);
    const d = this.files.get(from); if (d === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    this.files.delete(from); this.files.set(to, d);
  }
  unlink(path: string): void { path = norm(path); this.tick("unlink", path); this.files.delete(path); }
  /** Disarm the crash and reset the counter (the "restarted process"). */
  restart(): void { this.crashAt = null; this.torn = false; this.calls = 0; this.log = []; }
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
