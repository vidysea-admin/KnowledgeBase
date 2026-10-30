/** Runtime-only bounded source evidence; canonical schemas and CRAG thresholds are unchanged. */
import { createHash } from "node:crypto";
import type { TreeIndexNode, NativeSourceLocator } from "@lkb/core";
export type { NativeSourceLocator } from "@lkb/core";
import type { CompleteFn } from "./select-nodes.js";

export interface SourceQuote {
  id: string;
  nodeId: string;
  sessionRef: string;
  turnId: string;
  speakerRef: string;
  tStart: number;
  tEnd: number;
  charStart: number;
  charEnd: number;
  byteStart: number;
  byteEnd: number;
  turnTextSHA256: string;
  sliceSHA256: string;
  quote: string;
  origin: "speech" | "screen-ocr-unverified" | "visual-observation-unverified";
}

export interface NativeSourceQuote {
  id: string; nodeId: string; quote: string;
  origin: "document-page" | "message";
  sourceLocator: NativeSourceLocator;
}
export type SourceEvidenceQuote = SourceQuote | NativeSourceQuote;
export const isNativeSourceQuote = (quote: SourceEvidenceQuote): quote is NativeSourceQuote =>
  "sourceLocator" in quote;
/** Strict native metadata only. Canonical source resolution remains the hydrator's authority. */
export function validNativeSourceLocator(value: unknown): value is NativeSourceLocator {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const loc = value as NativeSourceLocator;
  const keys = loc.kind === "document-page" ? ["kind", "sourceId", "revisionHash", "passage", "documentId", "documentSourceId", "headRevision", "pageNumber"]
    : loc.kind === "message" ? ["kind", "sourceId", "revisionHash", "passage", "threadId", "messageId"] : [];
  if (!keys.length || Object.keys(loc).some((key) => !keys.includes(key)) || !text(loc.sourceId) || !hash(loc.revisionHash)) return false;
  const span = loc.passage;
  if (!span || typeof span !== "object" || Array.isArray(span) || Object.keys(span).some((key) => !["start", "end", "sha256"].includes(key))
    || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || !hash(span.sha256)) return false;
  return loc.kind === "document-page" ? text(loc.documentId) && text(loc.documentSourceId) && Number.isSafeInteger(loc.headRevision) && loc.headRevision >= 1
    && Number.isSafeInteger(loc.pageNumber) && loc.pageNumber > 0
    : text(loc.threadId) && text(loc.messageId);
}

