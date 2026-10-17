/** Real provider transport. CLI jobs are isolated, bounded, and never invoke a shell. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
/** POSIX: SIGKILL to the group is asynchronous, so wait (bounded) until the group has no members left
 *  before the caller sees the rejection. No-op on win32 (taskkill /T handles the tree there). */
async function groupGone(pid: number | undefined, boundMs = 2_000): Promise<void> {
  if (process.platform === "win32" || !pid) return;
  for (const end = Date.now() + boundMs; Date.now() < end; await new Promise((r) => setTimeout(r, 10)))
    try { process.kill(-pid, 0); } catch { return; }
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
          if (error) void groupGone(child.pid).then(() => reject(new Error(error)));
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
