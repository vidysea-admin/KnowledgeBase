/**
 * apps/api/src/routes/search.test.ts — in-process HTTP requests against `routes/search.ts` with
 * `fakeSearchDeps`. Covers: real hit shape on a match; empty result on no match; missing `q` ->
 * 400 not a stub 501; missing scope -> 403.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { NativeSourceLocator } from "@lkb/core";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";

test("GET /search?q=... with the search scope returns real hits", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "search-key": { tenantId: "tenant-1", scopes: ["search"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/search?q=hello`, { headers: { authorization: "Bearer search-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { query: string; hits: { turnId: string; turn: { text: string } | null; session: { title: string } | null }[] };
    assert.equal(body.query, "hello");
    assert.equal(body.hits.length, 1);
    assert.equal(body.hits[0]?.turnId, "t1");
    assert.equal(body.hits[0]?.turn?.text, "Hello.");
    assert.equal(body.hits[0]?.session?.title, "Fixture Session");
  } finally {
    await server.close();
  }
});

test("GET /search?q=... with no match returns an empty hits array, not an error", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "search-key": { tenantId: "tenant-1", scopes: ["search"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/search?q=nonexistentterm`, { headers: { authorization: "Bearer search-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { hits: unknown[] };
    assert.deepEqual(body.hits, []);
  } finally {
    await server.close();
  }
});

test("GET /search with no q param returns 400, not a stub 501", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "search-key": { tenantId: "tenant-1", scopes: ["search"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/search`, { headers: { authorization: "Bearer search-key" } });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("GET /search without the search scope returns 403, never a silent 200", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/search?q=hello`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

const nativeSearchLocator: NativeSourceLocator = { kind: "document-page", documentId: "immutable-doc", documentSourceId: "immutable-source",
  sourceId: "logical-source", headRevision: 1, revisionHash: "a".repeat(64), pageNumber: 2,
  passage: { start: 0, end: 4, sha256: "b".repeat(64) } };

test("actual Search route merges native references with legacy hits under one k and authenticated tenant", async () => {
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ "native-key": { tenantId: "tenant-1", scopes: ["search"] } }) });
  const transcriptSearch = deps.search.search, calls: unknown[][] = [];
  deps.search = { search: async (tenant, q, k) => (await transcriptSearch(tenant, q, k)).map(h => ({ ...h, score: 0.25 })),
    searchNative: async (...args) => { calls.push(args); return { hits: [{ nativeSourceLocator: nativeSearchLocator, score: 1, title: "Native document" }], truncated: true }; } };
  const server = await startTestServer(deps);
  try {
    const response = await fetch(`${server.baseUrl}/search?q=hello&k=1&tenantId=foreign`, { headers: { authorization: "Bearer native-key" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { query: "hello", hits: [{ nativeSourceLocator: nativeSearchLocator, score: 1, title: "Native document" }], nativeTruncated: true });
    assert.deepEqual(calls, [["tenant-1", "hello", 1]]);
  } finally { await server.close(); }
});

test("native provider failure returns safe Search unavailable without partial private evidence", async () => {
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ "native-key": { tenantId: "tenant-1", scopes: ["search"] } }) });
  deps.search.searchNative = async () => { throw new Error("PRIVATE head/source detail"); };
  const server = await startTestServer(deps);
  try {
    const response = await fetch(`${server.baseUrl}/search?q=hello`, { headers: { authorization: "Bearer native-key" } });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "search_unavailable" });
  } finally { await server.close(); }
});

test("missing native Search scope prevents inventory and transcript callbacks", async () => {
  let calls = 0;
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ "no-search": { tenantId: "tenant-1", scopes: ["citations"] } }),
    search: { search: async () => { calls++; return []; }, searchNative: async () => { calls++; return { hits: [], truncated: false }; } } });
  const server = await startTestServer(deps);
  try {
    const response = await fetch(`${server.baseUrl}/search?q=hello`, { headers: { authorization: "Bearer no-search" } });
    assert.equal(response.status, 403); assert.equal(calls, 0);
  } finally { await server.close(); }
});

// ---- D-206 K5: hard server-side deadline -----------------------------------------------------------------------------
import { resolveSearchDeadlineMs, DEFAULT_SEARCH_DEADLINE_MS } from "./search.js";

async function withDeadlineEnv<T>(ms: string | undefined, run: () => Promise<T>): Promise<T> {
  const prior = process.env.KB_SEARCH_DEADLINE_MS;
  if (ms === undefined) delete process.env.KB_SEARCH_DEADLINE_MS; else process.env.KB_SEARCH_DEADLINE_MS = ms;
  try { return await run(); } finally { if (prior === undefined) delete process.env.KB_SEARCH_DEADLINE_MS; else process.env.KB_SEARCH_DEADLINE_MS = prior; }
}

test("K5: a search that never finishes is answered 503 search_timeout at the deadline, not left hanging", async () => {
  await withDeadlineEnv("150", async () => {
    const deps = buildTestDeps({ keyStore: fakeKeyStore({ "k": { tenantId: "tenant-1", scopes: ["search"] } }) });
    let deadlineAt: number | undefined;
    deps.search = { search: (_t, _q, _k, options) => { deadlineAt = options?.deadlineAt; return new Promise(() => undefined); } };
    const server = await startTestServer(deps);
    try {
      const started = Date.now();
      const res = await fetch(`${server.baseUrl}/search?q=hello`, { headers: { authorization: "Bearer k" } });
      const elapsed = Date.now() - started;
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "search_timeout" });
      assert.ok(elapsed >= 100 && elapsed < 2000, `answered after ${elapsed}ms`);
      assert.ok(deadlineAt !== undefined && deadlineAt >= started && deadlineAt <= started + 1000, "the store receives the same absolute deadline");
    } finally { await server.close(); }
  });
});

test("K5: a store-side visibility deadline surfaces as search_timeout, other failures stay search_unavailable", async () => {
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ "k": { tenantId: "tenant-1", scopes: ["search"] } }) });
  let mode: "deadline" | "boom" = "deadline";
  deps.search = { search: async () => { const e = new Error("visibility"); e.name = mode === "deadline" ? "VisibilityDeadlineError" : "Error"; throw e; } };
  const server = await startTestServer(deps);
  try {
    const first = await fetch(`${server.baseUrl}/search?q=x`, { headers: { authorization: "Bearer k" } });
    assert.deepEqual([first.status, await first.json()], [503, { error: "search_timeout" }]);
    mode = "boom";
    const second = await fetch(`${server.baseUrl}/search?q=x`, { headers: { authorization: "Bearer k" } });
    assert.deepEqual([second.status, await second.json()], [503, { error: "search_unavailable" }]);
  } finally { await server.close(); }
});

test("K5: a fast search is unaffected by the deadline", async () => {
  await withDeadlineEnv("5000", async () => {
    const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore({ "k": { tenantId: "tenant-1", scopes: ["search"] } }) }));
    try {
      const res = await fetch(`${server.baseUrl}/search?q=hello`, { headers: { authorization: "Bearer k" } });
      assert.equal(res.status, 200);
    } finally { await server.close(); }
  });
});

test("K5: the deadline is configurable, bounded, and garbage never disables it", () => {
  assert.equal(resolveSearchDeadlineMs(undefined, undefined), DEFAULT_SEARCH_DEADLINE_MS);
  assert.equal(DEFAULT_SEARCH_DEADLINE_MS, 5000);
  assert.equal(resolveSearchDeadlineMs(undefined, "2500"), 2500);
  assert.equal(resolveSearchDeadlineMs(undefined, "0"), DEFAULT_SEARCH_DEADLINE_MS);
  assert.equal(resolveSearchDeadlineMs(undefined, "-5"), DEFAULT_SEARCH_DEADLINE_MS);
  assert.equal(resolveSearchDeadlineMs(undefined, "abc"), DEFAULT_SEARCH_DEADLINE_MS);
  assert.equal(resolveSearchDeadlineMs(undefined, ""), DEFAULT_SEARCH_DEADLINE_MS);
  assert.equal(resolveSearchDeadlineMs(undefined, "99999999"), 60_000);
  assert.equal(resolveSearchDeadlineMs(1, undefined), 50);
});
