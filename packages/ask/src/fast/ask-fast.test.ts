/**
 * packages/ask/src/fast/ask-fast.test.ts — ask-fast-rag C1/C3/C4/C5/C6. `askFastV2` is the default /ask path:
 * arms-only retrieval -> hydrate -> ONE answer call (+ at most ONE grounding call). Fake providers only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { CompleteFn } from "../select-nodes.js";
import { askFastV2, type AskV2Deps } from "../ask-v2.js";
import type { SourceQuote } from "../source-context.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const TEXT = "Visa requires a form.";
const mk = (id: string): TreeIndexNode => ({ node_id: `tenant:t/session:${id}`, title: id, level: "session", summary: "PRIVATE", evidence: { sessionRef: id }, children: [] });
const nodeA = mk("a"), nodeB = mk("b");
const tree: TreeIndexNode = { node_id: "tenant:t", title: "T", level: "tenant", summary: "", children: [nodeA, nodeB] };
const quoteFor = (n: TreeIndexNode): SourceQuote => ({ id: `q-${n.evidence!.sessionRef}`, nodeId: n.node_id, sessionRef: n.evidence!.sessionRef as string, turnId: `${n.evidence!.sessionRef}-t1`,
  speakerRef: "spk:0", tStart: 1, tEnd: 2, charStart: 0, charEnd: TEXT.length, byteStart: 0, byteEnd: TEXT.length, turnTextSHA256: sha(TEXT), sliceSHA256: sha(TEXT), quote: TEXT, origin: "speech" });
const result = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });

function fixture(over: Partial<AskV2Deps> = {}) {
  const calls: string[] = [], writes: { kind?: string }[] = [];
  let scored = 0, selected = 0, tavily = 0;
  const complete: CompleteFn = async (job) => {
    calls.push(job.kind);
    if (job.kind === "ask.answer_grounding") return result({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
    if (job.kind === "ask.answer") {
      const ctx = JSON.parse(job.messages[1]!.content).context as { sources: { sourceId: string }[] };
      return result({ sentences: [{ text: "A visa requires a form.", sourceIds: [ctx.sources[0]!.sourceId] }] });
    }
    return result({ node_ids: [] });
  };
  const deps: AskV2Deps = {
    complete, tenantId: "t", write: async (j) => { writes.push(j as { kind?: string }); },
    scoreFn: () => { scored++; return [0.9, "x"]; },
    treeSearchFn: () => { selected++; return []; },
    extraCandidateArmsFn: async () => ({ arms: [[nodeA, nodeB]], degraded: null }),
    sourceContext: { hydrate: async (_q, admitted) => ({ nodes: admitted.map((n) => ({ ...n, children: [], summary: JSON.stringify([quoteFor(n)]),
      evidence: { sessionRef: n.evidence!.sessionRef, sourceQuotes: [quoteFor(n)], sourceSnapshotSHA256: sha("snap") } })), snapshotSHA256: sha("snap"), sourceBytes: 10 }) },
    tavilySearchFn: async () => { tavily++; return [{ url: "https://example.test/x", content: "Web says forms." }]; },
    ...over,
  };
  return { deps, calls, writes, counts: () => ({ scored, selected, tavily }) };
}

test("[C1] default path: top-k retrieval then ONE answer call + ONE grounding check, no select/score/refine", async () => {
  const f = fixture();
  const out = await askFastV2("visa form", tree, f.deps);
  assert.deepEqual(f.calls, ["ask.answer", "ask.answer_grounding"]);
  assert.ok(f.calls.length <= 2);
  assert.deepEqual(f.counts(), { scored: 0, selected: 0, tavily: 0 });
  assert.match(out.answer, /visa requires a form/i);
  assert.equal(out.sources.internal.length, 1, "sources.internal is the chunk the answer cites, not every retrieved chunk (F4)");
  assert.equal(out.sources.internal[0]!.node_id, nodeA.node_id);
  assert.equal((out.sources.internal[0]!.evidence!.sourceQuotes as { quote: string }[])[0]!.quote, TEXT);
});

test("[C3] response keys are exactly the legacy ones, internal and web stay separate", async () => {
  const out = await askFastV2("visa form", tree, fixture().deps);
  for (const k of ["answer", "verdict", "reason", "scored", "web_used", "insufficient_coverage", "sources", "auditLog"]) assert.ok(k in out, k);
  assert.deepEqual(Object.keys(out.sources).sort(), ["internal", "web"]);
  assert.ok(["correct", "ambiguous", "incorrect"].includes(out.verdict));
  assert.equal(typeof out.reason, "string"); assert.ok(Array.isArray(out.scored));
  assert.equal(out.web_used, false); assert.equal(out.insufficient_coverage, false);
});

test("[C3] empty retrieval: insufficient_coverage, honest answer, zero LLM calls, no invented citation", async () => {
  const f = fixture({ extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }), tavilySearchFn: undefined });
  const out = await askFastV2("nothing matches", tree, f.deps);
  assert.equal(out.insufficient_coverage, true); assert.equal(out.verdict, "incorrect");
  assert.deepEqual(out.sources, { internal: [], web: [] });
  assert.equal(f.calls.length, 0);
  assert.match(out.answer, /no supported internal source|could not find|not enough/i);
});

test("[C4] a candidate the arms return from outside this tenant's tree is dropped and never cited", async () => {
  const foreign = { ...mk("foreign"), summary: "OTHER TENANT" };
  const f = fixture({ extraCandidateArmsFn: async () => ({ arms: [[foreign, nodeA]], degraded: null }) });
  const out = await askFastV2("visa form", tree, f.deps);
  assert.deepEqual(out.sources.internal.map((s) => s.node_id), [nodeA.node_id]);
  assert.ok(!JSON.stringify(out).includes("OTHER TENANT"));
  assert.ok(out.auditLog.some((e) => e.jobKind === "ask.candidates_dropped"));
});

test("[C5] web fallback only when retrieval is empty; never when retrieval has sources", async () => {
  const hit = fixture(); await askFastV2("visa form", tree, hit.deps);
  assert.equal(hit.counts().tavily, 0);
  const miss = fixture({ extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }) });
  const out = await askFastV2("visa form", tree, miss.deps);
  assert.equal(miss.counts().tavily, 1);
  assert.equal(out.web_used, true); assert.equal(out.insufficient_coverage, false);
  assert.equal(out.sources.web.length, 1); assert.equal(out.sources.internal.length, 0);
  assert.ok(miss.calls.length <= 2);
});

test("[C5] a throwing or empty web search degrades honestly instead of failing", async () => {
  const boom = fixture({ extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }), tavilySearchFn: async () => { throw new Error("no key"); } });
  const out = await askFastV2("q", tree, boom.deps);
  assert.equal(out.insufficient_coverage, true); assert.equal(out.web_used, false);
  assert.ok(out.auditLog.some((e) => e.jobKind === "ask.web_fallback_unavailable"));
  const empty = fixture({ extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }), tavilySearchFn: async () => [] });
  assert.equal((await askFastV2("q", tree, empty.deps)).insufficient_coverage, true);
});

test("[C6] total deadline returns a degraded answer instead of hanging", async () => {
  const f = fixture({ complete: () => new Promise(() => {}) });
  const started = Date.now();
  const out = await askFastV2("visa form", tree, f.deps, { deadlineMs: 60 });
  assert.ok(Date.now() - started < 2000);
  assert.equal(out.insufficient_coverage, true); assert.match(out.reason, /deadline/i);
  assert.deepEqual(out.sources, { internal: [], web: [] });
  assert.ok(out.auditLog.some((e) => e.jobKind === "ask.fast_deadline"));
});

test("[C6] default deadline is 20 s and is configurable", async () => {
  const { FAST_DEADLINE_MS } = await import("../ask-v2.js");
  assert.equal(FAST_DEADLINE_MS, 20_000);
});

test("[F4] sources.internal is the chunks the answer cites; an uncited retrieved chunk is not shipped", async () => {
  const citeSecond: CompleteFn = async (job) => {
    if (job.kind === "ask.answer_grounding") return result({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
    const ctx = JSON.parse(job.messages[1]!.content).context as { sources: { sourceId: string }[] };
    return result({ sentences: [{ text: "A visa requires a form.", sourceIds: [ctx.sources[1]!.sourceId] }] });
  };
  const out = await askFastV2("visa form", tree, fixture({ complete: citeSecond }).deps);
  assert.deepEqual(out.sources.internal.map((s) => s.node_id), [nodeB.node_id]);
  assert.ok(!out.sources.internal.some((s) => s.node_id === nodeA.node_id));
});

test("[F1] topic/native-passage nodes (not reachable by the session arms) reach the default path through the injected non-LLM tree arm, via treeSearchFn", async () => {
  const native: TreeIndexNode = { node_id: "tenant:t/topic:p1", title: "Visa forms", level: "topic", summary: TEXT,
    evidence: { sessionRef: "p1" }, children: [] };
  const withNative: TreeIndexNode = { ...tree, children: [nodeA, nodeB, native] };
  const found: string[][] = [];
  const f = fixture({ extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }),
    treeSearchFn: (t, ids) => { found.push(ids); return t.children.filter((n) => ids.includes(n.node_id)); } });
  const out = await askFastV2("visa form", withNative, f.deps, { treeLexicalIds: () => [native.node_id] });
  assert.deepEqual(found, [[native.node_id]]);
  assert.deepEqual(out.sources.internal.map((s) => s.node_id), [native.node_id]);
  assert.deepEqual(f.calls, ["ask.answer", "ask.answer_grounding"], "no select_nodes LLM call");
  // Where the request composition withholds tree selection (graph-scoped), treeSearchFn returns [] and nothing is admitted.
  const gated = fixture({ extraCandidateArmsFn: async () => ({ arms: [[]], degraded: null }), treeSearchFn: () => [], tavilySearchFn: undefined });
  const none = await askFastV2("visa form", withNative, gated.deps, { treeLexicalIds: () => [native.node_id] });
  assert.equal(none.insufficient_coverage, true); assert.deepEqual(none.sources.internal, []);
});

// ---- ask-trust (W-AFR): ISS-AFR-001..004 --------------------------------------------------------------------------------
type Round = { kinds: string[]; systems: string[] };
/** Scripted provider. `draft(sourceIds)` is the answer-call JSON; `keep(id)` is the grounding verdict for sentence `id`. */
function scripted(draft: (ids: string[]) => unknown, keep: (id: string) => boolean): { complete: CompleteFn } & Round {
  const kinds: string[] = [], systems: string[] = [];
  const complete: CompleteFn = async (job) => {
    kinds.push(job.kind);
    const user = JSON.parse(job.messages.find((m) => m.role === "user")!.content);
    if (job.kind === "ask.answer_grounding") return result({ decisions: user.sentences.map((s: { id: string }) => ({ id: s.id, supported: keep(s.id), answersQuery: keep(s.id) })) });
    systems.push(job.messages.find((m) => m.role === "system")?.content ?? "");
    return result(draft(user.context.sources.map((s: { sourceId: string }) => s.sourceId)));
  };
  return { complete, kinds, systems };
}
const oneSentence = (ids: string[]) => ({ sentences: [{ text: "A visa requires a form.", sourceIds: [ids[0]!] }] });

