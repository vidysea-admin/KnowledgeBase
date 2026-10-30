import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { inspect } from "node:util";
import { createArchiverClient, type ArchiverClient, type ArchiverClientEvent } from "./client.js";
import { loadArchiverConfig, type ArchiverConfig } from "./config.js";
import { ArchiverError, mapUpstreamError, UPSTREAM_CODES } from "./errors.js";

const TOKEN = "CANARY-TOKEN-" + "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const CANARY_QR = "CANARY-QR-9f8e7d6c5b4a";
const OWNER = "a".repeat(24);
const JID = "120363000000000000@g.us";
const mkConfig = (url = "https://archiver.example.org", o: { timeoutMs?: number } = {}): ArchiverConfig =>
  loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: url, WHATSAPP_ARCHIVER_API_TOKEN: TOKEN, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" }, o)!;
const json = (status: number, body: unknown, h: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-archiver-api-version": "1", ...h } });
const errBody = (code: string, extra: Record<string, unknown> = {}) => ({ error: { code, requestId: "req-abcdefgh", ...extra } });
type Call = { url: string; init: RequestInit };
function scripted(replies: Array<Response | Error | (() => Response)>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []; let i = 0;
  return { calls, fetch: (async (url: URL | string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies[Math.min(i++, replies.length - 1)]!;
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  }) as typeof fetch };
}
const client = (f: typeof fetch, cfg = mkConfig(), extra: Record<string, unknown> = {}): ArchiverClient =>
  createArchiverClient(cfg, { fetch: f, sleep: async () => {}, ...extra });
const code = async (p: Promise<unknown>): Promise<ArchiverError> => { try { await p; } catch (e) { return e as ArchiverError; } throw new Error("expected rejection"); };
const sessionOk = { status: "connected", detail: null, updatedAt: "2026-10-29T12:00:00.000Z", accountHint: "47" };

test("ids are validated before any request (no fetch call) and never come from anywhere else", async () => {
  const s = scripted([json(200, sessionOk)]); const c = client(s.fetch);
  const badOwners = ["", "A".repeat(24), "a".repeat(23), "a".repeat(25), "../../etc/passwd", `${OWNER}/../x`, `${OWNER}?x=1`, `${OWNER}%2f..`, "g".repeat(24), `${OWNER}\n`];
  for (const id of badOwners) assert.equal((await code(c.getSession(id))).code, "invalid_request", JSON.stringify(id));
  for (const j of ["x@c.us", "../x@g.us", "12345@g.us/../..", "1@g.us", "1".repeat(41) + "@g.us", `${JID}?q`, `${JID}\n`, ""])
    assert.equal((await code(c.listPeople(OWNER, j))).code, "invalid_request", JSON.stringify(j));
  assert.equal((await code(c.ensureOwner("nope"))).code, "invalid_request");
  assert.equal((await code(c.setPeople(OWNER, JID, ["zz"]))).code, "invalid_request");
  assert.equal((await code(c.setPeople(OWNER, JID, [OWNER, OWNER]))).code, "invalid_request");
  assert.equal((await code(c.setPeople(OWNER, JID, Array.from({ length: 1001 }, (_, i) => i.toString(16).padStart(24, "0"))))).code, "invalid_request");
  assert.equal((await code(c.setGroupTracking(OWNER, JID, { isTracked: "yes" as unknown as boolean }))).code, "invalid_request");
  assert.equal((await code(c.startSession(OWNER, { idempotencyKey: "bad key!" }))).code, "invalid_request");
  assert.equal(s.calls.length, 0);
});

test("request shape: fixed origin + constant path, bearer header only, no query, manual redirects, no-store, encoded jid", async () => {
  const cfg = mkConfig("https://archiver.example.org:8443");
  const s = scripted([json(200, { jid: JID, isTracked: true, trackAllSenders: true, capture: "all", changed: true })]);
  await client(s.fetch, cfg).setGroupTracking(OWNER, JID, { isTracked: true });
  const { url, init } = s.calls[0]!;
  assert.equal(url, `https://archiver.example.org:8443/svc/v1/owners/${OWNER}/groups/120363000000000000%40g.us/tracking`);
  assert.equal(new URL(url).search, "");
  assert.equal(init.redirect, "manual"); assert.equal(init.cache, "no-store"); assert.equal(init.method, "PUT");
  const h = init.headers as Record<string, string>;
  assert.equal(h.authorization, `Bearer ${TOKEN}`);
  assert.match(h["idempotency-key"]!, /^[A-Za-z0-9_-]{1,64}$/);
  assert.match(h["x-request-id"]!, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(!url.includes(TOKEN) && !String(init.body).includes(TOKEN));
  assert.equal(init.body, JSON.stringify({ isTracked: true }));
});

test("unlinkSession always sends the confirm literal; GET carries no body and no idempotency key", async () => {
  const s = scripted([json(200, { ownerId: OWNER, state: "unlinked", status: "closed", captureDisabled: true, unlinkedAt: "2026-10-29T12:00:00.000Z" }), json(200, sessionOk)]);
  const c = client(s.fetch);
  await c.unlinkSession(OWNER);
  assert.equal(s.calls[0]!.init.body, JSON.stringify({ confirm: "UNLINK" }));
  await c.getSession(OWNER);
  assert.equal(s.calls[1]!.init.body, undefined);
  assert.equal((s.calls[1]!.init.headers as Record<string, string>)["idempotency-key"], undefined);
});

test("every upstream code maps into the closed vocabulary; unknown codes become archiver_api_unexpected", () => {
  const expected: Record<string, string> = { unauthorized: "archiver_api_unavailable", not_found: "archiver_api_unexpected", method_not_allowed: "archiver_api_unexpected",
    payload_too_large: "archiver_api_unexpected", unsupported_media_type: "archiver_api_unexpected" };
  for (const c of UPSTREAM_CODES) assert.equal(mapUpstreamError(400, errBody(c), null).code, expected[c] ?? c, c);
  assert.equal(mapUpstreamError(400, errBody("brand_new_code"), null).code, "archiver_api_unexpected");
  assert.equal(mapUpstreamError(401, errBody("unauthorized"), null).upstreamCode, "unauthorized");
  assert.equal(mapUpstreamError(502, undefined, null).code, "archiver_api_unavailable");
  assert.equal(mapUpstreamError(403, undefined, null).reason, "unauthorized");
  assert.equal(mapUpstreamError(429, undefined, "7").retryAfterSec, 7);
  assert.equal(mapUpstreamError(429, errBody("rate_limited", { retryAfterSec: -1 }), "bogus").retryAfterSec, null);
  assert.equal(mapUpstreamError(418, undefined, null).code, "archiver_api_unexpected");
});

test("hostile error bodies echoing the token and a QR never reach message, JSON, inspect or stack", async () => {
  const hostile = { error: { code: "internal_error", requestId: "req-abcdefgh", message: `token ${TOKEN} qr ${CANARY_QR}`, stack: TOKEN, detail: { qr: CANARY_QR } } };
  const s = scripted([json(500, hostile), json(401, { error: { code: "unauthorized", requestId: `x ${TOKEN}` } }), new Response(`<html>${TOKEN} ${CANARY_QR}</html>`, { status: 502, headers: { "x-archiver-api-version": "1" } })]);
  const c = client(s.fetch);
  for (const call of [() => c.getHealth(), () => c.getHealth(), () => c.getQr(OWNER)]) {
    const e = await code(call());
    for (const text of [e.message, JSON.stringify(e), inspect(e, { depth: 6, showHidden: true }), String(e.stack), String(e)])
      assert.ok(!text.includes("CANARY"), text.slice(0, 80));
  }
  assert.equal((await code(client(scripted([json(500, hostile)]).fetch).getHealth())).code, "internal_error");
  assert.equal((await code(client(scripted([json(401, { error: { code: "unauthorized", requestId: `x ${TOKEN}` } })]).fetch).getHealth())).requestId, null);
});

test("redirects are never followed: a 3xx to another host is refused and the second host never sees the token", async () => {
  const seen: IncomingMessage[] = [];
  const evil: Server = createServer((req, res) => { seen.push(req); res.writeHead(200, { "x-archiver-api-version": "1", "content-type": "application/json" }).end("{}"); });
  await new Promise<void>(r => evil.listen(0, "127.0.0.1", r));
  const evilUrl = `http://127.0.0.1:${(evil.address() as { port: number }).port}/steal`;
  const front: Server = createServer((req, res) => { res.writeHead(req.url?.includes("same") ? 307 : 302, { location: req.url?.includes("same") ? "/svc/v1/health" : evilUrl }).end(); });
  await new Promise<void>(r => front.listen(0, "127.0.0.1", r));
  try {
    const c = createArchiverClient(mkConfig(`http://127.0.0.1:${(front.address() as { port: number }).port}`));
    const e = await code(c.getSession(OWNER));
    assert.deepEqual([e.code, e.reason, e.status], ["archiver_api_unavailable", "redirect_refused", 302]);
    assert.equal(seen.length, 0, "the redirect target was contacted");
    for (const status of [301, 303, 307, 308]) {
      const s = scripted([new Response(null, { status, headers: { location: evilUrl, "x-archiver-api-version": "1" } })]);
      assert.equal((await code(client(s.fetch).startSession(OWNER))).reason, "redirect_refused");
      assert.equal(s.calls.length, 1, "a redirect response is not retried or followed");
    }
  } finally { evil.close(); front.close(); evil.closeAllConnections(); front.closeAllConnections(); }
});

test("a missing or different X-Archiver-Api-Version is archiver_api_unavailable (version_mismatch)", async () => {
  for (const h of [{}, { "x-archiver-api-version": "2" }]) {
    const r = new Response(JSON.stringify(sessionOk), { status: 200, headers: { "content-type": "application/json", ...h } });
    const e = await code(client(scripted([r]).fetch).getSession(OWNER));
    assert.deepEqual([e.code, e.reason], ["archiver_api_unavailable", "version_mismatch"]);
  }
});

test("2xx must be JSON, an object, with the contract shape; unknown fields are dropped, not returned", async () => {
  const wrong = new Response("ok", { status: 200, headers: { "content-type": "text/html", "x-archiver-api-version": "1" } });
  assert.equal((await code(client(scripted([wrong]).fetch).getSession(OWNER))).code, "archiver_api_unexpected");
  for (const body of [[], null, "x", { status: "weird" }, { ...sessionOk, accountHint: "123" }, { ...sessionOk, updatedAt: "yesterday" }, { ...sessionOk, detail: "free text" }])
    assert.equal((await code(client(scripted([json(200, body)]).fetch).getSession(OWNER))).code, "archiver_api_unexpected", JSON.stringify(body));
  const ok = await client(scripted([json(200, { ...sessionOk, extra: "x", qr: CANARY_QR })]).fetch).getSession(OWNER);
  assert.deepEqual(Object.keys(ok).sort(), ["accountHint", "detail", "status", "updatedAt"]);
  const notConnected = await client(scripted([json(200, { ...sessionOk, status: "logged_out", detail: "logged_out" })]).fetch).getSession(OWNER);
  assert.equal(notConnected.accountHint, null);
});

test("QR response: consistent triple, png data URL only, status must be awaiting_qr", async () => {
  const url = "data:image/png;base64,AAAA";
  const good = { status: "awaiting_qr", qr: CANARY_QR, qrDataUrl: url, expiresAt: "2026-10-29T12:00:20.000Z" };
  assert.deepEqual(await client(scripted([json(200, good)]).fetch).getQr(OWNER), good);
  assert.deepEqual(await client(scripted([json(200, { status: "connected", qr: null, qrDataUrl: null, expiresAt: null })]).fetch).getQr(OWNER), { status: "connected", qr: null, qrDataUrl: null, expiresAt: null });
  for (const body of [{ ...good, qrDataUrl: "data:image/svg+xml;base64,AAAA" }, { ...good, qrDataUrl: "javascript:alert(1)" }, { ...good, qrDataUrl: "https://evil.example.org/x.png" },
    { ...good, status: "connected" }, { ...good, qrDataUrl: null }, { ...good, expiresAt: null }, { ...good, qr: "x".repeat(5000) }])
    assert.equal((await code(client(scripted([json(200, body)]).fetch).getQr(OWNER))).code, "archiver_api_unexpected", JSON.stringify(body).slice(0, 60));
});

test("echoes must match the request (ownerRef, ownerId, jid)", async () => {
  assert.equal((await code(client(scripted([json(200, { ownerId: OWNER, ownerRef: "b".repeat(24), created: true, state: "active" })]).fetch).ensureOwner("c".repeat(24)))).code, "archiver_api_unexpected");
  assert.equal((await code(client(scripted([json(200, { ownerId: "b".repeat(24), state: "unlinked", status: "closed", captureDisabled: true, unlinkedAt: "2026-10-29T12:00:00.000Z" })]).fetch).unlinkSession(OWNER))).code, "archiver_api_unexpected");
  assert.equal((await code(client(scripted([json(200, { jid: "999999@g.us", isTracked: true, trackAllSenders: true, capture: "all", changed: true })]).fetch).setGroupTracking(OWNER, JID, { isTracked: true }))).code, "archiver_api_unexpected");
});

test("oversized responses are refused by declared length and by streamed bytes", async () => {
  const huge = new Response("x".repeat(300 * 1024), { status: 200, headers: { "content-type": "application/json", "x-archiver-api-version": "1" } });
  assert.deepEqual([(await code(client(scripted([huge]).fetch).getSession(OWNER))).reason], ["oversize"]);
  const stream = new Response(new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(10_000)); c.close(); } }), { status: 200, headers: { "content-type": "application/json", "x-archiver-api-version": "1" } });
  assert.equal((await code(client(scripted([stream]).fetch).getSession(OWNER))).reason, "oversize");
});

