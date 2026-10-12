/**
 * packages/ask/src/ask-graph.test.ts — T-050 /ask graph. Golden equivalence: for each scenario,
 * `askV2` and `askGraphV2` run on SEPARATE fresh fakes and must agree on the result (answer,
 * citations, audit log), every recordJob write, and every provider call. Fakes only; no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { TreeIndexNode } from "@lkb/core";
import type { ScoreFn } from "./evaluator.js";
import type { CompleteFn } from "./select-nodes.js";
import { fakeComplete, fakeWrite, fakeTreeSearch } from "./testUtils.js";
import { askV2, type AskV2Deps } from "./ask-v2.js";
import { BoundedAskError, type SourceQuote } from "./source-context.js";
import { ASK_GRAPH, askGraphV2, initAskGraphState, runAskGraphNodes } from "./ask-graph.js";

const TREE: TreeIndexNode = {
  node_id: "tenant:t1", title: "t1", level: "tenant", summary: "",
  children: [
    { node_id: "tenant:t1/session:a", title: "A", level: "session", summary: "Apples are red.", evidence: [{ turn_id: "tenant:t1/turn:1" }], children: [] } as unknown as TreeIndexNode,
    { node_id: "tenant:t1/session:b", title: "B", level: "session", summary: "Oranges are orange.", children: [] },
  ],
};
const A = TREE.children[0]!;
const B = TREE.children[1]!;
const scores = (m: Record<string, number>): ScoreFn => (_q, node) => m[node.node_id]!;

interface Rig { deps: AskV2Deps; writes: () => unknown[]; calls: () => unknown[]; }

function plain(
  responses: Parameters<typeof fakeComplete>,
  sc: Record<string, number>,
  extra: Partial<AskV2Deps> = {},
): Rig {
  const complete = fakeComplete(...responses);
  const write = fakeWrite();
  return {
    deps: { complete, scoreFn: scores(sc), treeSearchFn: fakeTreeSearch, write, tenantId: "t1", ...extra },
    writes: () => write.writes.map(({ createdAt: _c, ...rest }) => rest),
    calls: () => complete.calls,
  };
}

// ---- bounded (sourceContext) fixture, mirrors bounded-ask.test.ts ----
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const bnode: TreeIndexNode = { node_id: "tenant:t/session:s", title: "Visa session", level: "session", summary: "PRIVATE ".repeat(50),
  evidence: { sessionRef: "s" }, children: [] } as unknown as TreeIndexNode;
const btree: TreeIndexNode = { node_id: "tenant:t", title: "T", level: "tenant", summary: bnode.summary, children: [bnode] };
const snapshot = sha("frozen");
const quote: SourceQuote = { id: "q1", nodeId: bnode.node_id, sessionRef: "s", turnId: "s-t1", speakerRef: "spk:0", tStart: 10, tEnd: 20,
  charStart: 0, charEnd: 21, byteStart: 0, byteEnd: 21, turnTextSHA256: sha("Visa requires a form."), sliceSHA256: sha("Visa requires a form."),
  quote: "Visa requires a form.", origin: "speech" };
const jres = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
function bounded(o: { score?: number; attack?: string } = {}, extra: Partial<AskV2Deps> = {}): Rig {
  const calls: string[] = [];
  const writes: unknown[] = [];
  const complete: CompleteFn = async (job) => {
    calls.push(job.kind);
    if (job.kind === "ask.select_nodes") return jres({ node_ids: [bnode.node_id] });
    if (job.kind === "ask.refine_batch") {
      const strips = JSON.parse(job.messages[1]!.content).strips;
      return jres({ decisions: strips.map((s: { id: string }) => ({ id: s.id, keep: true })) });
    }
    if (job.kind === "ask.answer_grounding") return jres({ decisions: [{ id: o.attack === "judge-unknown" ? "ghost" : "sentence-0", supported: o.attack !== "unsupported", answersQuery: true }] });
    return jres({ sentences: [{ text: "The source says a visa requires a form.", sourceIds: [o.attack === "source-unknown" ? "foreign" : "q1"] }] });
  };
  return {
    deps: {
      complete, scoreFn: () => [o.score ?? 0.9, "offline structural fixture"], tenantId: "t",
      treeSearchFn: (_r, ids) => (ids.includes(bnode.node_id) ? [bnode] : []),
      write: async (job) => { const { createdAt: _c, ...rest } = job as unknown as Record<string, unknown>; writes.push(rest); },
      sourceContext: { hydrate: async () => ({ nodes: [{ ...bnode, summary: JSON.stringify([quote]), children: [],
        evidence: { sessionRef: "s", sourceQuotes: [quote], sourceSnapshotSHA256: snapshot } } as unknown as TreeIndexNode],
        snapshotSHA256: snapshot, sourceBytes: 100 }) },
      ...extra,
    },
    writes: () => writes, calls: () => calls,
  };
}

type Scenario = { name: string; tree: TreeIndexNode; query: string; make: () => Rig };
const S: Scenario[] = [
  { name: "correct verdict", tree: TREE, query: "what color are apples?",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.9 }, { webFallbackFn: () => { throw new Error("no web"); } }) },
  { name: "ambiguous: refine + sync web fallback", tree: TREE, query: "what color are apples?",
    make: () => plain([{ json: { node_ids: [A.node_id, B.node_id] } }, { json: { keep: true } }, { json: { keep: false } }, { text: "Final answer" }],
      { [A.node_id]: 0.5, [B.node_id]: 0.1 }, { webFallbackFn: () => [{ content: "Bananas are yellow." }] }) },
  { name: "tavily fills the gap", tree: TREE, query: "q",
    make: () => plain([{ json: { node_ids: [B.node_id] } }, { json: { keep: true } }, { text: "Final answer" }], { [B.node_id]: 0.05 },
      { tavilySearchFn: async () => [{ content: "Real web result." }] }) },
  { name: "tavily throws", tree: TREE, query: "q",
    make: () => plain([{ json: { node_ids: [B.node_id] } }, { text: "Final answer" }], { [B.node_id]: 0.05 },
      { tavilySearchFn: async () => { throw new Error("no key"); } }) },
  { name: "no tavily, insufficient coverage", tree: TREE, query: "q",
    make: () => plain([{ json: { node_ids: [B.node_id] } }, { text: "Final answer" }], { [B.node_id]: 0.05 }) },
  { name: "extra arm surfaces a node", tree: TREE, query: "oranges?",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.1, [B.node_id]: 0.9 },
      { extraCandidateArmsFn: async () => ({ arms: [[B]], degraded: null }) }) },
  { name: "degraded arm", tree: TREE, query: "apples?",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.9 },
      { extraCandidateArmsFn: async () => ({ arms: [], degraded: "vector: embedding failed" }) }) },
  { name: "ghost tenant node from arm is dropped", tree: TREE, query: "apples?",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.9 },
      { extraCandidateArmsFn: async () => ({ arms: [[{ node_id: "tenant:t9/session:GHOST", title: "G", level: "session", summary: "x", children: [] }]], degraded: null }) }) },
  { name: "poisoned node with real id is replaced", tree: TREE, query: "oranges?",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.1, [B.node_id]: 0.9 },
      { extraCandidateArmsFn: async () => ({ arms: [[{ ...B, summary: "POISONED", evidence: [{ turn_id: "tenant:t9/turn:X" }] } as unknown as TreeIndexNode]], degraded: null }) }) },
  { name: "score exactly at lower threshold is kept", tree: TREE, query: "q",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { json: { keep: true } }, { text: "Final answer" }], { [A.node_id]: 0.3 }, { webFallbackFn: () => [{ content: "w" }] }) },
  { name: "bounded correct",tree: btree, query: "visa form", make: () => bounded() },
  { name: "bounded ambiguous + tavily unavailable", tree: btree, query: "visa form",
    make: () => bounded({ score: 0.5 }, { tavilySearchFn: async () => { throw new Error("Tavily not configured"); } }) },
  { name: "bounded empty web early return", tree: btree, query: "off-corpus",
    make: () => bounded({ score: 0.1 }, { tavilySearchFn: async () => [] }) },
  { name: "bounded poisoned arm", tree: btree, query: "visa form",
    make: () => bounded({}, { extraCandidateArmsFn: async () => ({ arms: [[{ ...bnode, summary: "FOREIGN", evidence: { sessionRef: "foreign" } } as unknown as TreeIndexNode]], degraded: null }) }) },
];

async function settle(f: () => Promise<unknown>): Promise<{ ok: true; value: unknown } | { ok: false; name: string; message: string }> {
  try { return { ok: true, value: await f() }; }
  catch (e) { return { ok: false, name: (e as Error).constructor.name, message: (e as Error).message }; }
}

for (const sc of S) {
  test(`golden: ${sc.name} - graph output, writes and provider calls equal askV2`, async () => {
    const a = sc.make(); const b = sc.make();
    const old = await askV2(sc.query, sc.tree, a.deps);
    const neu = await askGraphV2(sc.query, sc.tree, b.deps);
    assert.deepEqual(neu, old);
    assert.equal(JSON.stringify(neu), JSON.stringify(old), "byte-identical serialisation");
    assert.deepEqual(b.writes(), a.writes());
    assert.deepEqual(b.calls(), a.calls());
  });
}

for (const attack of ["source-unknown", "judge-unknown", "unsupported"]) {
  test(`golden: bounded refusal ${attack} - same error and same refusal write`, async () => {
    const a = bounded({ attack }); const b = bounded({ attack });
    const old = await settle(() => askV2("visa form", btree, a.deps));
    const neu = await settle(() => askGraphV2("visa form", btree, b.deps));
    assert.deepEqual(neu, old);
    assert.equal(old.ok, false);
    assert.deepEqual(b.writes(), a.writes());
  });
}

test("golden: heuristic-degraded evaluator refuses identically, before answer", async () => {
  const mk = () => bounded({}, { scoreFn: () => [1, "llm judge call failed: failed, fell back to heuristic"] });
  const a = mk(); const b = mk();
  const old = await settle(() => askV2("visa form", btree, a.deps));
  const neu = await settle(() => askGraphV2("visa form", btree, b.deps));
  assert.deepEqual(neu, old);
  assert.deepEqual(b.calls(), ["ask.select_nodes"]);
  assert.deepEqual(b.writes(), a.writes());
});

test("node failure (legacy mode) surfaces as the SAME unwrapped error, per node", async () => {
  const failures: Array<[string, () => Rig]> = [
    ["retrieve", () => plain([{ json: { node_ids: [A.node_id] } }], { [A.node_id]: 0.9 }, { treeSearchFn: () => { throw new Error("boom-retrieve"); } })],
    ["evaluate", () => plain([{ json: { node_ids: [A.node_id] } }], { [A.node_id]: 0.9 }, { scoreFn: () => { throw new Error("boom-evaluate"); } })],
    ["refine", () => plain([{ json: { node_ids: [A.node_id] } }, () => { throw new Error("boom-refine"); }], { [A.node_id]: 0.5 })],
    ["answer", () => plain([{ json: { node_ids: [A.node_id] } }, () => { throw new Error("boom-answer"); }], { [A.node_id]: 0.9 })],
  ];
  for (const [label, mk] of failures) {
    const a = mk(); const b = mk();
    const old = await settle(() => askV2("q", TREE, a.deps));
    const neu = await settle(() => askGraphV2("q", TREE, b.deps));
    assert.equal(old.ok, false, label);
    assert.deepEqual(neu, old, label);
    assert.match((neu as { message: string }).message, new RegExp(`boom-${label}`), label);
    assert.deepEqual(b.writes(), a.writes(), label);
  }
});

test("graph shape: 4 nodes in order; early return skips the answer node", async () => {
  assert.deepEqual(ASK_GRAPH.map((n) => n.name), ["retrieve", "evaluate", "refine", "answer"]);
  const full = plain([{ json: { node_ids: [A.node_id] } }, { text: "x" }], { [A.node_id]: 0.9 });
  const st = initAskGraphState("q", TREE, full.deps);
  await runAskGraphNodes(ASK_GRAPH, st);
  assert.deepEqual(st.trace, ["retrieve", "evaluate", "refine", "answer"]);
  const early = bounded({ score: 0.1 }, { tavilySearchFn: async () => [] });
  const st2 = initAskGraphState("q", btree, early.deps);
  await runAskGraphNodes(ASK_GRAPH, st2);
  assert.deepEqual(st2.trace, ["retrieve", "evaluate", "refine"]);
  assert.ok(!early.calls().includes("ask.answer"));
});

test("tenant scoping: every write carries the request tenantId; foreign-tenant arm nodes never become citations", async () => {
  const ghost = { node_id: "tenant:t9/session:GHOST", title: "G", level: "session", summary: "foreign", children: [] } as TreeIndexNode;
  const rig = plain([{ json: { node_ids: [A.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.9 },
    { extraCandidateArmsFn: async () => ({ arms: [[ghost]], degraded: null }) });
  const r = await askGraphV2("apples?", TREE, rig.deps);
  assert.ok(r.sources.internal.every((s) => JSON.stringify(s).indexOf("t9") === -1), "no foreign citation");
  assert.ok(rig.writes().length > 0);
  assert.ok(rig.writes().every((w) => (w as { tenantId: string }).tenantId === "t1"));
  assert.ok(r.auditLog.some((e) => e.jobKind === "ask.candidates_dropped"));
});
