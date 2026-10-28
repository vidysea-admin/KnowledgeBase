/**
 * packages/ask/src/router.ts — the CRAG-style /ask flow (port of ask_router/router.py,
 * T-005 → T-016; behaviour-identical).
 *
 * ask(query, tree, treeSearchFn, scoreFn, webFallbackFn?, upper=0.7, lower=0.3) ->
 *   { verdict, reason, scored, web_used, insufficient_coverage, sources: { internal, web } }
 *
 * Internal-first, web-fallback-only-when-needed (ARCHITECTURE §2.2 / H2). `treeSearchFn` is
 * expected to already have picked candidate nodes (the LLM-reasoning step lives outside this
 * module); this router only evaluates + routes. `insufficient_coverage` is true only when the
 * verdict != correct AND no web fallback ran. Internal and web sources are never merged.
 */
import type { TreeIndexNode } from "@lkb/core";
import { evaluate, isPromiseLike, LOWER_THRESHOLD, UPPER_THRESHOLD } from "./evaluator.js";
import type { Evaluation, ScoreFn, ScoreResult, Verdict, Scored } from "./evaluator.js";

export type TreeSearchFn = (tree: unknown, query: string) => TreeIndexNode[];
export type WebFallbackFn = (query: string) => WebSource[];
export type WebSource = Record<string, unknown>;

export interface InternalSource { node_id: string; evidence?: TreeIndexNode["evidence"] }

export interface AskResult {
  verdict: Verdict;
  reason: string;
  /** audit trail: every candidate's score + reason */
  scored: Scored[];
  web_used: boolean;
  insufficient_coverage: boolean;
  sources: { internal: InternalSource[]; web: WebSource[] };
}

export function internalSource(node: TreeIndexNode): InternalSource {
  const src: InternalSource = { node_id: node.node_id };
  if (node.evidence) src.evidence = node.evidence;
  return src;
}

function result(evaluation: Evaluation, webUsed: boolean, insufficient: boolean,
  webResults: WebSource[]): AskResult {
  return {
    verdict: evaluation.verdict,
    reason: evaluation.reason,
    scored: evaluation.scored,
    web_used: webUsed,
    insufficient_coverage: insufficient,
    sources: { internal: evaluation.good_docs.map(internalSource), web: [...webResults] },
  };
}

function finishAsk(evaluation: Evaluation, webFallbackFn: WebFallbackFn | undefined,
  query: string): AskResult {
  // Internal-first is enforced here, not just possible: a correct verdict never touches
  // webFallbackFn even if the caller supplied one.
  if (evaluation.verdict === "correct") return result(evaluation, false, false, []);
  if (webFallbackFn === undefined) return result(evaluation, false, true, []);
  return result(evaluation, true, false, webFallbackFn(query));
}

// Same overload split as evaluate() — a sync scoreFn keeps ask() typed as returning a plain
// `AskResult`, so every pre-T-009b sync caller (router.test.ts, ask-v2.ts's own tests) still
// compiles without `await`.
export function ask(query: string, tree: unknown, treeSearchFn: TreeSearchFn,
  scoreFn: (query: string, node: TreeIndexNode) => ScoreResult,
  webFallbackFn?: WebFallbackFn, upper?: number, lower?: number): AskResult;
export function ask(query: string, tree: unknown, treeSearchFn: TreeSearchFn, scoreFn: ScoreFn,
  webFallbackFn?: WebFallbackFn, upper?: number, lower?: number): AskResult | Promise<AskResult>;
export function ask(query: string, tree: unknown, treeSearchFn: TreeSearchFn, scoreFn: ScoreFn,
  webFallbackFn?: WebFallbackFn, upper: number = UPPER_THRESHOLD,
  lower: number = LOWER_THRESHOLD): AskResult | Promise<AskResult> {
  const candidates = treeSearchFn(tree, query);
  const evaluation = evaluate(query, candidates, scoreFn, upper, lower);

  if (isPromiseLike(evaluation)) {
    return evaluation.then((ev) => finishAsk(ev, webFallbackFn, query));
  }
  return finishAsk(evaluation, webFallbackFn, query);
}
