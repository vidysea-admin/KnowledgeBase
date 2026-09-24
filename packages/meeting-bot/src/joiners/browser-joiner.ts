/**
 * packages/meeting-bot/src/joiners/browser-joiner.ts — T-024 C3. Browser-profile join joiner
 * (for platforms without native Vexa support — webex, zoho, cloudonair; see strategy.ts).
 *
 * `launch`/`stop` are injected as a Playwright-shaped interface
 * (`(url, opts) => Promise<{sessionHandle, mediaStream}>`) so this file never imports a browser
 * driver directly. As of T-024b (2026-09-24, D-027/D-028) the real implementation satisfying
 * that interface is `createObsBrowserDeps` in `../capture/obs-windows.ts`: it spawns
 * `py/sb_join.py` (a headed SeleniumBase-UC Chrome on a persistent profile) for the actual
 * join-page automation, then drives OBS over obs-websocket v5 (window_capture +
 * wasapi_process_output_capture matched by window title) for per-process audio/video capture —
 * not an in-browser audio track, which is why `mediaStream` isn't a literal browser MediaStream.
 * See `qa/contracts/meeting-bot-live-capture.md` (T-024b, DRAFT) for the criteria this now meets.
 * `vexa-joiner.ts` and `system-audio-joiner.ts` remain stubs; this file's own interface is
 * unchanged by T-024b — only what satisfies it changed.
 */
import type { Joiner, JoinOpts, JoinResult } from "../joiner.js";

/** Playwright-shaped launcher, injected — never a direct `playwright` import in this file. */
export type BrowserLauncher = (url: string, opts: JoinOpts) => Promise<JoinResult>;
/** Injected stop hook — closes whatever the launcher opened for `sessionHandle`. */
export type BrowserStopper = (sessionHandle: string) => Promise<void>;

export interface BrowserJoinerDeps {
  launch: BrowserLauncher;
  stop?: BrowserStopper;
}

export function createBrowserJoiner(deps: BrowserJoinerDeps): Joiner {
  return {
    name: "browser",

    async join(url: string, opts: JoinOpts): Promise<JoinResult> {
      return deps.launch(url, opts);
    },

    async stop(sessionHandle: string): Promise<void> {
      if (deps.stop) await deps.stop(sessionHandle);
    },
  };
}
