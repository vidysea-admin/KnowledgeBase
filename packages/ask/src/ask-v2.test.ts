/**
 * packages/ask/src/ask-v2.test.ts — T-005b C5. `askV2` end-to-end on a fixture tree + fake
 * providers: sources.internal/sources.web stay separated (unchanged from T-005) with a
 * non-empty audit-log array, and a verdict-`correct` fixture case skips `refine`/web entirely
 * (T-005's internal-first guarantee still holds through `askV2`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { TreeIndexNode } from "@lkb/core";
import type { ScoreFn } from "./evaluator.js";
import type { WebFallbackFn } from "./router.js";
import { fakeComplete, fakeWrite, fakeTreeSearch } from "./testUtils.js";
import { askV2 } from "./ask-v2.js";

const TREE: TreeIndexNode = {
  node_id: "tenant:t1",
  title: "t1",
  level: "tenant",
  summary: "",
  children: [
    { node_id: "tenant:t1/session:a", title: "A", level: "session", summary: "Apples are red.", children: [] },
    { node_id: "tenant:t1/session:b", title: "B", level: "session", summary: "Oranges are orange.", children: [] },
  ],
};

const fakeScoreFn = (scoresByNodeId: Record<string, number>): ScoreFn =>
  (_query, node) => scoresByNodeId[node.node_id]!;

test("correct verdict: skips refine and web, still logs an audit trail and answers", async () => {
  const complete = fakeComplete(
    { json: { node_ids: ["tenant:t1/session:a"] } }, // selectNodes
    { text: "Final answer" }, // answer
  );
  const write = fakeWrite();
  const webFallback: WebFallbackFn = () => {
    throw new Error("web must not be called on a correct verdict");
  };

  const result = await askV2("what color are apples?", TREE, {
    complete,
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    webFallbackFn: webFallback,
    write,
    tenantId: "t1",
  });

  assert.equal(result.verdict, "correct");
  assert.equal(result.web_used, false);
  assert.deepEqual(result.sources.web, []);
  assert.equal(result.sources.internal.length, 1);
  assert.equal(result.answer, "Final answer");

  assert.ok(result.auditLog.length > 0, "audit log must be non-empty");
  assert.ok(result.auditLog.every((e) => e.step !== "refine"), "correct verdict must skip refine");
  assert.ok(result.auditLog.some((e) => e.step === "select_nodes"));
  assert.ok(result.auditLog.some((e) => e.step === "answer"));
  assert.ok(result.auditLog.some((e) => e.step === "score"));
  assert.equal(complete.calls.length, 2, "only selectNodes + answer should call complete");
  assert.ok(write.writes.length > 0, "every audit entry must also hit recordJob's injected write");
});

test("ambiguous verdict: refines both good_docs and web docs, keeps sources separated", async () => {
  const complete = fakeComplete(
    { json: { node_ids: ["tenant:t1/session:a", "tenant:t1/session:b"] } }, // selectNodes
    { json: { keep: true } }, // refine: "Apples are red." -> kept
    { json: { keep: false } }, // refine: web doc -> dropped
    { text: "Final answer" }, // answer
  );
  const write = fakeWrite();
  const webFallback: WebFallbackFn = () => [{ content: "Bananas are yellow." }];

  const result = await askV2("what color are apples?", TREE, {
    complete,
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.5, "tenant:t1/session:b": 0.1 }),
    treeSearchFn: fakeTreeSearch,
    webFallbackFn: webFallback,
    write,
    tenantId: "t1",
  });

  assert.equal(result.verdict, "ambiguous");
  assert.equal(result.web_used, true);
  assert.equal(result.sources.internal.length, 1, "only node A scored >= lower threshold");
  assert.deepEqual(result.sources.web, [{ content: "Bananas are yellow." }]);

  assert.equal(complete.calls.length, 4, "selectNodes + 2 refine strips + answer");
  const answerPrompt = complete.calls[3]!.messages[0]!.content;
  assert.match(answerPrompt, /Apples are red\./, "kept strip must reach the answer context");
  assert.doesNotMatch(answerPrompt, /Bananas are yellow\./, "dropped strip must not reach the answer context");

  const steps = result.auditLog.map((e) => e.step);
  assert.ok(steps.includes("select_nodes"));
  assert.ok(steps.filter((s) => s === "refine").length === 2);
  assert.ok(steps.filter((s) => s === "score").length === 2);
  assert.ok(steps.includes("answer"));
});

test("insufficient coverage with no sync webFallbackFn: tavilySearchFn fills the real gap (ISS-010)", async () => {
  const complete = fakeComplete(
    { json: { node_ids: ["tenant:t1/session:b"] } }, // selectNodes -- single candidate, scored below lower -> incorrect, good_docs empty
    { json: { keep: true } }, // refine: the tavily doc -> kept
    { text: "Final answer" }, // answer
  );
  const write = fakeWrite();
  let tavilyCalledWith: string | undefined;
  const tavilySearchFn = async (query: string) => {
    tavilyCalledWith = query;
    return [{ content: "Real web result." }];
  };

  const result = await askV2("what color are apples?", TREE, {
    complete,
    scoreFn: fakeScoreFn({ "tenant:t1/session:b": 0.05 }),
    treeSearchFn: fakeTreeSearch,
    // no webFallbackFn -- this is the exact production shape today (apps/api/src/production.ts
    // never wires one), so ask() must come back insufficient_coverage:true before tavilySearchFn
    // is tried.
    tavilySearchFn,
    write,
    tenantId: "t1",
  });

  assert.equal(tavilyCalledWith, "what color are apples?");
  assert.equal(result.verdict, "incorrect");
  assert.equal(result.insufficient_coverage, false, "tavilySearchFn must clear insufficient_coverage");
  assert.equal(result.web_used, true);
  assert.deepEqual(result.sources.web, [{ content: "Real web result." }]);
  assert.ok(result.auditLog.some((e) => e.step === "web_fallback"), "the fallback call must be audited");
  assert.ok(write.writes.some((w) => (w as { kind?: string }).kind === "ask.web_fallback"));
});

test("ISS-274: insufficient coverage + tavilySearchFn that THROWS (e.g. no Tavily key configured) still reaches the fallback path and degrades honestly", async () => {
  // D-041 ruling 2: off-corpus questions must REACH a web search path, not merely have one
  // present. This proves the path is actually invoked and its failure is caught, logged, and
  // never silently turned into a false "resolved" nor left to crash askV2.
  const complete = fakeComplete(
    { json: { node_ids: ["tenant:t1/session:b"] } }, // selectNodes -- scored below lower -> incorrect, good_docs empty
    { text: "Final answer" }, // answer -- no refine call since there are no docs (web fetch failed, internal empty)
  );
  const write = fakeWrite();
  let tavilyCalled = false;
  const tavilySearchFn = async (_query: string): Promise<never> => {
    tavilyCalled = true;
    throw new Error("web fallback unavailable: TAVILY_API_KEY not configured");
  };

  const result = await askV2("what color are apples?", TREE, {
    complete,
    scoreFn: fakeScoreFn({ "tenant:t1/session:b": 0.05 }),
    treeSearchFn: fakeTreeSearch,
    tavilySearchFn,
    write,
    tenantId: "t1",
  });

  assert.equal(tavilyCalled, true, "the fallback path must actually be invoked, not skipped");
  assert.equal(result.insufficient_coverage, true, "a failed fallback must not be reported as resolved coverage");
  assert.equal(result.web_used, false, "no real web result was obtained");
  assert.deepEqual(result.sources.web, [], "no fabricated web source on failure");

  const entry = result.auditLog.find((e) => e.jobKind === "ask.web_fallback_unavailable");
  assert.ok(entry, "the unavailable fallback must be visible in the audit log, not silently swallowed");
  assert.match(entry!.step, /TAVILY_API_KEY not configured/, "the real reason must be in the audit trail");
  assert.ok(!result.auditLog.some((e) => e.jobKind === "ask.web_fallback"), "must not also log a successful fallback");
  assert.ok(
    write.writes.some((w) => (w as { kind?: string; status?: string }).kind === "ask.web_fallback_unavailable" && (w as { status?: string }).status === "failed"),
    "the ledger write must record this as a failed job, not a done one",
  );
});

test("insufficient coverage with no tavilySearchFn provided: behavior is unchanged (byte-identical)", async () => {
  const complete = fakeComplete(
    { json: { node_ids: ["tenant:t1/session:a"] } }, // selectNodes
    { text: "Final answer" }, // answer -- low score means no refine call happens (empty docs)
  );
  const write = fakeWrite();

  const result = await askV2("what color are apples?", TREE, {
    complete,
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.1 }),
    treeSearchFn: fakeTreeSearch,
    write,
    tenantId: "t1",
  });

  assert.equal(result.insufficient_coverage, true);
  assert.equal(result.web_used, false);
  assert.deepEqual(result.sources.web, []);
  assert.ok(!result.auditLog.some((e) => e.step === "web_fallback"));
});

/* ── U1.5 hybrid merge (contract C1/C2/C5) ────────────────────────────────────────────────────
 * The merge lives in the thunk's INPUT, not inside ask(): plan §10 is explicit that ask() already
 * takes candidates via a thunk and is retriever-agnostic, so rewriting it would be scope creep on
 * the one working retrieval path.
 */
