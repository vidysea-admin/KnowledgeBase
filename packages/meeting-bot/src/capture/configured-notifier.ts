/**
 * packages/meeting-bot/src/capture/configured-notifier.ts — U3: assembles a multi-channel
 * `Notifier` (notify-channels.ts) from env/settings config (`readNotifyEnvConfig`) plus the two
 * known channel implementations (telegram-channel.ts, whatsapp-channel.ts). The one place that
 * knows both "which channels exist by name" and "which config wins" — everything else (the fan-
 * out itself, each transport) stays channel-agnostic or config-agnostic respectively.
 *
 * `notifyDigest` is the single call U2's watcher runner (scripts/watch/run-watch.mjs, another
 * lane, not edited here) needs: build the "digest"-class notifier from today's env and send the
 * truncated digest to every enabled channel. Not wired into that script from this lane — see the
 * build brief — but the export is stable and ready for it to import once merged.
 */
import { createNotifier, readNotifyEnvConfig, type EventClass, type Notifier, type NotifyChannel } from "./notify-channels.js";
import { createTelegramChannel, type TelegramChannelDeps } from "./telegram-channel.js";
import { createWhatsAppChannel, type WhatsAppChannelDeps } from "./whatsapp-channel.js";

export interface ConfiguredNotifierDeps {
  env?: NodeJS.ProcessEnv;
  settingsOverride?: Partial<Record<EventClass, string[]>>;
  log?: (msg: string) => void;
  now?: () => number;
  throttleMs?: number;
  telegram?: TelegramChannelDeps;
  whatsapp?: WhatsAppChannelDeps;
}

const CHANNEL_FACTORIES: Record<string, (deps: ConfiguredNotifierDeps) => NotifyChannel | undefined> = {
  telegram: (deps) => createTelegramChannel({ log: deps.log, ...deps.telegram }),
  whatsapp: (deps) => createWhatsAppChannel({ log: deps.log, ...deps.whatsapp }),
};

/** Builds the enabled channel set for one event class from `readNotifyEnvConfig`'s resolved
 * names. An unrecognized name is logged and skipped rather than throwing — a typo in
 * NOTIFY_CHANNELS must never crash a recording, same principle as a missing credential. */
export function buildChannels(names: readonly string[], deps: ConfiguredNotifierDeps = {}): NotifyChannel[] {
  const log = deps.log ?? ((m: string) => console.log(m));
  const out: NotifyChannel[] = [];
  for (const name of names) {
    const factory = CHANNEL_FACTORIES[name];
    if (!factory) {
      log(`[notify] unknown channel '${name}' ignored`);
      continue;
    }
    const channel = factory(deps);
    if (channel) out.push(channel);
  }
  return out;
}

/** The config-driven entry point: resolves enabled channels for `eventClass` and returns the
 * fan-out `Notifier` over them. */
export function createConfiguredNotifier(eventClass: EventClass, deps: ConfiguredNotifierDeps = {}): Notifier {
  const cfg = readNotifyEnvConfig(deps.env ?? process.env, deps.settingsOverride);
  const channels = buildChannels(cfg.channelsByClass[eventClass], deps);
  return createNotifier(channels, { log: deps.log, now: deps.now, throttleMs: deps.throttleMs });
}

/** Convenience for a one-shot digest send (U2's runner): builds the "digest"-class notifier from
 * today's config and sends `markdown` (truncated per notify-channels.ts's `truncateDigest`) to
 * every enabled channel. Fire-and-forget, never throws — same guarantee every notify call in
 * this package carries. */
export function notifyDigest(markdown: string, sourcePath?: string, deps: ConfiguredNotifierDeps = {}): void {
  createConfiguredNotifier("digest", deps).notifyDigest(markdown, sourcePath);
}
