import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpTransport } from "./ai-transport.js";

const req = { kind: "http" as const, url: "https://ollama.com/api/chat", method: "POST", headers: { authorization: "Bearer test-secret" }, body: { source: "private-source" } };
const mockFetch = (run: (input: unknown, init?: RequestInit) => Promise<Response>) => run as typeof globalThis.fetch;

test("HTTP text transport preserves JSON/Unicode and sends bearer once with manual redirect policy", async () => {
  let calls = 0;
  const transport = createHttpTransport({ fetch: mockFetch(async (url, init) => {
    calls++; assert.equal(url, req.url); assert.equal(init?.redirect, "manual");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-secret");
    assert.equal(init?.body, JSON.stringify(req.body));
    return new Response('{"answer":"नमस्ते"}', { status: 200 });
  }) });
  assert.deepEqual((await transport(req)).body, { answer: "नमस्ते" });
  assert.equal(calls, 1);
});

for (const status of [301, 302, 303, 307, 308]) {
  test(`HTTP ${status} refuses redirect without another request and cancels response`, async () => {
    let calls = 0; let cancelled = false;
    const transport = createHttpTransport({ fetch: mockFetch(async (_, init) => {
      calls++; assert.equal(init?.redirect, "manual");
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
        status, headers: { location: "https://evil.test/?test-secret=private-source" },
      });
    }) });
    await assert.rejects(transport(req), /^Error: HTTP redirects are refused$/);
    assert.equal(calls, 1); assert.equal(cancelled, true);
  });
}

test("HTTP response bytes are bounded while streaming even without content-length", async () => {
  let cancelled = false; let signal: AbortSignal | null | undefined;
  const transport = createHttpTransport({ outputBytes: 3, fetch: mockFetch(async (_, init) => {
    signal = init?.signal;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("éé")); },
      cancel() { cancelled = true; },
    }));
  }) });
  await assert.rejects(transport(req), /HTTP response exceeds byte limit/);
  assert.equal(cancelled, true); assert.equal(signal?.aborted, true);
});

test("HTTP oversized content-length rejected without reading body; exact byte boundary accepted", async () => {
  let cancelled = false;
  const transport = createHttpTransport({ outputBytes: 3, fetch: mockFetch(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-length": "4" } })) });
  await assert.rejects(transport(req), /exceeds byte limit/);
  assert.equal(cancelled, true);
  const exact = createHttpTransport({ outputBytes: 4, fetch: mockFetch(async () => new Response("éé")) });
  assert.equal((await exact(req)).text, "éé");
});

test("HTTP deadline covers headers when fetch ignores cancellation", async () => {
  let signal: AbortSignal | null | undefined;
  const transport = createHttpTransport({ timeoutMs: 5, fetch: mockFetch(async (_, init) => {
    signal = init?.signal; return new Promise(() => {});
  }) });
  await assert.rejects(transport(req), /HTTP request timed out/);
  assert.equal(signal?.aborted, true);
});

test("HTTP deadline covers body consumption and cancels a stalled stream", async () => {
  let cancelled = false;
  const transport = createHttpTransport({ timeoutMs: 5, fetch: mockFetch(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }))) });
  await assert.rejects(transport(req), /HTTP request timed out/);
  assert.equal(cancelled, true);
});

test("HTTP caller abort before request and during body is safe and keeps AbortError compatibility", async () => {
  const pre = new AbortController(); pre.abort("test-secret"); let calls = 0;
  const transport = createHttpTransport({ fetch: mockFetch(async () => { calls++; return new Response("ok"); }) });
  await assert.rejects(transport({ ...req, signal: pre.signal }), error => error instanceof Error && error.name === "AbortError" && !error.message.includes("secret"));
  assert.equal(calls, 0);
  let cancelled = false;
  const caller = new AbortController();
  const stalled = createHttpTransport({ fetch: mockFetch(async () => new Response(new ReadableStream({
    start() { queueMicrotask(() => caller.abort("test-secret")); }, cancel() { cancelled = true; },
  }))) });
  await assert.rejects(stalled({ ...req, signal: caller.signal }), error => error instanceof Error && error.name === "AbortError");
  assert.equal(cancelled, true);
});

test("HTTP failures never echo credentials, source, URLs or arbitrary abort reasons", async () => {
  for (const fetch of [mockFetch(async () => { throw new Error("Bearer test-secret private-source https://evil.test"); }),
    mockFetch(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("test-secret private-source")); } })))]) {
    await assert.rejects(createHttpTransport({ fetch })(req), error => {
      assert.ok(error instanceof Error); assert.equal(error.message, "HTTP request failed"); return true;
    });
  }
});

test("HTTP limit and transport kind validation fails closed", async () => {
  for (const outputBytes of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => createHttpTransport({ outputBytes }), /Invalid HTTP limit/);
  await assert.rejects(createHttpTransport()({ kind: "cli", command: "ignored" }), /requires HTTP request/);
});
