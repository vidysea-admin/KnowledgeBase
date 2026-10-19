/**
 * packages/ask/src/ask-graph.test.ts — T-050 /ask graph. Golden equivalence: for each scenario,
 * `askV2` and `askGraphV2` run on SEPARATE fresh fakes and must agree on the result (answer,
 * citations, audit log), every recordJob write, and every provider call. Fakes only; no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { TreeIndexNode } from "@lkb/core";
import type { ScoreFn } from "./evaluator.js";
import type { CompleteFn } from "./select-nodes.js";
import { fakeComplete, fakeWrite, fakeTreeSearch } from "./testUtils.js";
import { askV2, type AskV2Deps, type AskV2Result } from "./ask-v2.js";
import { BoundedAskError, SOURCE_LIMITS, type SourceQuote } from "./source-context.js";
import { ASK_GRAPH, askGraphV2, initAskGraphState, runAskGraphNodes, runAskLangGraphNodes, officialAskGraphEnabled } from "./ask-graph.js";

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

// ---- ISS-T050ASKGRAPH-001: extra bounded rig (multi-node, web citation, degraded hydrate, throwing complete) ----
const TEXT = "Visa requires a form.";
function mkQuote(i: number, node: TreeIndexNode): SourceQuote {
  return { ...quote, id: `q${i}`, nodeId: node.node_id, sessionRef: `s${i}`, turnId: `s${i}-t1`, turnTextSHA256: sha(TEXT), sliceSHA256: sha(TEXT) };
}
interface BoundedXOpts { n?: number; score?: number; citeWeb?: boolean; degraded?: string; throwOn?: string; swallowedHuge?: boolean }
type RigX = Rig & { hydrateSeen: () => number[]; tree: TreeIndexNode };
function boundedX(o: BoundedXOpts = {}, extra: Partial<AskV2Deps> = {}): RigX {
  const n = o.n ?? 1;
  const nodes: TreeIndexNode[] = Array.from({ length: n }, (_, i) => ({ node_id: `tenant:t/session:s${i}`, title: `S${i}`, level: "session",
    summary: "PRIVATE ".repeat(10), evidence: { sessionRef: `s${i}` }, children: [] } as unknown as TreeIndexNode));
  const xtree: TreeIndexNode = { node_id: "tenant:t", title: "T", level: "tenant", summary: "", children: nodes };
  const calls: string[] = []; const writes: unknown[] = []; const seen: number[] = [];
  const complete: CompleteFn = async (job) => {
    calls.push(job.kind);
    if (job.kind === o.throwOn) throw new Error("provider exploded");
    if (job.kind === "ask.select_nodes") return jres({ node_ids: nodes.map((x) => x.node_id) });
    if (job.kind === "ask.refine_batch") {
      const strips = JSON.parse(job.messages[1]!.content).strips;
      return jres({ decisions: strips.map((s: { id: string }) => ({ id: s.id, keep: true })) });
    }
    if (job.kind === "ask.answer_grounding") return jres({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
    if (job.kind === "ask.score_probe") return jres({});
    return jres({ sentences: [{ text: "The source says a visa requires a form.", sourceIds: o.citeWeb ? ["q0", "web-0"] : ["q0"] }] });
  };
  const sc: Partial<AskV2Deps> = o.swallowedHuge
    ? { scoreFnForComplete: (c: CompleteFn) => async () => {
        try { await c({ kind: "ask.score_probe", messages: [{ role: "user", content: "x".repeat(70_000) }] }); } catch { /* swallowed like the evaluator's heuristic fallback */ }
        return 0.9; } }
    : {};
  const deps: AskV2Deps = {
    complete, scoreFn: () => [o.score ?? 0.9, "offline structural fixture"], tenantId: "t",
    treeSearchFn: (_r, ids) => nodes.filter((x) => ids.includes(x.node_id)),
    // elapsedStartMs is wall-clock; mask it so the write comparison is deterministic.
    write: async (job) => { const { createdAt: _c, ...rest } = job as unknown as Record<string, unknown>;
      if (typeof rest.error === "string") rest.error = rest.error.replace(/"elapsedStartMs":\d+/g, '"elapsedStartMs":0');
      writes.push(rest); },
    sourceContext: { hydrate: async (_q, given) => { seen.push(given.length); return { nodes: given.map((g) => {
      const k = Number(g.node_id.split(":s").pop());
      const q = mkQuote(k, g);
      return { ...g, summary: JSON.stringify([q]), children: [], evidence: { sessionRef: `s${k}`, sourceQuotes: [q], sourceSnapshotSHA256: snapshot } } as unknown as TreeIndexNode;
    }), snapshotSHA256: snapshot, sourceBytes: 100, ...(o.degraded ? { degraded: o.degraded } : {}) }; } },
    ...sc, ...extra,
  };
  return { deps, writes: () => writes, calls: () => calls, hydrateSeen: () => seen, tree: xtree };
}
const xt = (n: number): TreeIndexNode => boundedX({ n }).tree;
const wkind = (rig: Rig) => rig.writes().map((w) => (w as { kind: string }).kind);

