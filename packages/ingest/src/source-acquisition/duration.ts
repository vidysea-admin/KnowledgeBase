import { dirname, isAbsolute } from "node:path";
import { boundedToolExec } from "./exec.js";
import type { YoutubeExec } from "../sources/youtube.js";

/** Local ffprobe metadata only; no network protocols, shell, decode or re-encoding. */
export function createMediaDurationProbe(env: Record<string, string | undefined> = process.env, execute: YoutubeExec = boundedToolExec) {
  const command = env.LKB_FFPROBE_PATH || "ffprobe";
  if (command !== "ffprobe" && (!isAbsolute(command) || /[\u0000-\u001f\u007f]/.test(command) || /\.(cmd|bat)$/i.test(command))) {
    throw new Error("media duration tool configuration refused");
  }
  return async (file: string): Promise<number> => {
    if (!isAbsolute(file) || /[\u0000-\u001f\u007f]/.test(file)) throw new Error("media duration path refused");
    try {
      const result = await execute(command, ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration", "-of", "json", "-i", file],
        { cwd: dirname(file), timeoutMs: 30_000 });
      if (result.exitCode !== 0 || result.timedOut || result.stdout.length > 65_536) throw new Error("probe failed");
      const duration = Number((JSON.parse(result.stdout) as { format?: { duration?: unknown } }).format?.duration);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("duration unavailable");
      return duration;
    } catch { throw new Error("source media duration unavailable"); }
  };
}