test("a server that never answers times out (archiver_api_unavailable/timeout) within the configured bound", async () => {
  const hang: Server = createServer(() => {});
  await new Promise<void>(r => hang.listen(0, "127.0.0.1", r));
  try {
    const c = createArchiverClient(mkConfig(`http://127.0.0.1:${(hang.address() as { port: number }).port}`, { timeoutMs: 150 }), { maxRetries: 0 });
    const t0 = Date.now(); const e = await code(c.getQr(OWNER));
    assert.deepEqual([e.code, e.reason], ["archiver_api_unavailable", "timeout"]);
    assert.ok(Date.now() - t0 < 3000);
  } finally { hang.closeAllConnections(); hang.close(); }
});

test("a connection refused is archiver_api_unavailable/network with no host detail", async () => {
  const e = await code(createArchiverClient(mkConfig("http://127.0.0.1:1"), { maxRetries: 0, sleep: async () => {} }).getHealth());
  assert.deepEqual([e.code, e.reason], ["archiver_api_unavailable", "network"]);
  assert.ok(!inspect(e, { depth: 8, showHidden: true }).includes("127.0.0.1"));
});

test("retries: idempotent calls retry transient failures with the SAME idempotency key; bounded at 3 attempts", async () => {
  const s = scripted([json(503, errBody("store_unavailable", { retryAfterSec: 1 })), new Error("socket hang up"), json(200, { status: "connecting", updatedAt: "2026-10-29T12:00:00.000Z" })]);
  const waits: number[] = [];
  const r = await createArchiverClient(mkConfig(), { fetch: s.fetch, sleep: async ms => { waits.push(ms); } }).startSession(OWNER);
  assert.equal(r.status, "connecting");
  assert.equal(s.calls.length, 3);
  assert.equal(new Set(s.calls.map(c => (c.init.headers as Record<string, string>)["idempotency-key"])).size, 1);
  assert.ok(waits.every(w => w <= 5000));
  const always = scripted([() => json(503, errBody("store_unavailable"))]);
  assert.equal((await code(client(always.fetch).getSession(OWNER))).code, "store_unavailable");
  assert.equal(always.calls.length, 3);
});

