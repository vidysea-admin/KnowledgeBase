import { apiFetch, ApiError } from "../client.js";

/** Session mode preserves the original dedupe; chunk mode requires source-resolved evidence. */
export interface SemanticResult {
  chunkId: string;
  sessionId: string;
  score: number;
  session: { _id: string; title: string; date: string } | null;
  turnIds?: string[];
  tStart?: number;
  tEnd?: number;
  sourceSpans?: { turnId: string; charStart: number; charEnd: number }[];
  rawTextSha256?: string;
  quote?: { turnId: string; charStart: number; charEnd: number; text: string;
    speakerRef: string; speakerLabel?: string; occurredAt?: string; tStart: number; tEnd: number };
}
export interface SemanticResponse { query: string; mode?: "chunks"; hits: SemanticResult[] }
export interface SemanticIndexReadiness {
  status: "ready" | "empty" | "reindex-required";
  total: number; bound: number; legacy: number; stale: number;
  invalidVectors: number; invalidModels: number; modelCount: number; dimensionCount: number;
  uncoveredTurns: number; pendingGaps: number;
  queryModelCompatibility: "checked-on-search";
}
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
function evidence(value: Record<string, unknown>): boolean {
  const quote = value.quote;
  if (!Array.isArray(value.turnIds) || value.turnIds.length === 0 || !value.turnIds.every(id) ||
      new Set(value.turnIds).size !== value.turnIds.length || !object(quote) ||
      !id(quote.turnId) || !value.turnIds.includes(quote.turnId) || !id(quote.speakerRef) ||
      (quote.speakerLabel !== undefined && typeof quote.speakerLabel !== "string") ||
      (quote.occurredAt !== undefined && (typeof quote.occurredAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(quote.occurredAt) || !Number.isFinite(Date.parse(quote.occurredAt)))) ||
      !Number.isInteger(quote.charStart) || !Number.isInteger(quote.charEnd) ||
      (quote.charStart as number) < 0 || (quote.charEnd as number) <= (quote.charStart as number) ||
      !id(quote.text) ||
      quote.text.length !== (quote.charEnd as number) - (quote.charStart as number)) return false;
  const times = [value.tStart, value.tEnd, quote.tStart, quote.tEnd];
  if (value.sourceSpans !== undefined && (!Array.isArray(value.sourceSpans) || !value.sourceSpans.length ||
      typeof value.rawTextSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.rawTextSha256) ||
      !value.sourceSpans.every(span => object(span) && id(span.turnId) && (value.turnIds as unknown[]).includes(span.turnId) &&
        Number.isInteger(span.charStart) && Number.isInteger(span.charEnd) &&
        (span.charStart as number) >= 0 && (span.charEnd as number) > (span.charStart as number)) ||
      !value.sourceSpans.some(span => span.turnId === quote.turnId && (span.charStart as number) <= (quote.charStart as number) && (span.charEnd as number) >= (quote.charEnd as number)))) return false;
  return times.every(t => typeof t === "number" && Number.isFinite(t) && t >= 0) &&
    (value.tStart as number) <= (quote.tStart as number) && (quote.tStart as number) <= (quote.tEnd as number) &&
    (quote.tEnd as number) <= (value.tEnd as number);
}
function result(value: unknown, requireEvidence: boolean): value is SemanticResult {
  if (!object(value) || !id(value.chunkId) || !id(value.sessionId) ||
      typeof value.score !== "number" || !Number.isFinite(value.score) ||
      value.score < -1 - COSINE_ROUNDOFF || value.score > 1 + COSINE_ROUNDOFF) return false;
  if (requireEvidence && !evidence(value)) return false;
  if (value.session === null) return !requireEvidence;
  return object(value.session) && value.session._id === value.sessionId &&
    typeof value.session.title === "string" && typeof value.session.date === "string";
}

export async function searchSemantic(apiKey: string | null, query: string, limit = 20,
  mode: "sessions" | "chunks" = "sessions"): Promise<SemanticResponse> {
  const normalized = query.trim();
  if (!normalized || Array.from(normalized).length > 512) throw new ApiError(400, "Enter a query of up to 512 characters.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400, "Invalid search limit.");
  // URLSearchParams handles Unicode (including isolated surrogates) without throwing.
  const params = new URLSearchParams({ q: normalized, k: String(limit) });
  if (mode === "chunks") params.set("mode", mode);
  const wireQuery = params.get("q");
  const response = await apiFetch<unknown>(`/search/semantic?${params.toString()}`, apiKey);
  if (!object(response) || response.query !== wireQuery || !Array.isArray(response.hits) ||
      (mode === "chunks" && response.mode !== "chunks") ||
      response.hits.length > limit || !response.hits.every(hit => result(hit, mode === "chunks")) ||
      (mode === "sessions" && new Set(response.hits.map(hit => hit.sessionId)).size !== response.hits.length) ||
      new Set(response.hits.map(hit => hit.chunkId)).size !== response.hits.length) {
    throw new ApiError(503, "Semantic search results could not be read.");
  }
  return response as unknown as SemanticResponse;
}

/** Explicit read-only readiness request; no query and no embedding call. */
export async function inspectSemanticIndex(apiKey: string | null): Promise<SemanticIndexReadiness> {
  const value = await apiFetch<unknown>("/search/semantic/readiness", apiKey);
  const names = ["total", "bound", "legacy", "stale", "invalidVectors", "invalidModels", "modelCount", "dimensionCount", "uncoveredTurns", "pendingGaps"];
  if (!object(value) || !names.every(name => Number.isSafeInteger(value[name]) && (value[name] as number) >= 0) ||
      value.queryModelCompatibility !== "checked-on-search" ||
      !["ready", "empty", "reindex-required"].includes(String(value.status)))
    throw new ApiError(503, "Semantic index readiness could not be read.");
  const result = value as unknown as SemanticIndexReadiness;
  const ready = result.total > 0 && result.bound === result.total && result.modelCount === 1 && result.dimensionCount === 1 &&
    result.uncoveredTurns === 0 && result.pendingGaps === 0;
  const empty = result.total === 0 && result.uncoveredTurns === 0 && result.pendingGaps === 0;
  if (result.total !== result.bound + result.legacy + result.stale + result.invalidVectors + result.invalidModels ||
      result.modelCount > result.total || result.dimensionCount > result.total ||
      result.status !== (empty ? "empty" : ready ? "ready" : "reindex-required"))
    throw new ApiError(503, "Semantic index readiness could not be read.");
  return result;
}
