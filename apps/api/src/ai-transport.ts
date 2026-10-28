/** Real provider transport. CLI jobs are isolated, bounded, and never invoke a shell. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { Transport, TransportRequest, TransportResponse } from "@lkb/ai";

function tryParseJson(text: string): unknown { try { return JSON.parse(text); } catch { return text; } }
export interface HttpLimits {
  timeoutMs?: number;
  outputBytes?: number;
  /** Injectable for offline boundary checks; production uses the native fetch implementation. */
  fetch?: typeof globalThis.fetch;
}
/** Refuse redirects before credentials or request bodies can be forwarded; bound response bytes and total time. */
export function createHttpTransport(options: HttpLimits = {}): Transport {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const outputBytes = options.outputBytes ?? 16_777_216;
  for (const limit of [timeoutMs, outputBytes])
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Invalid HTTP limit");
  return async (req: TransportRequest): Promise<TransportResponse> => {
    if (req.kind !== "http") throw new Error("HTTP transport requires HTTP request");
    const controller = new AbortController();
    let failure: string | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectBoundary: (reason: Error) => void = () => {};
    const boundary = new Promise<never>((_, reject) => { rejectBoundary = reject; });
    const abort = (message: string) => {
      failure = message;
      controller.abort();
      const error = new Error(message);
      if (message === "HTTP request aborted") error.name = "AbortError";
      rejectBoundary(error);
      if (reader) void reader.cancel().catch(() => {});
    };
    const onAbort = () => abort("HTTP request aborted");
    try {
      if (req.signal?.aborted) {
        const error = new Error("HTTP request aborted"); error.name = "AbortError"; throw error;
      }
      req.signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => abort("HTTP request timed out"), timeoutMs);
      const request = async (): Promise<TransportResponse> => {
        const res = await (options.fetch ?? globalThis.fetch)(req.url!, {
          method: req.method ?? "GET", headers: req.headers, redirect: "manual",
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined, signal: controller.signal,
        });
        if (controller.signal.aborted) { void res.body?.cancel().catch(() => {}); throw new Error("aborted"); }
        if (res.status >= 300 && res.status < 400) {
          void res.body?.cancel().catch(() => {});
          failure = "HTTP redirects are refused"; controller.abort(); throw new Error(failure);
        }
        const declaredLength = res.headers.get("content-length");
        if (declaredLength !== null && Number(declaredLength) > outputBytes) {
          void res.body?.cancel().catch(() => {});
          failure = "HTTP response exceeds byte limit"; controller.abort(); throw new Error(failure);
        }
        const chunks: Uint8Array[] = []; let bytes = 0;
        if (res.body) {
          reader = res.body.getReader();
          while (true) {
            controller.signal.throwIfAborted();
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > outputBytes) {
              failure = "HTTP response exceeds byte limit"; controller.abort();
              void reader.cancel().catch(() => {}); throw new Error(failure);
            }
            chunks.push(next.value);
          }
        }
        controller.signal.throwIfAborted();
        const text = Buffer.concat(chunks, bytes).toString("utf8");
        return { status: res.status, body: tryParseJson(text), text };
      };
      return await Promise.race([request(), boundary]);
    } catch {
      const error = new Error(failure ?? (req.signal?.aborted ? "HTTP request aborted" : "HTTP request failed"));
      if (error.message === "HTTP request aborted") error.name = "AbortError";
      throw error; // Never reflect URLs, credentials, headers, source content or proxy exceptions.
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
      try { reader?.releaseLock(); } catch { /* cancellation can still own an outstanding read */ }
    }
  };
}
const httpTransport = createHttpTransport();
export interface CliLimits {
  timeoutMs?: number; inputBytes?: number; outputBytes?: number; outputTokens?: number;
  executable?: string; cwd?: string;
  /** Ephemeral-directory cleanup seam. Cleanup never changes the call's outcome; `onFailure`
   *  gets only the error code (never the path) once the bounded retries are exhausted. */
  cleanup?: { remove?: (dir: string) => void; delayMs?: number; onFailure?: (code: string) => void };
  /** Called once when the post-kill wait for the process group gives up (never receives the pid or any path). */
  onGroupBound?: (reason: "bound" | "eperm") => void;
}
/** Total attempts 4; waits delayMs*1..3 between them (default 50 => 300 ms worst case, only after a failure). */
const CLEANUP_ATTEMPTS = 4;
async function removeEphemeral(dir: string, c: CliLimits["cleanup"] = {}): Promise<void> {
  const remove = c.remove ?? ((d: string) => rmSync(d, { recursive: true, force: true }));
  let code = "UNKNOWN";
  for (let attempt = 1; attempt <= CLEANUP_ATTEMPTS; attempt++) {
    try { remove(dir); return; } catch (e) {
      code = String((e as { code?: unknown } | null)?.code ?? "UNKNOWN");
      if (attempt < CLEANUP_ATTEMPTS) await new Promise((r) => setTimeout(r, (c.delayMs ?? 50) * attempt));
    }
  }
  try { c.onFailure?.(code); } catch { /* reporting must not alter the outcome */ }
}
/** Linux: process-state letters of the live members of process group `pgid`, read from /proc/<n>/stat.
 *  Returns undefined when /proc is not readable (caller then falls back to kill(-pgid, 0) alone). */
