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
import { AnswerAbstainError, sourceQuotes } from "./source-context.js";
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
 * refine. `askV2` (the multi-step graph) is untouched and reached with `filters.mode = "deep"`. Response shape is `AskV2Result`;
 * `scored` is empty because nothing is LLM-scored here.
 *
 * ask-trust (ISS-AFR-001..004): the verdict comes from the grounding check (sentences it dropped make it "ambiguous", which the
 * answer policy routes to review). Web search runs when retrieval is empty OR when the retrieved sources could not support an
 * answer (the model abstained or the judge rejected every sentence); if that also fails the result is an honest
 * insufficient-coverage answer, never a thrown refusal. After the deadline the orphaned run starts no further provider call and
 * the returned auditLog is a snapshot.
 */
export async function askFastV2(query: string, tree: TreeIndexNode, deps: AskV2Deps, options: AskFastOptions = {}): Promise<AskV2Result> {
  const deadlineMs = options.deadlineMs ?? FAST_DEADLINE_MS;
  let expired = false;
  const alive = (): void => { if (expired) throw new Error("ask fast path: deadline exceeded"); };
  const guarded: AskV2Deps = { ...deps, complete: async (job) => { alive(); return deps.complete(job); },
    ...(deps.tavilySearchFn ? { tavilySearchFn: async (q: string) => { alive(); return deps.tavilySearchFn!(q); } } : {}) };
  const s = initAskGraphState(query, tree, guarded);
  s.abstainable = true;
  const base = (over: Partial<AskResult>): AskResult => ({ verdict: "incorrect", reason: "", scored: [], web_used: false,
    insufficient_coverage: true, sources: { internal: [], web: [] }, ...over });
  const insufficient = (reason: string, answer: string): AskV2Result => ({ ...base({ reason }), auditLog: s.auditLog, answer });
  const answerNode = ASK_GRAPH.find((n) => n.name === "answer")!;
  /** One answer + grounding round over the current candidates/web. False when the sources could not support an answer. */
  const answerOnce = async (web: WebSource[]): Promise<boolean> => {
    s.askResult = base({ verdict: web.length ? "incorrect" : "correct", web_used: web.length > 0, insufficient_coverage: false,
      reason: web.length ? "internal retrieval could not support an answer; answered from web fallback (fast path, no LLM scoring)"
        : "fast path: top-k retrieval and one grounded answer; candidates are not LLM-scored",
      sources: { internal: s.candidates.map(internalSource), web } });
    s.refinedContext = deps.sourceContext ? JSON.stringify(contextStrips(s.boundedSources))
      : [...s.candidates.map((n) => n.summary), ...web.map((w) => String(w.content ?? w.snippet ?? ""))].join(" ");
    s.trace.push("answer");
    try { await answerNode.run(s); } catch (err) {
      if (!(err instanceof AnswerAbstainError)) throw err;
      s.auditLog.push({ jobKind: "ask.answer_abstained", step: `answer_abstained: ${err.reason}` });
      return false;
    }
    return true;
  };
  const searchWeb = async (): Promise<WebSource[]> => {
    if (!deps.tavilySearchFn) return [];
    let web: WebSource[] = [];
    try {
      web = await guarded.tavilySearchFn!(query);
      const kind = web.length ? "ask.web_fallback" : "ask.web_fallback_empty";
      await recordJob({ tenantId: deps.tenantId, kind, status: web.length ? "done" : "failed", ...(web.length ? {} : { error: "web search returned no evidence" }) }, deps.write);
      s.auditLog.push({ jobKind: kind, step: web.length ? "web_fallback" : "web_fallback_unavailable: web search returned no evidence" });
    } catch (err) {
      alive();
      const message = err instanceof Error ? err.message : String(err);
      await recordJob({ tenantId: deps.tenantId, kind: "ask.web_fallback_unavailable", status: "failed", error: message }, deps.write);
      s.auditLog.push({ jobKind: "ask.web_fallback_unavailable", step: `web_fallback_unavailable: ${message}` });
    }
    return web;
  };
  const run = async (): Promise<AskV2Result> => {
    s.trace.push("retrieve");
    const lexicalIds = options.treeLexicalIds?.(query, tree) ?? [];
    const lexicalNodes = lexicalIds.length ? deps.treeSearchFn(tree, lexicalIds) : [];
    const rank = new Map(lexicalIds.map((id, i) => [id, i] as const));
    s.candidates = await gatherCandidates(s, [...lexicalNodes].sort((a, b) => (rank.get(a.node_id) ?? 0) - (rank.get(b.node_id) ?? 0)), options.topK ?? 5);
    alive();
    s.boundedSources = deps.sourceContext ? boundedSourcesOf(s.candidates, []) : [];
    const haveInternal = deps.sourceContext ? s.boundedSources.length > 0 : s.candidates.length > 0;
    let web: WebSource[] = [];
    let answered = false;
    if (haveInternal) {
      answered = await answerOnce([]);
      if (!answered) s.auditLog.push({ jobKind: "ask.internal_insufficient", step: "retrieved internal sources did not support an answer" });
    }
    if (!answered) {
      s.candidates = [];
      web = await searchWeb();
      if (web.length) {
        s.boundedSources = deps.sourceContext ? boundedSourcesOf([], web) : [];
        answered = await answerOnce(web);
      }
    }
    if (!answered) {
      const why = haveInternal ? "the retrieved internal sources do not support an answer to this question" : "no supported internal source was retrieved for this question";
      return insufficient(why, `${why[0]!.toUpperCase()}${why.slice(1)}, and web search is unavailable or returned no evidence.`);
    }
    // F4: ship only what the answer cites. The bounded answer reports the source ids its kept sentences cite; an uncited
    // retrieved chunk must neither be shipped as a source nor be judged by the freshness verifier.
    const cited = s.citedSourceIds;
    if (cited && s.result) {
      const ids = new Set(cited);
      const internal = s.candidates.filter((n) => sourceQuotes(n).some((q) => ids.has(q.id))).map(internalSource);
      const webCited = web.filter((_w, i) => ids.has(`web-${i}`));
      s.result = { ...s.result, sources: { internal, web: webCited } };
    }
    // ISS-AFR-001: sentences the grounding judge dropped mean the answer is only partly supported; the policy reviews "ambiguous".
    const dropped = s.result!.removedSentences ?? 0;
    if (!web.length && dropped > 0) s.result = { ...s.result!, verdict: "ambiguous",
      reason: `${dropped} drafted sentence(s) failed the grounding check and were removed; the remaining answer is only partly supported` };
    return s.result!;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = run();
  pending.catch(() => {}); // a run that loses the race must not become an unhandled rejection
  const deadline = new Promise<"deadline">((resolve) => { timer = setTimeout(() => resolve("deadline"), deadlineMs); });
  try {
    const won = await Promise.race([pending, deadline]);
    if (won !== "deadline") return won;
    expired = true; // the orphaned run may finish its in-flight call, but starts no new one
    return { ...base({ reason: `deadline exceeded after ${deadlineMs} ms` }),
      auditLog: [...s.auditLog, { jobKind: "ask.fast_deadline", step: `deadline exceeded after ${deadlineMs} ms; degraded answer returned` }],
      answer: "This question took longer than the time limit to answer. Retry, or ask again with filters.mode \"deep\" for the slower multi-step search." };
  } catch (err) { throw await askFailure(err, deps); }
  finally { if (timer) clearTimeout(timer); }
}
