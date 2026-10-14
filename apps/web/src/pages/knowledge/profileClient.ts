import { ApiError } from "../../api/client.js";
import { listClaims, type ClaimListRow } from "../../api/claims.js";
import { getSession } from "../../api/sessions.js";
import { getGroundedContent, type GroundedContentView } from "../sessions/grounded/client.js";
import type { EvidenceRef } from "./profileModel.js";

export const QUOTE_SESSION_LIMIT = 8;
export const QUOTE_MAX_CHARS = 400;
export interface Quote { text: string; speaker: string | null; tStart: number; tEnd: number; clipped: boolean }

/** Quotes resolved from GET /sessions/:id turns. Sessions that fail stay explicit as `failed`. */
export async function loadQuotes(apiKey: string, refs: EvidenceRef[]) {
  const ids = [...new Set(refs.map(r => r.sessionId))];
  const chosen = ids.slice(0, QUOTE_SESSION_LIMIT);
  const quotes = new Map<string, Quote>(); const failed = new Set<string>();
  await Promise.all(chosen.map(async id => {
    try {
      const detail = await getSession(apiKey, id);
      if (!Array.isArray(detail.turns)) throw new ApiError(503, "Invalid session response.");
      for (const t of detail.turns) if (typeof t._id === "string" && typeof t.text === "string")
        quotes.set(`${id}\u0000${t._id}`, { text: t.text.slice(0, QUOTE_MAX_CHARS), clipped: t.text.length > QUOTE_MAX_CHARS, speaker: t.speakerLabel ?? null, tStart: t.tStart, tEnd: t.tEnd });
    } catch { failed.add(id); }
  }));
  return { quotes, failed, skippedSessions: ids.length - chosen.length, skippedIds: new Set(ids.slice(QUOTE_SESSION_LIMIT)) };
}

/** All claims in bounded pages (API caps limit at 100, offset at 10000). */
export async function loadAllClaims(apiKey: string, maxPages = 5): Promise<{ claims: ClaimListRow[]; truncated: boolean }> {
  const claims: ClaimListRow[] = []; let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const r = await listClaims(apiKey, { limit: 100, offset: page * 100 });
    claims.push(...r.claims); truncated = r.truncated;
    if (!r.truncated) break;
  }
  return { claims, truncated };
}

export const loadHighlights = (apiKey: string, sessionId: string): Promise<GroundedContentView> => getGroundedContent(apiKey, sessionId);

/**
 * TODO(API gap G2): no endpoint stores or lists curated collections. Typed stub: makes no request and
 * reports unavailability so the UI never invents saved membership. Replace with `GET /collections` when it exists.
 */
export interface CuratedCollection { id: string; title: string; sessionIds: string[] }
export function listCuratedCollections(): Promise<{ available: false; collections: CuratedCollection[] }> {
  return Promise.resolve({ available: false, collections: [] });
}
