/**
 * apps/api/src/routes/graph.test.ts — same DI/HTTP pattern as brain.test.ts.
 *
 * U-BRAIN extended this file rather than adding one: `apps/api/src/routes/` sits at exactly its
 * lint-dirsize budget (30/30), so a new test file there would be an automatic lint:structure FAIL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeGraphReadDeps } from "../fixtures.js";

test("GET /graph with the graph scope returns real nodes/edges", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "graph-key": { tenantId: "tenant-1", scopes: ["graph"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/graph`, { headers: { authorization: "Bearer graph-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { nodes: unknown[]; edges: unknown[] };
    assert.equal(body.nodes.length, 3);
    assert.equal(body.edges.length, 2);
  } finally {
    await server.close();
  }
});

test("GET /graph without the graph scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/graph`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("[C1] GET /graph carries the union: tree_index AND graph_edges nodes, edges typed, stats present", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "graph-key": { tenantId: "tenant-1", scopes: ["graph"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/graph`, { headers: { authorization: "Bearer graph-key" } });
    const body = (await res.json()) as {
      nodes: { id: string; label: string; kind: string; sources: string[] }[];
      edges: { source: string; target: string; type: string; inferred: boolean; evidence?: { turnId: string }[] }[];
      stats: { sessionsTotal: number; sessionsInGraph: number; sessionsMissing: unknown[]; edgeSources: { treeIndex: number; entityEdges: number } };
    };
    assert.ok(body.nodes.some((n) => n.sources.includes("tree_index")), "tree_index half present");
    assert.ok(body.nodes.some((n) => n.sources.includes("graph_edges")), "graph_edges half present — the collection no route used to read");
    for (const n of body.nodes) assert.ok(n.label.length > 0, `node ${n.id} must carry a label (C2)`);
    const spokeIn = body.edges.find((e) => e.type === "spoke_in");
    assert.ok(spokeIn, "edges carry `type` (the graph_edges field name), not `kind`");
    assert.deepEqual(spokeIn!.evidence?.map((e) => e.turnId), ["t1"], "evidence turnIds reach the client (C3)");
    assert.equal(body.stats.edgeSources.entityEdges, 1);
    assert.equal(body.stats.sessionsMissing.length, 0);
  } finally {
    await server.close();
  }
});

test("[I1] a second tenant's key gets 404 from /graph — no other tenant's node labels leak", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({
        "toc-key": { tenantId: "tenant-1", scopes: ["graph"] },
        "probe-key": { tenantId: "tenant-probe", scopes: ["graph"] },
      }),
    }),
  );
  try {
    const positive = await fetch(`${server.baseUrl}/graph`, { headers: { authorization: "Bearer toc-key" } });
    assert.equal(positive.status, 200, "positive control: the owning tenant still sees its graph");
    const probe = await fetch(`${server.baseUrl}/graph`, { headers: { authorization: "Bearer probe-key" } });
    assert.equal(probe.status, 404, "probe tenant must not reach tenant-1's graph");
    assert.doesNotMatch(await probe.text(), /Fixture Session|Anita|visas/, "not even a label may leak (ISS-078 class)");
  } finally {
    await server.close();
  }
});

test("GET /graph for a tenant with no tree index and no edges returns 404 with an explanatory message", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "graph-key": { tenantId: "tenant-empty", scopes: ["graph"] } }),
      graph: fakeGraphReadDeps(),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/graph`, { headers: { authorization: "Bearer graph-key" } });
    assert.equal(res.status, 404);
    // [C8]/[I1]: the 404 is KEPT (it is one of the cross-tenant probes) but it must say why, so
    // the UI can render an explanatory empty state instead of swallowing it.
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /no tree index has been built and no graph_edges rows exist/);
  } finally {
    await server.close();
  }
});
