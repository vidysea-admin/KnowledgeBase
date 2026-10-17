import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { AskV2Deps } from "@lkb/ask";
import { createAnswerPolicyService } from "./service.js";
import { createInMemoryAnswerPolicyStore } from "./store.js";
import { createInMemoryAnswerRecordStore } from "./answer-record-store.js";
import { createAnswerWorkflow, AnswerWorkflowError, answerGraphSelection, parseAnswerInput } from "./answer-workflow.js";
import { lookupEffectivePolicy } from "./application.js";
import { parsePolicyYaml, policyYaml, yamlSaveInput } from "./yaml.js";
import { simulateYamlPolicy } from "./yaml-simulation.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";

const actor = { actor: "api-key:tenant-a" }, sha = (s: string) => createHash("sha256").update(s).digest("hex");
const body = (over: Record<string, unknown> = {}) => ({ questionClass: "fees", mode: "internal-only", style: "detailed", onInsufficient: "review", note: "initial", ...over });
const input = (over: Record<string, unknown> = {}) => ({ query: "What is the fee?", questionClass: "fees", policyId: "fees", policyVersion: 1, evidenceMode: true, filters: { sessionIds: [], sources: "all" }, ...over });
function setup(score = .9, values = ["100", "200"]) {
  const policies = createAnswerPolicyService(createInMemoryAnswerPolicyStore()), records = createInMemoryAnswerRecordStore();
  let fresh = true, webCalls = 0;
  const jobs: Parameters<AskV2Deps["complete"]>[0][] = [];
  const nodes: TreeIndexNode[] = values.map((value, i) => ({ node_id: `n${i + 1}`, title: `Fee ${value}`, level: "session", summary: "",
    evidence: { sessionRef: `s${i + 1}` }, children: [] }));
  const tree: TreeIndexNode = { node_id: "root", title: "Tenant", level: "tenant", summary: "", children: nodes };
  const quoted = (node: TreeIndexNode) => {
    const quote = `Fee is ${values[Number(String(node.evidence!.sessionRef).slice(1)) - 1]}.`;
    return { id: `q-${node.node_id}`, nodeId: node.node_id, sessionRef: node.evidence!.sessionRef, turnId: `turn-${node.node_id}`, speakerRef: "spk:0", tStart: 10, tEnd: 20,
      charStart: 0, charEnd: quote.length, byteStart: 0, byteEnd: quote.length, turnTextSHA256: sha(quote), sliceSHA256: sha(quote), quote, origin: "speech" as const };
  };
  const completion = (json: unknown) => ({ json, text: JSON.stringify(json), provider: "offline", model: "structural-fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
  const deps: AskV2Deps = { tenantId: "tenant-a", scoreFn: () => [score, "offline retrieval fixture"], write: async () => {},
    treeSearchFn: (root, ids) => root.children.filter((n) => ids.includes(n.node_id)),
    webFallbackFn: () => { webCalls++; return []; }, tavilySearchFn: async () => { webCalls++; return []; },
    extraCandidateArmsFn: async () => ({ arms: [nodes], degraded: null }),
    sourceContext: { hydrate: async (_query, admitted) => ({ nodes: admitted.map((node) => ({ ...node, summary: JSON.stringify([quoted(node)]),
      evidence: { ...node.evidence, sourceQuotes: [quoted(node)], sourceSnapshotSHA256: sha("snapshot") } })), snapshotSHA256: sha("snapshot"), sourceBytes: 100 }) },
    complete: async (job) => {
      jobs.push(job);
      if (job.kind === "ask.select_nodes") return completion({ node_ids: nodes.map((n) => n.node_id) });
      const user = job.messages.find((m) => m.role === "user")!;
      const value = JSON.parse(user.content);
      if (job.kind === "ask.refine_batch") return completion({ decisions: value.strips.map((s: { id: string }) => ({ id: s.id, keep: true })) });
      if (job.kind === "ask.answer_grounding") return completion({ decisions: value.sentences.map((s: { id: string }) => ({ id: s.id, supported: true, answersQuery: true })) });
      return completion({ sentences: value.context.sources.map((s: { sourceId: string }, index: number) => ({ text: value.context.strips[index].text, sourceIds: [s.sourceId] })) });
    } };
  const workflow = () => createAnswerWorkflow(policies, records, async () => fresh);
  return { policies, records, workflow, deps, tree, jobs, stale: () => { fresh = false; }, webCalls: () => webCalls };
}
test("bounded YAML refuses executable structures, identity injection, weakened citations and duplicate keys; round trips version", async () => {
  const rig = setup(), policy = (await rig.policies.save("tenant-a", "fees", body(), actor)).revision;
  assert.equal(parsePolicyYaml(policyYaml(policy)).expectedVersion, 1);
  for (const attack of ['mode: !!js/function "x"', "mode: &anchor internal-only", "mode: *anchor", "mode: [internal-only]", " mode: internal-only", "mode: internal-only\nmode: internal-and-web", "tenantId: tenant-b", "citations: optional"]) {
    const yaml = `questionClass: fees\nmode: internal-only\nstyle: detailed\nonInsufficient: review\nnote: init\n${attack}\n`;
    assert.throws(() => yamlSaveInput(yaml));
  }
  assert.throws(() => parsePolicyYaml("x".repeat(8193)));
});
test("effective policy cannot cross tenants, mismatch class, be stale or bypass a live contradiction", async () => {
  const r = setup(); await r.policies.save("tenant-a", "fees", body(), actor);
  await assert.rejects(lookupEffectivePolicy(r.policies, "tenant-b", { policyId: "fees", questionClass: "fees" }));
  await assert.rejects(lookupEffectivePolicy(r.policies, "tenant-a", { policyId: "fees", questionClass: "career" }));
  await assert.rejects(lookupEffectivePolicy(r.policies, "tenant-a", { policyId: "fees", questionClass: "fees", expectedVersion: 2 }));
  await r.policies.save("tenant-a", "other", body({ mode: "internal-and-web" }), actor);
  assert.equal((await lookupEffectivePolicy(r.policies, "tenant-a", { policyId: "fees", questionClass: "fees" })).status, "conflict");
  await assert.rejects(r.workflow().execute("tenant-a", input(), actor, r.tree, r.deps), (e: unknown) => e instanceof AnswerWorkflowError && e.code === "policy_conflict");
  assert.equal(r.jobs.length, 0, "blocked selection dispatches no provider calls");
});
test("unsaved YAML simulation applies source/style/insufficiency to fresh actual Ask without writing policy or answer history", async () => {
  const r = setup(.6);
  const yaml = 'questionClass: fees\nmode: internal-only\nstyle: detailed\nonInsufficient: refuse\ncitations: required\nnote: Draft only\n';
  const reply = await simulateYamlPolicy("tenant-a", { policyId: "draft", yaml, query: "What is the fee?" }, { tree: { load: async (tenant) => tenant === "tenant-a" ? r.tree : null }, askDeps: r.deps });
  assert.equal(reply.transient, true); assert.equal(reply.simulation.decision, "refuse"); assert.equal(r.webCalls(), 0);
  assert.match(JSON.stringify(r.jobs.find((j) => j.kind === "ask.answer")), /detailed answer/);
  assert.deepEqual(await r.policies.list("tenant-a"), []); assert.deepEqual(await r.records.list("tenant-a", 100), []);
  await assert.rejects(simulateYamlPolicy("tenant-a", { policyId: "draft", yaml, query: "Fee", tenantId: "tenant-b" }, { tree: { load: async () => r.tree }, askDeps: r.deps }));
});
test("stored policy reaches the actual bounded Ask provider; filter suppresses foreign extra arms and both web paths", async () => {
  const r = setup(); await r.policies.save("tenant-a", "fees", body(), actor);
  const result = await r.workflow().execute("tenant-a", input({ filters: { sessionIds: ["s1"], sources: "all" } }), actor, r.tree, r.deps);
  assert.equal(result.state, "allowed"); assert.equal(result.answer, "Fee is 100."); assert.equal(result.policy!.version, 1);
  assert.equal(Object.hasOwn(result.policy!, "note"), false); assert.equal(Object.hasOwn(result.policy!, "changedBy"), false, "Ask scope exposes applied revision settings, not protected policy admin audit fields");
  assert.deepEqual(result.sources.internal.map((s) => s.node_id), ["n1"]); assert.equal(r.webCalls(), 0);
  assert.match(JSON.stringify(r.jobs.find((j) => j.kind === "ask.answer")), /detailed answer/);
  assert.equal((await r.workflow().history("tenant-a"))[0]!.result.answer, result.answer);
  assert.equal(result.auditLog.some((a) => Object.hasOwn(a, "costUsd") && a.costUsd === undefined), false, "undefined audit fields cannot acquire BSON null and change restart digests");
  assert.deepEqual(await r.workflow().history("tenant-b"), []);
  await assert.rejects(r.workflow().get("tenant-b", result.runId));
});
test("actual review candidate is held, fresh exact approval releases it, and concurrent/foreign reviews fail", async () => {
  const r = setup(.6); await r.policies.save("tenant-a", "fees", body(), actor);
  const app = r.workflow(), result = await app.execute("tenant-a", input(), actor, r.tree, r.deps);
  assert.equal(result.state, "review"); assert.equal(result.answer, ""); assert.equal(r.webCalls(), 0);
  const queue = await app.queue("tenant-a"); assert.match(queue[0]!.candidate.answer, /Fee is 100/); assert.equal(queue[0]!.evidence.length, 2);
  const review = { decision: "approved", note: "Checked both original quoted statements", candidateDigest: result.candidateDigest, evidenceDigest: result.evidenceDigest };
  await assert.rejects(app.review("tenant-b", result.runId, review, { actor: "api-key:tenant-b" }));
  const race = await Promise.allSettled([app.review("tenant-a", result.runId, review, actor), app.review("tenant-a", result.runId, review, actor)]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  const afterRestart = await r.workflow().get("tenant-a", result.runId);
  assert.equal(afterRestart.result.state, "approved"); assert.match(afterRestart.result.answer, /100/);
  await app.feedback("tenant-a", result.runId, { rating: "unhelpful", note: "The sources disagree" }, actor);
  assert.equal((await r.records.get("tenant-a", result.runId))!.feedback[0]!.rating, "unhelpful");
});
test("changed evidence or policy cannot authorize stale candidate approval; refusal cannot be approved", async () => {
  const r = setup(.6); await r.policies.save("tenant-a", "fees", body(), actor);
  const run = await r.workflow().execute("tenant-a", input(), actor, r.tree, r.deps);
  const decision = { decision: "approved", note: "reviewed", candidateDigest: run.candidateDigest, evidenceDigest: run.evidenceDigest };
  r.stale(); await assert.rejects(r.workflow().review("tenant-a", run.runId, decision, actor), /Source evidence changed/);
  const stale = await r.workflow().get("tenant-a", run.runId);
  assert.equal(stale.result.state, "stale"); assert.equal(stale.result.answer, ""); assert.deepEqual(stale.result.sourceEvidence, []);
  assert.deepEqual(stale.result.sources, { internal: [], web: [] });
  assert.equal((await r.workflow().queue("tenant-a"))[0]!.candidate.answer, "", "withdrawn snapshot is not exposed through candidate queue");
  const changed = setup(.6); await changed.policies.save("tenant-a", "fees", body(), actor);
  const beforeChange = await changed.workflow().execute("tenant-a", input(), actor, changed.tree, changed.deps);
  await changed.policies.save("tenant-a", "fees", body({ expectedVersion: 1, note: "New policy", style: "concise" }), actor);
  await assert.rejects(changed.workflow().review("tenant-a", beforeChange.runId, { ...decision, candidateDigest: beforeChange.candidateDigest, evidenceDigest: beforeChange.evidenceDigest }, actor), /Policy changed/);
  const r2 = setup(.6); await r2.policies.save("tenant-a", "fees", body({ onInsufficient: "refuse" }), actor);
  const refused = await r2.workflow().execute("tenant-a", input(), actor, r2.tree, r2.deps);
  assert.equal(refused.state, "refused"); assert.equal(refused.answer, ""); assert.equal((await r2.workflow().queue("tenant-a")).length, 0);
  await assert.rejects(r2.workflow().review("tenant-a", refused.runId, { ...decision, candidateDigest: refused.candidateDigest, evidenceDigest: refused.evidenceDigest }, actor));
});
test("reported evidence uses server-cited sources, holds original, resolves with attribution and reruns without losing provenance", async () => {
  const r = setup(); await r.policies.save("tenant-a", "fees", body(), actor);
  const app = r.workflow(), original = await app.execute("tenant-a", input(), actor, r.tree, r.deps);
  await assert.rejects(app.reportConflict("tenant-a", original.runId, { a: "fabricated", b: "internal:n2", explanation: "Conflict" }, actor));
  const conflict = await app.reportConflict("tenant-a", original.runId, { a: "internal:n1", b: "internal:n2", explanation: "One cited speaker says 100, another says 200." }, actor);
  assert.equal((await app.get("tenant-a", original.runId)).result.answer, "");
  await assert.rejects(app.resolveConflict("tenant-b", conflict.id, { keepSourceId: "internal:n1", note: "Preferred", evidenceDigest: conflict.evidenceDigest }, actor));
  const resolved = await app.resolveConflict("tenant-a", conflict.id, { keepSourceId: "internal:n1", note: "First source is the reviewed current statement", evidenceDigest: conflict.evidenceDigest }, actor);
  assert.equal(resolved.resolution.by.actor, actor.actor); assert.equal(resolved.resolution.excludeSourceId, "internal:n2");
  const alias = { ...r.tree.children[1]!, node_id: "renamed-session-alias" };
  const aliasTree = { ...r.tree, children: [...r.tree.children, alias] };
  const aliasDeps = { ...r.deps, extraCandidateArmsFn: async () => ({ arms: [[alias]], degraded: null }),
    complete: async (job: Parameters<typeof r.deps.complete>[0]) => job.kind === "ask.select_nodes"
      ? { text: '{"node_ids":["n1","renamed-session-alias"]}', json: { node_ids: ["n1", "renamed-session-alias"] }, provider: "offline", model: "alias-fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } }
      : r.deps.complete(job) };
  const rerun = await app.execute("tenant-a", input({ resolutionId: conflict.id }), actor, aliasTree, aliasDeps);
  assert.equal(rerun.answer, "Fee is 100."); assert.deepEqual(rerun.sources.internal.map((s) => s.node_id), ["n1"]);
  assert.equal((await r.records.get("tenant-a", original.runId))!.evidence.length, 2, "original provenance never deleted");
  assert.equal((await app.get("tenant-a", original.runId)).result.state, "conflicted", "resolution does not relabel the old candidate");
  r.stale(); await assert.rejects(app.execute("tenant-a", input({ resolutionId: conflict.id }), actor, r.tree, r.deps), /Source evidence changed/);
});

test("all reported conflicts must be resolved and every rejected canonical source is excluded", async () => {
  const r = setup(.9, ["100", "200", "300"]); await r.policies.save("tenant-a", "fees", body(), actor);
  const app = r.workflow(), original = await app.execute("tenant-a", input(), actor, r.tree, r.deps);
  assert.equal(original.sourceEvidence.length, 3);
  const first = await app.reportConflict("tenant-a", original.runId, { a: "internal:n1", b: "internal:n2", explanation: "100 conflicts with 200" }, actor);
  const second = await app.reportConflict("tenant-a", original.runId, { a: "internal:n1", b: "internal:n3", explanation: "100 conflicts with 300" }, actor);
  await app.resolveConflict("tenant-a", first.id, { keepSourceId: "internal:n1", note: "Prefer 100", evidenceDigest: first.evidenceDigest }, actor);
  const before = r.jobs.length;
  await assert.rejects(app.execute("tenant-a", input({ resolutionId: first.id }), actor, r.tree, r.deps), /Resolve every reported/);
  assert.equal(r.jobs.length, before, "another pending conflict blocks before any provider call");
  await app.resolveConflict("tenant-a", second.id, { keepSourceId: "internal:n1", note: "Prefer 100 over 300 too", evidenceDigest: second.evidenceDigest }, actor);
  const rerun = await app.execute("tenant-a", input({ resolutionId: first.id }), actor, r.tree, r.deps);
  assert.equal(rerun.answer, "Fee is 100."); assert.deepEqual(rerun.sources.internal.map((s) => s.node_id), ["n1"]);
  // A later report on the original evidence also withholds already saved descendants.
  await app.reportConflict("tenant-a", original.runId, { a: "internal:n2", b: "internal:n3", explanation: "Another reported contradiction" }, actor);
  const published = await app.get("tenant-a", rerun.runId);
  assert.equal(published.result.state, "conflicted"); assert.equal(published.result.answer, "");
});

test("a new conflict reported while a resolution rerun is pending prevents saving its candidate", async () => {
  const r = setup(.9, ["100", "200", "300"]); await r.policies.save("tenant-a", "fees", body(), actor);
  const app = r.workflow(), original = await app.execute("tenant-a", input(), actor, r.tree, r.deps);
  const first = await app.reportConflict("tenant-a", original.runId, { a: "internal:n1", b: "internal:n2", explanation: "100 conflicts with 200" }, actor);
  await app.resolveConflict("tenant-a", first.id, { keepSourceId: "internal:n1", note: "Prefer 100", evidenceDigest: first.evidenceDigest }, actor);
  let release!: () => void, entered!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; }), dispatched = new Promise<void>((resolve) => { entered = resolve; });
  const deps = { ...r.deps, complete: async (job: Parameters<typeof r.deps.complete>[0]) => {
    if (job.kind === "ask.select_nodes") { entered(); await pending; } return r.deps.complete(job);
  } };
  const rerun = app.execute("tenant-a", input({ resolutionId: first.id }), actor, r.tree, deps);
  await dispatched;
  await app.reportConflict("tenant-a", original.runId, { a: "internal:n1", b: "internal:n3", explanation: "New conflict arrived during generation" }, actor);
  release(); await assert.rejects(rerun, /Resolve every reported/);
  assert.equal((await r.records.list("tenant-a", 100)).length, 1, "no descendant is saved after the conflict-set race");
});

test("saved allowed and approved answers fail closed after policy revision, retirement or contradiction", async () => {
  for (const change of ["revision", "retirement", "contradiction"] as const) {
    for (const score of [.9, .6]) {
      const r = setup(score); await r.policies.save("tenant-a", "fees", body(), actor);
      const app = r.workflow(), answer = await app.execute("tenant-a", input(), actor, r.tree, r.deps);
      if (score === .6) await app.review("tenant-a", answer.runId, { decision: "approved", note: "Reviewed", candidateDigest: answer.candidateDigest, evidenceDigest: answer.evidenceDigest }, actor);
      if (change === "revision") await r.policies.save("tenant-a", "fees", body({ expectedVersion: 1, style: "concise", note: "Revised" }), actor);
      if (change === "retirement") await r.policies.retire("tenant-a", "fees", { expectedVersion: 1, note: "Retired" }, actor);
      if (change === "contradiction") await r.policies.save("tenant-a", "other", body({ mode: "internal-and-web", note: "Conflicting" }), actor);
      for (const result of [(await app.get("tenant-a", answer.runId)).result, (await app.history("tenant-a"))[0]!.result]) {
        assert.equal(result.state, "stale", change); assert.equal(result.answer, "");
        assert.deepEqual(result.sources, { internal: [], web: [] }); assert.deepEqual(result.sourceEvidence, []);
      }
      if (score === .6) {
        const queued = (await app.queue("tenant-a"))[0]!;
        assert.equal(queued.candidate.answer, ""); assert.deepEqual(queued.evidence, []);
      }
    }
  }
});

test("new saved policy invalidates a default-policy answer and its pending review", async () => {
  const r = setup(.6), app = r.workflow();
  const answer = await app.execute("tenant-a", input({ policyId: undefined, policyVersion: undefined }), actor, r.tree, r.deps);
  await r.policies.save("tenant-a", "fees", body(), actor);
  assert.equal((await app.get("tenant-a", answer.runId)).result.state, "stale");
  assert.equal((await app.queue("tenant-a"))[0]!.candidate.answer, "");
  await assert.rejects(app.review("tenant-a", answer.runId, { decision: "approved", note: "Reviewed", candidateDigest: answer.candidateDigest, evidenceDigest: answer.evidenceDigest }, actor), /effective policy changed/);
});

test("stored candidate and evidence digest corruption cannot release or expose review content", async () => {
  for (const target of ["candidate", "evidence"] as const) {
    const r = setup(.6); await r.policies.save("tenant-a", "fees", body(), actor);
    const app = r.workflow(), answer = await app.execute("tenant-a", input(), actor, r.tree, r.deps);
    const get = r.records.get.bind(r.records);
    r.records.get = async (tenant, id) => {
      const run = await get(tenant, id); if (!run) return null;
      if (target === "candidate") run.candidate.answer = "corrupted answer";
      else run.evidence[0]!.excerpt = "corrupted excerpt";
      return run;
    };
    r.records.reviewItems = async (tenant) => [(await r.records.get(tenant, answer.runId))!];
    assert.equal((await app.get("tenant-a", answer.runId)).result.state, "stale");
    const queued = (await app.queue("tenant-a"))[0]!;
    assert.equal(queued.candidate.answer, ""); assert.deepEqual(queued.evidence, []);
  }
});

test("graph selector parser preserves absent legacy shape, deduplicates trimmed canonical IDs and bounds both dimensions", () => {
  assert.deepEqual(parseAnswerInput({ query: "Question" }).filters, { sessionIds: [], sources: "all" });
  assert.equal(answerGraphSelection(parseAnswerInput({ query: "Question" }).filters), undefined);
  const parsed = parseAnswerInput({ query: "Question", filters: { speakerRefs: [" person:alice ", "person:alice"], topicRefs: ["tenant-a:fees"] } });
  assert.deepEqual(parsed.filters, { sessionIds: [], sources: "all", speakerRefs: ["person:alice"], topicRefs: ["tenant-a:fees"] });
  const selection = answerGraphSelection(parsed.filters)!;
  selection.speakerRefs!.push("person:bob"); assert.deepEqual(parsed.filters.speakerRefs, ["person:alice"], "factory hints cannot mutate saved filters");
  assert.deepEqual(parseAnswerInput({ query: "Question", filters: { speakerRefs: [], topicRefs: [] } }).filters,
    { sessionIds: [], sources: "all", speakerRefs: [], topicRefs: [] });
  for (const filters of [{ speakerRefs: null }, { speakerRefs: ["person:"] }, { speakerRefs: ["spk:0"] },
    { topicRefs: ["topic:fees\nprivate"] }, { topicRefs: ["topic:" + "x".repeat(200)] }, { topicRefs: [false] },
    { speakerRefs: ["person:alice"], topicRefs: Array.from({ length: 16 }, (_, n) => `topic:${n}`) }]) {
    assert.throws(() => parseAnswerInput({ query: "Question", filters }), (e) => e instanceof AnswerWorkflowError && e.code === "bad_request");
  }
  assert.throws(() => parseAnswerInput({ query: "Question", speakerRefs: ["person:alice"] }), /Unknown Ask request field/);
});

test("graph selector mounted durable Ask persists normalized selection in restart history without changing freshness guards", async () => {
  const r = setup(); await r.policies.save("tenant-a", "fees", body(), actor);
  const workflow = r.workflow(), calls: unknown[] = [];
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  base.ask.tree = { load: async () => r.tree }; base.ask.answerWorkflow = workflow; base.answerWorkflow = workflow;
  base.ask.requestDepsFor = (tenant, selection) => { calls.push({ tenant, selection }); return r.deps; };
  const server = await startTestServer(base);
  try {
    const filters = { sessionIds: ["s1"], sources: "internal", speakerRefs: [" person:alice ", "person:alice"], topicRefs: ["topic:fees"] };
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer a-key" },
      body: JSON.stringify(input({ filters })) });
    assert.equal(reply.status, 200); const result = await reply.json() as { runId: string; answer: string };
    assert.equal(result.answer, "Fee is 100.");
    assert.deepEqual(calls, [{ tenant: "tenant-a", selection: { speakerRefs: ["person:alice"], topicRefs: ["topic:fees"] } }]);
    const expected = { ...filters, speakerRefs: ["person:alice"] };
    assert.deepEqual((await r.records.get("tenant-a", result.runId))!.filters, expected);
    const history = await fetch(server.baseUrl + "/answer-history", { headers: { authorization: "Bearer a-key" } });
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json() as { history: { filters: unknown }[] }).history[0]!.filters, expected);
    assert.deepEqual((await r.workflow().history("tenant-a"))[0]!.filters, expected, "new workflow over persisted fixture retains selection");
    assert.deepEqual(await r.workflow().history("tenant-b"), []);
    r.stale(); assert.equal((await r.workflow().get("tenant-a", result.runId)).result.state, "stale");
  } finally { await server.close(); }
});

