/**
 * packages/ask/src/ask-shared.ts — types shared by ask-v2.ts and ask-graph.ts. Kept apart so the
 * dependency edge runs one way (ask-v2 -> ask-graph -> ask-shared); no behavior.
 */
import type { TreeIndexNode } from "@lkb/core";
import type { WriteJobFn } from "@lkb/ai";

import type { AskResult, WebFallbackFn, WebSource } from "./router.js";
import type { ScoreFn } from "./evaluator.js";
import type { CompleteFn, NodeSearchFn } from "./select-nodes.js";
import type { SourceContextDeps } from "./source-context.js";

export interface AuditEntry {
  jobKind: string;
  step: string;
  provider?: string;
  model?: string;
  costUsd?: number;
  /** D-153 (pending append): structured warning, the scoped turns excluded for failing row validation. */
  excludedTurns?: { sessionId: string; turnId: string; reason: string }[];
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
