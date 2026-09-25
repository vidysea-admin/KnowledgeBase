/**
 * packages/meeting-bot/src/capture/audio-watchdog.ts — T-031 live audio watchdog
 * (docs/meeting-bot-roadmap.md:46): "no signal for more than 2 min while the session is live ->
 * alert + reconnect. Done when: a muted tab triggers the alert."
 *
 * New file, not appended to obs-windows.ts or record-commands.ts: obs-windows.ts is already
 * pinned near the repo's 300-LOC budget (scripts/lint-loc.mjs) — obs-guard.ts, controller-state.ts,
 * watchdog.ts and record-finalize.ts were ALL split out of it or record-commands.ts/cli.ts for
 * exactly this reason (see each file's own header) — and this is a fourth, independent concern
 * (meter polling + silence-duration timer state), same shape as reconnect-gaps.ts/telegram-
 * alerts.ts's own splits.
 *
 * Two exports:
 *  - `createAudioWatchdog` — pure decision/timer logic. Clock, meter source, ticker, notifier and
 *    reconnect trigger are ALL injected (AudioWatchdogDeps), so tests drive it with a fake clock
 *    and synthetic meter events — no real OBS/browser/Telegram anywhere near the unit tests.
 *  - `createRealLevelSource` — the real OBS wiring, built as a SEPARATE obs-websocket-js
 *    connection from obs-windows.ts's scene/recording-control client (obs-websocket supports
 *    multiple concurrent clients over one server) specifically so this module never has to touch
 *    obs-windows.ts's already-tight LOC budget. Subscribes to the InputVolumeMeters high-volume
 *    event (opt-in bit, off by default) and reads AUDIO_INPUT's own peak level — never the
 *    desktop/mic inputs — so a live Zoom/Meet on the HOST's own speakers can never mask the bot's
 *    own capture going silent.
 *
 * Threshold: reuses record-finalize.ts's `isSilentCapture` / `SILENCE_MAX_DB` (-50 dB) predicate
 * for the live per-tick reading, so "silent" means the same thing live as it does in the post-hoc
 * finalize gate — one number, one reasoning (that file's own comment: -91 dB is measured digital
 * silence; -50 dB sits comfortably above the noise floor and below any real speech peak).
 *
 * "Once per stretch, re-arm on real audio" IS the cooldown: `alarmed` gates both the alert and the
 * reconnect, and `lastAudibleAt` resets to "now" on every non-silent reading — so a second firing
 * always requires its own fresh SILENT_TRIGGER_SEC of continuous silence, counted from the moment
 * audio last returned. A separate timer-based cooldown on top of that would never be reachable
 * (dead code): the alarmed-gated stretch boundary already enforces the same >=SILENT_TRIGGER_SEC
 * spacing between any two firings.
 *
 * No meter data at all (OBS unreachable, the audio input never appears) is treated the same as
 * true silence: `lastAudibleAt` starts at watchdog-start time and only ever moves forward on a
 * confirmed non-silent reading, so a dead meter feed still fires after SILENT_TRIGGER_SEC — a
 * fail-loud watchdog, not a fail-silent one, matches the roadmap's own reliability intent.
 *
 * C3 (mute handling): this module never mutes/unmutes anything — `AudioWatchdogDeps` has no
 * mute-shaped field at all, and neither export here imports obs-windows.ts's SetInputMute call
 * sites. Reconnect is triggered through T-031's own new sentinel-file channel (obs-windows.ts's
 * `triggerReload` + sb_join.py's `--reload-file`), never by touching the mute state OBS's mute
 * guard (C3, obs-windows.ts) already owns.
 */
import { OBSWebSocket, EventSubscription } from "obs-websocket-js";

import { isSilentCapture } from "./record-finalize.js";

/** Roadmap T-031: "more than 2 min" of continuous silence. */
export const SILENT_TRIGGER_SEC = 120;

