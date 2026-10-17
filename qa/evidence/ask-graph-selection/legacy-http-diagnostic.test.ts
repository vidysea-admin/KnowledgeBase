/** Approved one-fixture diagnostic. Original source SHA256: 0d2d59299e5e5696ebf57f6b6bd80e485474a822d6aeccd401f0b487c5e55c03. No assertion or active runtime policy changes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createSourceRequestDepsFor } from "../../../apps/api/src/ask/source-context.js";
import { startTestServer } from "../../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../../apps/api/src/fixtures.js";

test("legacy vector opt-in HTTP composition gives request factory sole ownership of arms and shared embed", async (t) => {
  let legacyFactory = 0, embedCalls = 0, vectorReads = 0;
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
      if (name === "chunks") vectorReads++;
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
    vectorless: false, db, write: async () => {}, treeSearchFn: (_root, ids) => tree.children.filter((n) => ids.includes(n.node_id)),
    embed: async () => { embedCalls++; return { vectors: [[1, 0]], dims: 2, provider: "offline", model: "offline" }; },
    dispatch: async (job) => {
      assert.ok(!job.messages.some((m) => m.content.includes("PRIVATE")));
      if (job.kind === "ask.select_nodes") return complete({ node_ids: [] });
      if (job.kind === "evaluator") return complete({ score: 0.9, reason: "source answers" });
      if (job.kind === "ask.answer_grounding") return complete({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = JSON.parse(job.messages[1]!.content).context;
      assert.equal(context.strips[0]?.sourceIndex, 0);
      assert.equal(context.strips[0]?.text, "Visa forms open in October.");
      assert.deepEqual(context.sources[0]?.source, { speakerRef: "spk:0", turnId: "s-t1", sessionRef: "s", tStart: 10, tEnd: 20 });
      assert.equal(typeof context.sources[0]?.sourceId, "string");
      return complete({ sentences: [{ text: "The source says forms open in October.", sourceIds: [context.sources[context.strips[0].sourceIndex].sourceId] }] });
    },
  });
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST", headers: { "content-type": "application/json",
      authorization: "Bearer ask-key" }, body: JSON.stringify({ query: "Visa October" }) });
    const diagnosticBody = await reply.clone().json().catch(() => null) as { error?: unknown } | null;
    const safeCodes = new Set(["source_context_unavailable", "payload_too_large", "bad_request", "answer_history_unavailable"]);
    const errorCode = typeof diagnosticBody?.error === "string" && safeCodes.has(diagnosticBody.error) ? diagnosticBody.error : "unclassified";
    t.diagnostic(JSON.stringify({ status: reply.status, errorCode, embedCalls, vectorReads, legacyFactoryCalls: legacyFactory }));
    assert.equal(reply.status, 200);
    assert.equal(legacyFactory, 0);
    assert.equal(embedCalls, 1);
    const result = await reply.json() as { sources: { internal: { evidence: { sourceQuotes: { turnId: string }[] } }[] } };
    assert.equal(result.sources.internal[0]!.evidence.sourceQuotes[0]!.turnId, "s-t1");
  } finally { await server.close(); }
});
