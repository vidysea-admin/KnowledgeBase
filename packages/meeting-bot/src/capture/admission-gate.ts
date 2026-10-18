/**
 * packages/meeting-bot/src/capture/admission-gate.ts — ISS-CAPTUREFIX-001.
 *
 * The audio-silence watchdog (T-031) must not run while the bot waits in the Meet lobby: a lobby is
 * silent, so after SILENT_TRIGGER_SEC the watchdog asked sb_join.py to reload the page, which ended
 * the tab's audio track and killed the capture (live run 2026-10-13). sb_join.py now emits
 * `admitted` once it sees the in-call controls (non-Meet platforms with no lobby or denied text for the whole wait: `assumed: true`, D-167);
 * this gate starts the watchdog only then, and turns the two failure shapes into clear messages:
 *  - `admission_timeout`  -> "admission_timeout: ..." (the bot was never let in);
 *  - a `capture-error` that follows a post-admission page reload -> the error plus the reload cause.
 * Split out of record-commands.ts to keep that file inside the repo LOC budget.
 */
export interface GateEvent { event: string; error?: unknown; seconds?: unknown; limit?: unknown }
export interface GateWatchdog { start(): void }

/** A reload this recent before a capture-error is treated as its cause. */
export const RELOAD_CAUSE_WINDOW_MS = 180_000;

export function createAdmissionGate(now: () => number = Date.now) {
  let admitted = false;
  let watchdog: GateWatchdog | undefined;
  let lastReload: { at: number; kind: string } | undefined;
  let failure: string | undefined;
  let timedOut = false;

  function decide(ev: GateEvent): string | undefined {
    switch (ev.event) {
      case "admitted":
        admitted = true;
        watchdog?.start();
        return undefined;
      case "admission_timeout":
        timedOut = !admitted;
        return `admission_timeout: the bot was not admitted to the meeting within ${String(ev.limit ?? "?")}s (waited ${String(ev.seconds ?? "?")}s in the lobby); no recording made`;
      case "watchdog-reload":
      case "reconnect-reload":
        if (admitted) lastReload = { at: now(), kind: ev.event };
        return undefined;
      case "capture-error": {
        if (admitted && lastReload && now() - lastReload.at <= RELOAD_CAUSE_WINDOW_MS) {
          return `${String(ev.error ?? "capture failed")} (the audio track ended after a page reload [${lastReload.kind}] following admission; the reload killed the capture)`;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  return {
    get admitted(): boolean { return admitted; },
    /** "lobby" until `admitted`; "failed" once an admission_timeout was reported; a capture is "recording" only in "admitted". */
    get state(): "lobby" | "admitted" | "failed" { return admitted ? "admitted" : timedOut ? "failed" : "lobby"; },
    /** The most recent failure message this gate produced (the tab backend's own stop error is terser). */
    get failure(): string | undefined { return failure; },
    /** Registers the watchdog; starts it at once if `admitted` already arrived (join() can emit it first). */
    attach(w: GateWatchdog): void { watchdog = w; if (admitted) w.start(); },
    /** Feed every bot event. Returns a failure message when the event is fatal for the capture. */
    onEvent(ev: GateEvent): string | undefined {
      const message = decide(ev);
      if (message) failure = message;
      return message;
    },
  };
}
