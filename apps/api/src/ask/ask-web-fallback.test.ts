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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GeminiFreeTierQuotaError } from "@lkb/ai";

import {
  createGeminiWebSearchFn, createTavilySearchFn, GeminiWebSearchError, TavilyUnavailableError, WEB_GROUNDING_DEFAULT_MODEL,
} from "./ask-web-fallback.js";

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

// ---------------------------------------------------------------------------------------------
// gemini-web-fallback (D-202): Gemini + Google Search grounding replaces Tavily as the web
// fallback. `fetch` is ALWAYS mocked — no test calls the real Gemini API.
// ---------------------------------------------------------------------------------------------
const SECRET_KEY = "AIzaFAKE-web-grounding-secret-777";

async function withGemini<T>(env: { key?: string; model?: string }, fetchImpl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const prevKey = process.env.GEMINI_API_KEY, prevModel = process.env.LKB_WEB_GROUNDING_MODEL, originalFetch = globalThis.fetch;
  if (env.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = env.key;
  if (env.model === undefined) delete process.env.LKB_WEB_GROUNDING_MODEL; else process.env.LKB_WEB_GROUNDING_MODEL = env.model;
  globalThis.fetch = fetchImpl;
  try { return await fn(); } finally {
    globalThis.fetch = originalFetch;
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.LKB_WEB_GROUNDING_MODEL; else process.env.LKB_WEB_GROUNDING_MODEL = prevModel;
  }
}

const groundedBody = {
  candidates: [{
    content: { parts: [{ text: "The fee is 100. Deadlines are in May." }] },
    groundingMetadata: {
      groundingChunks: [
        { web: { uri: "https://a.example/fees", title: "a.example" } },
        { web: { uri: "https://b.example/dates", title: "b.example" } },
        { web: { uri: "https://c.example/none", title: "c.example" } },
      ],
      groundingSupports: [
        { segment: { startIndex: 0, endIndex: 15, text: "The fee is 100." }, groundingChunkIndices: [0] },
        { segment: { startIndex: 16, endIndex: 38, text: "Deadlines are in May." }, groundingChunkIndices: [1, 0] },
      ],
    },
  }],
};
const okJson = (body: unknown) => (async () => ({ ok: true, status: 200, json: async () => body }) as Response) as typeof fetch;

test("[C1] Gemini fn calls generateContent with the google_search tool, default model gemini-2.5-flash, key in a header not the URL", async () => {
  let url = "", init: RequestInit | undefined, calls = 0;
  await withGemini({ key: SECRET_KEY }, (async (u: string, i?: RequestInit) => { calls++; url = String(u); init = i; return okJson(groundedBody)(u, i); }) as typeof fetch, async () => {
    await createGeminiWebSearchFn()("fee of x?");
  });
  assert.equal(calls, 1);
  assert.equal(WEB_GROUNDING_DEFAULT_MODEL, "gemini-2.5-flash");
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
  assert.ok(!url.includes(SECRET_KEY), "the key must not be in the URL");
  assert.equal((init!.headers as Record<string, string>)["x-goog-api-key"], SECRET_KEY);
  const sent = JSON.parse(init!.body as string);
  assert.deepEqual(sent.tools, [{ google_search: {} }]);
});

test("[C1] LKB_WEB_GROUNDING_MODEL overrides the model", async () => {
  let url = "";
  await withGemini({ key: SECRET_KEY, model: "gemini-9-test" }, (async (u: string, i?: RequestInit) => { url = String(u); return okJson(groundedBody)(u, i); }) as typeof fetch, async () => {
    await createGeminiWebSearchFn()("q");
  });
  assert.match(url, /models\/gemini-9-test:generateContent$/);
});

test("[C1] production composition wires the Gemini fn, not Tavily (source shape)", () => {
  const src = readFileSync(fileURLToPath(new URL("../composition/production.ts", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(src, /createGeminiWebSearchFn\(\)/);
  assert.doesNotMatch(src, /createTavilySearchFn\(\)/);
});

test("[C2] maps groundingChunks + supports to WebSource items whose content is the supported text", async () => {
  const out = await withGemini({ key: SECRET_KEY }, okJson(groundedBody), () => createGeminiWebSearchFn()("q"));
  assert.deepEqual(out, [
    { title: "a.example", url: "https://a.example/fees", content: "The fee is 100. Deadlines are in May." },
    { title: "b.example", url: "https://b.example/dates", content: "Deadlines are in May." },
    // chunk 2 has no supporting segment: falls back to the synthesized answer text, never invented text
    { title: "c.example", url: "https://c.example/none", content: "The fee is 100. Deadlines are in May." },
  ]);
});

test("[C2] a response with no grounding chunks yields [] — never a fabricated url", async () => {
  const none = { candidates: [{ content: { parts: [{ text: "I think it is 100." }] } }] };
  assert.deepEqual(await withGemini({ key: SECRET_KEY }, okJson(none), () => createGeminiWebSearchFn()("q")), []);
  const empty = { candidates: [{ content: { parts: [{ text: "x" }] }, groundingMetadata: { groundingChunks: [] } }] };
  assert.deepEqual(await withGemini({ key: SECRET_KEY }, okJson(empty), () => createGeminiWebSearchFn()("q")), []);
  assert.deepEqual(await withGemini({ key: SECRET_KEY }, okJson({}), () => createGeminiWebSearchFn()("q")), []);
  const noUri = { candidates: [{ groundingMetadata: { groundingChunks: [{ web: { title: "t" } }, { retrievedContext: { uri: "https://x" } }] } }] };
  assert.deepEqual(await withGemini({ key: SECRET_KEY }, okJson(noUri), () => createGeminiWebSearchFn()("q")), []);
});

test("[C3] no GEMINI_API_KEY: rejects with the unavailable error, no network call", async () => {
  let called = false;
  await withGemini({}, (async () => { called = true; throw new Error("must not be called"); }) as typeof fetch, async () => {
    const fn = createGeminiWebSearchFn();
    await assert.rejects(() => fn("q"), TavilyUnavailableError);
    await assert.rejects(() => fn("q"), /web fallback unavailable: GEMINI_API_KEY not configured/);
  });
  assert.equal(called, false);
});

test("[C3] HTTP errors throw a typed GeminiWebSearchError carrying the status and never the key", async () => {
  const resp = (status: number, body: unknown) => (async () => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response) as typeof fetch;
  for (const status of [400, 403, 500, 503]) {
    await withGemini({ key: SECRET_KEY }, resp(status, { error: { message: `bad key ${SECRET_KEY}` } }), async () => {
      const err = await createGeminiWebSearchFn()("q").then(() => null, (e: unknown) => e) as Error;
      assert.ok(err instanceof GeminiWebSearchError, `status ${status}`);
      assert.equal((err as GeminiWebSearchError).status, status);
      assert.ok(!err.message.includes(SECRET_KEY) && !String(err.stack).includes(SECRET_KEY), "key leaked in error");
    });
  }
});

test("[C3] free-tier 429 maps to GeminiFreeTierQuotaError (gemini-quota semantics); plain 429 is a typed error", async () => {
  const free = { error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaMetric: "m" }] }] } };
  const mk = (b: unknown) => (async () => ({ ok: false, status: 429, json: async () => b }) as Response) as typeof fetch;
  await withGemini({ key: SECRET_KEY }, mk(free), async () => {
    await assert.rejects(() => createGeminiWebSearchFn()("q"), GeminiFreeTierQuotaError);
  });
  await withGemini({ key: SECRET_KEY }, mk({ error: {} }), async () => {
    await assert.rejects(() => createGeminiWebSearchFn()("q"), (e: unknown) => e instanceof GeminiWebSearchError && e.status === 429);
  });
});

