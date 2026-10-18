/** ISS-SOURCEREADER-001 cycle 1: POST /ingest must only fetch guarded (public) targets. No real network or DNS. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createMongoIngestDeps } from "../ingest-store.js";
import { BlindDb, bindDb } from "../ask/tenant-test-kit.js";

const PUBLIC = async () => ["93.184.216.34"];
const lookupTable: Record<string, string[]> = { "internal.example": ["10.1.2.3"], "mixed.example": ["93.184.216.34", "127.0.0.1"] };

async function post(url: string, lookup: (h: string) => Promise<string[]>) {
  const calls: string[] = [];
  const real = globalThis.fetch;
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ k: { tenantId: "tenant-1", scopes: ["ingest"] } }),
    ingest: createMongoIngestDeps(undefined, { lookup }),
  }));
  const net = real; // the test server is local; only r.jina.ai-bound calls are stubbed
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    if (String(u).startsWith("https://r.jina.ai/")) { calls.push(String(u)); return new Response("Hello world.\n\nSecond paragraph."); }
    return net(u as string, init);
  }) as typeof fetch;
  try {
    const res = await net(`${server.baseUrl}/ingest`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer k" }, body: JSON.stringify({ url }) });
    return { status: res.status, body: (await res.json()) as { message?: string }, calls };
  } finally { globalThis.fetch = real; await server.close(); }
}

const BLOCKED: Array<[string, string, RegExp]> = [
  ["127.0.0.1", "http://127.0.0.1/admin", /url-blocked: host resolves to a private/],
  ["10.x", "http://10.0.0.5/x", /url-blocked: host resolves to a private/],
  ["169.254.169.254", "http://169.254.169.254/latest/meta-data/", /url-blocked: host resolves to a private/],
  ["[::1]", "http://[::1]/x", /url-blocked: host resolves to a private/],
  ["hostname resolving to a private IP", "https://internal.example/x", /url-blocked: host resolves to a private/],
  ["hostname with one private answer among public ones", "https://mixed.example/x", /url-blocked: host resolves to a private/],
  ["credentials in URL", "https://user:pw@public.example/x", /url-blocked: URLs with credentials/],
];

for (const [name, url, re] of BLOCKED) {
  test(`POST /ingest refuses ${name} and never reaches the reader`, async () => {
    const r = await post(url, async (h) => lookupTable[h] ?? ["93.184.216.34"]);
    assert.equal(r.status, 502);
    assert.match(r.body.message ?? "", re);
    assert.deepEqual(r.calls, []);
  });
}

test("POST /ingest refuses a non-http scheme (route 400) and the store guard refuses it too", async () => {
  const r = await post("ftp://public.example/x", PUBLIC);
  assert.equal(r.status, 400);
  assert.deepEqual(r.calls, []);
  const real = globalThis.fetch; let n = 0;
  globalThis.fetch = (async () => { n++; return new Response("x"); }) as typeof fetch;
  try {
    for (const u of ["file:///etc/passwd", "ftp://public.example/x", "javascript:alert(1)"]) {
      await assert.rejects(createMongoIngestDeps(undefined, { lookup: PUBLIC }).ingestUrl("tenant-1", u), /url-blocked: only http\(s\)/);
    }
  } finally { globalThis.fetch = real; }
  assert.equal(n, 0);
});

test("POST /ingest accepts a public host with injected lookup and fetch (no real network)", async () => {
  bindDb(new BlindDb({ sources: [], sessions: [], turns: [] }));
  const r = await post("https://public.example/article", PUBLIC);
  assert.equal(r.status, 201);
  assert.ok(r.calls.length >= 1 && r.calls.every((c) => c === "https://r.jina.ai/https://public.example/article"));
});
