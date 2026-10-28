/**
 * packages/ask/src/ask-fast.test.ts — ask-fast-rag C1/C3/C4/C5/C6. `askFastV2` is the default /ask path:
 * arms-only retrieval -> hydrate -> ONE answer call (+ at most ONE grounding call). Fake providers only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { CompleteFn } from "./select-nodes.js";
import { askFastV2, type AskV2Deps } from "./ask-v2.js";
import type { SourceQuote } from "./source-context.js";

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
  assert.equal(out.sources.internal.length, 2);
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
  const { FAST_DEADLINE_MS } = await import("./ask-v2.js");
  assert.equal(FAST_DEADLINE_MS, 20_000);
});
