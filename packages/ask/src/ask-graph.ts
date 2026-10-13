/**
 * packages/ask/src/ask-graph.ts — T-050 slice: the /ask flow as a typed graph of 4 coarse nodes
 * (D-142, pending append): retrieve -> evaluate -> refine -> answer. Nodes may be split later.
 *
 * NOT exported from index.ts and NOT wired to any route. ISS-T050ASKGRAPH-002: these node functions are
 * now the ONLY implementation of the /ask pipeline: `askV2` (./ask-v2.ts, the production path) delegates
 * to `askGraphV2` below, so there is no second copy to drift. Outputs, writes and provider calls are
 * pinned byte-for-byte by ask-graph.baseline.json. A node failure is NOT wrapped (bounded mode wraps
 * non-BoundedAskError once, in askGraphV2) — the original error propagates exactly as before.
 */
import type { TreeIndexNode } from "@lkb/core";
import { recordJob } from "@lkb/ai";

import { ask, type AskResult, type WebSource } from "./router.js";
import { LOWER_THRESHOLD, UPPER_THRESHOLD, type ScoreFn } from "./evaluator.js";
import { selectNodes, type CompleteFn } from "./select-nodes.js";
import { rrfMerge } from "./merge.js";
import { refine, type RefinableDoc } from "./refine.js";
import { answer as generateAnswer } from "./answer.js";
import { sourceCatalog, validateHydration, sourceQuotes, completionBudget, BoundedAskError, SOURCE_LIMITS } from "./source-context.js";
import { boundedRefine, contextStrips, type ContextSource } from "./bounded-refine.js";
import type { AskV2Deps, AskV2Result, AuditEntry } from "./ask-v2.js";

export type AskNodeName = "retrieve" | "evaluate" | "refine" | "answer";

/** Mutable run state threaded through the nodes. `result` set => the graph is finished. */
export interface AskGraphState {
  readonly query: string;
  readonly tree: TreeIndexNode;
  readonly deps: AskV2Deps;
  readonly upper: number;
  readonly lower: number;
  readonly auditLog: AuditEntry[];
  readonly budget: ReturnType<typeof completionBudget> | undefined;
  readonly loggingComplete: (step: string) => CompleteFn;
  candidates: TreeIndexNode[];
  askResult?: AskResult;
  boundedSources: ContextSource[];
  refinedContext?: string;
  result?: AskV2Result;
  /** Names of nodes entered, in order (diagnostic only; never part of the output). */
  readonly trace: AskNodeName[];
}

export interface AskGraphNode {
  readonly name: AskNodeName;
  readonly run: (s: AskGraphState) => Promise<void>;
}

function webDocText(source: WebSource): string {
  return ["title", "snippet", "content", "text"]
    .map((key) => source[key])
    .filter((v): v is string => typeof v === "string")
    .join(". ");
}

function collectNodesById(root: TreeIndexNode): Map<string, TreeIndexNode> {
  const byId = new Map<string, TreeIndexNode>();
  const stack: TreeIndexNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (!byId.has(n.node_id)) byId.set(n.node_id, n);
    for (const c of n.children ?? []) stack.push(c);
  }
  return byId;
}

