import { apiFetch, ApiError } from "../client.js";
import type { SessionSummary, Turn } from "../types.js";

export interface TranscriptSearchHit {
  turnId: string;
  sessionId: string;
  score: number;
  turn: Turn | null;
  session: SessionSummary | null;
}
export interface TranscriptSearchResponse { query: string; hits: TranscriptSearchHit[] }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function hit(value: unknown): value is TranscriptSearchHit {
  if (!object(value) || !id(value.turnId) || !id(value.sessionId) || !finite(value.score) || value.score < 0) return false;
  if (value.turn !== null) {
    const turn = value.turn;
    if (!object(turn) || turn._id !== value.turnId || turn.sessionId !== value.sessionId ||
        typeof turn.text !== "string" || !id(turn.speakerRef) || !finite(turn.tStart) || !finite(turn.tEnd) ||
        turn.tStart < 0 || turn.tEnd < turn.tStart ||
        turn.speakerLabel !== undefined && typeof turn.speakerLabel !== "string") return false;
  }
  if (value.session !== null) {
    const session = value.session;
    if (!object(session) || session._id !== value.sessionId || typeof session.title !== "string" ||
        typeof session.date !== "string" || !object(session.status) ||
        typeof session.status.transcribe !== "string" || typeof session.status.index !== "string") return false;
  }
  // The server owns authenticated tenant filtering; refuse inconsistent joined evidence.
  if (object(value.turn) && object(value.session) && value.turn.tenantId !== undefined &&
      value.session.tenantId !== undefined && value.turn.tenantId !== value.session.tenantId) return false;
  return true;
}

/** Existing lexical GET /search only; no model calls or client-provided tenant selector. */
export async function searchTranscripts(apiKey: string | null, query: string, limit = 20): Promise<TranscriptSearchResponse> {
  const normalized = query.trim();
  if (!normalized) throw new ApiError(400, "Enter a search query.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400, "Invalid search limit.");
  const response = await apiFetch<unknown>(`/search?q=${encodeURIComponent(normalized)}&k=${limit}`, apiKey);
  if (!object(response) || response.query !== normalized || !Array.isArray(response.hits) ||
      response.hits.length > limit || !response.hits.every(hit) ||
      new Set(response.hits.map((value) => value.turnId)).size !== response.hits.length) {
    throw new ApiError(503, "Search results could not be read. Try again.");
  }
  return response as unknown as TranscriptSearchResponse;
}
