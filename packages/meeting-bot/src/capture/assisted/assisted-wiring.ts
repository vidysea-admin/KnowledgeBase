/** Wires `lkb record --assisted` to the real plain-Chrome adapter. Flags: --debug-port N (9223), --play-timeout MIN (10). */
import path from "node:path";
import { connectAssistedChrome } from "./assisted-cdp.js";
import { createAssistedDeps } from "./assisted-record.js";

const num = (rest: string[], name: string, fallback: number): number => {
  const i = rest.indexOf(name), v = i >= 0 ? Number(rest[i + 1]) : fallback;
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number`);
  return v;
};

export function assistedRecordDeps(rest: string[], cfg: { profileDir: string; browserExecutable?: string; onEvent?: (h: string, e: any) => void }, recordDir: string) {
  const port = num(rest, "--debug-port", 9223), userDataDir = path.join(path.dirname(cfg.profileDir), "assisted-chrome-profile");
  return createAssistedDeps({
    recordDir, onEvent: cfg.onEvent, playTimeoutMs: num(rest, "--play-timeout", 10) * 60_000,
    connect: (url) => connectAssistedChrome(url, { port, userDataDir, executable: cfg.browserExecutable }),
  });
}