test("[ISS-AFR-001] the verdict reflects the grounding check: dropped sentences make it 'ambiguous', not a hard-coded 'correct'", async () => {
  const two = (ids: string[]) => ({ sentences: [{ text: "A visa requires a form.", sourceIds: [ids[0]!] }, { text: "It costs 90 euros.", sourceIds: [ids[0]!] }] });
  const partial = await askFastV2("visa form", tree, fixture({ complete: scripted(two, (id) => id === "sentence-0").complete }).deps);
  assert.equal(partial.verdict, "ambiguous"); assert.equal(partial.removedSentences, 1);
  assert.equal(partial.insufficient_coverage, false); assert.match(partial.reason, /1 .*sentence/i);
  assert.match(partial.answer, /visa requires a form/i); assert.ok(!/90 euros/.test(partial.answer));
  const full = await askFastV2("visa form", tree, fixture({ complete: scripted(two, () => true).complete }).deps);
  assert.equal(full.verdict, "correct"); assert.equal(full.removedSentences, undefined);
});

test("[ISS-AFR-003] irrelevant top-k yields an honest insufficient answer, not a thrown refusal; a model abstain (sentences: []) is the same channel", async () => {
  const none = scripted(oneSentence, () => false);
  const out = await askFastV2("unrelated", tree, fixture({ complete: none.complete, tavilySearchFn: undefined }).deps);
  assert.equal(out.insufficient_coverage, true); assert.equal(out.verdict, "incorrect"); assert.equal(out.web_used, false);
  assert.deepEqual(out.sources, { internal: [], web: [] });
  assert.match(out.answer, /do not support|no supported/i); assert.match(out.reason, /do not support|no supported/i);
  assert.ok(out.auditLog.some((e) => e.jobKind === "ask.answer_abstained"));
  assert.deepEqual(none.kinds, ["ask.answer", "ask.answer_grounding"]);
  const abstain = scripted(() => ({ sentences: [] }), () => true);
  const out2 = await askFastV2("unrelated", tree, fixture({ complete: abstain.complete, tavilySearchFn: undefined }).deps);
  assert.equal(out2.insufficient_coverage, true); assert.deepEqual(out2.sources, { internal: [], web: [] });
  assert.deepEqual(abstain.kinds, ["ask.answer"], "an abstain needs no grounding call");
  assert.match(abstain.systems[0]!, /sentences\s*:\s*\[\]/, "the fast path tells the model how to abstain");
  const { answer } = await import("../answer.js");
  let deepSystem = "";
  await answer("q", JSON.stringify([]), {}, async (job) => { deepSystem = job.messages[0]!.content; return result({}); }, { boundedSources: [] }).catch(() => {});
  assert.ok(!/sentences\s*:\s*\[\]/.test(deepSystem), "deep/shared prompt is unchanged unless abstain is requested");
  const malformed = scripted(() => ({ nope: 1 }), () => true);
  await assert.rejects(askFastV2("q", tree, fixture({ complete: malformed.complete, tavilySearchFn: undefined }).deps), /bounded source context/i);
});

