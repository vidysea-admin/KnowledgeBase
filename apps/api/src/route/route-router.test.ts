/**
 * apps/api/src/route/route-router.test.ts - D-206 `GET /route` over the real Express app: auth/scope parity with /search, k bounds,
 * the exact /search response shape, the hard deadline (503 route_timeout), and the per-tenant cache (TTL + isolation).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { RouteNoTree, RouteTimeout, type RouteDeps } from "./route-store.js";
import type { SearchHit } from "../routes/search.js";
import { createMongoSearchDeps } from "../search-store.js";
import { createRouteDeps } from "./route-store.js";
import { fakeRouteDb, syntheticTree } from "./route.testsupport.js";

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

// ---- ISS-420: the result cache is bound to the shared visibility fingerprint; ISS-421: the deadline aborts the work ---------------
function withFingerprint(state: { fp: string; wa: string[]; fail: boolean; reads: number }, onCall?: () => void): RouteDeps {
  return { route: async (tenantId, q, k) => { onCall?.(); return [hitFor(tenantId)]; },
    fingerprint: async () => { state.reads++; if (state.fail) throw new Error("fingerprint down"); return { fingerprint: state.fp, waSessions: new Set(state.wa) }; } };
}

test("ISS-420 cache: a changed visibility fingerprint drops the cached entry on the very next request, no TTL wait", async () => {
  const state = { fp: "v1", wa: [] as string[], fail: false, reads: 0 };
  let calls = 0;
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: withFingerprint(state, () => calls++), routeOptions: { cacheTtlMs: 600_000 } }));
  try {
    await get(s.baseUrl, "/route?q=hello", "a-key"); await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.equal(calls, 1, "same fingerprint -> served from cache");
    state.fp = "v2"; // consent withdrawn / index failed / relabel / review edit
    await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.equal(calls, 2, "changed fingerprint -> recomputed immediately");
    assert.equal(state.reads, 3, "the fingerprint is read on every request that could be cached");
  } finally { await s.close(); }
});

test("ISS-420 cache: an unreadable fingerprint bypasses the cache (never a constant), and nothing is stored meanwhile", async () => {
  const state = { fp: "v1", wa: [] as string[], fail: true, reads: 0 };
  let calls = 0;
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: withFingerprint(state, () => calls++), routeOptions: { cacheTtlMs: 600_000 } }));
  try {
    for (let i = 0; i < 3; i++) assert.equal((await get(s.baseUrl, "/route?q=hello", "a-key")).status, 200);
    assert.equal(calls, 3, "no caching while the fingerprint cannot be read");
    state.fail = false;
    await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.equal(calls, 4, "nothing was stored during the outage, so the first healthy request recomputes");
  } finally { await s.close(); }
});

test("ISS-420 cache: a result touching a WhatsApp-batch session is never cached (its approval can be withdrawn)", async () => {
  const state = { fp: "v1", wa: ["s1"], fail: false, reads: 0 };
  let calls = 0;
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route: withFingerprint(state, () => calls++), routeOptions: { cacheTtlMs: 600_000 } }));
  try {
    await get(s.baseUrl, "/route?q=hello", "a-key"); await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.equal(calls, 2);
  } finally { await s.close(); }
});

test("ISS-420 cache: the fingerprint is read for the verified tenant only", async () => {
  const seen: string[] = [];
  const route: RouteDeps = { route: async (t) => [hitFor(t)], fingerprint: async (t) => { seen.push(t); return { fingerprint: "x", waSessions: new Set() }; } };
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route }));
  try { await get(s.baseUrl, "/route?q=a&tenantId=tenant-b", "a-key"); await get(s.baseUrl, "/route?q=a", "b-key"); assert.deepEqual(seen, ["tenant-a", "tenant-b"]); } finally { await s.close(); }
});

test("ISS-421 deadline: after the hard deadline the in-flight route() work is told to stop (AbortSignal fires)", async () => {
  let signal: AbortSignal | undefined, deadlineAt = 0;
  const route: RouteDeps = { route: (_t, _q, _k, ctl) => { signal = ctl.signal; deadlineAt = ctl.deadlineAt; return new Promise(() => undefined); } };
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route, routeOptions: { deadlineMs: 50 } }));
  try {
    const before = Date.now();
    const res = await get(s.baseUrl, "/route?q=slow", "a-key");
    assert.equal(res.status, 503);
    assert.ok(signal, "route() received a signal");
    assert.equal(signal!.aborted, true, "the signal is aborted once the 503 is sent");
    assert.ok(signal!.reason instanceof RouteTimeout);
    assert.ok(deadlineAt >= before + 40 && deadlineAt <= before + 200);
  } finally { await s.close(); }
});

// ---- ISS-420 end to end: the REAL stores behind the REAL router, long TTLs, no clock tricks ---------------------------------
async function liveServer(o: Parameters<typeof fakeRouteDb>[0] = {}) {
  const f = fakeRouteDb(o), trees = { "tenant-a": syntheticTree({ tenantId: "tenant-a" }) } as Record<string, ReturnType<typeof syntheticTree>>;
  for (const name of ["sessions", "sources", "turns"]) f.data[name] = f.data[name]!.map((r) => (r.tenantId === "toc" ? { ...r, tenantId: "tenant-a", ...(typeof r.sourceId === "string" ? { sourceId: String(r.sourceId).replace("toc:", "tenant-a:") } : {}),
    ...(name === "sources" ? { _id: String(r._id).replace("toc:", "tenant-a:") } : {}), ...(name === "turns" ? { _id: String(r._id).replace("toc-", "tenant-a-") } : {}) } : r));
  const route = createRouteDeps({ db: f.db, tree: { load: async (t) => trees[t] ?? null } });
  const search = createMongoSearchDeps({ db: f.db, cacheTtlMs: 600_000 });
  const server = await startTestServer(buildTestDeps({ keyStore: KEYS, route, search, routeOptions: { cacheTtlMs: 600_000 } }));
  const ask = async (path: string) => (await (await get(server.baseUrl, path, "a-key")).json()) as { hits: SearchHit[] };
  return { ...f, server, ask };
}
const sessionsOf = (r: { hits: SearchHit[] }) => [...new Set(r.hits.map((h) => h.sessionId))];

test("ISS-420 e2e: consent withdrawn between two identical calls -> the very next /route AND /search exclude that session (no TTL wait)", async () => {
  const L = await liveServer();
  try {
    const q = "visa%20requirements%20for%20Germany";
    assert.ok(sessionsOf(await L.ask(`/route?q=${q}`)).includes("s04"), "precondition: s04 is routed and served");
    assert.ok(sessionsOf(await L.ask(`/search?q=blocked%20account`)).includes("s04"), "precondition: /search serves s04");
    await L.ask(`/route?q=${q}`); // second identical call is the cached one
    const src = L.data.sources!.find((r) => r.tenantId === "tenant-a" && String(r._id).endsWith(":s04")) as Record<string, unknown>;
    assert.ok(src, "fixture: s04's source row exists for tenant-a");
    src.consent = { given: false };
    assert.ok(!sessionsOf(await L.ask(`/route?q=${q}`)).includes("s04"), "/route served a withdrawn session from cache");
    assert.ok(!sessionsOf(await L.ask(`/search?q=blocked%20account`)).includes("s04"), "/search served a withdrawn session from cache");
  } finally { await L.server.close(); }
});

test("ISS-420 e2e: a session whose index turns failed vanishes from the very next /route call; /search is refreshed (its label shows the new status)", async () => {
  const L = await liveServer();
  try {
    const q = "visa%20requirements%20for%20Germany";
    assert.ok(sessionsOf(await L.ask(`/route?q=${q}`)).includes("s04"));
    await L.ask(`/route?q=${q}`);
    const ses = L.data.sessions!.find((r) => r.tenantId === "tenant-a" && r._id === "s04") as { status: { index: string } };
    ses.status.index = "failed";
    assert.ok(!sessionsOf(await L.ask(`/route?q=${q}`)).includes("s04"), "/route served an index-failed session from cache");
  } finally { await L.server.close(); }
});

test("ISS-420 e2e: with nothing changed the second /route call is served from cache (the fingerprint does not defeat the cache)", async () => {
  const L = await liveServer();
  try {
    const q = "visa%20requirements%20for%20Germany";
    await L.ask(`/route?q=${q}`);
    const turnReads = () => L.calls.filter((c) => c.coll === "turns").length, before = turnReads();
    await L.ask(`/route?q=${q}`);
    assert.equal(turnReads(), before, "no turns read on a cache hit");
  } finally { await L.server.close(); }
});

// ---- fix cycle 1 (checker B, C3): a hung fingerprint read must not outlive the hard deadline ------------------------------
const NEVER = (): Promise<never> => new Promise<never>(() => undefined);

test("cycle 1: a never-resolving fingerprint read is bounded by the hard deadline; the cache is bypassed and nothing is stored", async () => {
  let calls = 0;
  const route: RouteDeps = { route: async (t) => { calls++; return [hitFor(t)]; }, fingerprint: NEVER };
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route, routeOptions: { deadlineMs: 100, cacheTtlMs: 600_000 } }));
  try {
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now(), res = await get(s.baseUrl, "/route?q=hello", "a-key");
      assert.ok(Date.now() - t0 < 700, `answered after ${Date.now() - t0} ms`);
      assert.equal(res.status, 200);
    }
    assert.equal(calls, 2, "nothing was cached while the fingerprint could not be read");
  } finally { await s.close(); }
});

test("cycle 1: a hung fingerprint read plus work that cannot finish in the remaining time answers 503 route_timeout within the deadline", async () => {
  const route: RouteDeps = { route: () => NEVER(), fingerprint: NEVER };
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route, routeOptions: { deadlineMs: 100 } }));
  try {
    const t0 = Date.now(), res = await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.ok(Date.now() - t0 < 700, `answered after ${Date.now() - t0} ms`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "route_timeout" });
  } finally { await s.close(); }
});

test("cycle 1: a database handle that throws synchronously (getDb() not ready) answers 503 route_unavailable, never 500", async () => {
  const route = createRouteDeps({ get db(): never { throw new Error("mongo not configured"); } } as never);
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route, routeOptions: { deadlineMs: 1_000, cacheTtlMs: 600_000 } }));
  try {
    const res = await get(s.baseUrl, "/route?q=hello", "a-key");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "route_unavailable" });
  } finally { await s.close(); }
});

test("cycle 1: a fingerprint dependency that throws synchronously is a cache bypass (200, nothing stored), not an error", async () => {
  let calls = 0;
  const route: RouteDeps = { route: async (t) => { calls++; return [hitFor(t)]; }, fingerprint: () => { throw new Error("sync"); } };
  const s = await startTestServer(buildTestDeps({ keyStore: KEYS, route, routeOptions: { deadlineMs: 1_000, cacheTtlMs: 600_000 } }));
  try {
    for (let i = 0; i < 2; i++) assert.equal((await get(s.baseUrl, "/route?q=hello", "a-key")).status, 200);
    assert.equal(calls, 2, "nothing was cached while the fingerprint could not be read");
  } finally { await s.close(); }
});