test("no retry on non-transient errors, on long Retry-After, or on redirects/auth failures", async () => {
  for (const [res, n] of [[json(404, errBody("owner_not_found")), 1], [json(400, errBody("invalid_request")), 1], [json(401, errBody("unauthorized")), 1],
    [json(429, errBody("rate_limited", { retryAfterSec: 60 })), 1], [json(500, errBody("internal_error")), 1]] as const) {
    const s = scripted([res]); await code(client(s.fetch).getSession(OWNER)); assert.equal(s.calls.length, n);
  }
});

test("getQr is never retried and never cached: one request per call, nothing remembered between calls", async () => {
  for (const first of [json(503, errBody("store_unavailable", { retryAfterSec: 0 })), new Error("boom"), json(429, errBody("rate_limited", { retryAfterSec: 0 }))]) {
    const s = scripted([first, json(200, { status: "awaiting_qr", qr: CANARY_QR, qrDataUrl: "data:image/png;base64,AAAA", expiresAt: "2026-10-29T12:00:20.000Z" })]);
    const c = client(s.fetch);
    await code(c.getQr(OWNER)); assert.equal(s.calls.length, 1);
  }
  const s = scripted([json(200, { status: "awaiting_qr", qr: "QR-1", qrDataUrl: "data:image/png;base64,AAAA", expiresAt: "2026-10-29T12:00:20.000Z" }),
    json(200, { status: "awaiting_qr", qr: "QR-2", qrDataUrl: "data:image/png;base64,BBBB", expiresAt: "2026-10-29T12:00:40.000Z" })]);
  const c = client(s.fetch);
  assert.equal((await c.getQr(OWNER)).qr, "QR-1"); assert.equal((await c.getQr(OWNER)).qr, "QR-2");
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls.every(x => x.init.cache === "no-store" && (x.init.headers as Record<string, string>)["idempotency-key"] === undefined));
});

