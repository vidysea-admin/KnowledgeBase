/**
 * packages/meeting-bot/src/capture/telegram-channel.ts — U3: the ONE Telegram transport
 * (`node:https` POST to api.telegram.org). Moved out of telegram-alerts.ts verbatim (same
 * request shape, same timeout, same drain-the-response-body behaviour) so there is exactly one
 * Telegram client in this package — telegram-alerts.ts's `createTelegramNotifier` and
 * notify-channels.ts's multi-channel `createNotifier` both build on this file, neither
 * reimplements it.
 */
import https from "node:https";

import type { NotifyChannel } from "./notify-channels.js";

const SEND_TIMEOUT_MS = 8_000;

export interface TelegramChannelDeps {
  /** Defaults to process.env.TELEGRAM_BOT_TOKEN. */
  token?: string;
  /** Defaults to process.env.TELEGRAM_CHAT_ID. */
  chatId?: string;
  /** Injectable transport — tests supply a fake here. NEVER call the real API from a test (a
   * live send is an outward-facing action that gates to the human). */
  send?: (token: string, chatId: string, text: string) => Promise<void>;
  log?: (msg: string) => void;
}

/** Replaces every occurrence of `token` in `s` — the one thing standing between a thrown network
 * error and a token landing in a log line (T-030's own C6 token-redaction guarantee, extended
 * here to be the channel's own responsibility — see notify-channels.ts's header). */
function redact(s: string, token: string | undefined): string {
  if (!token) return s;
  return s.split(token).join("[REDACTED]");
}

/** Real transport: POST to api.telegram.org. Never imported directly by tests — always reached
 * through the injectable `send` dep, which tests replace with a fake. */
export function defaultTelegramSend(token: string, chatId: string, text: string): Promise<void> {
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

/**
 * Builds the Telegram `NotifyChannel`, or `undefined` when TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID
 * are missing — logged as ONE clear line, never a crash (same contract as every other channel
 * and as T-030's original `enabled` gate). Reads env once, at construction — a `.env` load that
 * happens after this call is NOT picked up, matching how record-commands.ts already loads `.env`
 * before constructing anything that reads a credential (OBS_WS_PASSWORD, this).
 */
export function createTelegramChannel(deps: TelegramChannelDeps = {}): NotifyChannel | undefined {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = deps.chatId ?? process.env.TELEGRAM_CHAT_ID;
  const log = deps.log ?? ((m: string) => console.log(m));
  const send = deps.send ?? defaultTelegramSend;

  if (!token || !chatId) {
    log("[telegram] alerts disabled — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set");
    return undefined;
  }

  return {
    name: "telegram",
    async send(text: string): Promise<void> {
      try {
        await send(token, chatId, text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Redact BEFORE it ever leaves this channel — notify-channels.ts's fan-out logs
        // whatever error reaches it verbatim, trusting each channel to have already scrubbed
        // its own secret (see that file's header).
        throw new Error(redact(msg, token));
      }
    },
  };
}

/** Serialized delivery queue extracted from the operational runner; no additional transport. */
export function createOperationNotifications(deps: {
  state: Record<string, any>; save: () => void; log: (message: string) => void; now: () => string;
  notifyOperation?: (notice: {feed?: string; sessionId?: string; status: string; reason?: string}) => Promise<string>;
}): {enqueue: (id: string, feed?: boolean) => void; wait: () => Promise<void>} {
  const {state, save, log, now, notifyOperation} = deps;
  let notifications = Promise.resolve();
  const enqueue = (id: string, feed = false) => {
    const collection = feed ? state.discovery : state.operations, row = collection[id];
    if (!feed && !['failed', 'action_required', 'ready'].includes(row.status)) return;
    const knownReasons = ['retry-limit', 'interrupted-no-recording-artifact', 'missed-while-processing', 'missed-coverage',
      'cancelled', 'overlap-lost', 'needs-registration', 'needs-review', 'invalid-time', 'unsafe-join-link'];
    const reason = feed || row.status === 'ready' ? '' : knownReasons.includes(row.reason) ? row.reason : 'pipeline-failed';
    const fingerprint = `${row.status}:${reason}`, notice = feed ? {feed: id, status: row.status} : {sessionId: id, status: row.status, reason};
    notifications = notifications.then(async () => {
      if (collection[id].notification?.acknowledged === fingerprint) return;
      let delivery = 'disabled', timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (notifyOperation) {
          delivery = await Promise.race([
            Promise.resolve().then(() => notifyOperation(notice)),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Alert deadline exceeded')), 9000); }),
          ]);
          if (!['sent', 'disabled'].includes(delivery)) throw new Error('Invalid alert result');
        }
      } catch { delivery = 'failed'; log(`${id}: notification failed; operation status retained`); }
      finally { clearTimeout(timer); }
      const previous = collection[id].notification;
      collection[id] = {...collection[id], notification: {
        acknowledged: delivery === 'sent' ? fingerprint : previous?.acknowledged,
        fingerprint, status: delivery, retryable: delivery === 'failed', updatedAt: now(),
      }};
      save();
    }).catch(() => { log(`${id}: notification metadata unavailable; operation status retained`); });
  };
  return {enqueue, wait: () => notifications};
}