type Scenario = { name: string; tree: TreeIndexNode; query: string; make: () => Rig; check?: (r: AskV2Result, rig: Rig) => void };
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
  // ---- ISS-T050ASKGRAPH-001: previously uncovered branches ----
  { name: "bounded + tavily with web results: web becomes a citable bounded source", tree: xt(1), query: "visa form",
    make: () => boundedX({ score: 0.5, citeWeb: true }, { tavilySearchFn: async () => [{ title: "Gov", content: "Web visa evidence." }] }),
    check: (r, rig) => {
      assert.equal(r.web_used, true); assert.equal(r.insufficient_coverage, false);
      assert.ok(r.auditLog.some((e) => e.jobKind === "ask.web_fallback"));
      assert.ok(wkind(rig).includes("ask.web_fallback"));
      assert.deepEqual(rig.calls(), ["ask.select_nodes", "ask.refine_batch", "ask.answer", "ask.answer_grounding"]);
      assert.match(r.answer, /visa requires a form/);
    } },
  { name: "bounded candidate cap: 8 candidates are cut to SOURCE_LIMITS.candidates before hydrate", tree: xt(8), query: "visa form",
    make: () => boundedX({ n: 8 }),
    check: (r, rig) => {
      assert.deepEqual((rig as RigX).hydrateSeen(), [SOURCE_LIMITS.candidates]);
      const e = r.auditLog.find((x) => x.jobKind === "ask.candidates_bounded");
      assert.equal(e?.step, `${8 - SOURCE_LIMITS.candidates} lower-ranked candidates omitted from bounded scoring`);
      assert.match(r.auditLog.find((x) => x.jobKind === "ask.source_hydrated")!.step, /^6 source nodes;/);
    } },
  { name: "bounded exactly at the cap: no candidates_bounded entry", tree: xt(6), query: "visa form",
    make: () => boundedX({ n: 6 }),
    check: (r, rig) => {
      assert.deepEqual((rig as RigX).hydrateSeen(), [6]);
      assert.ok(!r.auditLog.some((x) => x.jobKind === "ask.candidates_bounded"));
    } },
  { name: "scoreFnForComplete: score calls are logged via complete, ask.score audit is skipped", tree: TREE, query: "what color are apples?",
    make: () => plain([{ json: { node_ids: [A.node_id] } }, { text: "scored" }, { text: "Final answer" }], {},
      { scoreFnForComplete: (c) => async () => { await c({ kind: "evaluator", messages: [{ role: "user", content: "score" }] }); return 0.9; } }),
    check: (r, rig) => {
      assert.equal(r.auditLog.filter((e) => e.jobKind === "ask.score").length, 1, "exactly the one logged call, no per-node ask.score on top");
      assert.ok(r.auditLog.some((e) => e.jobKind === "ask.score" && e.provider === "fake"));
      assert.deepEqual(wkind(rig), ["ask.select_nodes", "ask.score", "ask.answer"]);
    } },
  { name: "scoreFnForComplete absent: one ask.score audit entry per scored node", tree: TREE, query: "q",
    make: () => plain([{ json: { node_ids: [A.node_id, B.node_id] } }, { text: "Final answer" }], { [A.node_id]: 0.9, [B.node_id]: 0.9 }),
    check: (r) => assert.equal(r.auditLog.filter((e) => e.jobKind === "ask.score").length, 2) },
  { name: "hydrate degraded: failed retrieval_degraded write and audit entry", tree: xt(1), query: "visa form",
    make: () => boundedX({ degraded: "lexical index stale" }),
    check: (r, rig) => {
      assert.ok(r.auditLog.some((e) => e.jobKind === "ask.retrieval_degraded" && e.step === "lexical index stale"));
      assert.ok(rig.writes().some((w) => { const x = w as { kind: string; status: string; error?: string }; return x.kind === "ask.retrieval_degraded" && x.status === "failed" && x.error === "lexical index stale"; }));
    } },
  { name: "legacy tavily returning []: still a web fallback (only bounded mode refuses empty)", tree: TREE, query: "q",
    make: () => plain([{ json: { node_ids: [B.node_id] } }, { text: "Final answer" }], { [B.node_id]: 0.05 }, { tavilySearchFn: async () => [] }),
    check: (r, rig) => {
      assert.equal(r.web_used, true); assert.equal(r.insufficient_coverage, false); assert.deepEqual(r.sources.web, []);
      assert.ok(r.auditLog.some((e) => e.jobKind === "ask.web_fallback"));
      assert.ok(!r.auditLog.some((e) => e.jobKind === "ask.web_fallback_empty"));
      assert.ok(wkind(rig).includes("ask.web_fallback"));
    } },
];

