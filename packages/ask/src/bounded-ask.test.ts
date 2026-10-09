import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { CompleteFn } from "./select-nodes.js";
import { askV2, type AskV2Deps } from "./ask-v2.js";
import { type SourceQuote, BoundedAskError } from "./source-context.js";
import { completionBudget, payloadBytes } from "./source-context.js";
import { answer } from "./answer.js";
import { contextStrips, unpackContext, type ContextSource } from "./bounded-refine.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const node: TreeIndexNode = { node_id: "tenant:t/session:s", title: "Visa session", level: "session", summary: "PRIVATE ".repeat(300000),
  evidence: { sessionRef: "s" }, children: [] };
const tree: TreeIndexNode = { node_id: "tenant:t", title: "T", level: "tenant", summary: node.summary, children: [node] };
const snapshot = sha("same scoped frozen bytes");
const quote: SourceQuote = { id: "q1", nodeId: node.node_id, sessionRef: "s", turnId: "s-t1", speakerRef: "spk:0",
  tStart: 10, tEnd: 20, charStart: 0, charEnd: 21, byteStart: 0, byteEnd: 21,
  turnTextSHA256: sha("Visa requires a form."), sliceSHA256: sha("Visa requires a form."), quote: "Visa requires a form.",
  origin: "speech" };
quote.charEnd = quote.quote.length; quote.byteEnd = Buffer.byteLength(quote.quote);
function result(json: unknown) { return { text: JSON.stringify(json), json, provider: "offline", model: "fixture",
  costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } }; }
function fixture(options: { score?: number; attack?: string } = {}) {
  const calls: string[] = [];
  const writes: unknown[] = [];
  const complete: CompleteFn = async (job) => {
    calls.push(job.kind);
    assert.ok(!job.messages.some((m) => m.content.includes("PRIVATE")), "raw summary reached provider");
    if (job.kind === "ask.select_nodes") return result({ node_ids: [node.node_id] });
    if (job.kind === "ask.refine_batch") {
      const strips = JSON.parse(job.messages[1]!.content).strips;
      return result({ decisions: strips.map((s: { id: string }) => ({ id: s.id, keep: true })) });
    }
    if (job.kind === "ask.answer_grounding") return result({ decisions: [{ id: options.attack === "judge-unknown" ? "ghost" : "sentence-0",
      supported: options.attack !== "unsupported", answersQuery: true }] });
    return result({ sentences: [{ text: "The source says a visa requires a form.", sourceIds: [options.attack === "source-unknown" ? "foreign" : "q1"] }] });
  };
  const deps: AskV2Deps = {
    complete, scoreFn: () => [options.score ?? 0.9, "offline structural fixture"], tenantId: "t",
    treeSearchFn: (_root, ids) => ids.includes(node.node_id) ? [node] : [], write: async (job) => { writes.push(job); },
    sourceContext: { hydrate: async () => ({ nodes: [{ ...node, summary: JSON.stringify([quote]), children: [],
      evidence: { sessionRef: "s", sourceQuotes: [quote], sourceSnapshotSHA256: snapshot } }],
      snapshotSHA256: snapshot, sourceBytes: 100 }) },
  };
  return { deps, calls, writes };
}
test("correct bounded Ask preserves internal-first flow and exact quote citations without original summary", async () => {
  const { deps, calls } = fixture();
  deps.tavilySearchFn = async () => { throw new Error("correct verdict must not search web"); };
  const before = JSON.stringify(tree);
  const actual = await askV2("visa form", tree, deps);
  assert.equal(actual.verdict, "correct");
  assert.equal(actual.web_used, false);
  assert.equal(actual.sources.internal[0]!.evidence!.sessionRef, "s");
  assert.deepEqual(actual.sources.internal[0]!.evidence!.sourceQuotes, [quote]);
  assert.deepEqual(calls, ["ask.select_nodes", "ask.answer", "ask.answer_grounding"]);
  assert.equal(JSON.stringify(tree), before);
});
test("ambiguous bounded Ask judges complete refine strips and reports unavailable off-corpus fallback", async () => {
  const { deps, calls } = fixture({ score: 0.5 });
  deps.tavilySearchFn = async () => { throw new Error("Tavily not configured"); };
  const actual = await askV2("visa form", tree, deps);
  assert.equal(actual.verdict, "ambiguous");
  assert.equal(actual.insufficient_coverage, true);
  assert.ok(actual.auditLog.some((a) => a.jobKind === "ask.web_fallback_unavailable"));
  assert.equal(calls.filter((s) => s === "ask.refine_batch").length, 1);
});
for (const attack of ["source-unknown", "judge-unknown", "unsupported"]) {
  test("answer refuses and audits " + attack, async () => {
    const { deps, writes } = fixture({ attack });
    await assert.rejects(askV2("visa form", tree, deps), BoundedAskError);
    assert.ok(writes.some((w) => (w as { kind: string }).kind === "ask.source_context_refused"));
  });
}
test("valid-ID poisoned arm is substituted before trusted source hydration", async () => {
  const { deps } = fixture();
  deps.extraCandidateArmsFn = async () => ({ arms: [[{ ...node, summary: "FOREIGN ARM POISON", evidence: { sessionRef: "foreign" } }]], degraded: null });
  const hydrate = deps.sourceContext!.hydrate;
  deps.sourceContext!.hydrate = async (query, nodes) => {
    assert.equal(nodes[0], node);
    assert.equal(nodes[0]!.evidence!.sessionRef, "s");
    return hydrate(query, nodes);
  };
  const actual = await askV2("visa form", tree, deps);
  assert.equal(actual.sources.internal[0]!.evidence!.sessionRef, "s");
});
test("heuristic scorer degradation refuses before answer even with a high score", async () => {
  const { deps, calls } = fixture();
  deps.scoreFn = () => [1, "llm judge call failed: failed, fell back to heuristic"];
  await assert.rejects(askV2("visa form", tree, deps), /evaluator degraded/);
  assert.deepEqual(calls, ["ask.select_nodes"]);
});
test("irrelevant query has no fabricated internal answer and still reaches unavailable web seam", async () => {
  const { deps, calls } = fixture({ score: 0.1 });
  let web = 0;
  deps.tavilySearchFn = async () => { web++; throw new Error("missing key"); };
  const actual = await askV2("unrelated astronomy", tree, deps);
  assert.equal(actual.verdict, "incorrect");
  assert.equal(actual.sources.internal.length, 0);
  assert.equal(actual.insufficient_coverage, true);
  assert.equal(web, 1);
  assert.ok(!calls.includes("ask.answer"));
});

