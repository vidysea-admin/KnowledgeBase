/** Assisted recording of media a HUMAN plays (e.g. YouTube replays behind a bot check).
 * The bot never clicks, never touches a bot-check, never downloads: it attaches to a plain Chrome the
 * human drives, waits until the page's <video> is really playing, records that element, and stops
 * when it ends. Recording an advert that plays first is expected and accepted. Returns the same
 * dependency shape as createTabBrowserDeps so runRecord's consent/finalize/index path is unchanged. */
import { appendFileSync, closeSync, mkdirSync, openSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { BrowserJoinerDeps } from "../../joiners/browser-joiner.js";
import type { GapWindow } from "../reconnect-gaps.js";

export interface AssistedMediaState { hasVideo: boolean; paused: boolean; ended: boolean; currentTime: number; duration: number; readyState: number }
/** A tab in the human's Chrome. snapshot() resolves null once the tab is gone. */
export interface AssistedPage {
  snapshot(): Promise<AssistedMediaState | null>;
  startRecording(onChunk: (bytes: Buffer) => void): Promise<void>;
  stopRecording(): Promise<void>;
  close(): Promise<void>;
  /** Optional: close a Chrome this run launched and remove its temp profile (skipped by --keep-browser). */
  dispose?(): Promise<void>;
}
export interface AssistedConfig {
  recordDir: string; sessionId?: string; tenantId?: string;
  connect: (url: string) => Promise<AssistedPage>;
  playTimeoutMs?: number; pollMs?: number;
  now?: () => number; sleep?: (ms: number) => Promise<void>;
  onEvent?: (handle: string, event: { event: string; t: number; [k: string]: unknown }) => void;
  log?: (message: string) => void;
}
const PLAY_TIMEOUT_MS = 10 * 60_000, POLL_MS = 1000, ENDED_CONFIRM_POLLS = 3;

export function isPlaying(prev: AssistedMediaState | undefined, cur: AssistedMediaState | null): boolean {
  return !!cur && cur.hasVideo && !cur.paused && !cur.ended && cur.readyState >= 3 && !!prev && cur.currentTime > prev.currentTime + 0.1;
}
export function isEnded(s: AssistedMediaState | null): boolean {
  if (!s) return true;
  return s.hasVideo && (s.ended || (Number.isFinite(s.duration) && s.duration > 0 && s.paused && s.currentTime >= s.duration - 0.5));
}

export function createAssistedDeps(cfg: AssistedConfig) {
  const log = cfg.log ?? ((m: string) => console.log(`[assisted] ${m}`));
  const sleep = cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = cfg.now ?? Date.now, pollMs = cfg.pollMs ?? POLL_MS;
  const runs = new Map<string, { page: AssistedPage; output: string; bytes: number; stopped: boolean; exited: Promise<number | null>; gaps: GapWindow[] }>();
  const emit = (handle: string, event: string, extra: Record<string, unknown> = {}) => cfg.onEvent?.(handle, { event, t: now(), ...extra });
  const deps: BrowserJoinerDeps = {
    async launch(url) {
      const handle = `assisted-${now()}-${randomBytes(4).toString("hex")}`;
      mkdirSync(cfg.recordDir, { recursive: true });
      const output = path.join(cfg.recordDir, `${handle}.webm`);
      const page = await cfg.connect(url);
      log("READY: press play in the Chrome window (the bot will not click anything). Recording starts when playback is detected.");
      const timeoutMs = cfg.playTimeoutMs ?? PLAY_TIMEOUT_MS, deadline = now() + timeoutMs;
      let prev: AssistedMediaState | undefined;
      for (;;) {
        const cur = await page.snapshot();
        if (isPlaying(prev, cur)) break;
        if (now() >= deadline) {
          await page.close().catch(() => {}); await page.dispose?.().catch(() => {});
          throw new Error(`assisted: nothing played within ${Math.round(timeoutMs / 600) / 100} minutes; refusing, no recording made`);
        }
        prev = cur ?? undefined;
        await sleep(pollMs);
      }
      closeSync(openSync(output, "w"));
      const run = { page, output, bytes: 0, stopped: false, gaps: [] as GapWindow[], exited: undefined as unknown as Promise<number | null> };
      await page.startRecording((b) => { appendFileSync(output, b); run.bytes += b.length; });
      emit(handle, "admitted", { assumed: false });
      emit(handle, "capture-started", { mediaStartedAt: now() });
      log(`playback detected, recording to ${output} (an advert that plays first is recorded too)`);
      run.exited = (async () => {
        let ended = 0;
        while (!run.stopped) {
          await sleep(pollMs);
          const s = await page.snapshot().catch(() => null);
          ended = isEnded(s) ? ended + 1 : 0;
          if (!s || ended >= ENDED_CONFIRM_POLLS) { log(s ? "media ended" : "tab closed"); return 0; }
        }
        return null;
      })();
      runs.set(handle, run);
      return { sessionHandle: handle, mediaStream: output };
    },
    async stop(handle) {
      const run = runs.get(handle); if (!run || run.stopped) return;
      run.stopped = true;
      try { await run.page.stopRecording(); } finally { await run.page.close().catch(() => {}); await run.page.dispose?.().catch(() => {}); } // close detaches only; dispose closes a Chrome we launched
      emit(handle, "capture-stopped", { failed: false });
      if (!run.bytes || statSync(run.output).size === 0) throw new Error("assisted: no media bytes were recorded");
    },
  };
  return {
    deps, outputPath: (h: string) => runs.get(h)?.output,
    browserExited: (h: string) => runs.get(h)?.exited,
    triggerReload: () => {}, // never reload or touch the human's page
    subscribeLevel: (_l: (db: number) => void) => () => {},
    persistControlGap: (h: string, gap: GapWindow) => { runs.get(h)?.gaps.push(gap); },
    disconnect: async () => { for (const h of runs.keys()) await deps.stop?.(h).catch(() => {}); },
  };
}