const retrieveNode: AskGraphNode = {
  name: "retrieve",
  async run(s) {
    const { query, tree, deps, auditLog } = s;
    const { treeSearchFn, extraCandidateArmsFn, write, tenantId } = deps;
    const catalog = deps.sourceContext ? sourceCatalog(tree) : tree;
    const treeCandidates = await selectNodes(query, catalog, s.loggingComplete("select_nodes"), (_catalog, ids) => treeSearchFn(tree, ids));
    let candidates = treeCandidates;
    if (extraCandidateArmsFn) {
      const extra = await extraCandidateArmsFn(query, tree);
      if (extra.degraded) {
        await recordJob({ tenantId, kind: "ask.retrieval_degraded", status: "done" }, write);
        auditLog.push({ jobKind: "ask.retrieval_degraded", step: extra.degraded });
      }
      const merged = rrfMerge([treeCandidates, ...extra.arms], { keyOf: (n: TreeIndexNode) => n.node_id });
      // Membership guard + resolve (ISS-157/158): the tree's own node replaces whatever an arm supplied.
      const byId = collectNodesById(tree);
      const resolved = merged.map((n) => byId.get(n.node_id)).filter((n): n is TreeIndexNode => n !== undefined);
      const dropped = merged.length - resolved.length;
      if (dropped > 0) {
        await recordJob({ tenantId, kind: "ask.candidates_dropped", status: "done" }, write);
        auditLog.push({ jobKind: "ask.candidates_dropped", step: `${dropped} candidate(s) not in this tenant's tree` });
      }
      candidates = resolved;
    }
    if (deps.sourceContext) {
      const byId = collectNodesById(tree);
      candidates = candidates.map((n) => byId.get(n.node_id)).filter((n): n is TreeIndexNode => n !== undefined);
      if (candidates.length > SOURCE_LIMITS.candidates) {
        auditLog.push({ jobKind: "ask.candidates_bounded", step: `${candidates.length - SOURCE_LIMITS.candidates} lower-ranked candidates omitted from bounded scoring` });
        candidates = candidates.slice(0, SOURCE_LIMITS.candidates);
      }
      const hydrated = await deps.sourceContext.hydrate(query, candidates);
      candidates = validateHydration(hydrated, candidates);
      if (hydrated.degraded) {
        await recordJob({ tenantId, kind: "ask.retrieval_degraded", status: "failed", error: hydrated.degraded }, write);
        auditLog.push({ jobKind: "ask.retrieval_degraded", step: hydrated.degraded });
      }
      if (hydrated.excludedTurns?.length) {
        auditLog.push({ jobKind: "ask.source_rows_excluded", excludedTurns: hydrated.excludedTurns,
          step: `warning: ${hydrated.excludedTurns.length} invalid source turn(s) excluded from this answer: ` + hydrated.excludedTurns.map((e) => `session ${e.sessionId} turn ${e.turnId} (${e.reason})`).join("; ") });
      }
      auditLog.push({ jobKind: "ask.source_hydrated", step: `${candidates.length} source nodes; snapshot ${hydrated.snapshotSHA256}; ${hydrated.sourceBytes} source bytes` });
    }
    s.candidates = candidates;
  },
};