test("U1.5: extra arms are merged into the candidates, and a node they surface can be answered from", async () => {
  const write = fakeWrite();
  const result = await askV2("what color are oranges?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } }, // selectNodes returns only session:a
      { text: "Final answer" },
    ),
    // Only session:b scores well — so the answer can only be "correct" if the EXTRA arm's node
    // reached the candidate set. The tree arm alone would fail this.
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.1, "tenant:t1/session:b": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({
      arms: [[TREE.children[1]!]], // a vector arm surfacing session:b
      degraded: null,
    }),
    write,
    tenantId: "t1",
  });
  assert.equal(result.verdict, "correct");
  assert.ok(result.sources.internal.length > 0, "the merged candidate must reach the answer");
});

test("U1.5 / C5: a DEGRADED arm still answers, and the degradation is VISIBLE in the audit log", async () => {
  // This project has shipped three separate silent-degradation bugs. "Answered from fewer arms"
  // and "answered from all arms" must not look identical to an operator.
  const write = fakeWrite();
  const result = await askV2("what color are apples?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [], degraded: "vector: embedding failed" }),
    write,
    tenantId: "t1",
  });
  assert.equal(result.verdict, "correct", "a failed arm must not take /ask down with it");
  const entry = result.auditLog.find((e) => e.jobKind === "ask.retrieval_degraded");
  assert.ok(entry, "a degraded retrieval arm must appear in the audit log");
  assert.match(entry!.step, /embedding failed/, "and must say WHICH arm and why");
});