async function settle(f: () => Promise<unknown>): Promise<{ ok: true; value: unknown } | { ok: false; name: string; message: string }> {
  try { return { ok: true, value: await f() }; }
  catch (e) { return { ok: false, name: (e as Error).constructor.name, message: (e as Error).message }; }
}

// Frozen pre-refactor baseline (ISS-T050ASKGRAPH-002): the byte-exact askV2 result, writes and provider
// calls per scenario, recorded from the ORIGINAL duplicated-body askV2. Once askV2 and the graph share
// one set of node functions the two-way comparison alone can no longer see a regression; this can.
// Regenerate only deliberately: WRITE_ASK_BASELINE=1.
const BASELINE_PATH = new URL("./ask-graph.baseline.json", import.meta.url);
const baseline: Record<string, string> = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {};
const recorded: Record<string, string> = {};
process.on("exit", () => { if (process.env.WRITE_ASK_BASELINE === "1") writeFileSync(BASELINE_PATH, JSON.stringify(recorded, null, 1) + "\n"); });

test("official Ask executor is default-off and accepts only the exact opt-in", () => {
  for (const value of [undefined, "", "0", "true", " 1", "1 "]) assert.equal(officialAskGraphEnabled({ LKB_ASK_GRAPH: value }), false);
  assert.equal(officialAskGraphEnabled({ LKB_ASK_GRAPH: "1" }), true);
});
for (const sc of S) test(`official LangGraph: ${sc.name} matches frozen original result, writes and calls`, async () => {
  const rig = sc.make();
  const result = await askGraphV2(sc.query, sc.tree, rig.deps, { officialGraph: true });
  assert.equal(JSON.stringify({ result, writes: rig.writes(), calls: rig.calls() }), baseline[sc.name]);
  sc.check?.(result, rig);
});
for (const attack of ["source-unknown", "judge-unknown", "unsupported"]) test(`official LangGraph bounded refusal: ${attack}`, async () => {
  const old = bounded({ attack }), official = bounded({ attack });
  assert.deepEqual(await settle(() => askGraphV2("visa form", btree, official.deps, { officialGraph: true })),
    await settle(() => askGraphV2("visa form", btree, old.deps, { officialGraph: false })));
  assert.deepEqual(official.writes(), old.writes()); assert.deepEqual(official.calls(), old.calls());
});
test("official library routing enters authoritative nodes, stops after a result and preserves original errors", async () => {
  const fixture = plain([], {}), state = initAskGraphState("q", TREE, fixture.deps);
  const result = { answer: "done" } as AskV2Result;
  const output = await runAskLangGraphNodes([
    { name: "retrieve", run: async s => { s.result = result; } },
    { name: "answer", run: async () => { assert.fail("must stop before answer"); } },
  ], state);
  assert.equal(output, result); assert.deepEqual(state.trace, ["retrieve"]);
  const error = new Error("original node failure");
  await assert.rejects(runAskLangGraphNodes([{ name: "retrieve", run: async () => { throw error; } }], initAskGraphState("q", TREE, fixture.deps)), e => e === error);
});
test("official executor preserves completion-budget, provider-error and poisoned evaluator refusal writes", async () => {
  const cases: Array<() => RigX> = [
    () => boundedX({ swallowedHuge:true }), () => boundedX({ throwOn:"ask.select_nodes" }),
    () => boundedX({ throwOn:"ask.answer" }),
    () => boundedX({}, {scoreFn:()=>[1,"llm judge call failed: failed, fell back to heuristic"]}),
  ];
  for(const make of cases) {
    const old=make(), official=make();
    assert.deepEqual(await settle(()=>askGraphV2("visa form",official.tree,official.deps,{officialGraph:true})),
      await settle(()=>askGraphV2("visa form",old.tree,old.deps,{officialGraph:false})));
    assert.deepEqual(official.writes(),old.writes()); assert.deepEqual(official.calls(),old.calls());
  }
});

