/** Wires `lkb record --assisted` to the real plain-Chrome adapter. Flags: --debug-port N (9223), --play-timeout MIN (10). */
import path from "node:path";
import { connectAssistedChrome } from "./assisted-cdp.js";
import { createAssistedDeps } from "./assisted-record.js";

const num = (rest: string[], name: string, fallback: number): number => {
  const i = rest.indexOf(name), v = i >= 0 ? Number(rest[i + 1]) : fallback;
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number`);
  return v;
};

/** True when --assisted is given; refuses (never ignores) a non-tab backend. */
export function assistedFlag(rest: string[], env: NodeJS.ProcessEnv = process.env): boolean {
  const on = rest.includes("--assisted"), i = rest.indexOf("--backend"), backend = (i >= 0 ? rest[i + 1] : env.LKB_CAPTURE_BACKEND) ?? "tab";
  if (on && backend !== "tab") throw new Error("--assisted records through the tab backend only; it cannot be combined with --backend " + backend);
  return on;
}

export function assistedRecordDeps(rest: string[], cfg: { profileDir: string; browserExecutable?: string; onEvent?: (h: string, e: any) => void }, recordDir: string) {
  const port = num(rest, "--debug-port", 9223), userDataDir = path.join(path.dirname(cfg.profileDir), "assisted-chrome-profile");
  return createAssistedDeps({
    recordDir, onEvent: cfg.onEvent, playTimeoutMs: num(rest, "--play-timeout", 10) * 60_000,
    connect: (url) => connectAssistedChrome(url, { port, userDataDir, executable: cfg.browserExecutable, keepBrowser: rest.includes("--keep-browser") }),
  });
}