test("U1.5 / C5: an arm that RAN and found nothing is NOT logged as degraded", async () => {
  // The distinction that matters: empty-but-healthy and failed must be distinguishable, or the
  // audit entry means nothing.
  const write = fakeWrite();
  const result = await askV2("what color are apples?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }),
    write,
    tenantId: "t1",
  });
  assert.equal(result.auditLog.find((e) => e.jobKind === "ask.retrieval_degraded"), undefined,
    "an empty-but-healthy arm must not be reported as a failure");
});

test("U1.5: with NO extraCandidateArmsFn, behaviour is unchanged (the tavilySearchFn precedent)", async () => {
  const write = fakeWrite();
  const result = await askV2("what color are apples?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    write,
    tenantId: "t1",
  });
  assert.equal(result.verdict, "correct");
  assert.equal(result.auditLog.find((e) => e.jobKind === "ask.retrieval_degraded"), undefined);
});

test("ISS-157 / C2: a node an ARM invents can never become a citation", async () => {
  // The checker fabricated `tenant:t9/session:GHOST`, watched it come back in sources.internal,
  // and all 45 tests stayed green. ask() builds an internal source from whatever the thunk yields
  // and performs no membership check; rrfMerge is generic over T so it structurally cannot.
  //
  // Note the ghost carries a FOREIGN TENANT prefix — this is not merely a hygiene guard. A
  // retrieval arm is exactly the kind of thing that will later be fed by a vector index over rows
  // another tenant wrote, and the contract's own invariant is that tenant scoping is never a
  // property of the caller behaving well.
  const write = fakeWrite();
  const GHOST = { node_id: "tenant:t9/session:GHOST", title: "Ghost", level: "session", summary: "Not in this tree.", children: [] } as TreeIndexNode;
  const result = await askV2("what color are apples?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.9, "tenant:t9/session:GHOST": 0.99 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [[GHOST]], degraded: null }),
    write,
    tenantId: "t1",
  });
  const cited = result.sources.internal.map((s) => JSON.stringify(s));
  assert.ok(!cited.some((c) => c.includes("GHOST")),
    `a fabricated node reached the citations: ${cited.join(" | ")}`);
  assert.equal(result.verdict, "correct", "and the real candidate must still answer");
});

