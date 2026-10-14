/**
 * scripts/watch/bot-events-host.ts - the host-side reader behind GET /bot-events: the schedule tick's bot-events.jsonl feed
 * (packages/meeting-bot/src/autojoin/bot-events.ts) in the same state directory the join-rules host already owns.
 * Wired in scripts/webinar/join-rules-api-host.ts; tenant filtering happens in the reader, never in the caller.
 */
import { readBotEvents } from "../../packages/meeting-bot/src/autojoin/bot-events.js";
import type { BotEventsDeps } from "../../apps/api/src/bot-events/router.js";

export function createBotEventsDeps(opts: { stateDir: string; read?: typeof readBotEvents }): BotEventsDeps {
  const read = opts.read ?? readBotEvents;
  return { list: (tenantId, limit) => read(opts.stateDir, tenantId, limit) };
}
