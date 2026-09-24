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
 *  - Transport: Telegram Bot API `sendMessage` over HTTPS (`node:https`, no new dependency).
 *  - Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID -> alerts silently disabled with ONE log line;
 *    never throws — a missing/misconfigured Telegram must never crash or block a recording.
 *  - Every send is fire-and-forget with a short timeout; a failure is logged (token redacted —
 *    contract C6, meeting-bot-live-capture.md) and never rethrown to the caller.
 *  - Throttle: the same alert key is sent at most once per `throttleMs` (default 60s), so a
 *    flapping connection (rapid reconnect-reload/gap cycles) cannot spam the phone.
 *  - Silence >2min: this module only EXPOSES `notifySilence` / `onBotEvent`'s hook point for it —
 *    no OBS-meter watchdog lives here. Wiring a live trigger is T-031's job (out of scope here,
 *    same as the contract's own non-goals list for this phase).
 */
import { existsSync, readFileSync } from "node:fs";
import https from "node:https";

import type { BotEvent } from "./obs-windows.js";

const DEFAULT_THROTTLE_MS = 60_000;
const SEND_TIMEOUT_MS = 8_000;

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

/** Replaces every occurrence of `token` in `s` — the one thing standing between a thrown network
 * error and a token landing in a log line (C6). Applied to every string this module logs. */
function redact(s: string, token: string | undefined): string {
  if (!token) return s;
  return s.split(token).join("[REDACTED]");
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

/** Real transport: POST to api.telegram.org. Never imported directly by tests — always reached
 * through the injectable `send` dep, which tests replace with a fake. */
function defaultSend(token: string, chatId: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text });
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/sendMessage`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: SEND_TIMEOUT_MS,
      },
      (res) => {
        res.resume(); // drain — this module never reads the response body
        if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`telegram sendMessage HTTP ${res.statusCode ?? "?"}`));
      },
    );
    req.on("timeout", () => req.destroy(new Error("telegram sendMessage timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Builds the notifier. Reading env once here (rather than per-call) means a `.env` load that
 * happens after construction is NOT picked up — callers construct this after
 * `process.loadEnvFile(...)`, matching how record-commands.ts already loads `.env` before using
 * any other credential (OBS_WS_PASSWORD). */
export function createTelegramNotifier(deps: TelegramNotifierDeps = {}): TelegramNotifier {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = deps.chatId ?? process.env.TELEGRAM_CHAT_ID;
  const log = deps.log ?? ((m: string) => console.log(m));
  const now = deps.now ?? (() => Date.now());
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const send = deps.send ?? defaultSend;
  const enabled = Boolean(token && chatId);

  if (!enabled) {
    log("[telegram] alerts disabled — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set");
  }

  const lastSentAt = new Map<string, number>();

  /** true = throttled (caller must skip this send). Also records the send-time as a side effect
   * when NOT throttled, so back-to-back calls for the same key within `throttleMs` collapse. */
  function throttled(key: string): boolean {
    const t = now();
    const last = lastSentAt.get(key);
    if (last !== undefined && t - last < throttleMs) return true;
    lastSentAt.set(key, t);
    return false;
  }

  /** Fire-and-forget: returns void synchronously, never a Promise the caller could await/throw
   * on. A send failure or timeout is logged (token redacted) and goes no further — it must never
   * break or delay the recording it is reporting on. */
  function fireAndForget(key: string, text: string): void {
    if (!enabled) return;
    if (throttled(key)) {
      log(`[telegram] throttled (${key})`);
      return;
    }
    void Promise.resolve()
      .then(() => send(token as string, chatId as string, text))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[telegram] send failed: ${redact(msg, token)}`);
      });
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
