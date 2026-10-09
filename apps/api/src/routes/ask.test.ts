import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createSourceRequestDepsFor } from "../ask/source-context.js";
import { BoundedAskError } from "@lkb/ask";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeAskDeps } from "../fixtures.js";

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

test("actual HTTP composition gives request factory sole ownership of arms and shared embed", async () => {
  let legacyFactory = 0, embedCalls = 0;
  const tree = { node_id: "tenant:toc", title: "TOC", level: "tenant" as const, summary: "PRIVATE".repeat(350000), children: [{
    node_id: "tenant:toc/session:s", title: "Visa October", level: "session" as const, summary: "PRIVATE",
    evidence: { sessionRef: "s" }, children: [] }] };
  const rows: Record<string, unknown[]> = {
    turns: [{ _id: "s-t1", tenantId: "toc", sessionId: "s", speakerRef: "spk:0", tStart: 10, tEnd: 20, text: "Visa forms open in October." }],
    chunks: [{ _id: "c", tenantId: "toc", sourceRef: "s", turnRefs: ["s-t1"], chunkIndex: 0,
      vector: [1, 0], dims: 2, embeddingModel: "offline" }],
  };
  const db = { collection: (name: string) => ({ find: (filter: Record<string, unknown>) => ({
    toArray: async () => {
      assert.equal(filter.tenantId, "toc");
      return rows[name] ?? [];
    },
  }) }) } as unknown as Pick<Db, "collection">;
  const complete = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "test",
    costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "ask-key": { tenantId: "toc", scopes: ["ask"] } }) });
  base.ask.tree = { load: async () => tree };
  base.ask.extraCandidateArmsFor = () => {
    legacyFactory++;
    return async () => ({ arms: [], degraded: null });
  };
  base.ask.requestDepsFor = createSourceRequestDepsFor({
    db, write: async () => {}, treeSearchFn: (_root, ids) => tree.children.filter((n) => ids.includes(n.node_id)),
    embed: async () => { embedCalls++; return { vectors: [[1, 0]], dims: 2, provider: "offline", model: "offline" }; },
    dispatch: async (job) => {
      assert.ok(!job.messages.some((m) => m.content.includes("PRIVATE")));
      if (job.kind === "ask.select_nodes") return complete({ node_ids: [] });
      if (job.kind === "evaluator") return complete({ score: 0.9, reason: "source answers" });
      if (job.kind === "ask.answer_grounding") return complete({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = JSON.parse(JSON.parse(job.messages[1]!.content).context);
      return complete({ sentences: [{ text: "The source says forms open in October.", sourceIds: [context[0].sourceId] }] });
    },
  });
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST", headers: { "content-type": "application/json",
      authorization: "Bearer ask-key" }, body: JSON.stringify({ query: "Visa October" }) });
    assert.equal(reply.status, 200);
    assert.equal(legacyFactory, 0);
    assert.equal(embedCalls, 1);
    const result = await reply.json() as { sources: { internal: { evidence: { sourceQuotes: { turnId: string }[] } }[] } };
    assert.equal(result.sources.internal[0]!.evidence.sourceQuotes[0]!.turnId, "s-t1");
  } finally { await server.close(); }
});