test("graph selector conflict replay refuses changed selection before provider calls", async () => {
  const r = setup(); await r.policies.save("tenant-a", "fees", body(), actor);
  const app = r.workflow(), filters = { sessionIds: [], sources: "all", speakerRefs: ["person:alice"], topicRefs: ["topic:fees"] };
  const original = await app.execute("tenant-a", input({ filters }), actor, r.tree, r.deps);
  const conflict = await app.reportConflict("tenant-a", original.runId, { a: "internal:n1", b: "internal:n2", explanation: "Fees disagree" }, actor);
  await app.resolveConflict("tenant-a", conflict.id, { keepSourceId: "internal:n1", note: "Reviewed original evidence", evidenceDigest: conflict.evidenceDigest }, actor);
  const before = r.jobs.length;
  await assert.rejects(app.execute("tenant-a", input({ filters: { ...filters, speakerRefs: ["person:bob"] }, resolutionId: conflict.id }), actor, r.tree, r.deps), /different answer selection/);
  assert.equal(r.jobs.length, before);
  const replay = await app.execute("tenant-a", input({ filters, resolutionId: conflict.id }), actor, r.tree, r.deps);
  assert.equal(replay.answer, "Fee is 100.");
  assert.deepEqual((await r.records.get("tenant-a", replay.runId))!.filters, filters);
});
