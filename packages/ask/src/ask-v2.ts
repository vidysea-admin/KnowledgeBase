/**
 * packages/ask/src/ask-v2.ts — T-005b C4. Composes `selectNodes -> evaluate (via T-005's
 * existing `ask()`) -> refine -> answer`, logging every external call (selectNodes' LLM call,
 * each refine strip call, the answer call, and the evaluator's per-candidate score_fn call) via
 * T-019's `recordJob`. Does NOT replace `./evaluator.ts` / `./router.ts` — `ask()` stays the
 * lower-level primitive this builds on; imported and called, never reimplemented.
 */
import type { TreeIndexNode } from "@lkb/core";
import type { WriteJobFn } from "@lkb/ai";
import { recordJob } from "@lkb/ai";

import { ask, type AskResult, type WebFallbackFn, type WebSource } from "./router.js";
import { LOWER_THRESHOLD, UPPER_THRESHOLD, type ScoreFn } from "./evaluator.js";
import { selectNodes, type CompleteFn, type NodeSearchFn } from "./select-nodes.js";
import { rrfMerge } from "./merge.js";
import { refine, type RefinableDoc } from "./refine.js";
import { answer as generateAnswer } from "./answer.js";

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

function webDocText(source: WebSource): string {
  return ["title", "snippet", "content", "text"]
    .map((key) => source[key])
    .filter((v): v is string => typeof v === "string")
    .join(". ");
}

/** Every node_id in this tenant's loaded tree. Local and trivial — `packages/ask` may not import
 * `packages/index` (contract C10), and a membership set does not need a tree library. */
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