test("ISS-157 / C2: the guard does not drop LEGITIMATE arm nodes that are in the tree", async () => {
  // The guard must not be a blanket "ignore the extra arms" — that would pass the ghost test while
  // silently disabling the whole feature, which is the cheaper wrong fix.
  const write = fakeWrite();
  const result = await askV2("what color are oranges?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.1, "tenant:t1/session:b": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [[TREE.children[1]!]], degraded: null }),
    write,
    tenantId: "t1",
  });
  assert.equal(result.verdict, "correct", "a real node from an arm must still reach the answer");
});

test("ISS-158 / C2: a fabricated node wearing a REAL node_id cannot poison the citation", async () => {
  // The cycle-2 bypass, and the sharper version of the ghost attack. The guard filtered on the id
  // STRING, so an arm supplying a real-but-unselected node_id kept ITS OWN object — and router.ts
  // copies node.evidence verbatim, so a poisoned summary and ANOTHER TENANT'S turn_id reached the
  // answer context with all 47 tests green.
  //
  // Checking that an id is known says nothing about the object carrying it. An arm's job is to say
  // WHICH nodes are relevant; it has no authority over what those nodes CONTAIN.
  const write = fakeWrite();
  const POISONED = {
    node_id: "tenant:t1/session:b", // a REAL id that selectNodes did not return
    title: "B",
    level: "session",
    summary: "POISONED SUMMARY injected by a retrieval arm.",
    evidence: [{ turn_id: "tenant:t9/turn:X", sessionId: "t9" }],
    children: [],
  } as unknown as TreeIndexNode;

  const result = await askV2("what color are oranges?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.1, "tenant:t1/session:b": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [[POISONED]], degraded: null }),
    write,
    tenantId: "t1",
  });

  const cited = JSON.stringify(result.sources.internal);
  assert.ok(!cited.includes("POISONED"), `the arm's fabricated summary reached the citation: ${cited}`);
  assert.ok(!cited.includes("tenant:t9"), `another tenant's evidence reached the citation: ${cited}`);
  // and the REAL node behind that id must still be usable — this is a resolve, not a rejection.
  assert.equal(result.verdict, "correct");
});

test("ISS-159: candidates dropped by the membership guard are REPORTED, not dropped silently", async () => {
  // Dropping them silently sat four lines below the code that exists to make a degraded run
  // distinguishable from a healthy one. An arm that keeps proposing unknown nodes is a broken arm.
  const write = fakeWrite();
  const GHOST = { node_id: "tenant:t9/session:GHOST", title: "G", level: "session", summary: "x", children: [] } as TreeIndexNode;
  const result = await askV2("what color are apples?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [[GHOST]], degraded: null }),
    write,
    tenantId: "t1",
  });
  const entry = result.auditLog.find((e) => e.jobKind === "ask.candidates_dropped");
  assert.ok(entry, "a dropped candidate must be visible in the audit log");
  assert.match(entry!.step, /1 candidate/);
});

test("ISS-159: a clean run reports NO drops — the entry must mean something", async () => {
  const write = fakeWrite();
  const result = await askV2("what color are oranges?", TREE, {
    complete: fakeComplete(
      { json: { node_ids: ["tenant:t1/session:a"] } },
      { text: "Final answer" },
    ),
    scoreFn: fakeScoreFn({ "tenant:t1/session:a": 0.1, "tenant:t1/session:b": 0.9 }),
    treeSearchFn: fakeTreeSearch,
    extraCandidateArmsFn: async () => ({ arms: [[TREE.children[1]!]], degraded: null }),
    write,
    tenantId: "t1",
  });
  assert.equal(result.auditLog.find((e) => e.jobKind === "ask.candidates_dropped"), undefined);
});