for (const sc of S) {
  test(`golden: ${sc.name} - graph output, writes and provider calls equal askV2`, async () => {
    const a = sc.make(); const b = sc.make();
    const old = await askV2(sc.query, sc.tree, a.deps);
    const neu = await askGraphV2(sc.query, sc.tree, b.deps);
    assert.deepEqual(neu, old);
    assert.equal(JSON.stringify(neu), JSON.stringify(old), "byte-identical serialisation");
    assert.deepEqual(b.writes(), a.writes());
    assert.deepEqual(b.calls(), a.calls());
    sc.check?.(old, a);
    sc.check?.(neu, b);
    const frozen = JSON.stringify({ result: old, writes: a.writes(), calls: a.calls() });
    recorded[sc.name] = frozen;
    if (process.env.WRITE_ASK_BASELINE !== "1") assert.equal(frozen, baseline[sc.name], "askV2 drifted from the frozen pre-refactor baseline");
  });
}

test("golden: bounded completion-budget refusal (swallowed over-budget call, then assertHealthy) is identical and carries diagnostics", async () => {
  const mk = () => boundedX({ swallowedHuge: true });
  const a = mk(); const b = mk();
  const old = await settle(() => askV2("visa form", a.tree, a.deps));
  const neu = await settle(() => askGraphV2("visa form", b.tree, b.deps));
  assert.deepEqual(neu, old);
  assert.equal(old.ok, false);
  assert.match((old as { message: string }).message, /budget exhausted/);
  assert.deepEqual(a.calls(), ["ask.select_nodes"], "refused right after evaluate, before refine/answer spend");
  assert.deepEqual(b.writes(), a.writes());
  const w = a.writes().find((x) => (x as { kind: string }).kind === "ask.source_context_refused") as { error: string; status: string };
  assert.equal(w.status, "failed");
  const parsed = JSON.parse(w.error);
  assert.equal(parsed.format, "lkb.budget_refusal.v1");
  assert.equal(parsed.budgetRefusal.reason, "job_byte_limit");
});

// ISS-ASKSHARED-001: pins the FIRST assertHealthy (right after evaluate). Score 0.05 + no tavily means refine would
// otherwise return the "No supported internal source" success early, so only this check rethrows the sticky budget failure.
test("budget refusal after a swallowed over-budget evaluator call is not masked by the low-score 'no supported source' early return", async () => {
  const lowScore = { scoreFnForComplete: (c: CompleteFn) => async () => {
    try { await c({ kind: "ask.score_probe", messages: [{ role: "user", content: "x".repeat(70_000) }] }); } catch { /* swallowed like the evaluator's heuristic fallback */ }
    return 0.05; } };
  for (const run of [askV2, askGraphV2]) {
    const r = boundedX({ swallowedHuge: true }, lowScore);
    const out = await settle(() => run("visa form", r.tree, r.deps));
    assert.equal(out.ok, false, "must refuse, not return the no-supported-source success");
    assert.match((out as { message: string }).message, /budget exhausted/);
    assert.deepEqual(r.calls(), ["ask.select_nodes"]);
  }
});

for (const kind of ["ask.answer", "ask.select_nodes"]) {
  test(`golden: bounded non-BoundedAskError from ${kind} is wrapped identically as 'source or completion processing failed'`, async () => {
    const mk = () => boundedX({ throwOn: kind });
    const a = mk(); const b = mk();
    const old = await settle(() => askV2("visa form", a.tree, a.deps));
    const neu = await settle(() => askGraphV2("visa form", b.tree, b.deps));
    assert.deepEqual(neu, old);
    assert.equal(old.ok, false);
    assert.equal((old as { name: string }).name, "BoundedAskError");
    assert.match((old as { message: string }).message, /source or completion processing failed/);
    assert.deepEqual(b.writes(), a.writes());
    const w = a.writes().filter((x) => (x as { kind: string }).kind === "ask.source_context_refused") as Array<{ error: string }>;
    assert.equal(w.length, 1);
    assert.match(w[0]!.error, /source or completion processing failed/);
    assert.ok(!w[0]!.error.includes("provider exploded"), "raw provider error is not leaked into the write");
  });
}

test("golden: legacy mode does NOT wrap a non-Bounded error", async () => {
  const mk = () => plain([{ json: { node_ids: [A.node_id] } }, () => { throw new Error("raw-boom"); }], { [A.node_id]: 0.9 });
  const a = mk(); const b = mk();
  const old = await settle(() => askV2("q", TREE, a.deps));
  const neu = await settle(() => askGraphV2("q", TREE, b.deps));
  assert.deepEqual(neu, old);
  assert.deepEqual(old, { ok: false, name: "Error", message: "raw-boom" });
  assert.equal(wkind(b).includes("ask.source_context_refused"), false);
});

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
