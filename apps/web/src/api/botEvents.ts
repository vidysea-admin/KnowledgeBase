import { apiFetch } from "./client.js";

/** GET /bot-events (scope `jobs`): the bot's recent will-join / recording / stopped-early / failed / done events. Tenant comes from the key. */
export interface BotEventRow {
  id: string; at: string; kind: string; sessionKey: string; title: string; startTime?: string; endTime?: string;
  careerGuidance?: boolean; testData?: boolean; matchedKeywords?: string[]; detail?: string; outputPath?: string;
}
export function listBotEvents(apiKey: string | null): Promise<{ events: BotEventRow[] }> {
  return apiFetch("/bot-events?limit=20", apiKey);
}
