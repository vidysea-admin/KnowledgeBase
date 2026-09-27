/**
 * packages/meeting-bot/src/capture/notify-channels.ts — U3 (docs/meeting-bot-roadmap.md, plan
 * §U3): generic multi-channel notification primitives that telegram-alerts.ts's
 * `createTelegramNotifier` (T-030) is now built on top of, plus the new digest path U2's watcher
 * runner will call.
 *
 * Design:
 *  - `NotifyChannel` is the one seam a transport implements: a `name` (used in log lines) and a
 *    `send(text)` that resolves/rejects. telegram-channel.ts and whatsapp-channel.ts are the two
 *    implementations today.
 *  - `createNotifier(channels, deps)` fans a single logical send out to every channel it was
 *    given. One channel's rejection is caught and logged in isolation — it can never block or
 *    fail another channel's send, or the caller (same fire-and-forget, never-throws guarantee
 *    T-030 shipped for the single-channel case).
 *  - Throttling is per `key` (e.g. "joined", "digest") across the WHOLE send call, not per
 *    channel — a throttled key skips every channel this call, matching T-030's existing
 *    behaviour when there is exactly one channel.
 *  - U4a's two new bot-status alerts (telegram-alerts.ts's `notifyPollFailed` / `pollFailed:*`
 *    keys, `notifyUpcomingRecording` / `upcoming:*` keys) route through this exact `send()` —
 *    no change was needed here for them. R1's real dedup ("one alert, then silence until it
 *    changes state") is state-based, not time-based, so it is NOT this file's per-key time
 *    throttle alone — the caller (run-watch.mjs) only invokes `notifyPollFailed` on a genuine
 *    transition into `status: "failed"`; this module's throttle is just the same defensive
 *    backstop every other alert kind already gets.
 *  - Per-channel secrets are NEVER this module's problem: each channel implementation is
 *    responsible for redacting its own secret out of any error it throws (telegram-channel.ts
 *    does this) before this module's catch handler logs it. That keeps this file channel-
 *    agnostic — it never needs to know what a channel's secret even is.
 *  - Config precedence (`readNotifyEnvConfig`): an explicit `settingsOverride` argument (the
 *    seam a future dashboard-backed settings read would fill — see the note below) wins over a
 *    per-event-class env var (`NOTIFY_CHANNELS_DIGEST` / `NOTIFY_CHANNELS_BOT_STATUS`), which
 *    wins over the blanket `NOTIFY_CHANNELS`, which wins over the hard default (`["telegram"]`,
 *    T-030's original single-channel behaviour).
 *  - No web-settings-backed override is wired today: `qa/contracts/web-settings-keys.md` (T-010)
 *    only covers self-serve API-KEY management (`apps/api/src/routes/keys.ts` — list/create/
 *    revoke, masked, tenant-scoped); there is no generic settings key/value store in this repo
 *    yet for U4's dashboard to write NOTIFY_CHANNELS into. `settingsOverride` is the seam U4
 *    fills once that store exists — `createConfiguredNotifier`/`readNotifyEnvConfig` already
 *    accept it and prefer it over env, so no caller changes when that day comes.
 */
export interface NotifyChannel {
  readonly name: string;
  send(text: string): Promise<void>;
}

export interface NotifierDeps {
  log?: (msg: string) => void;
  now?: () => number;
  throttleMs?: number;
}

export interface Notifier {
  readonly channels: readonly NotifyChannel[];
  /** Fire-and-forget: returns void synchronously, never throws, never returns a Promise the
   * caller could await. Sends `text` to every channel; throttled per `key`. */
  send(key: string, text: string): void;
  /** Turns a watcher digest into a short message (`truncateDigest`) and sends it under the
   * "digest" throttle key — kept separate from any bot-status key so a digest send can never be
   * collapsed by, or collapse, an unrelated alert. */
  notifyDigest(markdown: string, sourcePath?: string): void;
}

