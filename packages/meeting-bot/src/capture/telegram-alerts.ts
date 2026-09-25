/**
 * packages/meeting-bot/src/capture/telegram-alerts.ts — T-030 status alerts to Telegram.
 *
 * Hooks onto the event points record-commands.ts already has wired (sb_join.py's JSON stdout
 * stream, forwarded through obs-windows.ts's `onEvent`, plus the join call and the
 * finalizeRecording summary) — no parallel event system, per the roadmap row (docs/meeting-bot-
 * roadmap.md T-030): "joined · disconnected/recovered · silent for more than 2 min · finished +
 * transcript ready (with a summary)".
 *
 * Design:
 *  - Transport: Telegram Bot API `sendMessage` over HTTPS — now telegram-channel.ts's ONE client
 *    (U3 generalization, plan §U3). This file no longer talks HTTPS itself; `createTelegramNotifier`
 *    builds a single-channel `Notifier` (notify-channels.ts) over `createTelegramChannel` and
 *    routes every notify* call through it. Public API, message text, throttle keys and the
 *    token-redaction guarantee are UNCHANGED from T-030 — every existing caller (record-commands.ts,
 *    record-finalize.ts) and every existing test in this file keeps working as before.
 *  - Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID -> alerts silently disabled with ONE log line;
 *    never throws — a missing/misconfigured Telegram must never crash or block a recording.
 *  - Every send is fire-and-forget with a short timeout; a failure is logged (token redacted —
 *    telegram-channel.ts) and never rethrown to the caller.
 *  - Throttle: the same alert key is sent at most once per `throttleMs` (default 60s), so a
 *    flapping connection (rapid reconnect-reload/gap cycles) cannot spam the phone.
 *  - Silence >2min: this module only EXPOSES `notifySilence` / `onBotEvent`'s hook point for it —
 *    no OBS-meter watchdog lives here (T-031's audio-watchdog.ts calls `notifySilence` directly).
 *  - Multi-channel / WhatsApp / config (NOTIFY_CHANNELS): deliberately NOT wired into this
 *    Telegram-only notifier — record-commands.ts and audio-watchdog.ts stay exactly as they are.
 *    The multi-channel, config-driven path lives in configured-notifier.ts's `notifyDigest` /
 *    `createConfiguredNotifier`, for the new digest use case (U2) and any future dashboard-driven
 *    (U4) reconfiguration of bot-status alerts.
 */
import { existsSync, readFileSync } from "node:fs";

import type { BotEvent } from "./obs-windows.js";
import { createNotifier } from "./notify-channels.js";
import { createTelegramChannel } from "./telegram-channel.js";

export interface FinishedSummary {
  title: string;
  sessionId: string;
  /** Wall-clock recording duration in seconds; 0 when unknown (e.g. the `finalize` recovery path,
   * which has no live `startedAt` to measure from). */
  durationSec: number;
  gapCount: number;
  transcriptPath?: string;
  turnCount?: number;
}

export interface TelegramNotifierDeps {
  /** Defaults to process.env.TELEGRAM_BOT_TOKEN. */
  token?: string;
  /** Defaults to process.env.TELEGRAM_CHAT_ID. */
  chatId?: string;
  /** Injectable transport — tests supply a fake here. NEVER call the real API from a test (a
   * live send is an outward-facing action that gates to the human). */
  send?: (token: string, chatId: string, text: string) => Promise<void>;
  log?: (msg: string) => void;
  now?: () => number;
  throttleMs?: number;
}

export interface TelegramNotifier {
  readonly enabled: boolean;
  notifyJoined(title: string, platform: string): void;
  notifyDisconnected(reason: string): void;
  notifyRecovered(reason: string, durationSec: number): void;
  /** Exposed for a future live silence-watchdog (T-031) to call; nothing in this module triggers
   * it on its own. */
  notifySilence(durationSec: number): void;
  notifyFinished(summary: FinishedSummary): void;
  /** Pure event-shape dispatcher for sb_join.py's JSON stream (the existing onEvent point in
   * record-commands.ts). Maps "reconnect-reload" -> disconnected and a completed, RECOVERED gap
   * -> recovered; every other event (heartbeat, clicked, tab-switch, an unrecovered end-of-run
   * gap, ...) is a deliberate no-op. */
  onBotEvent(ev: BotEvent): void;
}

