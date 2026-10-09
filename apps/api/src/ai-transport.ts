/** Real provider transport. CLI jobs are isolated, bounded, and never invoke a shell. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { Transport, TransportRequest, TransportResponse } from "@lkb/ai";

function tryParseJson(text: string): unknown { try { return JSON.parse(text); } catch { return text; } }
async function httpTransport(req: TransportRequest): Promise<TransportResponse> {
  const res = await fetch(req.url!, { method: req.method ?? "GET", headers: req.headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined });
  const text = await res.text();
  return { status: res.status, body: tryParseJson(text), text };
}
export interface CliLimits {
  timeoutMs?: number; inputBytes?: number; outputBytes?: number; outputTokens?: number;
  executable?: string; cwd?: string;
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
          if (error) reject(new Error(error));
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
    } finally { if (ephemeral) rmSync(ephemeral, {recursive: true, force: true}); }
  };
}
const cliTransport = createCliTransport();
export const realTransport: Transport = (req) => req.kind === "cli" ? cliTransport(req) : httpTransport(req);
