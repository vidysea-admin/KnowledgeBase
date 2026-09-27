/**
 * apps/api/src/ask-web-fallback.test.ts — real behavior of `createTavilySearchFn`, `fetch`
 * mocked (no real network call in tests — the honest limitation disclosed in the manifest is
 * that the REAL Tavily HTTP path is unverified pending a real TAVILY_API_KEY, not this logic).
 *
 * ISS-274: `createTavilySearchFn` no longer returns `undefined` when the key is unset — it always
 * returns a function, so the seam is reachable. Without a key that function REJECTS with
 * `TavilyUnavailableError` instead of performing a network call or resolving with fake success.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createTavilySearchFn, TavilyUnavailableError } from "./ask-web-fallback.js";

test("createTavilySearchFn always returns a function, even with no TAVILY_API_KEY (ISS-274)", () => {
  const prev = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const fn = createTavilySearchFn();
    assert.equal(typeof fn, "function", "the seam must be reachable even with no key configured");
  } finally {
    if (prev !== undefined) process.env.TAVILY_API_KEY = prev;
  }
});

test("createTavilySearchFn's function rejects with TavilyUnavailableError when no key is set, WITHOUT a network call (ISS-274)", async () => {
  const prev = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("must not be called");
  }) as typeof fetch;

  try {
    const fn = createTavilySearchFn();
    await assert.rejects(() => fn("what color are apples?"), TavilyUnavailableError);
    await assert.rejects(() => fn("what color are apples?"), /web fallback unavailable: TAVILY_API_KEY not configured/);
    assert.equal(fetchCalled, false, "the honest-unavailable path must not touch the network");
  } finally {
    globalThis.fetch = originalFetch;
    if (prev !== undefined) process.env.TAVILY_API_KEY = prev;
  }
});

test("createTavilySearchFn, when a key is set, calls the real Tavily endpoint shape and maps results", async () => {
  const prev = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedBody: unknown;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init!.body as string);
    return {
      ok: true,
      json: async () => ({ results: [{ title: "A", url: "https://a.example", content: "Real content." }] }),
    } as Response;
  }) as typeof fetch;

  try {
    const fn = createTavilySearchFn();
    assert.ok(fn, "must return a real function when the key is set");
    const results = await fn!("what color are apples?");
    assert.equal(capturedUrl, "https://api.tavily.com/search");
    assert.deepEqual(capturedBody, { api_key: "test-key", query: "what color are apples?", max_results: 5 });
    assert.deepEqual(results, [{ title: "A", url: "https://a.example", content: "Real content." }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (prev !== undefined) process.env.TAVILY_API_KEY = prev; else delete process.env.TAVILY_API_KEY;
  }
});

test("createTavilySearchFn's function throws a real error on a non-OK response, never silently returns []", async () => {
  const prev = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 401 }) as Response) as typeof fetch;

  try {
    const fn = createTavilySearchFn();
    await assert.rejects(() => fn!("query"), /Tavily search failed \(HTTP 401\)/);
  } finally {
    globalThis.fetch = originalFetch;
    if (prev !== undefined) process.env.TAVILY_API_KEY = prev; else delete process.env.TAVILY_API_KEY;
  }
});
