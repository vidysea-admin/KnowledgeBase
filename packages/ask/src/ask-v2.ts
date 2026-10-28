/**
 * packages/ask/src/ask-v2.ts — T-005b C4. Composes `selectNodes -> evaluate (via T-005's
 * existing `ask()`) -> refine -> answer`, logging every external call (selectNodes' LLM call,
 * each refine strip call, the answer call, and the evaluator's per-candidate score_fn call) via
 * T-019's `recordJob`. Does NOT replace `./evaluator.ts` / `./router.ts` — `ask()` stays the
 * lower-level primitive this builds on; imported and called, never reimplemented.
 */
import type { TreeIndexNode } from "@lkb/core";
import { recordJob } from "@lkb/ai";
import { ASK_GRAPH, askFailure, askGraphV2, boundedSourcesOf, gatherCandidates, initAskGraphState } from "./ask-graph.js";
import { contextStrips } from "./bounded-refine.js";
import { internalSource, type AskResult, type WebSource } from "./router.js";
import { sourceQuotes } from "./source-context.js";
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

/** ask-fast-rag C6: total wall-clock budget of the default path (D-203). */
export const FAST_DEADLINE_MS = 20_000;
export interface AskFastOptions {
  /** Total deadline in ms; default FAST_DEADLINE_MS. */ deadlineMs?: number;
  /** Top-k candidate sessions; default 5. */ topK?: number;
  /** Non-LLM content arm over the tenant tree (native document/message passages, topics): returns node ids, resolved through
   * `deps.treeSearchFn` so request composition can withhold tree selection (graph-scoped asks) exactly as it does for deep. */
  treeLexicalIds?: (query: string, tree: TreeIndexNode) => string[];
}

/**
 * ask-fast-rag (D-203): the default `/ask` path, a standard RAG chatbot. Arms-only top-k retrieval (the same tenant-scoped
 * arms `/search` ranks with; no tree-selection LLM) -> hydrate exact quotes -> ONE answer call that cites them -> at most ONE
 * grounding check (both inside `answer()`, via the graph's own `answer` node). No per-candidate scoring, evaluator loop or
 * refine. `askV2` (the multi-step graph) is untouched and reached with `filters.mode = "deep"`. Web search runs only when
 * retrieval came back empty. Response shape is `AskV2Result`; `scored` is empty because nothing is LLM-scored here.
 */
export async function askFastV2(query: string, tree: TreeIndexNode, deps: AskV2Deps, options: AskFastOptions = {}): Promise<AskV2Result> {
  const deadlineMs = options.deadlineMs ?? FAST_DEADLINE_MS;
  const s = initAskGraphState(query, tree, deps);
  const base = (over: Partial<AskResult>): AskResult => ({ verdict: "incorrect", reason: "", scored: [], web_used: false,
    insufficient_coverage: true, sources: { internal: [], web: [] }, ...over });
  const run = async (): Promise<AskV2Result> => {
    s.trace.push("retrieve");
    const lexicalIds = options.treeLexicalIds?.(query, tree) ?? [];
    const lexicalNodes = lexicalIds.length ? deps.treeSearchFn(tree, lexicalIds) : [];
    const rank = new Map(lexicalIds.map((id, i) => [id, i] as const));
    s.candidates = await gatherCandidates(s, [...lexicalNodes].sort((a, b) => (rank.get(a.node_id) ?? 0) - (rank.get(b.node_id) ?? 0)), options.topK ?? 5);
    let web: WebSource[] = [];
    s.boundedSources = deps.sourceContext ? boundedSourcesOf(s.candidates, []) : [];
    if (deps.sourceContext ? !s.boundedSources.length : !s.candidates.length) {
      s.candidates = [];
      if (deps.tavilySearchFn) {
        try {
          web = await deps.tavilySearchFn(query);
          const kind = web.length ? "ask.web_fallback" : "ask.web_fallback_empty";
          await recordJob({ tenantId: deps.tenantId, kind, status: web.length ? "done" : "failed", ...(web.length ? {} : { error: "web search returned no evidence" }) }, deps.write);
          s.auditLog.push({ jobKind: kind, step: web.length ? "web_fallback" : "web_fallback_unavailable: web search returned no evidence" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordJob({ tenantId: deps.tenantId, kind: "ask.web_fallback_unavailable", status: "failed", error: message }, deps.write);
          s.auditLog.push({ jobKind: "ask.web_fallback_unavailable", step: `web_fallback_unavailable: ${message}` });
        }
      }
      if (!web.length) {
        return { ...base({ reason: "no supported internal source was retrieved for this question" }), auditLog: s.auditLog,
          answer: "No supported internal source was retrieved for this question, and web search is unavailable or returned no evidence." };
      }
      s.boundedSources = deps.sourceContext ? boundedSourcesOf([], web) : [];
    }
    s.askResult = base({ verdict: web.length ? "incorrect" : "correct", web_used: web.length > 0, insufficient_coverage: false,
      reason: web.length ? "internal retrieval was empty; answered from web fallback (fast path, no LLM scoring)"
        : "fast path: top-k retrieval and one grounded answer; candidates are not LLM-scored",
      sources: { internal: s.candidates.map(internalSource), web } });
    s.refinedContext = deps.sourceContext ? JSON.stringify(contextStrips(s.boundedSources))
      : [...s.candidates.map((n) => n.summary), ...web.map((w) => String(w.content ?? w.snippet ?? ""))].join(" ");
    s.trace.push("answer");
    await ASK_GRAPH.find((n) => n.name === "answer")!.run(s);
    // F4: ship only what the answer cites. The bounded answer reports the source ids its kept sentences cite; an uncited
    // retrieved chunk must neither be shipped as a source nor be judged by the freshness verifier.
    const cited = s.citedSourceIds;
    if (cited && s.result) {
      const ids = new Set(cited);
      const internal = s.candidates.filter((n) => sourceQuotes(n).some((q) => ids.has(q.id))).map(internalSource);
      const webCited = web.filter((_w, i) => ids.has(`web-${i}`));
      s.result = { ...s.result, sources: { internal, web: webCited } };
    }
    return s.result!;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = run();
  pending.catch(() => {}); // a run that loses the race must not become an unhandled rejection
  const deadline = new Promise<"deadline">((resolve) => { timer = setTimeout(() => resolve("deadline"), deadlineMs); });
  try {
    const won = await Promise.race([pending, deadline]);
    if (won !== "deadline") return won;
    s.auditLog.push({ jobKind: "ask.fast_deadline", step: `deadline exceeded after ${deadlineMs} ms; degraded answer returned` });
    return { ...base({ reason: `deadline exceeded after ${deadlineMs} ms` }), auditLog: s.auditLog,
      answer: "This question took longer than the time limit to answer. Retry, or ask again with filters.mode \"deep\" for the slower multi-step search." };
  } catch (err) { throw await askFailure(err, deps); }
  finally { if (timer) clearTimeout(timer); }
}
