/**
 * T-057 D4 usage analytics: the recorder (what is written, when, and that a failing/hanging write never
 * touches the request), the closed document shape, and GET /usage (auth, scope, tenant isolation, bounds).
 * No Mongo: stores are in-memory fakes; the closed-shape test drives the real @lkb/db builder over a fake Db.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import type { Db } from "mongodb";
import { requireAuth } from "../auth.js";
import { createLogger } from "../composition/logger.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeSearchDeps } from "../fixtures.js";
import { recordUsageEvent } from "../../../../packages/db/src/collections/usage-events.js";
import { usageRecorder, usageKindOf, usageOutcomeOf, type UsageRecordDeps, type UsageRecordInput } from "./recorder.js";
import { createUsageRouter, type UsageReadDeps } from "./router.js";
import { createMongoUsageDeps, type UsageDeps } from "./store.js";

const keys = fakeKeyStore({
  "ask-a": { tenantId: "tenant-A", scopes: ["ask", "search", "jobs"] },
  "ask-b": { tenantId: "tenant-B", scopes: ["ask", "search", "jobs"] },
  "ask-only": { tenantId: "tenant-A", scopes: ["ask"] },
});
const auth = (key: string) => ({ authorization: `Bearer ${key}` });
const json = { "content-type": "application/json" };
const SECRET_QUERY = "topic one SECRET-QUERY-TEXT";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error("condition not met"); await sleep(5); }
}
function capture() {
  const lines: string[] = [];
  return { lines, logger: createLogger({ level: "debug", write: (l) => lines.push(l) }) };
}
type Event = { tenantId: string; input: UsageRecordInput };
function memoryStore(): UsageDeps & { events: Event[] } {
  const events: Event[] = [];
  return { events,
    async record(tenantId, input) { events.push({ tenantId, input }); },
    async readUsage() { return { rows: [], truncated: false }; } };
}

test("usageKindOf / usageOutcomeOf classify only ask+search and only 2xx/3xx/5xx", () => {
  assert.equal(usageKindOf("POST", "/ask"), "ask");
  assert.equal(usageKindOf("POST", "/ASK/"), "ask");
  assert.equal(usageKindOf("GET", "/search"), "search");
  assert.equal(usageKindOf("GET", "/ask"), null);
  assert.equal(usageKindOf("POST", "/search"), null);
  assert.equal(usageKindOf("GET", "/usage"), null);
  assert.equal(usageKindOf("POST", "/asked"), null);
  assert.deepEqual([200, 302, 400, 401, 403, 404, 429, 500, 503].map(usageOutcomeOf), ["ok", "ok", null, null, null, null, null, "error", "error"]);
});

test("one event per answered /ask and /search, tenant from the key, closed input shape, no content", async () => {
  const store = memoryStore();
  const server = await startTestServer(buildTestDeps({ keyStore: keys, usage: store }));
  try {
    const a = await fetch(`${server.baseUrl}/ask`, { method: "POST", headers: { ...json, ...auth("ask-a") }, body: JSON.stringify({ query: SECRET_QUERY, tenantId: "tenant-B" }) });
    assert.equal(a.status, 200);
    const s = await fetch(`${server.baseUrl}/search?q=hello&k=3`, { headers: { ...auth("ask-b"), "x-forwarded-for": "9.9.9.9" } });
    assert.equal(s.status, 200);
    await until(() => store.events.length === 2);
    await sleep(30);
    assert.equal(store.events.length, 2, "exactly one event per request");
    const [first, second] = store.events as [Event, Event];
    assert.equal(first.tenantId, "tenant-A");
    assert.deepEqual(Object.keys(first.input).sort(), ["kind", "latencyMs", "outcome"]);
    assert.deepEqual({ kind: first.input.kind, outcome: first.input.outcome }, { kind: "ask", outcome: "ok" });
    assert.equal(second.tenantId, "tenant-B");
    assert.deepEqual({ kind: second.input.kind, outcome: second.input.outcome }, { kind: "search", outcome: "ok" });
    for (const e of store.events) {
      assert.ok(Number.isFinite(e.input.latencyMs) && e.input.latencyMs >= 0);
      const text = JSON.stringify(e);
      for (const forbidden of [SECRET_QUERY, "hello", "9.9.9.9", "ask-a", "ask-b", "Bearer"]) assert.ok(!text.includes(forbidden), forbidden);
    }
  } finally { await server.close(); }
});

test("a handler that throws is recorded as an error; 4xx and unrelated routes record nothing", async () => {
  const store = memoryStore();
  const server = await startTestServer(buildTestDeps({
    keyStore: keys, usage: store,
    search: fakeSearchDeps({ search: async () => { throw new Error("boom with SECRET-QUERY-TEXT"); } }),
  }));
  try {
    assert.equal((await fetch(`${server.baseUrl}/search?q=x`, { headers: auth("ask-a") })).status, 500);
    await until(() => store.events.length === 1);
    assert.deepEqual({ kind: store.events[0]!.input.kind, outcome: store.events[0]!.input.outcome }, { kind: "search", outcome: "error" });
    const before = store.events.length;
    assert.equal((await fetch(`${server.baseUrl}/search`, { headers: auth("ask-a") })).status, 400);
    assert.equal((await fetch(`${server.baseUrl}/ask`, { method: "POST", headers: { ...json, ...auth("ask-a") }, body: "{}" })).status, 400);
    assert.equal((await fetch(`${server.baseUrl}/search?q=x`, { headers: auth("ask-only") })).status, 403);
    assert.equal((await fetch(`${server.baseUrl}/ask`, { method: "POST", headers: json, body: JSON.stringify({ query: "q" }) })).status, 401);
    assert.equal((await fetch(`${server.baseUrl}/usage`, { headers: auth("ask-a") })).status, 200);
    await sleep(60);
    assert.equal(store.events.length, before);
  } finally { await server.close(); }
});

test("a throwing store never fails the request; the warning carries no request content", async () => {
  const { lines, logger } = capture();
  const store: UsageDeps = { record: async () => { throw Object.assign(new Error("mongodb://user:pw@host down; q=SECRET-QUERY-TEXT"), { name: "MongoNetworkError" }); }, readUsage: async () => ({ rows: [], truncated: false }) };
  const server = await startTestServer(buildTestDeps({ keyStore: keys, usage: store, logger }));
  try {
    const res = await fetch(`${server.baseUrl}/ask`, { method: "POST", headers: { ...json, ...auth("ask-a") }, body: JSON.stringify({ query: SECRET_QUERY }) });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { answer: string }).answer, "This is the fake answer.");
    await until(() => lines.some((l) => l.includes("usage event not recorded")));
    const warn = lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.msg === "usage event not recorded")!;
    assert.deepEqual({ level: warn.level, usageKind: warn.usageKind, reason: warn.reason, errorName: warn.errorName }, { level: "warn", usageKind: "ask", reason: "error", errorName: "MongoNetworkError" });
    const all = lines.join("");
    for (const forbidden of [SECRET_QUERY, "SECRET-QUERY-TEXT", "user:pw", "ask-a", "Bearer"]) assert.ok(!all.includes(forbidden), forbidden);
  } finally { await server.close(); }
});

async function miniApp(deps: UsageRecordDeps, opts: Parameters<typeof usageRecorder>[2], log = capture()) {
  const app = express();
  app.use(requireAuth(keys));
  app.use(usageRecorder(deps, log.logger, opts));
  app.get("/search", (_req, res) => { res.status(200).json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return { url: `http://127.0.0.1:${address.port}`, log, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("a hanging write does not delay the response and is abandoned at the timeout (reason: timeout)", async () => {
  let calls = 0;
  const app = await miniApp({ record: () => { calls++; return new Promise<void>(() => undefined); } }, { timeoutMs: 60 });
  try {
    const started = Date.now();
    const res = await fetch(`${app.url}/search`, { headers: auth("ask-a") });
    assert.equal(res.status, 200);
    assert.ok(Date.now() - started < 50, "response must not wait for the write");
    await until(() => app.log.lines.length > 0);
    assert.equal(calls, 1);
    assert.equal((JSON.parse(app.log.lines[0]!) as { reason: string }).reason, "timeout");
  } finally { await app.close(); }
});

test("pending writes are bounded: beyond maxInFlight events are dropped with a backlog warning", async () => {
  let calls = 0;
  const app = await miniApp({ record: () => { calls++; return new Promise<void>(() => undefined); } }, { timeoutMs: 5000, maxInFlight: 2 });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await fetch(`${app.url}/search`, { headers: auth("ask-a") })).status, 200);
    await until(() => app.log.lines.length >= 3);
    assert.equal(calls, 2);
    assert.deepEqual(app.log.lines.map((l) => (JSON.parse(l) as { reason: string }).reason), ["backlog", "backlog", "backlog"]);
  } finally { await app.close(); }
});

test("a synchronously throwing record() is contained", async () => {
  const app = await miniApp({ record: () => { throw new Error("sync"); } }, { timeoutMs: 100 });
  try {
    assert.equal((await fetch(`${app.url}/search`, { headers: auth("ask-a") })).status, 200);
    await until(() => app.log.lines.length > 0);
  } finally { await app.close(); }
});

test("the stored document is EXACTLY the closed schema shape (real builder over a fake Db), nothing from the request", async () => {
  const rows: Record<string, unknown>[] = [];
  const db = { collection: (name: string) => { assert.equal(name, "usage_events"); return { insertOne: async (d: Record<string, unknown>) => { rows.push(d); return {}; } }; } } as unknown as Db;
  const usage = createMongoUsageDeps({ record: (t, i) => recordUsageEvent(t, i, db), list: async () => ({ rows: [], truncated: false }) });
  const server = await startTestServer(buildTestDeps({ keyStore: keys, usage }));
  try {
    await fetch(`${server.baseUrl}/ask`, { method: "POST", headers: { ...json, ...auth("ask-a"), "user-agent": "UA-SECRET" }, body: JSON.stringify({ query: SECRET_QUERY }) });
    await until(() => rows.length === 1);
    const doc = rows[0]!;
    assert.deepEqual(Object.keys(doc).sort(), ["_id", "at", "day", "kind", "latencyMs", "outcome", "tenantId"]);
    assert.equal(doc.tenantId, "tenant-A"); assert.equal(doc.kind, "ask"); assert.equal(doc.outcome, "ok");
    assert.match(String(doc._id), /^[0-9a-f-]{36}$/);
    assert.match(String(doc.day), /^\d{4}-\d{2}-\d{2}$/); assert.equal(doc.day, String(doc.at).slice(0, 10));
    assert.ok(Number.isInteger(doc.latencyMs));
    for (const forbidden of [SECRET_QUERY, "UA-SECRET", "127.0.0.1", "ask-a"]) assert.ok(!JSON.stringify(doc).includes(forbidden), forbidden);
  } finally { await server.close(); }
});

// ---- GET /usage ----
const TODAY = new Date("2026-10-12T10:00:00Z");
function usageApp(read: UsageReadDeps["readUsage"]) {
  const app = express();
  app.use(express.json());
  app.use(requireAuth(keys));
  app.use(createUsageRouter({ readUsage: read }, () => TODAY));
  return app;
}
async function serve(app: express.Express, run: (url: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((r) => server.close(() => r())); }
}
const R = (day: string, kind: "ask" | "search", outcome: "ok" | "error") => ({ day, kind, outcome });

test("GET /usage: per-day counts by kind, error rates, zero-filled window, tenant isolation, no-store", async () => {
  const all: Record<string, unknown[]> = {
    "tenant-A": [R("2026-10-12", "ask", "ok"), R("2026-10-12", "ask", "error"), R("2026-10-12", "search", "ok"), R("2026-10-10", "ask", "ok"), R("2026-10-01", "ask", "ok")],
    "tenant-B": [R("2026-10-12", "search", "error"), R("2026-10-12", "search", "error")],
  };
  const calls: [string, string][] = [];
  await serve(usageApp(async (t, since) => { calls.push([t, since]); return { rows: all[t] ?? [], truncated: false }; }), async (url) => {
    const res = await fetch(`${url}/usage?days=3`, { headers: { ...auth("ask-a"), "x-tenant-id": "tenant-B" } });
    assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await res.json() as { days: number; from: string; to: string; byDay: { day: string; ask: object; search: object }[]; totals: object; truncated: boolean };
    assert.deepEqual(calls, [["tenant-A", "2026-10-10"]]);
    assert.deepEqual(body.byDay.map((d) => d.day), ["2026-10-10", "2026-10-11", "2026-10-12"]);
    assert.deepEqual(body.byDay[0]!.ask, { total: 1, errors: 0, errorRate: 0 });
    assert.deepEqual(body.byDay[1]!.ask, { total: 0, errors: 0, errorRate: null });
    assert.deepEqual(body.byDay[2]!.ask, { total: 2, errors: 1, errorRate: 0.5 });
    assert.deepEqual(body.byDay[2]!.search, { total: 1, errors: 0, errorRate: 0 });
    assert.deepEqual(body.totals, { ask: { total: 3, errors: 1, errorRate: 1 / 3 }, search: { total: 1, errors: 0, errorRate: 0 } });
    assert.equal(body.days, 3); assert.equal(body.from, "2026-10-10"); assert.equal(body.to, "2026-10-12"); assert.equal(body.truncated, false);
    const b = await (await fetch(`${url}/usage?days=1`, { headers: auth("ask-b") })).json() as { totals: { search: object; ask: object } };
    assert.deepEqual(b.totals.search, { total: 2, errors: 2, errorRate: 1 }); assert.deepEqual(b.totals.ask, { total: 0, errors: 0, errorRate: null });
    assert.deepEqual(calls[1], ["tenant-B", "2026-10-12"]);
  });
});

test("GET /usage: default 30 days, bounds 1..90, strict query refused before any read", async () => {
  const calls: string[] = [];
  await serve(usageApp(async (_t, since) => { calls.push(since); return { rows: [], truncated: false }; }), async (url) => {
    for (const q of ["days=0", "days=91", "days=-1", "days=01", "days=1.5", "days=1e1", "days=+5", "days=", "days=abc", "days=1&days=2", "days[]=1", "tenantId=tenant-B", "days=5&tenant=B", "limit=5", "__proto__=x"]) {
      const res = await fetch(`${url}/usage?${q}`, { headers: auth("ask-a") });
      assert.equal(res.status, 400, q);
      assert.deepEqual(await res.json(), { error: "invalid_usage_query", message: "Invalid usage query" });
    }
    assert.deepEqual(calls, []);
    const d30 = await (await fetch(`${url}/usage`, { headers: auth("ask-a") })).json() as { days: number; byDay: unknown[] };
    assert.equal(d30.days, 30); assert.equal(d30.byDay.length, 30);
    const d1 = await (await fetch(`${url}/usage?days=1`, { headers: auth("ask-a") })).json() as { byDay: unknown[] };
    assert.equal(d1.byDay.length, 1);
    const d90 = await (await fetch(`${url}/usage?days=90`, { headers: auth("ask-a") })).json() as { byDay: unknown[] };
    assert.equal(d90.byDay.length, 90);
    assert.deepEqual(calls, ["2026-09-13", "2026-10-12", "2026-07-15"]);
  });
});

test("GET /usage: 401 without a key, 403 without the jobs scope, both before any read", async () => {
  const calls: string[] = [];
  await serve(usageApp(async (t) => { calls.push(t); return { rows: [], truncated: false }; }), async (url) => {
    assert.equal((await fetch(`${url}/usage`)).status, 401);
    assert.equal((await fetch(`${url}/usage`, { headers: auth("nope") })).status, 401);
    assert.equal((await fetch(`${url}/usage`, { headers: auth("ask-only") })).status, 403);
    assert.deepEqual(calls, []);
  });
});

test("GET /usage fails closed (503, fixed body) on a store error, a malformed row, or no store wired; reports truncation", async () => {
  const bodyOf = async (read: UsageReadDeps["readUsage"], url?: string) => {
    let out: { status: number; body: unknown } | undefined;
    await serve(usageApp(read), async (u) => { const r = await fetch(`${u}/usage${url ?? ""}`, { headers: auth("ask-a") }); out = { status: r.status, body: await r.json() }; });
    return out!;
  };
  const fixed = { error: "usage_unavailable", message: "Usage analytics are unavailable" };
  assert.deepEqual(await bodyOf(async () => { throw new Error("mongodb://u:p@h SECRET"); }), { status: 503, body: fixed });
  assert.deepEqual(await bodyOf(async () => ({ rows: [{ day: "2026-10-12", kind: "chat", outcome: "ok" }], truncated: false })), { status: 503, body: fixed });
  assert.deepEqual(await bodyOf(async () => ({ rows: [null], truncated: false })), { status: 503, body: fixed });
  const t = await bodyOf(async () => ({ rows: [], truncated: true }), "?days=2");
  assert.equal(t.status, 200); assert.equal((t.body as { truncated: boolean }).truncated, true);
  const server = await startTestServer(buildTestDeps({ keyStore: keys }));
  try { const r = await fetch(`${server.baseUrl}/usage`, { headers: auth("ask-a") }); assert.equal(r.status, 503); } finally { await server.close(); }
});

test("rows outside the window (clock skew) are ignored, not mis-bucketed", async () => {
  await serve(usageApp(async () => ({ rows: [R("2026-10-13", "ask", "ok"), R("2026-09-01", "ask", "ok"), R("2026-10-12", "ask", "ok")], truncated: false })), async (url) => {
    const b = await (await fetch(`${url}/usage?days=2`, { headers: auth("ask-a") })).json() as { totals: { ask: { total: number } } };
    assert.equal(b.totals.ask.total, 1);
  });
});

test("the store layer forwards only kind/outcome/latencyMs, even if handed more", async () => {
  const seen: unknown[] = [];
  const usage = createMongoUsageDeps({ record: async (t, i) => { seen.push([t, i]); }, list: async () => ({ rows: [], truncated: false }) });
  await usage.record("tenant-A", { kind: "ask", outcome: "ok", latencyMs: 3, query: "SECRET", keyId: "k" } as never);
  assert.deepEqual(seen, [["tenant-A", { kind: "ask", outcome: "ok", latencyMs: 3 }]]);
  await assert.rejects(usage.record(" ", { kind: "ask", outcome: "ok", latencyMs: 1 }));
  await assert.rejects(usage.readUsage("", "2026-10-01"));
});
