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
import { AnswerAbstainError, sourceQuotes, isNativeSourceQuote, type LiveSourceTurn, type SourceQuote } from "./source-context.js";
import { AnswerHoldError, conditionHold, evidenceTurns, wholeTurnSources, type EvidenceTurn } from "./answer.js";
import type { AskV2Deps, AskV2Result } from "./ask-shared.js";
export type { AuditEntry, AskV2Deps, AskV2Result } from "./ask-shared.js";

/** F1 (ask-condition-fidelity): the existing hold path. "ambiguous" + insufficient coverage is what the answer policy routes to
 * review; the workflow then stores the candidate in state review and publishes an empty answer (C3). The reason never quotes
 * the held answer. */
function holdForReview(result: AskV2Result, why: string): AskV2Result {
  return { ...result, verdict: "ambiguous", insufficient_coverage: true, reason: `held for review: ${why}`,
    auditLog: [...result.auditLog, { jobKind: "ask.condition_held", step: `condition_held: ${why}` }] };
}
/** Transcript quotes of hydrated or released internal sources (native passages have no speaker turn). */
function transcriptQuotes(nodes: { evidence?: unknown }[]): SourceQuote[] {
  return nodes.flatMap((n) => {
    const quotes = (n.evidence as { sourceQuotes?: unknown } | undefined)?.sourceQuotes;
    return Array.isArray(quotes) ? (quotes as Parameters<typeof isNativeSourceQuote>[0][]).filter((q): q is SourceQuote => !!q && !isNativeSourceQuote(q)) : [];
  });
}
/** Hydration observer: records the live turn text a hydrator supplies (SourceHydration.liveTurns) without changing the result. */
function observeHydration(deps: AskV2Deps): { deps: AskV2Deps; liveTurns: () => LiveSourceTurn[] | undefined } {
  let live: LiveSourceTurn[] | undefined;
  const sc = deps.sourceContext;
  if (!sc) return { deps, liveTurns: () => undefined };
  return { deps: { ...deps, sourceContext: { ...sc, hydrate: async (q, nodes) => { const h = await sc.hydrate(q, nodes); live = h.liveTurns; return h; } } },
    liveTurns: () => live };
}

/**
 * ISS-T050ASKGRAPH-002: `askV2` no longer carries its own copy of the pipeline. The retrieve ->
 * evaluate -> refine -> answer node functions live in ./ask-graph.ts and are the ONLY implementation;
 * this is the production entry point over them (public signature, outputs, writes and provider calls
 * unchanged — pinned by ask-graph.baseline.json and the ask-v2/bounded-ask suites). Bounded refusals
 * are explicit and recorded; legacy callers retain their original behavior (see askGraphV2).
 */
export async function askV2(query: string, tree: TreeIndexNode, deps: AskV2Deps): Promise<AskV2Result> {
  if (!deps.sourceContext) return askGraphV2(query, tree, deps);
  // F1 deep gate: the graph's refine/answer nodes (ask-graph.ts) are unchanged; the released answer is checked against the
  // cited turns (whole when the hydrator proves them) and held for review when it drops a stated condition.
  const observed = observeHydration(deps);
  const result = await askGraphV2(query, tree, observed.deps);
  if (result.web_used || result.insufficient_coverage || !result.answer.trim()) return result;
  const why = conditionHold(result.answer, evidenceTurns(transcriptQuotes(result.sources.internal), observed.liveTurns()).map((t) => t.text));
  return why ? holdForReview(result, why) : result;
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
  const observed = observeHydration(deps);
  const guarded: AskV2Deps = { ...observed.deps, complete: async (job) => { alive(); return deps.complete(job); },
    ...(deps.tavilySearchFn ? { tavilySearchFn: async (q: string) => { alive(); return deps.tavilySearchFn!(q); } } : {}) };
  /** F1: the speaker turns behind the bounded sources, and why the answer step held its draft (over-long sentence). */
  let turns: EvidenceTurn[] = [];
  let heldWhy: string | undefined;
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
      if (err instanceof AnswerHoldError) {
        // Held, not refused and not retried on the web: the draft is kept only in the candidate the review path stores.
        s.result = { ...s.askResult!, answer: err.draft.text, auditLog: s.auditLog };
        s.citedSourceIds = err.draft.sourceIds;
        heldWhy = err.reason;
        return true;
      }
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
    // F1-C1: generation reads each cited speaker turn whole (proven by its turn hash), never an excerpt that cuts a sentence.
    if (deps.sourceContext) {
      turns = evidenceTurns(transcriptQuotes(s.candidates), observed.liveTurns());
      s.boundedSources = wholeTurnSources(s.boundedSources, turns);
    }
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
    // F1-C1: citing a whole-turn source cites every hydrated quote of that turn (speaker and start/end time unchanged).
    const citedIds = new Set((cited ?? []).flatMap((id) => turns.find((t) => t.whole && t.quoteIds.includes(id))?.quoteIds ?? [id]));
    if (cited && s.result) {
      const ids = citedIds;
      const internal = s.candidates.flatMap((node) => {
        const quotes = sourceQuotes(node).filter((quote) => ids.has(quote.id));
        if (!quotes.length) return [];
        return [{ node_id: node.node_id, evidence: { ...node.evidence, sourceQuotes: quotes } }];
      });
      const webCited = web.filter((_w, i) => ids.has(`web-${i}`));
      s.result = { ...s.result, sources: { internal, web: webCited } };
    }
    // ISS-AFR-001: sentences the grounding judge dropped mean the answer is only partly supported; the policy reviews "ambiguous".
    const dropped = s.result!.removedSentences ?? 0;
    if (!web.length && dropped > 0) s.result = { ...s.result!, verdict: "ambiguous",
      reason: `${dropped} drafted sentence(s) failed the grounding check and were removed; the remaining answer is only partly supported` };
    // F1-C2/C3 gate (deterministic, no extra call): an answer citing a turn that is not whole, or dropping a condition its
    // cited turn states, is held through the review path; no web retry follows a hold.
    if (heldWhy) s.result = holdForReview(s.result!, heldWhy);
    else if (deps.sourceContext && !web.length && cited) {
      const citedTurns = turns.filter((t) => t.quoteIds.some((id) => citedIds.has(id)));
      const partial = citedTurns.find((t) => !t.whole);
      const why = partial ? `cited turn ${partial.turnId}: ${partial.incomplete}` : conditionHold(s.result!.answer, citedTurns.map((t) => t.text));
      if (why) s.result = holdForReview(s.result!, why);
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
    expired = true; // the orphaned run may finish its in-flight call, but starts no new one
    return { ...base({ reason: `deadline exceeded after ${deadlineMs} ms` }),
      auditLog: [...s.auditLog, { jobKind: "ask.fast_deadline", step: `deadline exceeded after ${deadlineMs} ms; degraded answer returned` }],
      answer: "This question took longer than the time limit to answer. Retry, or ask again with filters.mode \"deep\" for the slower multi-step search." };
  } catch (err) { throw await askFailure(err, deps); }
  finally { if (timer) clearTimeout(timer); }
}