const DEFAULT_THROTTLE_MS = 60_000;
/** Telegram's own practical message-length comfort zone (well under its ~4096-char hard limit,
 * leaving room for the truncation suffix). Applied to every channel for now — a per-channel
 * limit is a real future need (WhatsApp's real limit will differ) but out of scope until a real
 * WhatsApp transport exists to measure against. */
export const DIGEST_MAX_CHARS = 3500;

/** Builds the fan-out notifier. `channels` may be empty (every configured channel disabled/
 * unconfigured) — `send` is then a no-op, matching T-030's `enabled: false` behaviour. */
export function createNotifier(channels: readonly NotifyChannel[], deps: NotifierDeps = {}): Notifier {
  const log = deps.log ?? ((m: string) => console.log(m));
  const now = deps.now ?? (() => Date.now());
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const lastSentAt = new Map<string, number>();

  function throttled(key: string): boolean {
    const t = now();
    const last = lastSentAt.get(key);
    if (last !== undefined && t - last < throttleMs) return true;
    lastSentAt.set(key, t);
    return false;
  }

  function send(key: string, text: string): void {
    if (channels.length === 0) return;
    if (throttled(key)) {
      log(`[notify] throttled (${key})`);
      return;
    }
    for (const channel of channels) {
      void Promise.resolve()
        .then(() => channel.send(text))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          // Channels are trusted to have already redacted their own secrets out of `msg` — see
          // this file's header. Nothing channel-specific happens here on purpose.
          log(`[${channel.name}] send failed: ${msg}`);
        });
    }
  }

  return {
    channels,
    send,
    notifyDigest(markdown, sourcePath) {
      send("digest", truncateDigest(markdown, sourcePath));
    },
  };
}

/** Truncates `markdown` to `maxChars`, replacing the cut tail with a pointer to the full digest
 * file when `sourcePath` is given. A no-op when `markdown` already fits. */
export function truncateDigest(markdown: string, sourcePath?: string, maxChars = DIGEST_MAX_CHARS): string {
  if (markdown.length <= maxChars) return markdown;
  const suffix = sourcePath ? `\n… full digest: ${sourcePath}` : "\n… (truncated)";
  const budget = Math.max(0, maxChars - suffix.length);
  return markdown.slice(0, budget) + suffix;
}

/** Event classes a channel-set can be configured per (plan §U3: "digest" and "bot-status" named
 * explicitly). A string union, not an enum, so a future class needs no schema/type migration. */
export type EventClass = "digest" | "bot-status";

export interface NotifyEnvConfig {
  channelsByClass: Record<EventClass, string[]>;
}

/** T-030's original behaviour: exactly one channel, Telegram. Kept as the floor so an unset
 * NOTIFY_CHANNELS changes nothing for anyone who never opts in. */
const DEFAULT_CHANNELS: readonly string[] = ["telegram"];

function parseList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  const items = v.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Reads which channel names are enabled per event class. Precedence per class, highest first:
 * `settingsOverride[class]` -> `NOTIFY_CHANNELS_<CLASS>` -> `NOTIFY_CHANNELS` -> `["telegram"]`.
 * `settingsOverride` is today always undefined in production (see this file's header) — the
 * param exists so U4's dashboard-settings read has a slot to fill without a signature change.
 */
export function readNotifyEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
  settingsOverride?: Partial<Record<EventClass, string[]>>,
): NotifyEnvConfig {
  const base = parseList(env.NOTIFY_CHANNELS) ?? [...DEFAULT_CHANNELS];
  const envDigest = parseList(env.NOTIFY_CHANNELS_DIGEST) ?? base;
  const envBotStatus = parseList(env.NOTIFY_CHANNELS_BOT_STATUS) ?? base;
  return {
    channelsByClass: {
      digest: settingsOverride?.digest ?? envDigest,
      "bot-status": settingsOverride?.["bot-status"] ?? envBotStatus,
    },
  };
}
