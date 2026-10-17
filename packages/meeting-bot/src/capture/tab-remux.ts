/**
 * packages/meeting-bot/src/capture/tab-remux.ts — zoomwebinar lane. FALLBACK ONLY, OFF by default.
 *
 * When a tab capture is stopped and the recorder never acknowledged its final flush (Chrome already gone),
 * the chunks written so far are a MediaRecorder WebM with no duration/cues: it plays badly and needs a
 * remux. With LKB_TAB_REMUX_RECOVERY=1 the controller runs `ffmpeg -c copy` over the received bytes (no
 * re-encode), keeps the untouched original as `<output>.raw`, and puts the remuxed file at `output`.
 * The tail since the last chunk the extension delivered is NOT recoverable; this is flagged in status.
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync, statSync } from "node:fs";

export const REMUX_ENV = "LKB_TAB_REMUX_RECOVERY";
export const remuxRecoveryEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env[REMUX_ENV] === "1";

export interface RemuxResult { ok: boolean; error?: string }
type Run = (cmd: string, args: string[]) => { status: number | null; stderr?: string | Buffer | null; error?: Error };

export function remuxWebmInPlace(output: string, run: Run = (c, a) => spawnSync(c, a, { encoding: "utf8" })): RemuxResult {
  const tmp = `${output}.remux.webm`, raw = `${output}.raw`;
  try {
    if (!existsSync(output) || statSync(output).size === 0) return { ok: false, error: "no media to remux" };
    rmSync(tmp, { force: true });
    const r = run(process.env.LKB_FFMPEG ?? "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", output, "-c", "copy", "-f", "webm", tmp]);
    if (r.error || r.status !== 0 || !existsSync(tmp) || statSync(tmp).size === 0) {
      rmSync(tmp, { force: true });
      return { ok: false, error: r.error?.message ?? `ffmpeg exited ${r.status}: ${String(r.stderr ?? "").slice(0, 200)}` };
    }
    rmSync(raw, { force: true });
    renameSync(output, raw);
    renameSync(tmp, output);
    return { ok: true };
  } catch (e) {
    rmSync(tmp, { force: true });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