/** Plain array length off a written turns.json — no LLM call, no re-parsing of the audio. Used by
 * the "finished + transcript ready" summary. Returns undefined for a missing/malformed file
 * rather than throwing — a notification detail must never fail the finalize step it reports on. */
export function readTurnCount(turnsPath: string): number | undefined {
  if (!existsSync(turnsPath)) return undefined;
  try {
    const turns = JSON.parse(readFileSync(turnsPath, "utf8"));
    return Array.isArray(turns) ? turns.length : undefined;
  } catch {
    return undefined;
  }
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m${r}s`;
}

/** Builds the notifier. Reading env once here (rather than per-call) means a `.env` load that
 * happens after construction is NOT picked up — callers construct this after
 * `process.loadEnvFile(...)`, matching how record-commands.ts already loads `.env` before using
 * any other credential (OBS_WS_PASSWORD).
 *
 * U3: internally a single-channel `Notifier` (notify-channels.ts) over `createTelegramChannel`
 * (telegram-channel.ts) — same enabled-gate, same throttle, same fire-and-forget/never-throws
 * guarantee, same redacted-failure log line as before the split, just built from the shared
 * primitives instead of a private copy of them. */
export function createTelegramNotifier(deps: TelegramNotifierDeps = {}): TelegramNotifier {
  const log = deps.log ?? ((m: string) => console.log(m));
  const channel = createTelegramChannel({ token: deps.token, chatId: deps.chatId, send: deps.send, log });
  const enabled = channel !== undefined;
  const fanout = createNotifier(channel ? [channel] : [], { log, now: deps.now, throttleMs: deps.throttleMs });

  /** Fire-and-forget: returns void synchronously, never a Promise the caller could await/throw
   * on. A send failure or timeout is logged (token redacted, telegram-channel.ts) and goes no
   * further — it must never break or delay the recording it is reporting on. */
  function fireAndForget(key: string, text: string): void {
    fanout.send(key, text);
  }

  const notifier: TelegramNotifier = {
    enabled,
    notifyJoined(title, platform) {
      fireAndForget("joined", `✅ Joined: ${title} (${platform})`);
    },
    notifyDisconnected(reason) {
      fireAndForget("disconnected", `⚠️ Disconnected — ${reason}`);
    },
    notifyRecovered(reason, durationSec) {
      fireAndForget("recovered", `🔄 Recovered after ${formatDuration(durationSec)} (${reason})`);
    },
    notifySilence(durationSec) {
      fireAndForget("silent", `🔇 Silent for ${formatDuration(durationSec)}`);
    },
    notifyFinished(summary) {
      const lines = [
        `🏁 Finished: ${summary.title}`,
        `duration: ${formatDuration(summary.durationSec)}`,
        `gaps: ${summary.gapCount}`,
      ];
      if (summary.transcriptPath) lines.push(`transcript: ${summary.transcriptPath}`);
      if (summary.turnCount !== undefined) lines.push(`turns: ${summary.turnCount}`);
      fireAndForget(`finished:${summary.sessionId}`, lines.join("\n"));
    },
    onBotEvent(ev) {
      // Routed through the public methods above (single source of truth for the message text
      // and the throttle key) rather than re-building the strings here.
      if (ev.event === "reconnect-reload") {
        notifier.notifyDisconnected(String(ev.reason ?? "unknown"));
        return;
      }
      if (ev.event === "gap" && ev.recovered === true) {
        const start = Number(ev.start);
        const end = Number(ev.end);
        const durationSec = Number.isFinite(start) && Number.isFinite(end) ? end - start : 0;
        notifier.notifyRecovered(String(ev.reason ?? "unknown"), durationSec);
        return;
      }
      // Every other event (heartbeat, clicked, tab-switch, opened, closed, an unrecovered
      // end-of-run gap, ...) is a deliberate no-op — see the interface doc above.
    },
  };
  return notifier;
}
