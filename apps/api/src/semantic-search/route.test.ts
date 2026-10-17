/** T-008: GET /search/semantic — auth scope, tenant from key only, flag-off absence. Fakes only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import type { SemanticSearchDeps } from "./route.js";
import { SemanticIndexPendingError } from "./readiness.js";

const keys = fakeKeyStore({
  "s-key": { tenantId: "tenant-1", scopes: ["search"] },
  "ask-key": { tenantId: "tenant-1", scopes: ["ask"] },
});
const H = { authorization: "Bearer s-key" };

test("readiness is authenticated, tenant pinned and exposes safe rebuild guidance without embedding", async () => {
  const calls: string[] = [];
  const readiness = { status: "reindex-required" as const, total: 1, bound: 0, legacy: 1, stale: 0,
    invalidVectors: 0, invalidModels: 0, modelCount: 1, dimensionCount: 1, uncoveredTurns: 0, pendingGaps: 0, queryModelCompatibility: "checked-on-search" as const };
  const deps: SemanticSearchDeps = { readiness: async tenant => { calls.push(tenant); return readiness; },
    search: async () => { throw new SemanticIndexPendingError(); } };
  const server = await startTestServer({ ...buildTestDeps({ keyStore: keys }), semanticSearch: deps });
  try {
    for (const headers of [{}, { authorization: "Bearer ask-key" }])
      assert.ok([401, 403].includes((await fetch(`${server.baseUrl}/search/semantic/readiness`, { headers })).status));
    assert.deepEqual(calls, []);
    const response = await fetch(`${server.baseUrl}/search/semantic/readiness?tenantId=foreign`, { headers: H });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), readiness); assert.deepEqual(calls, ["tenant-1"]);
    const pending = await fetch(`${server.baseUrl}/search/semantic?q=visa&mode=chunks`, { headers: H });
    assert.equal(pending.status, 503);
    assert.equal((await pending.json() as { error: string }).error, "semantic_index_pending");
  } finally { await server.close(); }
});

test("explicit chunks mode reaches authenticated store and bad modes or oversized queries refuse", async () => {
  const { deps, calls } = spy();
  const server = await startTestServer({ ...buildTestDeps({ keyStore: keys }), semanticSearch: deps });
  try {
    const res = await fetch(`${server.baseUrl}/search/semantic?q=visa&mode=chunks&tenantId=foreign`, { headers: H });
    assert.equal(res.status, 200);
    assert.equal((await res.json() as { mode: string }).mode, "chunks");
    assert.deepEqual(calls, [["tenant-1", "visa", 10, "chunks"]]);
    for (const query of ["q=x&mode=unknown", "q=x&mode=chunks&mode=sessions", `q=${"a".repeat(513)}`]) {
      assert.equal((await fetch(`${server.baseUrl}/search/semantic?${query}`, { headers: H })).status, 400);
    }
    assert.equal(calls.length, 1);
  } finally { await server.close(); }
});

function spy() {
  const calls: unknown[][] = [];
  const deps: SemanticSearchDeps = {
    async search(...a) {
      calls.push(a);
      return [{ chunkId: "c1", sessionId: "s1", score: 0.9, session: null }];
    },
  };
  return { deps, calls };
}

test("flag off (semanticSearch absent): route is not mounted, not a 200", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: keys }));
  try {
    const res = await fetch(`${server.baseUrl}/search/semantic?q=x`, { headers: H });
    assert.notEqual(res.status, 200);
  } finally {
    await server.close();
  }
});

test("with deps: search scope returns hits; tenant comes from the key, k is capped, a client tenant param is ignored", async () => {
  const { deps, calls } = spy();
  const server = await startTestServer({ ...buildTestDeps({ keyStore: keys }), semanticSearch: deps });
  try {
    const res = await fetch(`${server.baseUrl}/search/semantic?q=visa&k=9999&tenantId=evil`, { headers: H });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { hits: { chunkId: string }[] };
    assert.equal(body.hits[0]?.chunkId, "c1");
    assert.deepEqual(calls[0], ["tenant-1", "visa", 50]);
  } finally {
    await server.close();
  }
});

test("missing scope 403, no key 401, empty q 400 — deps never called", async () => {
  const { deps, calls } = spy();
  const server = await startTestServer({ ...buildTestDeps({ keyStore: keys }), semanticSearch: deps });
  try {
    assert.equal((await fetch(`${server.baseUrl}/search/semantic?q=x`, { headers: { authorization: "Bearer ask-key" } })).status, 403);
    assert.equal((await fetch(`${server.baseUrl}/search/semantic?q=x`)).status, 401);
    assert.equal((await fetch(`${server.baseUrl}/search/semantic?q=%20`, { headers: H })).status, 400);
    assert.equal(calls.length, 0);
  } finally {
    await server.close();
  }
});

test("a throwing store yields 503 without leaking the error", async () => {
  const deps: SemanticSearchDeps = {
    async search() {
      throw new Error("secret-detail");
    },
  };
  const server = await startTestServer({ ...buildTestDeps({ keyStore: keys }), semanticSearch: deps });
  try {
    const res = await fetch(`${server.baseUrl}/search/semantic?q=x`, { headers: H });
    assert.equal(res.status, 503);
    assert.ok(!(await res.text()).includes("secret-detail"));
  } finally {
    await server.close();
  }
});

test("ISS-T008SEARCH-001 recorded: oversized q is refused before the embedder (12000 chars, cap, cap+1, whitespace padding)", async () => {
  const { deps, calls } = spy();
  const server = await startTestServer({ ...buildTestDeps({ keyStore: keys }), semanticSearch: deps });
  try {
    let refused = 0;
    // recorded repro: q of 12000 chars. (200000 chars is cut off by Node's header limit, ECONNRESET; not replayable over HTTP.)
    for (const q of ["a".repeat(12000), "a".repeat(513), " ".repeat(600) + "visa", "visa" + " ".repeat(600)]) {
      const res = await fetch(`${server.baseUrl}/search/semantic?q=${encodeURIComponent(q)}`, { headers: H });
      assert.equal(res.status, 400, `q length ${q.length}`);
      refused++;
    }
    assert.equal(calls.length, 0, "deps.search never reached");
    const ok = await fetch(`${server.baseUrl}/search/semantic?q=${"a".repeat(512)}`, { headers: H });
    assert.equal(ok.status, 200, "cap itself is accepted");
    assert.equal(calls.length, 1);
    console.log(`ISS-T008SEARCH-001: ${refused}/4 oversized repros refused (12000 recorded + 3 padding/cap+1 variants); cap 512 accepted`);
  } finally { await server.close(); }
});

test("ISS-T008SEARCH-002: composition keeps semanticSearch dormant (D-173); no env flag can enable it", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../composition/production.ts", import.meta.url), "utf8");
  assert.match(src, /semanticSearch:\s*undefined/);
  assert.doesNotMatch(src, /semanticSearchEnabled|LKB_SEMANTIC_SEARCH/);
});
