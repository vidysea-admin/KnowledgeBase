import { spawn } from "node:child_process";
import { join } from "node:path";
import type { YoutubeExec } from "../sources/youtube.js";

/** Media tooling gets OS basics, never application API keys or OAuth tokens. */
export function mediaToolEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL"])
    if (env[key] !== undefined) result[key] = env[key];
  return result;
}

export function boundedMediaArguments(args: string[]): string[] {
  return ["--no-plugin-dirs", "--no-js-runtimes", "--js-runtimes", `node:${process.execPath}`, "--no-remote-components",
    "--socket-timeout", "20", "--retries", "1", "--fragment-retries", "1", "--max-filesize", "128M",
    ...(args.includes("--use-extractors") ? [] : ["--use-extractors", "Youtube"]), ...args];
}

/** Bounded shell-free process, output cap covers stderr too; timeout kills its process tree. */
export const boundedToolExec: YoutubeExec = (command, args, options) => new Promise((resolve, reject) => {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 600_000 ||
      /\.(cmd|bat)$/i.test(command) || /[\u0000-\u001f\u007f]/.test(command)) {
    reject(new Error("media command configuration refused")); return;
  }
  const child = spawn(command, args, { cwd: options.cwd, shell: false, windowsHide: true,
    detached: process.platform !== "win32", env: mediaToolEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", bytes = 0, timedOut = false, stopped = false;
  const kill = () => {
    if (stopped) return;
    stopped = true;
    if (process.platform === "win32" && child.pid) {
      const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      const killTimer = setTimeout(() => { killer.kill(); child.kill(); }, 5_000);
      killer.once("error", () => { clearTimeout(killTimer); child.kill(); });
      killer.once("close", () => { clearTimeout(killTimer); child.kill(); });
    } else { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
  };
  const timer = setTimeout(() => { timedOut = true; kill(); }, options.timeoutMs);
  const collect = (chunk: Buffer, retain: boolean) => {
    if (stopped) return;
    bytes += chunk.byteLength;
    if (bytes > 64 * 1024) { kill(); return; }
    if (retain) stdout += chunk.toString("utf8");
  };
  child.stdout.on("data", (chunk: Buffer) => collect(chunk, true));
  child.stderr.on("data", (chunk: Buffer) => collect(chunk, false));
  child.once("error", () => { clearTimeout(timer); reject(new Error("media command unavailable")); });
  child.once("close", (code) => {
    clearTimeout(timer);
    resolve({ exitCode: stopped ? 1 : code, stdout: stopped ? "" : stdout, timedOut });
  });
});

export const boundedMediaExec: YoutubeExec = (command, args, options) => boundedToolExec(command, boundedMediaArguments(args), options);
