/**
 * packages/ask/src/ask-v2.ts — T-005b C4. Composes `selectNodes -> evaluate (via T-005's
 * existing `ask()`) -> refine -> answer`, logging every external call (selectNodes' LLM call,
 * each refine strip call, the answer call, and the evaluator's per-candidate score_fn call) via
 * T-019's `recordJob`. Does NOT replace `./evaluator.ts` / `./router.ts` — `ask()` stays the
 * lower-level primitive this builds on; imported and called, never reimplemented.
 */
import type { TreeIndexNode } from "@lkb/core";
import type { WriteJobFn } from "@lkb/ai";

import type { AskResult, WebFallbackFn, WebSource } from "./router.js";
import type { ScoreFn } from "./evaluator.js";
import type { CompleteFn, NodeSearchFn } from "./select-nodes.js";
import type { SourceContextDeps } from "./source-context.js";
import { askGraphV2 } from "./ask-graph.js";

export interface AuditEntry {
  jobKind: string;
  step: string;
  provider?: string;
  model?: string;
  costUsd?: number;
}

export interface AskV2Deps {
  complete: CompleteFn;
  scoreFn: ScoreFn;
  scoreFnForComplete?: (complete: CompleteFn) => ScoreFn;
  sourceContext?: SourceContextDeps;
  /** `@lkb/index`'s `treeSearch` — injected, never imported (see select-nodes.ts module doc). */
  treeSearchFn: NodeSearchFn;
  webFallbackFn?: WebFallbackFn;
  /** ISS-010: the real, async web-search escape hatch. `router.ts`'s `WebFallbackFn` is
   * synchronous by design (T-005/T-016, already shipped and checker-PASSed — never touched by
   * this addition), so a real HTTP-backed provider (Tavily) can't be that function directly.
   * Instead: when `ask()` comes back `insufficient_coverage` (verdict != correct AND no
   * `webFallbackFn` fired), this optional async fn is tried as a second, real fallback — layered
   * on top of `router.ts`, never inside it. Omitted in production until a real `TAVILY_API_KEY`
   * exists (apps/api/src/ask-web-fallback.ts); absent here, behavior is byte-identical to before
   * this addition. */
  tavilySearchFn?: (query: string) => Promise<WebSource[]>;
  /**
   * U1.5. Extra retrieval arms (vector, lexical) as already-ranked node lists, best-first.
   *
   * INJECTED, not imported: `packages/ask` may not depend on `packages/index` (contract C10), and
   * the vector arm needs an embedding call this package must not know about. The composition root
   * binds it PER REQUEST with the real tenantId — never at boot — because `buildProductionDeps`
   * has no tenant and its router-level id is the literal `"system"` (contract C6).
   *
   * OPTIONAL, following the `tavilySearchFn` precedent: absent, `askV2` behaves byte-identically
   * to before this addition, so an install with no vector index is unaffected rather than broken.
   *
   * It must NEVER throw — a failed arm returns `[]` and `/ask` still answers from the tree. See
   * the call site for why that is reported rather than swallowed.
   */
  extraCandidateArmsFn?: (query: string, tree: TreeIndexNode) => Promise<{ arms: TreeIndexNode[][]; degraded: string | null }>;
  write: WriteJobFn;
  tenantId: string;
  upper?: number;
  lower?: number;
}

export interface AskV2Result extends AskResult {
  answer: string;
  /** append-only per-query audit trail — one entry per external (LLM/score) call this run made. */
  auditLog: AuditEntry[];
}

/**
 * ISS-T050ASKGRAPH-002: `askV2` no longer carries its own copy of the pipeline. The retrieve ->
 * evaluate -> refine -> answer node functions live in ./ask-graph.ts and are the ONLY implementation;
 * this is the production entry point over them (public signature, outputs, writes and provider calls
 * unchanged — pinned by ask-graph.baseline.json and the ask-v2/bounded-ask suites). Bounded refusals
 * are explicit and recorded; legacy callers retain their original behavior (see askGraphV2).
 */
export async function askV2(query: string, tree: TreeIndexNode, deps: AskV2Deps): Promise<AskV2Result> {
  return askGraphV2(query, tree, deps);
}
