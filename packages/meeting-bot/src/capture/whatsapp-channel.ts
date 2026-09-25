/**
 * packages/meeting-bot/src/capture/whatsapp-channel.ts — U3: config-gated WhatsApp stub.
 *
 * No WhatsApp provider is wired yet (plan §U3: "whatsapp (stub, config-gated, wired later)").
 * "Config-gated" is the opt-in itself — this channel only exists in a notifier's channel set
 * when something explicitly asks for "whatsapp" (NOTIFY_CHANNELS=telegram,whatsapp, or a future
 * settings override — see notify-channels.ts's header). Once asked for, `send` always logs the
 * one clear "not configured" line and resolves without sending anything — it never throws, so it
 * can never be the channel that breaks fan-out isolation.
 *
 * Seam for the real provider: replace this file's `send` body with a real WhatsApp client call
 * (e.g. the WhatsApp Cloud API) once one is chosen. Nothing else changes — `NotifyChannel`'s
 * `{ name, send(text) }` shape is the only contract any caller (notify-channels.ts's fan-out,
 * telegram-alerts.ts, U2's future digest caller) depends on.
 */
import type { NotifyChannel } from "./notify-channels.js";

export interface WhatsAppChannelDeps {
  log?: (msg: string) => void;
}

export function createWhatsAppChannel(deps: WhatsAppChannelDeps = {}): NotifyChannel {
  const log = deps.log ?? ((m: string) => console.log(m));
  return {
    name: "whatsapp",
    async send(_text: string): Promise<void> {
      log("[whatsapp] channel not configured — message not sent");
    },
  };
}