export interface AudioWatchdogDeps {
  /** Injectable clock (ms epoch) — tests drive this with a fake instead of real Date.now(). */
  now: () => number;
  /** Subscribes to live level readings in dB (already converted from the meter source's native
   * units). Called exactly once, in start(). Returns an unsubscribe function. */
  subscribeLevel: (onLevelDb: (levelDb: number) => void) => () => void;
  /** Periodic-tick driver. Tests inject a fake so no real timer is ever created; production
   * passes a thin setInterval wrapper. Returns a function that cancels the tick. */
  scheduleTick: (fn: () => void, intervalMs: number) => () => void;
  /** telegram-alerts.ts's notifySilence(durationSec) — called once per silent stretch. */
  notifySilence: (durationSec: number) => void;
  /** Triggers ONE reconnect attempt for the current silent stretch. */
  reconnect: () => void;
  log?: (msg: string) => void;
}

export interface AudioWatchdog {
  start(): void;
  /** Idempotent and safe to call even if start() was never called — every caller in
   * record-commands.ts calls this unconditionally on every exit path (the no-dangling-timer
   * rule this unit exists to satisfy). */
  stop(): void;
}

const TICK_INTERVAL_MS = 1000;

export function createAudioWatchdog(deps: AudioWatchdogDeps): AudioWatchdog {
  const log = deps.log ?? (() => {});
  let unsubscribeLevel: (() => void) | undefined;
  let cancelTick: (() => void) | undefined;
  let lastAudibleAt: number | undefined;
  let alarmed = false;
  let started = false;

  function onLevel(levelDb: number): void {
    if (isSilentCapture(levelDb)) return;
    const wasAlarmed = alarmed;
    lastAudibleAt = deps.now();
    alarmed = false;
    if (wasAlarmed) log("audio-watchdog: audio returned — re-armed");
  }

  function tick(): void {
    if (lastAudibleAt === undefined || alarmed) return;
    const silentForSec = (deps.now() - lastAudibleAt) / 1000;
    if (silentForSec <= SILENT_TRIGGER_SEC) return;
    alarmed = true; // gates both calls below until the next confirmed non-silent reading
    log(`audio-watchdog: silent for ${Math.round(silentForSec)}s — alerting + reconnecting`);
    deps.notifySilence(silentForSec);
    deps.reconnect();
  }

  return {
    start() {
      if (started) return;
      started = true;
      lastAudibleAt = deps.now(); // assume audible at start — a slow-starting capture must not
      // read as an immediate false alarm; a genuinely muted tab still crosses SILENT_TRIGGER_SEC
      // on its own, counted from this same baseline.
      alarmed = false;
      unsubscribeLevel = deps.subscribeLevel(onLevel);
      cancelTick = deps.scheduleTick(tick, TICK_INTERVAL_MS);
    },
    stop() {
      if (!started) return;
      started = false;
      unsubscribeLevel?.();
      cancelTick?.();
      unsubscribeLevel = undefined;
      cancelTick = undefined;
    },
  };
}

// ---- real OBS meter wiring -------------------------------------------------

export interface AudioLevelSourceConfig {
  obsUrl: string;
  obsPassword: string;
  /** Must match obs-windows.ts's AUDIO_INPUT (imported by callers, not duplicated here — this
   * module takes it as config instead of importing obs-windows.ts, keeping the two files
   * decoupled). */
  inputName: string;
  log?: (msg: string) => void;
}

/** Minimal shape this module needs from an obs-websocket-js client: a DEDICATED connection (never
 * obs-windows.ts's own `obs` instance — see file header) plus its typed InputVolumeMeters event.
 * Test seam: a fake implementing just this shape, no real websocket. */
