import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceRequestDepsFor } from "../../ask/source-context.js";
import { BoundedAskError } from "@lkb/ask";
import { unpackContext } from "../../../../../packages/ask/src/bounded-refine.js";
import { publicPreservedReviewFixture, PUBLIC_REVIEW_TURN } from "../../indexing/public-preserved-review.fixture.js";
import { startTestServer } from "../../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeAskDeps } from "../../fixtures.js";

test("POST /ask binds request factory to verified tenant and returns explicit audited source refusal", async () => {
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  const tenants: string[] = [], writes: unknown[] = [];
  base.ask.requestDepsFor = (tenantId) => {
    tenants.push(tenantId);
    return { ...fakeAskDeps(), write: async (j) => { writes.push(j); },
      sourceContext: { hydrate: async () => { throw new BoundedAskError("source offset invalid"); } } };
  };
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer a-key" },
      body: JSON.stringify({ query: "topic one", tenantId: "foreign" }) });
    assert.equal(reply.status, 503);
    const payload = await reply.json() as { error: string; message: string; answer?: string };
    assert.equal(payload.error, "source_context_unavailable");
    assert.equal(payload.answer, undefined);
    assert.deepEqual(tenants, ["tenant-a"]);
    assert.ok(writes.some((w) => (w as { kind: string }).kind === "ask.source_context_refused"));
  } finally { await server.close(); }
});
test("missing Ask scope prevents source factory and retrieval calls", async () => {
  let calls = 0;
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "read-key": { tenantId: "toc", scopes: ["sessions"] } }) });
  base.ask.requestDepsFor = () => { calls++; return fakeAskDeps(); };
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer read-key" }, body: JSON.stringify({ query: "visa" }) });
    assert.equal(reply.status, 403); assert.equal(calls, 0);
  } finally { await server.close(); }
});

test("public Ask ignores explicit vector false and legacy ports while returning current exact cited source", async () => {
  let legacyFactory = 0, embedCalls = 0, vectorReads = 0;
  const f = publicPreservedReviewFixture({ preserveReview: false });
  const leaf = { node_id: "tenant:tenant-a/session:session-a", title: "Fee policy", level: "session" as const, summary: "PRIVATE", evidence: { sessionRef: "session-a" }, children: [] };
  const tree = { node_id: "tenant:tenant-a", title: "Knowledge", level: "tenant" as const, summary: "PRIVATE", children: [leaf] };
  const db = new Proxy(f.db, { get(target, key) {
    if (key !== "collection") return Reflect.get(target, key, target);
    return (name: string) => { if (/chunk|vector|embedding/i.test(name)) { vectorReads++; throw new Error("public vector access forbidden"); } return target.collection(name); };
  } });
  const complete = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "test", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "ask-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  base.ask.tree = { load: async () => tree };
  base.ask.extraCandidateArmsFor = () => { legacyFactory++; throw new Error("legacy retrieval factory forbidden"); };
  base.ask.requestDepsFor = createSourceRequestDepsFor({ vectorless: false, db, write: async () => {}, treeSearchFn: (_root, ids) => tree.children.filter(n => ids.includes(n.node_id)),
    embed: async () => { embedCalls++; throw new Error("public embedding forbidden"); }, dispatch: async job => {
      assert.ok(!job.messages.some(m => m.content.includes("PRIVATE")));
      if (job.kind === "ask.select_nodes") return complete({ node_ids: [] });
      if (job.kind === "evaluator") return complete({ score: 0.9, reason: "source answers" });
      if (job.kind === "ask.answer_grounding") return complete({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = unpackContext(JSON.parse(job.messages[1]!.content).context);
      assert.ok(context.length > 0);
      assert.ok(context.every(strip => strip.sourceId === context[0]!.sourceId));
      assert.equal(context.map(strip => strip.text).join(" "), PUBLIC_REVIEW_TURN.text);
      return complete({ sentences: [{ text: PUBLIC_REVIEW_TURN.text, sourceIds: [context[0]!.sourceId] }] });
    } });
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer ask-key" }, body: JSON.stringify({ query: "fee rupees" }) });
    assert.equal(reply.status, 200); assert.equal(legacyFactory, 0); assert.equal(embedCalls, 0); assert.equal(vectorReads, 0);
    const result = await reply.json() as { answer: string; sources: { internal: { evidence: { sourceQuotes: { turnId: string; quote: string }[] } }[] } };
    assert.equal(result.answer, PUBLIC_REVIEW_TURN.text); assert.equal(result.sources.internal[0]!.evidence.sourceQuotes[0]!.turnId, "t1");
    assert.equal(result.sources.internal[0]!.evidence.sourceQuotes[0]!.quote, PUBLIC_REVIEW_TURN.text);
  } finally { await server.close(); }
});

test("public Ask never invokes the legacy arms fallback when request factory is absent", async () => {
  let legacyFactory = 0;
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "ask-key": { tenantId: "toc", scopes: ["ask"] } }) });
  base.ask.requestDepsFor = undefined; base.ask.extraCandidateArmsFor = () => { legacyFactory++; throw new Error("legacy vector fallback forbidden"); };
  const server = await startTestServer(base);
  try {
    const response = await fetch(server.baseUrl + "/ask", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer ask-key" }, body: JSON.stringify({ query: "topic one" }) });
    assert.equal(response.status, 200); assert.equal(legacyFactory, 0);
  } finally { await server.close(); }
});