export async function askV2(query: string, tree: TreeIndexNode, deps: AskV2Deps): Promise<AskV2Result> {
  const { complete, scoreFn, treeSearchFn, webFallbackFn, tavilySearchFn, extraCandidateArmsFn, write, tenantId } = deps;
  const upper = deps.upper ?? UPPER_THRESHOLD;
  const lower = deps.lower ?? LOWER_THRESHOLD;
  const auditLog: AuditEntry[] = [];

  const loggingComplete = (step: string): CompleteFn => async (job) => {
    const completion = await complete(job);
    await recordJob(
      { tenantId, kind: `ask.${step}`, status: "done", provider: completion.provider, model: completion.model },
      write,
    );
    auditLog.push({
      jobKind: `ask.${step}`,
      step,
      provider: completion.provider,
      model: completion.model,
      costUsd: completion.costUsd,
    });
    return completion;
  };

  const treeCandidates = await selectNodes(query, tree, loggingComplete("select_nodes"), treeSearchFn);

  // U1.5 hybrid merge. It lives HERE, in the thunk's input, and deliberately not inside `ask()`:
  // plan §10 is explicit that `ask()` already takes candidates via a thunk and is therefore
  // retriever-agnostic, so rewriting it would be scope creep on the one working retrieval path
  // (contract C1 — `router.ts` and `evaluator.ts` must stay byte-unchanged).
  let candidates = treeCandidates;
  if (extraCandidateArmsFn) {
    // The tree is passed so an arm can map its own id vocabulary (a vector arm knows sessionIds,
    // not node_ids) without duplicating buildTree's path convention — one definition, not two that
    // agree until someone edits one. The arm may return sparse `{node_id}` placeholders: the
    // resolution step below substitutes the tree's real node regardless (ISS-158).
    const extra = await extraCandidateArmsFn(query, tree);
    // A degraded arm is REPORTED, never silently absent (contract C5). This project has shipped
    // three separate silent-degradation bugs; "answered from fewer arms" and "answered from all
    // arms" must not look identical to an operator reading the audit log.
    if (extra.degraded) {
      await recordJob({ tenantId, kind: "ask.retrieval_degraded", status: "done" }, write);
      auditLog.push({ jobKind: "ask.retrieval_degraded", step: extra.degraded });
    }
    // The tree arm goes FIRST: on a tie its node is the representative, and it is the one carrying
    // the `summary` the refine step reads without a second lookup.
    const merged = rrfMerge([treeCandidates, ...extra.arms], { keyOf: (n: TreeIndexNode) => n.node_id });
    // MEMBERSHIP GUARD (ISS-157, contract C2). Without it, ANY node an arm supplies becomes a
    // citation — a checker fabricated `tenant:t9/session:GHOST`, watched it come back in
    // `sources.internal`, and the whole suite stayed green. `ask()` builds an internal source from
    // whatever the thunk yields and performs no membership check, and `rrfMerge` is generic over
    // `T` so it structurally cannot perform one.
    //
    // Deliberately NOT treated as the caller's obligation: the ghost carried a foreign TENANT
    // prefix, and this contract's own invariant is that tenant scoping is never a property of the
    // caller behaving well. A retrieval arm is exactly the kind of thing that will later be fed by
    // a vector index over rows another tenant wrote.
    // RESOLVE, do not merely filter (ISS-158). Filtering on the id STRING let a fabricated node
    // wearing a REAL node_id survive as its own object — and `router.ts` copies `node.evidence`
    // verbatim into the citation, so a poisoned summary and another tenant's `turn_id` reached the
    // answer context with the whole suite green. Checking that an id is known says nothing about
    // the object carrying it.
    //
    // The tree's own node is therefore substituted for whatever the arm supplied. An arm's job is
    // to say WHICH nodes are relevant; it has no authority over what those nodes CONTAIN.
    const byId = collectNodesById(tree);
    const resolved = merged.map((n) => byId.get(n.node_id)).filter((n): n is TreeIndexNode => n !== undefined);
    // Dropped candidates are REPORTED (ISS-159). Dropping them silently sat four lines below the
    // code that exists to make a degraded run distinguishable from a healthy one — an arm that
    // keeps proposing unknown nodes is a broken arm, and it must not look like a quiet one.
    const dropped = merged.length - resolved.length;
    if (dropped > 0) {
      await recordJob({ tenantId, kind: "ask.candidates_dropped", status: "done" }, write);
      auditLog.push({ jobKind: "ask.candidates_dropped", step: `${dropped} candidate(s) not in this tenant's tree` });
    }
    candidates = resolved;
  }
  // ask() re-scores `candidates` via `scoreFn` internally (T-005's evaluate()) — reused here, not
  // duplicated. Each candidate's node comes back on `scored[].node`, still the full node object
  // selectNodes/treeSearch resolved (with `summary`), so refine below needs no second lookup.
  let askResult = await ask(query, tree, () => candidates, scoreFn, webFallbackFn, upper, lower);

  // ISS-010 / ISS-274: real async web-search fallback, layered on top of router.ts (never inside
  // it — see AskV2Deps.tavilySearchFn doc). Only reachable when the sync webFallbackFn path
  // didn't already cover it (insufficient_coverage is true exactly when verdict != correct AND no
  // webFallbackFn fired), so this and the sync path never both run for the same query.
  //
  // ISS-274 / D-041 ruling 2: the seam must be REACHED on every off-corpus question, not merely
  // present. tavilySearchFn can now throw (no TAVILY_API_KEY configured -> TavilyUnavailableError,
  // or a real Tavily HTTP/network failure) instead of always resolving. Either case degrades
  // HONESTLY and OBSERVABLY: caught here, logged via a distinct `ask.web_fallback_unavailable`
  // audit entry (status "failed", the real error message attached), and insufficient_coverage is
  // left exactly as ask() computed it — never flipped to a false "resolved" and never left to
  // crash the whole /ask request.
  if (askResult.insufficient_coverage && tavilySearchFn) {
    try {
      const webResults = await tavilySearchFn(query);
      await recordJob({ tenantId, kind: "ask.web_fallback", status: "done" }, write);
      auditLog.push({ jobKind: "ask.web_fallback", step: "web_fallback" });
      askResult = { ...askResult, web_used: true, insufficient_coverage: false, sources: { ...askResult.sources, web: webResults } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordJob({ tenantId, kind: "ask.web_fallback_unavailable", status: "failed", error: message }, write);
      auditLog.push({ jobKind: "ask.web_fallback_unavailable", step: `web_fallback_unavailable: ${message}` });
      // insufficient_coverage / web_used are deliberately left unchanged: the fallback was
      // reached and failed, which is not the same claim as "there was nothing to fall back to".
    }
  }

  for (const s of askResult.scored) {
    await recordJob({ tenantId, kind: "ask.score", status: "done" }, write);
    auditLog.push({ jobKind: "ask.score", step: "score" });
  }

  const goodDocNodes: TreeIndexNode[] = askResult.scored
    .filter((s) => s.score >= lower)
    .map((s) => s.node);

  let refinedContext: string;
  if (askResult.verdict === "correct") {
    // Internal-first guarantee holds through askV2 too: no refine, no web, on a correct verdict.
    refinedContext = goodDocNodes.map((n) => n.summary).join(" ");
  } else {
    const docs: RefinableDoc[] = [
      ...goodDocNodes.map((n) => ({ text: n.summary })),
      ...askResult.sources.web.map((w) => ({ text: webDocText(w) })),
    ];
    refinedContext = await refine(docs, query, loggingComplete("refine"));
  }

  const answerResult = await generateAnswer(query, refinedContext, askResult.sources, loggingComplete("answer"));

  return { ...askResult, answer: answerResult.text, auditLog };
}
