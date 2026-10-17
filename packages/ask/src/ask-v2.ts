/**
 * packages/ask/src/ask-v2.ts — T-005b C4. Composes `selectNodes -> evaluate (via T-005's
 * existing `ask()`) -> refine -> answer`, logging every external call (selectNodes' LLM call,
 * each refine strip call, the answer call, and the evaluator's per-candidate score_fn call) via
 * T-019's `recordJob`. Does NOT replace `./evaluator.ts` / `./router.ts` — `ask()` stays the
 * lower-level primitive this builds on; imported and called, never reimplemented.
 */
import type { TreeIndexNode } from "@lkb/core";
import { askGraphV2 } from "./ask-graph.js";
import type { AskV2Deps, AskV2Result } from "./ask-shared.js";
export type { AuditEntry, AskV2Deps, AskV2Result } from "./ask-shared.js";

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