export function linuxGroupStates(pgid: number, procDir = "/proc"): string[] | undefined {
  let names: string[];
  try { names = readdirSync(procDir).filter((n) => /^\d+$/.test(n)); } catch { return undefined; }
  const states: string[] = [];
  for (const n of names) {
    try {
      const stat = readFileSync(`${procDir}/${n}/stat`, "utf8");
      const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" "); // "<state> <ppid> <pgrp> ..." (comm may contain spaces/parens)
      if (Number(rest[2]) === pgid) states.push(rest[0] ?? "");
    } catch { /* the process exited between readdir and read */ }
  }
  return states;
}
export interface GroupGoneOptions {
  boundMs?: number; platform?: string; pollMs?: number;
  kill?: (pid: number, signal: number) => unknown;
  /** Member states of the group (see linuxGroupStates); undefined means unknown. */
  states?: (pgid: number) => string[] | undefined;
  onBound?: (reason: "bound" | "eperm") => void;
}
/** POSIX: SIGKILL to the group is asynchronous, so wait (bounded) until the group has no LIVE members left
 *  before the caller sees the rejection. Zombies (state Z, killed but awaiting a slow reaper such as a container
 *  PID 1 without init) count as gone: kill(-pgid, 0) keeps succeeding for them. Only ESRCH means gone through
 *  kill; EPERM stops the wait and is reported once. No-op on win32 (taskkill /T handles the tree there).
 *  ISS-CILINUX4-001. */
