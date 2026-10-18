import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createSourceReader } from "./source-reader.js";
import { createMongoIngestDeps } from "../ingest-store.js";

// Local-only server (no external network). Records socket closes so abort can be asserted.
async function serve(handler: http.RequestListener) {
  const sockets = new Set<import("node:net").Socket>();
  let closed = 0;
  const server = http.createServer(handler);
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => { closed++; sockets.delete(s); }); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return { base, closedCount: () => closed, stop: async () => { for (const s of sockets) s.destroy(); await new Promise((r) => server.close(r)); } };
}
const via = (base: string) => ((_u: string | URL | Request, init?: RequestInit) => fetch(base, { ...init, headers: { connection: "close" } })) as typeof fetch;
const waitFor = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };

test("slow drip: deadline covers the body, rejects near timeoutMs, connection closed", async () => {
  const srv = await serve((_q, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    const t = setInterval(() => res.write("x"), 50);
    res.on("close", () => clearInterval(t));
  });
  try {
    const started = Date.now();
    await assert.rejects(createSourceReader({ timeoutMs: 300, fetcher: via(srv.base) })("https://public.example/a"), /^Error: source reader acquisition failed$/);
    const took = Date.now() - started;
    assert.ok(took >= 250 && took < 2000, `took ${took}ms`);
    await waitFor(() => srv.closedCount() >= 1);
    assert.ok(srv.closedCount() >= 1, "connection closed after abort");
  } finally { await srv.stop(); }
});

test("slow headers: deadline covers the header phase", async () => {
  const srv = await serve(() => { /* never respond */ });
  try {
    const started = Date.now();
    await assert.rejects(createSourceReader({ timeoutMs: 200, fetcher: via(srv.base) })("https://public.example/a"));
    assert.ok(Date.now() - started < 2000);
    await waitFor(() => srv.closedCount() >= 1);
    assert.ok(srv.closedCount() >= 1);
  } finally { await srv.stop(); }
});

test("oversized chunked body is cut off while streaming and connection closed", async () => {
  let sent = 0;
  const srv = await serve((_q, res) => {
    res.writeHead(200);
    const t = setInterval(() => { sent += 1000; res.write("y".repeat(1000)); }, 5);
    res.on("close", () => clearInterval(t));
  });
  try {
    await assert.rejects(createSourceReader({ maxBytes: 5000, timeoutMs: 5000, fetcher: via(srv.base) })("https://public.example/a"), /^Error: source reader acquisition failed$/);
    await waitFor(() => srv.closedCount() >= 1);
    assert.ok(srv.closedCount() >= 1, "connection closed");
    assert.ok(sent < 100_000, `server was not drained (sent ${sent})`);
  } finally { await srv.stop(); }
});

test("POST /ingest path (ingest-store jinaReaderFetch) is bounded: oversized public body refused", async () => {
  const srv = await serve((_q, res) => {
    res.writeHead(200);
    const t = setInterval(() => res.write("z".repeat(100_000)), 1);
    res.on("close", () => clearInterval(t));
  });
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => real(srv.base, { ...init, headers: { connection: "close" } })) as typeof fetch;
  try {
    await assert.rejects(createMongoIngestDeps().ingestUrl("tenant-a", "https://public.example/a"), /acquisition failed/);
    await waitFor(() => srv.closedCount() >= 1);
    assert.ok(srv.closedCount() >= 1);
  } finally { globalThis.fetch = real; await srv.stop(); }
});
