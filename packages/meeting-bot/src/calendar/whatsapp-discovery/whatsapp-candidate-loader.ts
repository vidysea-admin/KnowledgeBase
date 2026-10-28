/**
 * whatsapp-candidate-loader.ts (w27-walinks). Maps WhatsApp link candidates to the scheduler's candidate input.
 * Flag-gated by LKB_WA_DISCOVERY=1 (default OFF). The real message fetcher is NOT part of this unit: it arrives with the
 * owner decision on the new read path. D-178 ruling 1: `senderAuthenticated: undefined` = unknown = needs approval; only the
 * owner's approval (status -> approved) promotes a row. Only allow-listed groups whose consent is not `false` are read at all.
 */
import type { AutoRecordCandidateInput } from "../auto-join.js";
import { extractWhatsappLinks, hashId, type WaLinkCandidate } from "./whatsapp-link-extractor.js";

export interface WaRawMessage { text: string; ts: string | number; groupId: string; messageId?: string }
export type WhatsappCandidateInput = AutoRecordCandidateInput & { source: "whatsapp" };

export interface WhatsappLoaderDeps {
  /** Injected. The real fetcher comes with the decision; absent = no messages. */
  fetchMessages: () => Promise<WaRawMessage[]>;
  /** WA_DISCOVERY_GROUPS: raw group ids that may be read. Empty = nothing is fetched. */
  allowedGroups: readonly string[];
  /** Per-group consent; `false` refuses, anything else (true/unknown) passes the allow-list. */
  consentFor?: (groupId: string) => boolean | undefined;
  /** Optional start/end source (a link in chat carries no time). Absent = candidate has no window and is never scheduled. */
  windowFor?: (c: WaLinkCandidate) => { startTime: string; endTime: string } | undefined;
}

export function parseWaDiscoveryGroups(raw: string | undefined): string[] {
  return (raw ?? "").split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
}

export function toCandidateInput(c: WaLinkCandidate, windowFor?: WhatsappLoaderDeps["windowFor"]): WhatsappCandidateInput {
  const win = windowFor?.(c);
  return {
    source: "whatsapp", id: `wa-${c.messageIdHash}`, title: "WhatsApp-shared meeting link",
    senderEmail: "", senderDomain: "", senderAuthenticated: undefined, status: "pending",
    receivedAt: c.ts, meetingUrl: c.url, kind: "upcoming", registrationOnly: c.needsRegistration || undefined,
    ...(win ?? {}),
  };
}

export function createWhatsappCandidateLoader(deps: WhatsappLoaderDeps): () => Promise<WhatsappCandidateInput[]> {
  const allowed = new Set(deps.allowedGroups.filter(g => g.length > 0));
  return async () => {
    if (allowed.size === 0) return [];
    const out: WhatsappCandidateInput[] = [], messages = await deps.fetchMessages();
    for (const m of messages) {
      if (!allowed.has(m.groupId)) continue;
      if (deps.consentFor?.(m.groupId) === false) continue;
      for (const c of extractWhatsappLinks({ text: m.text, ts: m.ts, groupId: m.groupId, messageId: m.messageId })) out.push(toCandidateInput(c, deps.windowFor));
    }
    return out;
  };
}

/** Production wiring. Returns undefined unless LKB_WA_DISCOVERY=1, so the tick sees no difference with the flag off. */
export function createWhatsappLoaderFromEnv(env: NodeJS.ProcessEnv, log: (msg: string) => void,
  fetchMessages: () => Promise<WaRawMessage[]> = async () => []): (() => Promise<WhatsappCandidateInput[]>) | undefined {
  if (env.LKB_WA_DISCOVERY !== "1") return undefined;
  const allowedGroups = parseWaDiscoveryGroups(env.WA_DISCOVERY_GROUPS);
  const consentOff = new Set(parseWaDiscoveryGroups(env.WA_DISCOVERY_CONSENT_FALSE));
  log(`wa-discovery: enabled for ${allowedGroups.length} allow-listed group(s) [${allowedGroups.map(hashId).join(",")}]`);
  return createWhatsappCandidateLoader({ fetchMessages, allowedGroups, consentFor: g => (consentOff.has(g) ? false : undefined) });
}