export async function groupGone(pid: number | undefined, o: GroupGoneOptions = {}): Promise<void> {
  const platform = o.platform ?? process.platform;
  if (platform === "win32" || !pid) return;
  const kill = o.kill ?? ((p: number, sig: number) => process.kill(p, sig));
  const states = o.states ?? (platform === "linux" ? linuxGroupStates : () => undefined);
  const report = (reason: "bound" | "eperm") => { try { o.onBound?.(reason); } catch { /* reporting must not alter the outcome */ } };
  for (const end = Date.now() + (o.boundMs ?? 2_000); Date.now() < end; await new Promise((r) => setTimeout(r, o.pollMs ?? 10))) {
    try { kill(-pid, 0); } catch (e) {
      if ((e as { code?: unknown } | null)?.code === "ESRCH") return;
      report("eperm"); return; // cannot observe the group (not ours); waiting longer would not help
    }
    const members = states(pid);
    if (members && members.every((st) => st === "Z" || st === "X")) return;
  }
  report("bound");
}
export function resolveCliCommand(command: string): string {
  if (process.platform !== "win32") return command;
  if (/\.(cmd|bat)$/i.test(command)) throw new Error("CLI shell shims are unsupported");
  if (isAbsolute(command)) {
    if (!/\.exe$/i.test(command) || !existsSync(command)) throw new Error("CLI native executable unavailable");
    return command;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, /\.exe$/i.test(command) ? command : `${command}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("CLI native executable unavailable");
}
/** Preserve local OAuth access through the normal user profile, not application credentials. */
export function cliEnvironment(outputTokens: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH",
    "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_GIT_BASH_PATH"])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(outputTokens), CLAUDE_CODE_MAX_TURNS: "1",
    CLAUDE_CODE_MAX_RETRIES: "0", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" };
}
export function createCliTransport(options: CliLimits = {}): Transport {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const inputBytes = options.inputBytes ?? 1_048_576;
  const outputBytes = options.outputBytes ?? 4_194_304;
  const outputTokens = options.outputTokens ?? 16_384;
  for (const limit of [timeoutMs, inputBytes, outputBytes, outputTokens])
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Invalid CLI limit");
  return async (req) => {
    if (req.kind !== "cli") throw new Error("CLI transport requires CLI request");
    if (Buffer.byteLength(req.stdin ?? "", "utf8") > inputBytes) throw new Error("CLI input exceeds byte limit");
    const command = resolveCliCommand(options.executable ?? req.command ?? "");
    const ephemeral = options.cwd ? undefined : mkdtempSync(join(tmpdir(), "lkb-cli-"));
    const cwd = options.cwd ?? ephemeral!;
    try {
      return await new Promise<TransportResponse>((resolve, reject) => {
        const child = spawn(command, req.args ?? [], { shell: false, windowsHide: true, cwd,
          detached: process.platform !== "win32", env: cliEnvironment(outputTokens) });
        let stdout: Buffer[] = []; let bytes = 0; let failure: string | undefined;
        let settled = false; let timer: ReturnType<typeof setTimeout>;
        const finish = (error?: string, code?: number | null) => {
          if (settled) return; settled = true; clearTimeout(timer);
          if (error) void groupGone(child.pid, { onBound: options.onGroupBound }).then(() => reject(new Error(error)));
          else { const text = Buffer.concat(stdout).toString("utf8"); resolve({status: code ?? 1, body: tryParseJson(text), text}); }
        };
        const terminate = (reason: string) => {
          if (failure || settled) return; failure = reason; stdout = [];
          if (!child.pid) { finish(reason); return; }
          if (process.platform === "win32") {
            const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
              ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
            const killTimer = setTimeout(() => { killer.kill(); child.kill(); }, 5_000);
            killer.once("error", () => { clearTimeout(killTimer); child.kill(); });
            killer.once("close", () => { clearTimeout(killTimer); if (child.exitCode === null) child.kill(); });
          } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
        };
        const accept = (chunk: Buffer, keep: boolean) => {
          if (failure || settled) return;
          bytes += chunk.length;
          if (bytes > outputBytes) { terminate("CLI output exceeds byte limit"); return; }
          if (keep) stdout.push(chunk);
        };
        child.stdout.on("data", (chunk: Buffer) => accept(chunk, true));
        child.stderr.on("data", (chunk: Buffer) => accept(chunk, false));
        child.once("error", () => finish("CLI process failed to start"));
        child.once("close", (code) => finish(failure, code));
        child.stdin.on("error", () => terminate("CLI stdin failed"));
        timer = setTimeout(() => terminate("CLI process timed out"), timeoutMs);
        child.stdin.end(req.stdin ?? "");
      });
    } finally { if (ephemeral) await removeEphemeral(ephemeral, options.cleanup); }
  };
}
const cliTransport = createCliTransport();
export const realTransport: Transport = (req) => req.kind === "cli" ? cliTransport(req) : httpTransport(req);