/** D-153 (pending append): a scoped turn that failed row validation was EXCLUDED from the hydration (never cited). */
export interface ExcludedSourceTurn { sessionId: string; turnId: string; reason: string }
/** The live turn text the hydrator loaded. When present, quote proofs are recomputed against it (fail closed). */
export interface LiveSourceTurn { sessionId: string; turnId: string; text: string }
export interface SourceHydration {
  excludedTurns?: ExcludedSourceTurn[];
  /** Optional: live turn text for proof recomputation. Same canonicalization as the proof producer (raw UTF-8 sha256, UTF-16 char offsets, UTF-8 byte offsets of the prefix). */
  liveTurns?: LiveSourceTurn[];
  nodes: TreeIndexNode[];
  snapshotSHA256: string;
  sourceBytes: number;
  degraded?: string;
}
export type HydrateSourcesFn = (query: string, nodes: TreeIndexNode[]) => Promise<SourceHydration>;
export interface SourceContextDeps {
  hydrate: HydrateSourcesFn;
  /** Canonical authority reload; required for native evidence before generation and release. */
  revalidate?: (nodes: TreeIndexNode[]) => Promise<void>;
}
export interface BudgetRefusalDiagnostics {
  readonly reason: "dispatch_limit" | "job_byte_limit" | "aggregate_byte_limit" | "start_deadline" | "output_byte_limit";
  readonly phase: "input_admission" | "output_validation";
  readonly stage: string;
  readonly limit: number;
  readonly attemptedJobBytes: number;
  readonly dispatchedCalls: number;
  readonly acceptedInputBytes: number;
  readonly elapsedStartMs: number;
  readonly serializedOutputBytes?: number;
}
export class BoundedAskError extends Error {
  readonly code = "source_context_unavailable";
  readonly budgetRefusal?: Readonly<BudgetRefusalDiagnostics>;
  constructor(readonly reason: string, budgetRefusal?: BudgetRefusalDiagnostics) {
    super("Ask could not validate a bounded source context: " + reason);
    this.name = "BoundedAskError";
    this.budgetRefusal = budgetRefusal ? Object.freeze({ ...budgetRefusal }) : undefined;
  }
}
/** The answer step found no answer in the admitted context (model abstained, or the grounding judge rejected every sentence). Still a BoundedAskError for deep; the fast path turns it into an honest insufficient answer. */
export class AnswerAbstainError extends BoundedAskError {}
export const SOURCE_LIMITS = Object.freeze({
  catalogBytes: 64 * 1024, contextBytes: 48 * 1024, jobBytes: 64 * 1024,
  totalJobBytes: 256 * 1024, calls: 12, candidates: 6, startDeadlineMs: 240_000,
});
export const payloadBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
/** Returns a stale-proof reason, or null when the proof matches the live turn text. */
function staleQuoteProof(q: SourceQuote, live: Map<string, string>): string | null {
  const turnText = live.get(JSON.stringify([q.sessionRef, q.turnId]));
  if (turnText === undefined) return "quote-proof-stale: live turn missing";
  if (sha256(turnText) !== q.turnTextSHA256) return "quote-proof-stale: turn text hash differs";
  if (q.charEnd > turnText.length) return "quote-proof-stale: offsets out of range";
  const slice = turnText.slice(q.charStart, q.charEnd);
  if (slice !== q.quote || sha256(slice) !== q.sliceSHA256) return "quote-proof-stale: slice hash differs";
  if (Buffer.byteLength(turnText.slice(0, q.charStart), "utf8") !== q.byteStart
    || Buffer.byteLength(turnText.slice(0, q.charEnd), "utf8") !== q.byteEnd) return "quote-proof-stale: byte offsets differ";
  return null;
}

/** Metadata only; routing summaries are explicitly supplied by the accepted-source indexer.
 * The complete catalog stays local. selectNodes admits bounded frontiers to the provider. */
export function sourceCatalog(root: TreeIndexNode): TreeIndexNode {
  const seen = new Set<string>();
  function clone(node: TreeIndexNode, depth = 0): TreeIndexNode {
    if (!text(node.node_id) || seen.has(node.node_id) || !text(node.title) || !Array.isArray(node.children)) {
      throw new BoundedAskError("invalid or duplicate catalog identity");
    }
    if (depth > 32 || seen.size >= 50_000 || payloadBytes([node.node_id, node.title]) > 4096) {
      throw new BoundedAskError("catalog identity or traversal exceeds budget");
    }
    seen.add(node.node_id);
    const sessionRef = node.evidence?.sessionRef;
    const routing = node.evidence?.routingSummary;
    const summary = typeof routing === "string" && Buffer.byteLength(routing, "utf8") <= 768
      ? routing : node.children.slice(0, 8).map((child) => child.title).join("; ").slice(0, 192);
    return {
      node_id: node.node_id, title: node.title, level: node.level,
      summary: summary || (node.level === "session" ? "Transcript source; select this session when relevant." : "Catalog container."),
      ...(typeof sessionRef === "string" ? { evidence: { sessionRef } } : {}),
      children: node.children.map((child) => clone(child, depth + 1)),
    };
  }
  const result = clone(root);
  return result;
}