test("bounded empty web search stays insufficient and cannot present a resolved answer", async () => {
  const { deps, calls, writes } = fixture({ score: 0.1 });
  deps.tavilySearchFn = async () => [];
  const result = await askV2("off-corpus astronomy", tree, deps);
  assert.equal(result.insufficient_coverage, true);
  assert.equal(result.web_used, false);
  assert.deepEqual(result.sources.web, []);
  assert.ok(result.auditLog.some((a) => a.jobKind === "ask.web_fallback_empty"));
  assert.ok(writes.some((w) => (w as { kind: string }).kind === "ask.web_fallback_empty"));
  assert.ok(!calls.includes("ask.answer"));
});

test("dense six-session answer packs every strip once and keeps individual citation boundaries", async (t) => {
  const sources: ContextSource[] = Array.from({ length: 6 }, (_, i) => ({ id: "quote-" + sha("fixture:" + i).slice(0, 24), origin: "speech",
    text: Array.from({ length: 64 }, (_, j) => "Source " + i + " fact " + j + " is explicit.").join(" "),
    source: { speakerRef: "spk:unknown", sessionRef: "session-" + i + "-" + "s".repeat(80),
      turnId: "turn-" + i + "-" + "t".repeat(128), tStart: i, tEnd: i + 1 } }));
  const strips = contextStrips(sources), jobs: number[] = [];
  let dispatched = 0;
  const budget = completionBudget(async (job) => {
    dispatched++;
    if (job.kind === "evaluator") return result({ score: 0.9 });
    const input = JSON.parse(job.messages[1]!.content);
    if (job.kind === "ask.answer") {
      assert.deepEqual(unpackContext(input.context), strips);
      return result({ sentences: sources.map((source, i) => ({ text: "Source " + i + " fact 0 is explicit.", sourceIds: [source.id] })) });
    }
    const byId = new Map(unpackContext(input.context).map((s) => [s.id, s]));
    for (const sentence of input.sentences) {
      assert.equal(sentence.stripIds.length, 64);
      for (const id of sentence.stripIds) assert.ok(sentence.sourceIds.includes(byId.get(id)!.sourceId));
    }
    assert.equal(input.context.strips.length, 384);
    return result({ decisions: input.sentences.map((s: { id: string }) => ({ id: s.id, supported: true, answersQuery: true })) });
  });
  for (let i = 0; i < 7; i++) await budget.complete({ kind: "evaluator", messages: [] });
  const completed = await answer("aid", JSON.stringify(strips), {}, async (job) => {
    jobs.push(payloadBytes(job)); return budget.complete(job);
  }, { boundedSources: sources });
  assert.equal(completed.text, sources.map((_, i) => "Source " + i + " fact 0 is explicit.").join("\n"));
  assert.equal(dispatched, 9);
  assert.ok(jobs.every((size) => size <= 65536));
  const legacyBytes = payloadBytes({ query: "aid", context: JSON.stringify(strips) });
  assert.ok(legacyBytes > 65536);
  t.diagnostic(JSON.stringify({ strips: strips.length, sourceDictionaryRows: sources.length,
    oldNestedContextBytes: legacyBytes, newAnswerJobBytes: jobs[0], newGroundingJobBytes: jobs[1], callsAfterSevenPrior: dispatched }));
});
test("indivisible oversized packed answer still refuses before provider invocation", async (t) => {
  const sources = [{ id: "q-large", origin: "speech", text: "界".repeat(30000) + "." }];
  const strips = contextStrips(sources), sizes: number[] = [];
  let providers = 0;
  const budget = completionBudget(async () => { providers++; return result({}); });
  await assert.rejects(answer("large", JSON.stringify(strips), {}, async (job) => {
    sizes.push(payloadBytes(job)); return budget.complete(job);
  }, { boundedSources: sources }), /budget/);
  assert.equal(providers, 0);
  assert.ok(sizes[0]! > 65536);
  t.diagnostic(JSON.stringify({ deniedSerializedJobBytes: sizes[0], providerInvocations: providers }));
});
