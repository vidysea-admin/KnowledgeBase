/**
 * packages/meeting-bot/src/capture/tab-silence-health.ts — zoomwebinar lane. Capture-health check, OFF by default.
 *
 * Live 2026-10-13: tab audio went digitally silent (-91 dB) from ~368 s to the end while video kept flowing,
 * and nothing said so (the T-031 watchdog needs 120 s at -50 dB, only alerts via Telegram, and its reconnect is
 * suppressed while admission is not recognised). With LKB_TAB_SILENCE_HEALTH=1 every capture-level reading feeds
 * this tracker; a sustained stretch at or below the threshold (default -90 dB for 60 s) is flagged once, written
 * to the capture status.json as `audioHealth`, and logged. It never rejoins or stops anything (lane capresume).
 */
export const SILENCE_HEALTH_ENV = "LKB_TAB_SILENCE_HEALTH";
export const silenceHealthEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env[SILENCE_HEALTH_ENV] === "1";

export interface AudioHealth { silent: boolean; silentSince?: string; silentSeconds?: number; note?: string }
export interface SilenceHealthOpts { now?: () => number; thresholdDb?: number; thresholdSec?: number; onChange: (h: AudioHealth) => void }

export function createSilenceHealth(o: SilenceHealthOpts) {
  const now = o.now ?? Date.now, db = o.thresholdDb ?? Number(process.env.LKB_TAB_SILENCE_DB ?? -90), sec = o.thresholdSec ?? Number(process.env.LKB_TAB_SILENCE_SEC ?? 60);
  let since: number | undefined, flagged = false;
  return {
    /** Feed one capture-level reading (dB). Readings only arrive while the recorder runs, i.e. video is live. */
    onLevel(levelDb: number): void {
      const t = now();
      if (levelDb > db) {
        since = undefined;
        if (flagged) { flagged = false; o.onChange({ silent: false, note: "audio returned" }); }
        return;
      }
      since ??= t;
      const secs = (t - since) / 1000;
      if (!flagged && secs >= sec) {
        flagged = true;
        o.onChange({ silent: true, silentSince: new Date(since).toISOString(), silentSeconds: Math.round(secs),
          note: `tab audio digitally silent (<= ${db} dB) for ${Math.round(secs)}s while the recorder is live` });
      }
    },
  };
}