export interface MeterClient {
  connect: (
    url: string,
    password: string,
    identificationParams: { eventSubscriptions: number },
  ) => Promise<unknown>;
  on: (event: "InputVolumeMeters", cb: (data: { inputs: Array<Record<string, unknown>> }) => void) => unknown;
  off: (event: "InputVolumeMeters", cb: (data: { inputs: Array<Record<string, unknown>> }) => void) => unknown;
  disconnect: () => Promise<unknown>;
}

/** obs-websocket's InputVolumeMeters payload (Obs_VolumeMeter.cpp): each channel of
 * `inputLevelsMul` is `[magnitude, peak, peakUnaffectedByVolume]`, linear multipliers (0.0-1.0+),
 * not dB. Index 1 ("peak, with volume applied") is the same value OBS's own mixer meter displays.
 * Returns the max peak across channels — a single loud channel must never be masked by a quiet
 * one — or undefined if the shape is missing/malformed (never throws on an unexpected payload). */
export function peakMulFromLevels(levels: unknown): number | undefined {
  if (!Array.isArray(levels) || levels.length === 0) return undefined;
  let max: number | undefined;
  for (const channel of levels) {
    if (!Array.isArray(channel)) continue;
    const peak = channel[1];
    if (typeof peak === "number" && Number.isFinite(peak) && (max === undefined || peak > max)) max = peak;
  }
  return max;
}

/** Linear multiplier -> dB. 0 (digital silence, e.g. a muted tab's capture) maps to -Infinity,
 * which is always < SILENCE_MAX_DB — exactly the "muted tab triggers the alert" behaviour the
 * roadmap row names as this unit's own done-check. */
export function mulToDb(mul: number): number {
  return mul > 0 ? 20 * Math.log10(mul) : -Infinity;
}

const defaultMakeClient = (): MeterClient => new OBSWebSocket() as unknown as MeterClient;

/**
 * Builds `AudioWatchdogDeps.subscribeLevel` for real production use: a dedicated OBS connection
 * subscribed to the InputVolumeMeters high-volume event, filtered to `cfg.inputName` only (the
 * bot's own per-process capture — never the global desktop/mic inputs obs-windows.ts mutes for
 * the run), converted from linear multiplier to dB.
 */
export function createRealLevelSource(
  cfg: AudioLevelSourceConfig,
  makeClient: () => MeterClient = defaultMakeClient,
): (onLevelDb: (levelDb: number) => void) => () => void {
  const log = cfg.log ?? (() => {});
  return (onLevelDb: (levelDb: number) => void): (() => void) => {
    const client = makeClient();
    // `stopped` guards the race where unsubscribe() runs before connect() resolves: without it,
    // the pending .then() below would still register the listener and the connection would never
    // be closed — a leaked handle stop() was supposed to prevent (same class as ISS-T-033-2).
    // `closed` makes the actual disconnect() call idempotent — unsubscribe() and the deferred
    // .then() branch can both reach it, but it must only ever fire once.
    let stopped = false;
    let closed = false;
    const closeOnce = () => {
      if (closed) return;
      closed = true;
      void client.disconnect().catch(() => {});
    };
    const handler = (data: { inputs: Array<Record<string, unknown>> }): void => {
      const input = data.inputs.find((i) => i.inputName === cfg.inputName);
      if (!input) return;
      const mul = peakMulFromLevels(input.inputLevelsMul);
      if (mul === undefined) return;
      onLevelDb(mulToDb(mul));
    };
    client
      .connect(cfg.obsUrl, cfg.obsPassword, {
        eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters,
      })
      .then(() => {
        if (stopped) {
          closeOnce();
          return;
        }
        client.on("InputVolumeMeters", handler);
      })
      .catch((e: unknown) => {
        // ISS-T-047-CONTROLLER-001-style rule: never log connect-error content that could carry
        // the OBS_WS_PASSWORD connect argument (C6) — message only, never the error object.
        log(`audio-watchdog: meter connection failed: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      stopped = true;
      client.off("InputVolumeMeters", handler);
      closeOnce();
    };
  };
}
