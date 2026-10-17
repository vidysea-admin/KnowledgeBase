import { apiFetch, ApiError } from "../client.js";

/** One suggested speaker name (U2.4, D-141). A suggestion is NOT a final name until `status` is "confirmed". */
export interface SpeakerSuggestion {
  id: string; sessionId: string; speakerRef: string; suggestedName: string;
  status: "suggested" | "confirmed";
  quotes: { turnId: string; quote: string; kind: string }[];
  finalProvenance?: "human-confirmed";
}

function object(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function str(v: unknown): v is string { return typeof v === "string" && v.length > 0; }
function parseOne(v: unknown): SpeakerSuggestion {
  if (!object(v) || !str(v.id) || !str(v.sessionId) || !str(v.speakerRef) || !str(v.suggestedName) || (v.status !== "suggested" && v.status !== "confirmed") ||
    !Array.isArray(v.quotes) || !v.quotes.every((q) => object(q) && str(q.turnId) && str(q.quote) && str(q.kind)) ||
    (v.status === "confirmed") !== (v.finalProvenance === "human-confirmed")) throw new ApiError(503, "Invalid speaker suggestion response.");
  return { id: v.id, sessionId: v.sessionId, speakerRef: v.speakerRef, suggestedName: v.suggestedName, status: v.status,
    quotes: (v.quotes as { turnId: string; quote: string; kind: string }[]).map((q) => ({ turnId: q.turnId, quote: q.quote, kind: q.kind })),
    ...(v.finalProvenance === "human-confirmed" ? { finalProvenance: "human-confirmed" as const } : {}) };
}
const base = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}/speaker-suggestions`;

/** GET /sessions/:id/speaker-suggestions (scope `sessions`): this tenant's pending and confirmed suggestions. Strictly validated. */
export async function listSpeakerSuggestions(apiKey: string | null, sessionId: string): Promise<SpeakerSuggestion[]> {
  const r = await apiFetch<unknown>(base(sessionId), apiKey);
  if (!object(r) || !Array.isArray(r.suggestions)) throw new ApiError(503, "Invalid speaker suggestion response.");
  return r.suggestions.map(parseOne);
}

/** POST .../:id/confirm or /reject. Idempotent on the server. Resolves to the state the server reports; anything else is an error. */
export async function decideSpeakerSuggestion(apiKey: string | null, sessionId: string, id: string, action: "confirm" | "reject"): Promise<"confirmed" | "rejected"> {
  const r = await apiFetch<unknown>(`${base(sessionId)}/${encodeURIComponent(id)}/${action}`, apiKey, { method: "POST" });
  const want = action === "confirm" ? "confirmed" : "rejected";
  if (!object(r) || !object(r.suggestion) || r.suggestion.id !== id || r.suggestion.status !== want ||
    (action === "confirm" && r.suggestion.finalProvenance !== "human-confirmed")) throw new ApiError(503, "Invalid speaker suggestion response.");
  return want;
}