test("canary token and canary QR never reach console, stdout/stderr, observer events, errors or results other than the QR result", async () => {
  const sink: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout), realErr = process.stderr.write.bind(process.stderr);
  const methods = ["log", "info", "warn", "error", "debug"] as const; const saved = methods.map(m => console[m]);
  const capture = (...a: unknown[]): void => { sink.push(a.map(x => (typeof x === "string" ? x : inspect(x, { depth: 6 }))).join(" ")); };
  methods.forEach(m => { console[m] = capture; });
  process.stdout.write = ((c: unknown) => { sink.push(String(c)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((c: unknown) => { sink.push(String(c)); return true; }) as typeof process.stderr.write;
  const events: ArchiverClientEvent[] = [];
  const thrown: unknown[] = [];
  try {
    const qrOk = json(200, { status: "awaiting_qr", qr: CANARY_QR, qrDataUrl: "data:image/png;base64,AAAA", expiresAt: "2026-10-29T12:00:20.000Z" });
    const hostile = (c: string) => json(500, { error: { code: c, requestId: "req-abcdefgh", message: `${TOKEN} ${CANARY_QR}` } });
    const s = scripted([qrOk, hostile("internal_error"), hostile("brand_new"), new Response(`${TOKEN}${CANARY_QR}`, { status: 502 }), new Error(`${TOKEN} ${CANARY_QR}`), json(200, { status: "awaiting_qr", qr: 5 })]);
    const c = createArchiverClient(mkConfig(), { fetch: s.fetch, sleep: async () => {}, maxRetries: 0, onEvent: e => events.push(e) });
    await c.getQr(OWNER);
    for (let i = 0; i < 5; i++) { try { await c.getQr(OWNER); } catch (e) { thrown.push(e); } }
  } finally {
    methods.forEach((m, i) => { console[m] = saved[i]!; });
    process.stdout.write = realOut; process.stderr.write = realErr;
  }
  assert.equal(thrown.length, 5);
  for (const text of [...sink, JSON.stringify(events), ...thrown.map(e => `${inspect(e, { depth: 8, showHidden: true })}${JSON.stringify(e)}${(e as Error).stack}`)])
    assert.ok(!text.includes("CANARY"), text.slice(0, 100));
  for (const e of events) assert.deepEqual(Object.keys(e).sort(), ["attempt", "ms", "op", "outcome", "requestId", "status"]);
});

test("a throwing observer cannot change the outcome", async () => {
  const c = client(scripted([json(200, sessionOk)]).fetch, mkConfig(), { onEvent: () => { throw new Error("observer bug"); } });
  assert.equal((await c.getSession(OWNER)).status, "connected");
});
