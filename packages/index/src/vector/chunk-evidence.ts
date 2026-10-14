/**
 * packages/index/src/vector/chunk-evidence.ts — T-008 chunk-level semantic results with evidence.
 *
 * `rankSessionsByCosine` answers "which session"; this answers "which chunk, which turn(s), what
 * time, and which exact words" — one result PER CHUNK, never session-deduped, so a citing UI can
 * point at the passage. PURE, no I/O (contract vector-retrieval C9): the caller loads turns.
 *
 * REFUSES LOUDLY: a chunk with no/malformed turnRefs, a turn that is missing, belongs to another
 * session or tenant, has non-finite or inverted times, or empty text, or a quote that is not
 * byte-for-byte a slice of its turn, throws. A result without verifiable evidence is never
 * returned, because an unverifiable citation looks exactly like a verified one.
 */
import { cosineSimilarity } from "./cosine.js";

export interface EvidenceChunk {
  _id: string;
  sourceRef: string;
  turnRefs: string[];
  vector?: number[];
  chunkIndex?: number;
  tenantId?: string;
}

export interface EvidenceTurn {
  _id: string;
  sessionId: string;
  tStart: number;
  tEnd: number;
  text: string;
  tenantId?: string;
}

/** A verbatim span of one turn: `turn.text.slice(charStart, charEnd) === text`. */
export interface QuoteSpan {
  turnId: string;
  charStart: number;
  charEnd: number;
  text: string;
}

export interface ChunkEvidenceResult {
  chunkId: string;
  sessionId: string;
  chunkIndex: number | null;
  turnIds: string[];
  /** min tStart / max tEnd over the chunk's turns, seconds relative to session start. */
  tStart: number;
  tEnd: number;
  quote: QuoteSpan;
  score: number;
}

export interface EvidenceOptions {
  /** Query text, used only to choose which sentence of the chunk to quote. */
  queryText?: string;
  /** When set, chunk AND turns must carry exactly this tenantId. */
  tenantId?: string;
}

const MAX_QUOTE_CHARS = 300;

function refuse(msg: string): never {
  throw new Error(`chunk-evidence: ${msg}`);
}

/** Provenance check: the quote must be a verbatim slice of the referenced turn text. */
export function verifyQuoteSpan(quote: QuoteSpan, turn: EvidenceTurn): void {
  if (!quote || quote.turnId !== turn._id) refuse(`quote references turn ${quote?.turnId} but was checked against ${turn._id}`);
  if (!Number.isInteger(quote.charStart) || !Number.isInteger(quote.charEnd) || quote.charStart < 0 ||
      quote.charEnd <= quote.charStart || quote.charEnd > turn.text.length) {
    refuse(`quote offsets [${quote.charStart},${quote.charEnd}) invalid for turn ${turn._id}`);
  }
  if (typeof quote.text !== "string" || quote.text.trim() === "" || turn.text.slice(quote.charStart, quote.charEnd) !== quote.text) {
    refuse(`quote is not verbatim text of turn ${turn._id}`);
  }
}

const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** Sentence-ish spans with offsets into `text`, whitespace trimmed, long spans capped. */
function spansOf(text: string): Array<{ s: number; e: number }> {
  const out: Array<{ s: number; e: number }> = [];
  for (const m of text.matchAll(/[^.!?\n]+[.!?]*/g)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!body) continue;
    const s = (m.index ?? 0) + lead;
    out.push({ s, e: Math.min(s + body.length, s + MAX_QUOTE_CHARS) });
  }
  return out;
}

/** Deterministic: best query-word overlap, ties to earliest; no overlap -> first span of first turn. */
export function selectQuote(turns: EvidenceTurn[], queryText?: string): QuoteSpan {
  const q = words(queryText ?? "");
  let best: { quote: QuoteSpan; hits: number } | null = null;
  for (const turn of turns) {
    for (const { s, e } of spansOf(turn.text)) {
      const text = turn.text.slice(s, e);
      let hits = 0;
      for (const w of words(text)) if (q.has(w)) hits++;
      if (!best || hits > best.hits) best = { quote: { turnId: turn._id, charStart: s, charEnd: e, text }, hits };
    }
  }
  if (!best) refuse("no quotable text in the chunk's turns");
  return best.quote;
}

