/**
 * apps/api/src/route/route-router.test.ts - D-206 `GET /route` over the real Express app: auth/scope parity with /search, k bounds,
 * the exact /search response shape, the hard deadline (503 route_timeout), and the per-tenant cache (TTL + isolation).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { RouteNoTree, type RouteDeps } from "./route-store.js";
import type { SearchHit } from "../routes/search.js";

const KEYS = fakeKeyStore({
  "a-key": { tenantId: "tenant-a", scopes: ["search"] }, "b-key": { tenantId: "tenant-b", scopes: ["search"] },
  "ask-key": { tenantId: "tenant-a", scopes: ["ask"] },
});
const hitFor = (tenantId: string): SearchHit => ({ turnId: `${tenantId}-t1`, sessionId: "s1", score: 0.5,
  turn: { _id: `${tenantId}-t1`, tenantId, sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: `Hello from ${tenantId}.` } as never,
  session: { _id: "s1", tenantId, sourceId: "src", title: "Fixture Session", date: "2026-01-01", status: { transcribe: "done", index: "done" } } as never });
function fake(onCall?: (tenantId: string, q: string, k: number) => void): RouteDeps {
  return { route: async (tenantId, q, k) => { onCall?.(tenantId, q, k); return [hitFor(tenantId)]; } };
}
const get = (base: string, path: string, key?: string) => fetch(base + path, { headers: key ? { authorization: `Bearer ${key}` } : {} });

test("auth parity with /search: 401 without a key, 403 without the search scope, 400 without q", async () => {
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: fake() }));
  try {
    assert.equal((await get(s.baseUrl, "/route?q=hello")).status, 401);
    assert.equal((await get(s.baseUrl, "/route?q=hello", "ask-key")).status, 403);
    assert.equal((await get(s.baseUrl, "/route", "a-key")).status, 400);
    assert.equal((await get(s.baseUrl, "/route?q=%20%20", "a-key")).status, 400);
    assert.equal((await get(s.baseUrl, `/route?q=${"x".repeat(513)}`, "a-key")).status, 400);
  } finally { await s.close(); }
});

test("not mounted when no route deps are configured (existing deployments unchanged)", async () => {
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS }));
  try { assert.notEqual((await get(s.baseUrl, "/route?q=hello", "a-key")).status, 200); } finally { await s.close(); }
});

test("k defaults to 5, is capped at 20, and the tenant comes only from the verified key", async () => {
  const seen: [string, number][] = [];
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: fake((t, _q, k) => seen.push([t, k])) }));
  try {
    await get(s.baseUrl, "/route?q=one", "a-key");
    await get(s.baseUrl, "/route?q=two&k=500&tenantId=tenant-b", "a-key");
    await get(s.baseUrl, "/route?q=three&k=-3", "a-key");
    await get(s.baseUrl, "/route?q=four&k=7", "a-key");
    assert.deepEqual(seen, [["tenant-a", 5], ["tenant-a", 20], ["tenant-a", 5], ["tenant-a", 7]]);
  } finally { await s.close(); }
});

test("the response body is byte-identical in shape to /search for the same hit", async () => {
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: fake(),
    search: { search: async (tenantId) => [hitFor(tenantId)] } }));
  try {
    const route = await (await get(s.baseUrl, "/route?q=hello", "a-key")).json();
    const search = await (await get(s.baseUrl, "/search?q=hello", "a-key")).json();
    assert.deepEqual(route, search);
    assert.deepEqual(Object.keys(route as object).sort(), ["hits", "query"]);
  } finally { await s.close(); }
});

test("deadline: an overrun returns 503 route_timeout promptly instead of hanging", async () => {
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: { route: () => new Promise(() => undefined) }, routeOptions: { deadlineMs: 60 } }));
  try {
    const t0 = Date.now();
    const res = await get(s.baseUrl, "/route?q=slow", "a-key");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "route_timeout" });
    assert.ok(Date.now() - t0 < 1500);
  } finally { await s.close(); }
});

test("errors: no tree -> 404, any other failure -> 503 route_unavailable, and failures are never cached", async () => {
  let n = 0;
  const route: RouteDeps = { route: async () => { n++; if (n === 1) throw new RouteNoTree(); if (n === 2) throw new Error("boom"); return []; } };
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route }));
  try {
    assert.equal((await get(s.baseUrl, "/route?q=x", "a-key")).status, 404);
    const r = await get(s.baseUrl, "/route?q=x", "a-key");
    assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "route_unavailable" });
    assert.equal((await get(s.baseUrl, "/route?q=x", "a-key")).status, 200);
  } finally { await s.close(); }
});

test("cache: same tenant+query+k is served from cache within the TTL and recomputed after it", async () => {
  let clock = 1_000, calls = 0;
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: fake(() => calls++), routeOptions: { cacheTtlMs: 5_000, now: () => clock } }));
  try {
    await get(s.baseUrl, "/route?q=Visa%20Germany", "a-key");
    await get(s.baseUrl, "/route?q=visa%20%20germany", "a-key"); // case / whitespace-insensitive key
    assert.equal(calls, 1);
    await get(s.baseUrl, "/route?q=visa%20germany&k=9", "a-key"); // different k -> different entry
    assert.equal(calls, 2);
    clock += 6_000;
    await get(s.baseUrl, "/route?q=visa%20germany", "a-key");
    assert.equal(calls, 3);
  } finally { await s.close(); }
});

test("cache isolation: tenant B never receives tenant A's cached hits for the identical query", async () => {
  const calls: string[] = [];
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: fake((t) => calls.push(t)), routeOptions: { cacheTtlMs: 60_000 } }));
  try {
    const a = (await (await get(s.baseUrl, "/route?q=hello", "a-key")).json()) as { hits: SearchHit[] };
    const b = (await (await get(s.baseUrl, "/route?q=hello", "b-key")).json()) as { hits: SearchHit[] };
    assert.deepEqual(calls, ["tenant-a", "tenant-b"], "B must miss A's cache entry");
    assert.equal(a.hits[0]!.turn?.tenantId, "tenant-a");
    assert.equal(b.hits[0]!.turn?.tenantId, "tenant-b");
    await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.deepEqual(calls, ["tenant-a", "tenant-b"], "A is still cached");
  } finally { await s.close(); }
});