test("graph selector /ask forwards only normalized parsed hints with verified tenant", async () => {
  const calls: { tenant: string; selection: unknown }[] = [];
  const base = buildTestDeps({ keyStore: fakeKeyStore({
    "a-key": { tenantId: "tenant-a", scopes: ["ask"] }, "b-key": { tenantId: "tenant-b", scopes: ["ask"] },
  }) });
  base.ask.requestDepsFor = (tenant, selection) => { calls.push({ tenant, selection }); return fakeAskDeps(); };
  const server = await startTestServer(base);
  try {
    for (const [key, tenant] of [["a-key", "tenant-a"], ["b-key", "tenant-b"]]) {
      const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({
          query: "topic one", tenantId: "foreign", speakerRefs: ["person:forged"],
          filters: { speakerRefs: [" person:alice ", "person:alice"], topicRefs: ["topic:fees", " topic:fees "] },
        }) });
      assert.equal(reply.status, 200);
      assert.deepEqual(calls.at(-1), { tenant, selection: { speakerRefs: ["person:alice"], topicRefs: ["topic:fees"] } });
    }
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer a-key" }, body: JSON.stringify({ query: "topic one" }) });
    assert.equal(reply.status, 200); assert.deepEqual(calls.at(-1), { tenant: "tenant-a", selection: undefined });
  } finally { await server.close(); }
});

test("graph selector /ask rejects malformed hints before tree or factory and fails closed without graph factory", async () => {
  let treeCalls = 0, factoryCalls = 0;
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  const load = base.ask.tree.load; base.ask.tree.load = async (tenant) => { treeCalls++; return load(tenant); };
  base.ask.requestDepsFor = () => { factoryCalls++; return fakeAskDeps(); };
  const server = await startTestServer(base);
  try {
    for (const filters of [{ speakerRefs: "person:alice" }, { speakerRefs: ["person:"] }, { speakerRefs: ["tenant-b/person:alice"] },
      { topicRefs: ["topic:fees\u0000"] }, { topicRefs: [null] }, { topicRefs: Array.from({ length: 17 }, (_, n) => `topic:${n}`) },
      { speakerRefs: ["person:alice"], topicRefs: Array.from({ length: 16 }, (_, n) => `topic:${n}`) }, { tenantId: "tenant-b" }]) {
      const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer a-key" }, body: JSON.stringify({ query: "topic one", filters }) });
      assert.equal(reply.status, 400, JSON.stringify(filters));
    }
    assert.equal(treeCalls, 0); assert.equal(factoryCalls, 0);
    base.ask.requestDepsFor = undefined;
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer a-key" },
      body: JSON.stringify({ query: "topic one", filters: { speakerRefs: ["person:alice"] } }) });
    assert.equal(reply.status, 503); assert.equal(treeCalls, 0);
  } finally { await server.close(); }
});

test("graph selector /ask keeps foreign canonical hints inside verified tenant authority", async () => {
  let checked = 0;
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  base.ask.requestDepsFor = (tenant, selection) => {
    assert.equal(tenant, "tenant-a"); assert.deepEqual(selection, { topicRefs: ["tenant-b:fees"] }); checked++;
    throw new BoundedAskError("selected graph authority unavailable");
  };
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer a-key" },
      body: JSON.stringify({ query: "topic one", filters: { topicRefs: ["tenant-b:fees"] } }) });
    assert.equal(reply.status, 503); assert.equal(checked, 1);
    assert.equal((await reply.json() as { answer?: string }).answer, undefined);
  } finally { await server.close(); }
});