const evaluateNode: AskGraphNode = {
  name: "evaluate",
  async run(s) {
    const { query, tree, deps, auditLog } = s;
    const { webFallbackFn, tavilySearchFn, write, tenantId } = deps;
    const scoreFn: ScoreFn = deps.scoreFnForComplete ? deps.scoreFnForComplete(s.loggingComplete("score")) : deps.scoreFn;
    const candidates = s.candidates;
    let askResult = await ask(query, tree, () => candidates, scoreFn, webFallbackFn, s.upper, s.lower);

    s.budget?.assertHealthy();
    if (deps.sourceContext && askResult.scored.some((x) => /fell back|heuristic/i.test(x.reason))) {
      throw new BoundedAskError("evaluator degraded to heuristic scoring");
    }

    if (askResult.insufficient_coverage && tavilySearchFn) {
      try {
        const webResults = await tavilySearchFn(query);
        if (deps.sourceContext && webResults.length === 0) {
          await recordJob({ tenantId, kind: "ask.web_fallback_empty", status: "failed", error: "web search returned no evidence" }, write);
          auditLog.push({ jobKind: "ask.web_fallback_empty", step: "web_fallback_unavailable: web search returned no evidence" });
        } else {
          await recordJob({ tenantId, kind: "ask.web_fallback", status: "done" }, write);
          auditLog.push({ jobKind: "ask.web_fallback", step: "web_fallback" });
          askResult = { ...askResult, web_used: true, insufficient_coverage: false, sources: { ...askResult.sources, web: webResults } };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await recordJob({ tenantId, kind: "ask.web_fallback_unavailable", status: "failed", error: message }, write);
        auditLog.push({ jobKind: "ask.web_fallback_unavailable", step: `web_fallback_unavailable: ${message}` });
      }
    }

    if (!deps.scoreFnForComplete) for (const _x of askResult.scored) {
      await recordJob({ tenantId, kind: "ask.score", status: "done" }, write);
      auditLog.push({ jobKind: "ask.score", step: "score" });
    }
    s.askResult = askResult;
  },
};

const refineNode: AskGraphNode = {
  name: "refine",
  async run(s) {
    const { query, deps, auditLog } = s;
    const askResult = s.askResult!;
    const goodDocNodes: TreeIndexNode[] = askResult.scored.filter((x) => x.score >= s.lower).map((x) => x.node);
    const boundedSources: ContextSource[] = deps.sourceContext ? [
      ...goodDocNodes.flatMap((n) => sourceQuotes(n).map((q) => ({ id: q.id, text: q.quote, origin: q.origin, source: { speakerRef: q.speakerRef, turnId: q.turnId, sessionRef: q.sessionRef, tStart: q.tStart, tEnd: q.tEnd } }))),
      ...askResult.sources.web.map((w, i) => ({ id: `web-${i}`, text: webDocText(w), origin: "web-unverified" })),
    ] : [];
    s.boundedSources = boundedSources;
    if (deps.sourceContext && !boundedSources.length) {
      s.result = { ...askResult, answer: "No supported internal source was retrieved. Web fallback is unavailable or returned no evidence.", auditLog };
      return;
    }
    if (askResult.verdict === "correct") {
      s.refinedContext = deps.sourceContext ? JSON.stringify(contextStrips(boundedSources)) : goodDocNodes.map((n) => n.summary).join(" ");
    } else {
      const docs: RefinableDoc[] = [
        ...goodDocNodes.map((n) => ({ text: n.summary })),
        ...askResult.sources.web.map((w) => ({ text: webDocText(w) })),
      ];
      s.refinedContext = deps.sourceContext ? await boundedRefine(boundedSources, query, s.loggingComplete("refine")) : await refine(docs, query, s.loggingComplete("refine"));
    }
  },
};

const answerNode: AskGraphNode = {
  name: "answer",
  async run(s) {
    const askResult = s.askResult!;
    const answerResult = await generateAnswer(s.query, s.refinedContext!, askResult.sources, s.loggingComplete("answer"), s.deps.sourceContext ? { boundedSources: s.boundedSources } : undefined);
    s.budget?.assertHealthy();
    s.result = { ...askResult, answer: answerResult.text, auditLog: s.auditLog };
  },
};

/** The node list, in execution order (linear; a node that sets `result` ends the run). */
export const ASK_GRAPH: readonly AskGraphNode[] = Object.freeze([retrieveNode, evaluateNode, refineNode, answerNode]);

export function initAskGraphState(query: string, tree: TreeIndexNode, deps: AskV2Deps): AskGraphState {
  const { complete: rawComplete, write, tenantId } = deps;
  const auditLog: AuditEntry[] = [];
  const budget = deps.sourceContext ? completionBudget(rawComplete) : undefined;
  const complete = budget?.complete ?? rawComplete;
  const loggingComplete = (step: string): CompleteFn => async (job) => {
    const completion = await complete(job);
    await recordJob({ tenantId, kind: `ask.${step}`, status: "done", provider: completion.provider, model: completion.model }, write);
    auditLog.push({ jobKind: `ask.${step}`, step, provider: completion.provider, model: completion.model, costUsd: completion.costUsd });
    return completion;
  };
  return {
    query, tree, deps,
    upper: deps.upper ?? UPPER_THRESHOLD,
    lower: deps.lower ?? LOWER_THRESHOLD,
    auditLog, budget, loggingComplete,
    candidates: [], boundedSources: [], trace: [],
  };
}

/** Minimal sequential executor. Errors from a node propagate unchanged. */
export async function runAskGraphNodes(nodes: readonly AskGraphNode[], state: AskGraphState): Promise<AskV2Result> {
  for (const node of nodes) {
    state.trace.push(node.name);
    await node.run(state);
    if (state.result) return state.result;
  }
  throw new Error("ask graph ended without a result");
}

/** The single /ask implementation (askV2 delegates here). The graph itself stays unexported from index.ts. */
export async function askGraphV2(query: string, tree: TreeIndexNode, deps: AskV2Deps): Promise<AskV2Result> {
  try { return await runAskGraphNodes(ASK_GRAPH, initAskGraphState(query, tree, deps)); }
  catch (err) {
    if (deps.sourceContext) {
      const failure = err instanceof BoundedAskError ? err : new BoundedAskError("source or completion processing failed");
      const error = failure.budgetRefusal
        ? JSON.stringify({ format: "lkb.budget_refusal.v1", message: failure.message, budgetRefusal: failure.budgetRefusal }) : failure.message;
      await recordJob({ tenantId: deps.tenantId, kind: "ask.source_context_refused", status: "failed", error }, deps.write);
      throw failure;
    }
    throw err;
  }
}
