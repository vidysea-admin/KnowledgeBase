import { apiFetch, ApiError } from "../client.js";

/** Semantic endpoint returns one winning chunk per session, not passage evidence. */
export interface SemanticResult {
  chunkId: string;
  sessionId: string;
  score: number;
  session: { _id: string; title: string; date: string } | null;
}
export interface SemanticResponse { query: string; hits: SemanticResult[] }
// The existing cosine implementation does not clamp IEEE-754 roundoff near +/-1.
const COSINE_ROUNDOFF = 1e-9;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  // Session identifiers become path components. Reject malformed UTF-16 rather than crash rendering.
  try { encodeURIComponent(value); return true; } catch { return false; }
}
function result(value: unknown): value is SemanticResult {
  if (!object(value) || !id(value.chunkId) || !id(value.sessionId) ||
      typeof value.score !== "number" || !Number.isFinite(value.score) ||
      value.score < -1 - COSINE_ROUNDOFF || value.score > 1 + COSINE_ROUNDOFF) return false;
  if (value.session === null) return true;
  return object(value.session) && value.session._id === value.sessionId &&
    typeof value.session.title === "string" && typeof value.session.date === "string";
}

export async function searchSemantic(apiKey: string | null, query: string, limit = 20): Promise<SemanticResponse> {
  const normalized = query.trim();
  if (!normalized || Array.from(normalized).length > 512) throw new ApiError(400, "Enter a query of up to 512 characters.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400, "Invalid search limit.");
  // URLSearchParams handles Unicode (including isolated surrogates) without throwing.
  const params = new URLSearchParams({ q: normalized, k: String(limit) });
  const wireQuery = params.get("q");
  const response = await apiFetch<unknown>(`/search/semantic?${params.toString()}`, apiKey);
  if (!object(response) || response.query !== wireQuery || !Array.isArray(response.hits) ||
      response.hits.length > limit || !response.hits.every(result) ||
      new Set(response.hits.map(hit => hit.sessionId)).size !== response.hits.length ||
      new Set(response.hits.map(hit => hit.chunkId)).size !== response.hits.length) {
    throw new ApiError(503, "Semantic search results could not be read.");
  }
  return response as unknown as SemanticResponse;
}