test("[ISS-AFR-002] irrelevant top-k falls back to web when sources allow it, and never when web is withheld", async () => {
  let round = 0;
  const s = scripted((ids) => { round++; return oneSentence(ids); }, () => round > 1);
  const f = fixture({ complete: s.complete });
  const out = await askFastV2("visa form", tree, f.deps);
  assert.equal(f.counts().tavily, 1);
  assert.equal(out.web_used, true); assert.equal(out.insufficient_coverage, false);
  assert.equal(out.sources.web.length, 1); assert.deepEqual(out.sources.internal, []);
  assert.match(out.answer, /visa requires a form/i);
  assert.deepEqual(s.kinds, ["ask.answer", "ask.answer_grounding", "ask.answer", "ask.answer_grounding"]);
  assert.ok(out.auditLog.some((e) => e.jobKind === "ask.web_fallback"));
  assert.ok(f.writes.some((w) => w.kind === "ask.web_fallback"));
  // sources=internal / internal-only policy withhold tavilySearchFn: no web call, honest abstain.
  const held = fixture({ complete: scripted(oneSentence, () => false).complete, tavilySearchFn: undefined });
  assert.equal((await askFastV2("visa form", tree, held.deps)).web_used, false); assert.equal(held.counts().tavily, 0);
  // Web that also fails grounding ends in the same honest abstain, not a throw.
  const both = fixture({ complete: scripted(oneSentence, () => false).complete });
  const nothing = await askFastV2("visa form", tree, both.deps);
  assert.equal(nothing.insufficient_coverage, true); assert.deepEqual(nothing.sources, { internal: [], web: [] });
});

test("[ISS-AFR-004] after the deadline the orphaned run starts no further provider call and cannot mutate the returned auditLog", async () => {
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  const calls: string[] = []; let tavily = 0;
  const complete: CompleteFn = async (job) => {
    calls.push(job.kind);
    if (job.kind === "ask.answer_grounding") return result({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
    const ctx = JSON.parse(job.messages[1]!.content).context as { sources: { sourceId: string }[] };
    await gate;
    return result(oneSentence([ctx.sources[0]!.sourceId]));
  };
  const f = fixture({ complete, tavilySearchFn: async () => { tavily++; return []; } });
  const out = await askFastV2("visa form", tree, f.deps, { deadlineMs: 40 });
  assert.match(out.reason, /deadline/i); assert.ok(out.auditLog.some((e) => e.jobKind === "ask.fast_deadline"));
  const snapshot = JSON.stringify(out.auditLog), before = [...calls];
  release();
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, before, "the loser must not start the grounding call after the deadline");
  assert.equal(tavily, 0);
  assert.equal(JSON.stringify(out.auditLog), snapshot, "the returned auditLog is a snapshot, not the loser's live array");
});
