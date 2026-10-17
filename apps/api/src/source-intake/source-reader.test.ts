import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceReader } from "./source-reader.js";
import { guardUrlFetcher } from "./adapters.js";

test("ISS-SOURCEREADER-001: never-resolving transport is bounded even if it ignores abort", async () => {
  const read = createSourceReader({ timeoutMs: 10, fetcher: async () => new Promise<Response>(() => {}) });
  await assert.rejects(read("https://public.example/article"), /^Error: source reader acquisition failed$/);
});

test("ISS-SOURCEREADER-001: stalled response body is cancelled on deadline", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
  await assert.rejects(createSourceReader({ timeoutMs: 10, fetcher: async () => response })("https://public.example/article"));
  assert.equal(cancelled, true);
});

test("ISS-SOURCEREADER-001: chunked body above byte cap without content-length is refused", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new Uint8Array(6)); c.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; },
  }));
  await assert.rejects(createSourceReader({ maxBytes: 10, fetcher: async () => response })("https://public.example/article"));
  assert.equal(cancelled, true);
});

test("declared oversized body is refused before reading and errors hide provider secrets", async () => {
  for (const response of [new Response("private", { headers: { "content-length": "1000001" } }),
    new Response("private-token", { status: 302, headers: { location: "https://private.example/secret" } })]) {
    await assert.rejects(createSourceReader({ fetcher: async () => response })("https://public.example/article"), /^Error: source reader acquisition failed$/);
  }
  await assert.rejects(createSourceReader({ fetcher: async () => { throw new Error("provider-key-secret"); } })("https://public.example/article"), /^Error: source reader acquisition failed$/);
});

test("bounded UTF-8 content survives guarded downstream fetch with manual redirects and scoped key", async () => {
  let calls = 0;
  const content = "हिन्दी career advice";
  const bytes = new TextEncoder().encode(content);
  const read = createSourceReader({ apiKey: "fixture-key", maxBytes: bytes.length, fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://r.jina.ai/https://public.example/article");
    assert.equal(init?.redirect, "manual"); assert.equal(init?.headers && (init.headers as Record<string, string>).authorization, "Bearer fixture-key");
    return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 2)); c.enqueue(bytes.slice(2)); c.close(); } }));
  } });
  const guarded = guardUrlFetcher(read, async () => ["93.184.216.34"]);
  assert.equal(await guarded("https://public.example/article"), content);
  await assert.rejects(guarded("http://127.0.0.1/private"));
  assert.equal(calls, 1);
});

test("invalid or expanded resource limits cannot disable bounds", () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 10001 }, { maxBytes: 0 }, { maxBytes: 1000001 }, { maxBytes: Infinity }]) {
    assert.throws(() => createSourceReader(options), /invalid source reader limits/);
  }
});