/** Validates the chunk/turn evidence and builds one result. Throws on any malformed input. */
export function attachEvidence(
  chunk: EvidenceChunk,
  score: number,
  turnsById: ReadonlyMap<string, EvidenceTurn>,
  options: EvidenceOptions = {},
): ChunkEvidenceResult {
  if (!chunk || typeof chunk._id !== "string" || !chunk._id) refuse("chunk has no _id");
  if (typeof chunk.sourceRef !== "string" || !chunk.sourceRef) refuse(`chunk ${chunk._id} has no sourceRef`);
  if (!Array.isArray(chunk.turnRefs) || chunk.turnRefs.length === 0 ||
      chunk.turnRefs.some((t) => typeof t !== "string" || !t) || new Set(chunk.turnRefs).size !== chunk.turnRefs.length) {
    refuse(`chunk ${chunk._id} has missing or malformed turnRefs`);
  }
  if (typeof score !== "number" || !Number.isFinite(score)) refuse(`chunk ${chunk._id} has a non-finite score`);
  if (options.tenantId !== undefined && chunk.tenantId !== options.tenantId) refuse(`chunk ${chunk._id} tenant mismatch`);
  const turns: EvidenceTurn[] = [];
  for (const id of chunk.turnRefs) {
    const t = turnsById.get(id);
    if (!t) refuse(`chunk ${chunk._id} references missing turn ${id}`);
    if (t.sessionId !== chunk.sourceRef) refuse(`turn ${id} belongs to session ${t.sessionId}, chunk ${chunk._id} to ${chunk.sourceRef}`);
    if (options.tenantId !== undefined && t.tenantId !== options.tenantId) refuse(`turn ${id} tenant mismatch`);
    if (!Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart) {
      refuse(`turn ${id} has invalid time ${t.tStart}..${t.tEnd}`);
    }
    if (typeof t.text !== "string" || t.text.trim() === "") refuse(`turn ${id} has empty text`);
    turns.push(t);
  }
  const quote = selectQuote(turns, options.queryText);
  verifyQuoteSpan(quote, turns.find((t) => t._id === quote.turnId)!);
  return {
    chunkId: chunk._id,
    sessionId: chunk.sourceRef,
    chunkIndex: Number.isInteger(chunk.chunkIndex) ? chunk.chunkIndex! : null,
    turnIds: [...chunk.turnRefs],
    tStart: Math.min(...turns.map((t) => t.tStart)),
    tEnd: Math.max(...turns.map((t) => t.tEnd)),
    quote,
    score,
  };
}

/**
 * Exact cosine over chunks, top k CHUNKS (not deduped), each with verified evidence.
 * Dimension mismatch / missing vector throws unless `skipMismatched` (same default as rankByCosine).
 * Ties break on chunkId for determinism (contract C3).
 */
export function rankChunksWithEvidence(
  queryVector: number[],
  chunks: EvidenceChunk[],
  turnsById: ReadonlyMap<string, EvidenceTurn>,
  k: number,
  options: EvidenceOptions & { skipMismatched?: boolean } = {},
): ChunkEvidenceResult[] {
  if (!Number.isInteger(k) || k < 0) refuse(`k must be a non-negative integer, got ${k}`);
  if (k === 0) return [];
  const scored: Array<{ chunk: EvidenceChunk; score: number }> = [];
  for (const c of chunks) {
    if (!c.vector || c.vector.length !== queryVector.length) {
      if (options.skipMismatched) continue;
      refuse(`chunk ${c._id} has ${c.vector?.length ?? "no"} dims, query has ${queryVector.length}`);
    }
    scored.push({ chunk: c, score: cosineSimilarity(queryVector, c.vector) });
  }
  scored.sort((x, y) => (y.score - x.score) || (x.chunk._id < y.chunk._id ? -1 : x.chunk._id > y.chunk._id ? 1 : 0));
  // Evidence is attached to the top k only: a bad row outside the window does not block a query,
  // but a bad row INSIDE it refuses rather than being silently replaced by the next one.
  return scored.slice(0, k).map((s) => attachEvidence(s.chunk, s.score, turnsById, options));
}