export function sourceQuotes(node: TreeIndexNode): SourceEvidenceQuote[] {
  const quotes = node.evidence?.sourceQuotes;
  if (!Array.isArray(quotes)) throw new BoundedAskError("missing source quote inventory");
  return quotes as SourceEvidenceQuote[];
}
export function validateHydration(result: SourceHydration, admitted: TreeIndexNode[]): TreeIndexNode[] {
  if (!hash(result.snapshotSHA256) || !Number.isSafeInteger(result.sourceBytes) || result.sourceBytes < 0) {
    throw new BoundedAskError("invalid source snapshot proof");
  }
  if (result.degraded !== undefined && !text(result.degraded)) throw new BoundedAskError("invalid source degradation status");
  const excluded = result.excludedTurns ?? [];
  if (!Array.isArray(excluded) || excluded.some((e) => !text(e?.sessionId) || !text(e?.turnId) || !text(e?.reason))) {
    throw new BoundedAskError("invalid excluded-turn warning");
  }
  const excludedKeys = new Set(excluded.map((e) => JSON.stringify([e.sessionId, e.turnId])));
  const originals = new Map(admitted.map((n) => [n.node_id, n]));
  const nodeIds = new Set<string>();
  const quoteIds = new Set<string>();
  const live = result.liveTurns === undefined ? undefined
    : new Map(result.liveTurns.map((t) => [JSON.stringify([t.sessionId, t.turnId]), t.text] as const));
  if (live && !result.liveTurns!.every((t) => text(t?.sessionId) && text(t?.turnId) && typeof t.text === "string")) {
    throw new BoundedAskError("invalid live turn text");
  }
  const kept: TreeIndexNode[] = [];
  for (const node of result.nodes) {
    const original = originals.get(node.node_id);
    if (!original || nodeIds.has(node.node_id) || original.evidence?.sessionRef !== node.evidence?.sessionRef
      || node.evidence?.sourceSnapshotSHA256 !== result.snapshotSHA256) {
      throw new BoundedAskError("hydration identity is outside admitted original nodes");
    }
    nodeIds.add(node.node_id);
    const quotes = sourceQuotes(node);
    if (quotes.length === 0) throw new BoundedAskError("empty hydrated evidence");
    for (const q of quotes) {
      if (!q || !text(q.id) || quoteIds.has(q.id) || q.nodeId !== node.node_id || !text(q.quote)) throw new BoundedAskError("invalid source quote proof");
      if (isNativeSourceQuote(q)) {
        const loc = q.sourceLocator;
        if (!validNativeSourceLocator(loc) || q.origin !== loc.kind
          || Object.keys(q).some((key) => !["id", "nodeId", "quote", "origin", "sourceLocator"].includes(key))
          || loc.sourceId !== original.evidence?.sourceId || loc.revisionHash !== original.evidence?.revisionHash
          || loc.sourceId !== node.evidence?.sourceId || loc.revisionHash !== node.evidence?.revisionHash
          || (original.evidence?.sourceLocator !== undefined && JSON.stringify(original.evidence.sourceLocator) !== JSON.stringify(loc))
          || loc.passage.end - loc.passage.start !== q.quote.length
          || createHash("sha256").update(q.quote, "utf8").digest("hex") !== loc.passage.sha256) {
          throw new BoundedAskError("invalid native source quote proof");
        }
      } else {
      if (excludedKeys.has(JSON.stringify([q.sessionRef, q.turnId]))) throw new BoundedAskError("excluded turn cited");
      if (!text(q.id) || quoteIds.has(q.id) || q.nodeId !== node.node_id || q.sessionRef !== node.evidence?.sessionRef
        || !text(q.sessionRef) || !text(q.turnId) || !text(q.speakerRef) || !text(q.quote) || !hash(q.turnTextSHA256) || !hash(q.sliceSHA256)
        || !Number.isFinite(q.tStart) || !Number.isFinite(q.tEnd) || q.tStart < 0 || q.tEnd < q.tStart
        || !Number.isSafeInteger(q.charStart) || !Number.isSafeInteger(q.charEnd) || q.charStart < 0 || q.charEnd <= q.charStart
        || !Number.isSafeInteger(q.byteStart) || !Number.isSafeInteger(q.byteEnd) || q.byteStart < 0 || q.byteEnd <= q.byteStart
        || q.charEnd - q.charStart !== q.quote.length || q.byteEnd - q.byteStart !== Buffer.byteLength(q.quote, "utf8")
        || !["speech", "screen-ocr-unverified", "visual-observation-unverified"].includes(q.origin)) {
        throw new BoundedAskError("invalid source quote proof");
      }
      }
      quoteIds.add(q.id);
    }
    if (node.summary !== JSON.stringify(quotes)) throw new BoundedAskError("hydrated text differs from quote inventory");
    if (!live) { kept.push(node); continue; }
    // Recompute against live turn text; a stale citation is excluded (never cited) with a per-citation reason.
    const good: SourceEvidenceQuote[] = [];
    for (const q of quotes) {
      const reason = isNativeSourceQuote(q) ? null : staleQuoteProof(q, live);
      if (!reason) { good.push(q); continue; }
      const sq = q as SourceQuote;
      (result.excludedTurns ??= []).push({ sessionId: sq.sessionRef, turnId: sq.turnId, reason });
    }
    if (good.length === quotes.length) kept.push(node);
    else if (good.length > 0) kept.push({ ...node, summary: JSON.stringify(good), evidence: { ...node.evidence, sourceQuotes: good } as TreeIndexNode["evidence"] });
  }
  if (result.nodes.length > SOURCE_LIMITS.candidates || payloadBytes(result.nodes) > SOURCE_LIMITS.contextBytes) {
    throw new BoundedAskError("hydrated context exceeds byte budget");
  }
  return kept;
}

