/** T-008: GET /search/semantic — auth scope, tenant from key only, flag-off absence. Fakes only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import type { SemanticSearchDeps } from "./route.js";

const keys = fakeKeyStore({
  "s-key": { tenantId: "tenant-1", scopes: ["search"] },
  "ask-key": { tenantId: "tenant-1", scopes: ["ask"] },
});
const H = { authorization: "Bearer s-key" };

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