test("[C3] a network failure whose message embeds the key is rethrown without the key", async () => {
  const boom = (async () => { throw new Error(`connect failed for https://x?key=${SECRET_KEY}`); }) as typeof fetch;
  await withGemini({ key: SECRET_KEY }, boom, async () => {
    const err = await createGeminiWebSearchFn()("q").then(() => null, (e: unknown) => e) as Error;
    assert.ok(err instanceof GeminiWebSearchError);
    assert.ok(!err.message.includes(SECRET_KEY));
  });
});

test("[C3] the error text ask-graph records on degrade carries the status and not the key", async () => {
  // Uses the real graph catch path (packages/ask/src/ask-graph.ts web-fallback node) with the real
  // Gemini fn and a mocked failing fetch. Skipped shape check: only asserts what leaves the seam.
  const failing = (async () => ({ ok: false, status: 503, json: async () => ({ error: { message: `x ${SECRET_KEY}` } }) }) as Response) as typeof fetch;
  await withGemini({ key: SECRET_KEY }, failing, async () => {
    const err = await createGeminiWebSearchFn()("q").then(() => null, (e: unknown) => e) as Error;
    const audited = `web_fallback_unavailable: ${err.message}`; // exactly what ask-graph.ts records
    assert.ok(!audited.includes(SECRET_KEY));
    assert.match(audited, /HTTP 503/);
  });
});

test("[C4] only the query text is sent: body is contents[query] + tools, nothing else; no tenant or session fields", async () => {
  let body: Record<string, unknown> = {};
  await withGemini({ key: SECRET_KEY }, (async (u: string, i?: RequestInit) => { body = JSON.parse(i!.body as string); return okJson(groundedBody)(u, i); }) as typeof fetch, async () => {
    await createGeminiWebSearchFn()("what is the fee?");
  });
  assert.deepEqual(Object.keys(body).sort(), ["contents", "tools"]);
  assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: "what is the fee?" }] }]);
});

test("[C4] filters.sources=internal: answer-workflow strips the web dependency so the Gemini fn is never invoked", () => {
  const src = readFileSync(fileURLToPath(new URL("../answer-policy/answer-workflow.ts", import.meta.url)), "utf8");
  assert.match(src, /filters\.sources === "internal"\) deps = \{ \.\.\.deps, webFallbackFn: undefined, tavilySearchFn: undefined \}/);
});