/** Sticky limits survive the existing scorer's catch-and-heuristic fallback. */
export function completionBudget(complete: CompleteFn, now: () => number = Date.now) {
  const started = now();
  let calls = 0, bytes = 0;
  let failure: BoundedAskError | undefined;
  const assertHealthy = () => { if (failure) throw failure; };
  const bounded: CompleteFn = async (job) => {
    assertHealthy();
    const size = payloadBytes(job);
    const elapsed = now() - started;
    const stage = ["ask", "evaluator", "ask.select_nodes", "ask.refine_batch", "ask.answer", "ask.answer_grounding"]
      .includes(job.kind) ? job.kind : "other";
    const cause = calls >= SOURCE_LIMITS.calls ? "dispatch_limit"
      : size > SOURCE_LIMITS.jobBytes ? "job_byte_limit"
        : bytes + size > SOURCE_LIMITS.totalJobBytes ? "aggregate_byte_limit"
          : elapsed >= SOURCE_LIMITS.startDeadlineMs ? "start_deadline" : undefined;
    if (cause) {
      const limit = cause === "dispatch_limit" ? SOURCE_LIMITS.calls
        : cause === "job_byte_limit" ? SOURCE_LIMITS.jobBytes
          : cause === "aggregate_byte_limit" ? SOURCE_LIMITS.totalJobBytes : SOURCE_LIMITS.startDeadlineMs;
      failure = new BoundedAskError("completion dispatch, byte, or start-deadline budget exhausted", {
        reason: cause, phase: "input_admission", stage, limit, attemptedJobBytes: size,
        dispatchedCalls: calls, acceptedInputBytes: bytes, elapsedStartMs: elapsed,
      });
      throw failure;
    }
    calls += 1; bytes += size;
    const result = await complete(job);
    const outputSize = payloadBytes(result);
    if (outputSize > SOURCE_LIMITS.jobBytes) {
      failure = new BoundedAskError("completion output exceeds byte budget", {
        reason: "output_byte_limit", phase: "output_validation", stage, limit: SOURCE_LIMITS.jobBytes,
        attemptedJobBytes: size, dispatchedCalls: calls, acceptedInputBytes: bytes,
        elapsedStartMs: now() - started, serializedOutputBytes: outputSize,
      });
      throw failure;
    }
    return result;
  };
  return { complete: bounded, assertHealthy, stats: () => ({ calls, inputBytes: bytes }) };
}
