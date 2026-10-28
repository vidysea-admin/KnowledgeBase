/** ask-fast-rag C1-C3/C5/C7 at the answer workflow: the default path is the single-call RAG path, `filters.mode = "deep"` the old graph. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { AskV2Deps } from "@lkb/ask";
import { createAnswerPolicyService } from "./service.js";
import { createInMemoryAnswerPolicyStore } from "./store.js";
import { createInMemoryAnswerRecordStore } from "./answer-record-store.js";
import { createAnswerWorkflow, AnswerWorkflowError, parseAnswerInput } from "./answer-workflow.js";
import { createMongoEvidenceVerifier } from "./answer-evidence.js";
import { answerTestDb } from "./answer-testdb.js";
import type { VerifyEvidence } from "./answer-records.js";

const actor = { actor: "api-key:tenant-a" }, sha = (s: string) => createHash("sha256").update(s).digest("hex");
const TEXT = "Fee is 100.";
const input = (over: Record<string, unknown> = {}) => ({ query: "What is the fee?", questionClass: "fees", evidenceMode: true, filters: { sessionIds: [], sources: "all" }, ...over });
const result = (json: unknown) => ({ json, text: JSON.stringify(json), provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });

function rig(o: { arms?: boolean; extra?: boolean; verify?: VerifyEvidence } = {}) {
  const policies = createAnswerPolicyService(createInMemoryAnswerPolicyStore()), records = createInMemoryAnswerRecordStore();
  const kinds: string[] = []; let tavily = 0;
  const nodes: TreeIndexNode[] = [{ node_id: "n1", title: "Fee", level: "session", summary: "", evidence: { sessionRef: "s1" }, children: [] }];
  if (o.extra) nodes.push({ node_id: "n2", title: "Other", level: "session", summary: "", evidence: { sessionRef: "s2" }, children: [] });
  const tree: TreeIndexNode = { node_id: "root", title: "Tenant", level: "tenant", summary: "", children: nodes };
  const quoteOf = (n: TreeIndexNode) => ({ id: `q-${n.node_id}`, nodeId: n.node_id, sessionRef: n.evidence!.sessionRef as string, turnId: n.node_id === "n1" ? "t1" : "t2", speakerRef: "spk:0", tStart: 10, tEnd: 20, charStart: 0, charEnd: TEXT.length,
    byteStart: 0, byteEnd: TEXT.length, turnTextSHA256: sha(TEXT), sliceSHA256: sha(TEXT), quote: TEXT, origin: "speech" as const });
  const deps: AskV2Deps = { tenantId: "tenant-a", scoreFn: () => [0.9, "offline"], write: async () => {},
    treeSearchFn: (root, ids) => root.children.filter((n) => ids.includes(n.node_id)),
    tavilySearchFn: async () => { tavily++; return [{ url: "https://example.test/fee", content: "Web says the fee is 100." }]; },
    extraCandidateArmsFn: async () => ({ arms: o.arms === false ? [[]] : [nodes], degraded: null }),
    sourceContext: { hydrate: async (_q, admitted) => ({ nodes: admitted.map((n) => ({ ...n, summary: JSON.stringify([quoteOf(n)]),
      evidence: { ...n.evidence, sourceQuotes: [quoteOf(n)], sourceSnapshotSHA256: sha("snap") } })), snapshotSHA256: sha("snap"), sourceBytes: 10 }) },
    complete: async (job) => {
      kinds.push(job.kind);
      if (job.kind === "ask.select_nodes") return result({ node_ids: ["n1"] });
      const value = JSON.parse(job.messages.find((m) => m.role === "user")!.content);
      if (job.kind === "ask.answer_grounding") return result({ decisions: value.sentences.map((s: { id: string }) => ({ id: s.id, supported: true, answersQuery: true })) });
      return result({ sentences: [{ text: TEXT, sourceIds: [value.context.sources[0].sourceId] }] });
    } };
  const workflow = createAnswerWorkflow(policies, records, o.verify ?? (async () => true));
  return { workflow, deps, tree, kinds, tavily: () => tavily, records };
}
const run = (r: ReturnType<typeof rig>, over: Record<string, unknown> = {}) => r.workflow.execute("tenant-a", input(over), actor, r.tree, r.deps);

test("[C1][C2] default = one answer call + one grounding check; filters.mode=deep runs the multi-step graph (select_nodes)", async () => {
  const fast = rig(); await run(fast);
  assert.deepEqual(fast.kinds, ["ask.answer", "ask.answer_grounding"]);
  const deep = rig(); await run(deep, { filters: { sessionIds: [], sources: "all", mode: "deep" } });
  assert.ok(deep.kinds.includes("ask.select_nodes"), deep.kinds.join());
  const explicit = rig(); await run(explicit, { filters: { sessionIds: [], sources: "all", mode: "fast" } });
  assert.deepEqual(explicit.kinds, ["ask.answer", "ask.answer_grounding"]);
});

test("[C2] mode is parsed from filters, validated, and never persisted into the stored filter schema", async () => {
  assert.equal(parseAnswerInput(input({ filters: { mode: "deep" } })).mode, "deep");
  assert.equal(parseAnswerInput(input({ filters: { mode: "fast" } })).mode, undefined);
  assert.equal(parseAnswerInput(input()).mode, undefined);
  assert.throws(() => parseAnswerInput(input({ filters: { mode: "turbo" } })), AnswerWorkflowError);
  const stored = parseAnswerInput(input({ filters: { mode: "deep" } })).filters;
  assert.equal(Object.hasOwn(stored, "mode"), false);
  const r = rig(); const out = await run(r, { filters: { sessionIds: [], sources: "all", mode: "deep" } });
  assert.equal(Object.hasOwn((await r.records.get("tenant-a", out.runId))!.filters, "mode"), false);
});

test("[C3] response shape is identical in both modes", async () => {
  const shape = (v: Record<string, unknown>) => ({ keys: ["answer", "verdict", "reason", "scored", "web_used", "insufficient_coverage", "sources"].map((k) => [k, typeof v[k]]),
    sources: Object.keys(v.sources as object).sort(), scoredIsArray: Array.isArray(v.scored), verdict: v.verdict, web_used: v.web_used, insufficient_coverage: v.insufficient_coverage });
  const fast = await run(rig()), deep = await run(rig(), { filters: { sessionIds: [], sources: "all", mode: "deep" } });
  assert.deepEqual(shape(fast as never), shape(deep as never));
  assert.deepEqual(shape(fast as never), { keys: [["answer", "string"], ["verdict", "string"], ["reason", "string"], ["scored", "object"], ["web_used", "boolean"],
    ["insufficient_coverage", "boolean"], ["sources", "object"]], sources: ["internal", "web"], scoredIsArray: true, verdict: "correct", web_used: false, insufficient_coverage: false });
  assert.equal(fast.sources.internal.length, 1); assert.equal(fast.answer, TEXT);
});

test("[C3] empty retrieval: insufficient_coverage, no citation, no model call", async () => {
  const r = rig({ arms: false }); r.deps.tavilySearchFn = undefined;
  const out = await run(r);
  assert.equal(out.insufficient_coverage, true); assert.deepEqual(out.sources, { internal: [], web: [] });
  assert.deepEqual(r.kinds, []);
});

test("[C5] web fallback runs on empty retrieval only when filters.sources allows web; never for sources=internal", async () => {
  const internal = rig({ arms: false }); await run(internal, { filters: { sessionIds: [], sources: "internal" } });
  assert.equal(internal.tavily(), 0);
  const all = rig({ arms: false }); await run(all);
  assert.equal(all.tavily(), 1);
  const hit = rig(); await run(hit);
  assert.equal(hit.tavily(), 0, "never when retrieval found sources");
});

function realVerifierRig() {
  const db = answerTestDb();
  db.rows("sessions").push({ _id: "s1", tenantId: "tenant-a", sourceId: "source1" });
  db.rows("sources").push({ _id: "source1", tenantId: "tenant-a", kind: "recording" });
  db.rows("turns").push({ _id: "t1", tenantId: "tenant-a", sessionId: "s1", speakerRef: "spk:0", tStart: 10, tEnd: 20, text: TEXT });
  return { db, r: rig({ verify: createMongoEvidenceVerifier(db.db) }) };
}

test("[C7] a fresh default-path answer whose citations are valid internal chunks ships those sources", async () => {
  const { r } = realVerifierRig();
  const out = await run(r);
  assert.equal(out.state, "allowed"); assert.equal(out.sources.internal.length, 1);
  assert.equal(out.sourceEvidence.length, 1); assert.equal(out.answer, TEXT);
});

test("[C7] a verification failure surfaces its real reason instead of a generic wipe", async () => {
  const { db, r } = realVerifierRig();
  db.rows("turns")[0]!.text = "Fee is 100. Edited.";
  const stale = await run(r);
  assert.equal(stale.state, "stale"); assert.deepEqual(stale.sources, { internal: [], web: [] });
  assert.match(stale.reason, /internal source evidence/i);
  assert.match(stale.reason, /turn|transcript|changed|withdrawn/i);
  const web = rig({ arms: false, verify: async (_t, b) => b.every((e) => e.origin === "internal") });
  const webOut = await run(web);
  assert.equal(webOut.state, "stale");
  assert.match(webOut.reason, /web evidence/i); assert.match(webOut.reason, /verif/i);
  const none = rig({ arms: false }); none.deps.tavilySearchFn = undefined;
  assert.doesNotMatch((await run(none)).reason, /cannot be verified/i, "an honest empty result is not reported as a verification failure");
});

test("[C7] deep mode keeps the previous stale wording (unchanged behavior)", async () => {
  const deep = rig({ verify: async () => false });
  const out = await run(deep, { filters: { sessionIds: [], sources: "all", mode: "deep" } });
  assert.equal(out.reason, "Stored candidate, policy or source evidence changed, was withdrawn, or cannot be verified.");
});

test("[F4] sources.internal is what the answer cites: one uncited chunk that fails verification does not wipe the cited, valid one", async () => {
  const r = rig({ extra: true, verify: async (_t, bindings) => bindings.every((e) => e.source.node_id === "n1") });
  const out = await run(r);
  assert.equal(out.state, "allowed"); assert.equal(out.answer, TEXT);
  assert.deepEqual(out.sources.internal.map((s) => s.node_id), ["n1"]);
  assert.equal(out.sourceEvidence.length, 1);
  assert.deepEqual(r.kinds, ["ask.answer", "ask.answer_grounding"]);
});

test("[F3] a verifier that throws never turns a persisted default-path run into a 500; it degrades to the generic stale wording like deep", async () => {
  for (const mode of [undefined, "deep"]) {
    const r = rig({ verify: async () => { throw new Error("evidence store down"); } });
    const out = await run(r, mode ? { filters: { sessionIds: [], sources: "all", mode } } : {});
    assert.equal(out.state, "stale"); assert.equal(out.answer, ""); assert.deepEqual(out.sources, { internal: [], web: [] });
    assert.equal(out.reason, "Stored candidate, policy or source evidence changed, was withdrawn, or cannot be verified.");
    assert.equal((await r.records.get("tenant-a", out.runId))?.id, out.runId, "the run was persisted before the verifier failed");
  }
});
