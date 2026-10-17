/**
 * apps/api/src/server.test.ts — T-009 C7. In-process HTTP requests (via `testUtils.ts`'s
 * ephemeral-port helper) against `createServer(deps)` with fakes for every injected dependency.
 * Covers: valid key + `ask` scope -> 200 `AskResult`; missing/invalid key -> 401; valid key
 * missing `ask` scope on `/ask` -> 403; webhook scope/hosting configuration refusals -> 403/503;
 * rate limit trips after N requests -> 429 with `Retry-After`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeTreeStore, fakeAskDeps } from "./fixtures.js";

test("mounted grounded-content route consumes tenant-scoped BrainReadDeps and refuses unauthenticated reads", async () => {
  const calls: string[][] = [];
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ reader: { tenantId: "tenant-a", scopes: ["sessions"] } }) });
  deps.brain.getSessionDetail = async (tenant, id) => {
    calls.push([tenant, id]);
    return { session: { _id: id, tenantId: tenant, sourceId: "src", title: "Session", date: "2026-10-14",
      status: { transcribe: "done", index: "done" } }, claims: [], turns: [], page: null };
  };
  const server = await startTestServer(deps);
  try {
    assert.equal((await fetch(`${server.baseUrl}/sessions/session-1/grounded-content`)).status, 401);
    assert.deepEqual(calls, []);
    const response = await fetch(`${server.baseUrl}/sessions/session-1/grounded-content`, { headers: { authorization: "Bearer reader" } });
    assert.equal(response.status, 200); assert.deepEqual(calls, [["tenant-a", "session-1"]]);
    assert.deepEqual(await response.json(), { sessionId: "session-1", notes: [], qa: [], claims: [] });
  } finally { await server.close(); }
});

test("POST /ask with a valid key + ask scope returns 200 with an AskResult shape", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer good-ask-key" },
      body: JSON.stringify({ query: "topic one" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.verdict, "correct");
    assert.equal(body.answer, "This is the fake answer.");
    assert.ok(Array.isArray(body.auditLog));
    assert.ok(typeof body.sources === "object" && body.sources !== null);
  } finally {
    await server.close();
  }
});

test("POST /ask with no Authorization header returns 401", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "topic one" }),
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "unauthorized");
  } finally {
    await server.close();
  }
});

test("POST /ask with an invalid/unknown key returns 401", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer not-a-real-key" },
      body: JSON.stringify({ query: "topic one" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("POST /ask with a valid key that lacks the ask scope returns 403, not 401", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "no-ask-scope-key": { tenantId: "tenant-1", scopes: ["sources"] } }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer no-ask-scope-key" },
      body: JSON.stringify({ query: "topic one" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "forbidden");
  } finally {
    await server.close();
  }
});

test("a webhooks-only key cannot register without the hosting scope", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "sources-key": { tenantId: "tenant-1", scopes: ["webhooks"] } }),
    }),
  );
  try {
    const postRes = await fetch(`${server.baseUrl}/webhooks/register`, {
      method: "POST",
      headers: { authorization: "Bearer sources-key" },
    });
    assert.equal(postRes.status, 403);
    const postBody = (await postRes.json()) as { error: string; message: string };
    assert.equal(postBody.error, "forbidden");
    assert.match(postBody.message, /missing the required "hosting" scope/);
  } finally {
    await server.close();
  }
});

test("a valid key lacking hosting scope gets 403 before webhook configuration is read", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/webhooks/register`, { method: "POST", headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("a hosting and webhooks key gets 503 when hosting runtime is not configured", async () => {
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ "hosting-key": { tenantId: "tenant-1", scopes: ["hosting", "webhooks"] } }),
  }));
  try {
    const res = await fetch(`${server.baseUrl}/webhooks/register`, {
      method: "POST", headers: { authorization: "Bearer hosting-key" },
    });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "1");
    const body = await res.json();
    assert.ok(body && typeof body === "object" && "error" in body);
    assert.equal(body.error, "hosting_unavailable");
  } finally { await server.close(); }
});

test("rate limit trips after N requests with 429 and a Retry-After header", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "rl-key": { tenantId: "tenant-rl", scopes: ["search"] } }),
      rateLimit: { windowMs: 60_000, max: 2 },
    }),
  );
  try {
    // /search is real now (plan §10 U0.7) — no `q` param means 400, not 501, but the rate
    // limiter counts every request regardless of what the route itself would answer, which is
    // exactly the ordering this test exists to prove.
    const headers = { authorization: "Bearer rl-key" };
    const first = await fetch(`${server.baseUrl}/search`, { headers });
    const second = await fetch(`${server.baseUrl}/search`, { headers });
    const third = await fetch(`${server.baseUrl}/search`, { headers });

    assert.equal(first.status, 400);
    assert.equal(second.status, 400);
    assert.equal(third.status, 429);
    assert.ok(third.headers.get("retry-after"), "429 response must carry a Retry-After header");
    const body = (await third.json()) as { error: string };
    assert.equal(body.error, "rate_limited");
  } finally {
    await server.close();
  }
});

test("fixtures sanity: fakeTreeStore/fakeAskDeps build injectable deps without touching Mongo/network", async () => {
  const deps = fakeAskDeps();
  assert.equal(typeof deps.complete, "function");
  assert.equal(typeof deps.treeSearchFn, "function");
  assert.ok(await fakeTreeStore().load("tenant-1"));
});
