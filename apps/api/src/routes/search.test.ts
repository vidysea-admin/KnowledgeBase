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
