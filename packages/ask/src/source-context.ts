/** Runtime-only bounded source evidence; canonical schemas and CRAG thresholds are unchanged. */
import type { TreeIndexNode } from "@lkb/core";
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
export interface SourceHydration {
  nodes: TreeIndexNode[];
  snapshotSHA256: string;
  sourceBytes: number;
  degraded?: string;
}
export type HydrateSourcesFn = (query: string, nodes: TreeIndexNode[]) => Promise<SourceHydration>;
export interface SourceContextDeps { hydrate: HydrateSourcesFn }
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
export const SOURCE_LIMITS = Object.freeze({
  catalogBytes: 64 * 1024, contextBytes: 48 * 1024, jobBytes: 64 * 1024,
  totalJobBytes: 256 * 1024, calls: 12, candidates: 6, startDeadlineMs: 240_000,
});
export const payloadBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** A complete metadata clone. Selection never sees source summaries and never mutates the tree. */
export function sourceCatalog(root: TreeIndexNode): TreeIndexNode {
  const seen = new Set<string>();
  function clone(node: TreeIndexNode): TreeIndexNode {
    if (!text(node.node_id) || seen.has(node.node_id) || !text(node.title) || !Array.isArray(node.children)) {
      throw new BoundedAskError("invalid or duplicate catalog identity");
    }
    seen.add(node.node_id);
    const sessionRef = node.evidence?.sessionRef;
    return {
      node_id: node.node_id, title: node.title, level: node.level,
      summary: node.level === "session" ? "Transcript source; select this session when relevant." : "Catalog container.",
      ...(typeof sessionRef === "string" ? { evidence: { sessionRef } } : {}),
      children: node.children.map(clone),
    };
  }
  const result = clone(root);
  if (payloadBytes(result) > SOURCE_LIMITS.catalogBytes) throw new BoundedAskError("complete catalog exceeds byte budget");
  return result;
}

export function sourceQuotes(node: TreeIndexNode): SourceQuote[] {
  const quotes = node.evidence?.sourceQuotes;
  if (!Array.isArray(quotes)) throw new BoundedAskError("missing source quote inventory");
  return quotes as SourceQuote[];
}
export function validateHydration(result: SourceHydration, admitted: TreeIndexNode[]): TreeIndexNode[] {
  if (!hash(result.snapshotSHA256) || !Number.isSafeInteger(result.sourceBytes) || result.sourceBytes < 0) {
    throw new BoundedAskError("invalid source snapshot proof");
  }
  if (result.degraded !== undefined && !text(result.degraded)) throw new BoundedAskError("invalid source degradation status");
  const originals = new Map(admitted.map((n) => [n.node_id, n]));
  const nodeIds = new Set<string>();
  const quoteIds = new Set<string>();
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
      if (!text(q.id) || quoteIds.has(q.id) || q.nodeId !== node.node_id || q.sessionRef !== node.evidence?.sessionRef
        || !text(q.turnId) || !text(q.speakerRef) || !text(q.quote) || !hash(q.turnTextSHA256) || !hash(q.sliceSHA256)
        || !Number.isFinite(q.tStart) || !Number.isFinite(q.tEnd) || q.tStart < 0 || q.tEnd < q.tStart
        || !Number.isSafeInteger(q.charStart) || !Number.isSafeInteger(q.charEnd) || q.charStart < 0 || q.charEnd <= q.charStart
        || !Number.isSafeInteger(q.byteStart) || !Number.isSafeInteger(q.byteEnd) || q.byteStart < 0 || q.byteEnd <= q.byteStart
        || q.charEnd - q.charStart !== q.quote.length || q.byteEnd - q.byteStart !== Buffer.byteLength(q.quote, "utf8")
        || !["speech", "screen-ocr-unverified", "visual-observation-unverified"].includes(q.origin)) {
        throw new BoundedAskError("invalid source quote proof");
      }
      quoteIds.add(q.id);
    }
    if (node.summary !== JSON.stringify(quotes)) throw new BoundedAskError("hydrated text differs from quote inventory");
  }
  if (result.nodes.length > SOURCE_LIMITS.candidates || payloadBytes(result.nodes) > SOURCE_LIMITS.contextBytes) {
    throw new BoundedAskError("hydrated context exceeds byte budget");
  }
  return result.nodes;
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
