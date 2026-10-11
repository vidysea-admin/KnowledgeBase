/** Helpers for tests that run REAL child processes against a real temp directory (not used by production code). */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CORE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const here = (f: string) => pathToFileURL(fileURLToPath(new URL(f, import.meta.url))).href;
export const STORE_URL = here("./run-state-store.ts"), FS_URL = here("./run-state-fs.ts"), KIT_URL = here("./run-state-test-kit.ts");

export async function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-runlock-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Runs a TypeScript child script under tsx; returns its status and output. Hard timeout, never left running. */
export function runTs(dir: string, name: string, source: string, args: string[], timeoutMs = 120_000) {
  const file = path.join(dir, name);
  writeFileSync(file, source);
  const r = spawnSync(process.execPath, ["--import", "tsx", file, ...args], { cwd: CORE_DIR, encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Starts a TypeScript child under tsx without waiting; the caller awaits `done` and must `kill` it in a finally. */
export function startTs(dir: string, name: string, source: string, args: string[], timeoutMs = 200_000) {
  const file = path.join(dir, name);
  writeFileSync(file, source);
  const child = spawn(process.execPath, ["--import", "tsx", file, ...args], { cwd: CORE_DIR, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const done = new Promise<{ code: number | null; out: string }>((res, rej) => {
    let out = "", err = "";
    const t = setTimeout(() => { child.kill(); rej(new Error(`child timed out: ${err}`)); }, timeoutMs);
    child.stdout!.on("data", (b) => { out += b; });
    child.stderr!.on("data", (b) => { err += b; });
    child.once("exit", (c) => { clearTimeout(t); res({ code: c, out: out + err }); });
  });
  return { child, done, kill: () => { if (child.exitCode === null) child.kill(); } };
}

/** A plain-JS child that prints `ready` and then sleeps; the caller must `stop` it in a finally. */
export async function holdChild(dir: string, script: string, args: string[]): Promise<{ child: ChildProcess; pid: number; stop: () => Promise<void> }> {
  const file = path.join(dir, "hold.mjs");
  writeFileSync(file, script);
  const child = spawn(process.execPath, [file, ...args], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  const exited = new Promise<void>((res) => { child.once("exit", () => res()); });
  const stop = async () => { child.kill(); await Promise.race([exited, new Promise<void>((r) => setTimeout(r, 10_000))]); };
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("child never became ready")), 20_000);
      child.stdout!.on("data", (b) => { if (String(b).includes("ready")) { clearTimeout(t); res(); } });
      child.once("exit", () => { clearTimeout(t); rej(new Error("child exited early")); });
    });
  } catch (e) { await stop(); throw e; }
  return { child, pid: child.pid!, stop };
}
