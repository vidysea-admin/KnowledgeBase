/**
 * apps/api/src/composition/request-log.test.ts — D7. Structured logger + request-id/access-log middleware
 * against the real Express app (ephemeral loopback port, fakes only: no Mongo, no network beyond loopback).
 * Every secret kind is fed a FAKE value and asserted absent from the captured output.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, resolveLevel, type LogLevel } from "./logger.js";
import { SAFE_REQUEST_ID } from "./request-log.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = "good-ask-key";
const FAKE_KEY = "sk-FAKE-api-key-0123456789abcdef";
const FAKE_MONGO = "mongodb+srv://dbuser:SuperSecretPw9@cluster0.example.mongodb.net/lkb?retryWrites=true";

function capture(level: LogLevel | "silent" = "debug") {
  const lines: string[] = [];
  return { lines, logger: createLogger({ level, write: (l) => lines.push(l) }), json: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
}

async function withServer<T>(over: Parameters<typeof buildTestDeps>[0], fn: (base: string, cap: ReturnType<typeof capture>) => Promise<T>): Promise<T> {
  const cap = capture();
  const server = await startTestServer(buildTestDeps({ logger: cap.logger, ...over }));
  try { return await fn(server.baseUrl, cap); } finally { await server.close(); }
}
/** Access lines are written on "finish"/"close", which can land just after the client has the response. */
const settle = () => new Promise<void>((r) => setTimeout(r, 30));
const access = (cap: ReturnType<typeof capture>) => cap.json().filter((l) => l.msg === "request");

test("request id: generated UUID when absent, echoed on the response, same id in the access line", async () => {
  await withServer({}, async (base, cap) => {
    const res = await fetch(`${base}/health`);
    const id = res.headers.get("x-request-id")!;
    assert.match(id, UUID);
    await settle();
    const lines = access(cap);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.requestId, id);
  });
});

test("request id: a safe incoming X-Request-Id is accepted and echoed", async () => {
  await withServer({}, async (base, cap) => {
    const res = await fetch(`${base}/health`, { headers: { "x-request-id": "trace-123.ABC_def" } });
    assert.equal(res.headers.get("x-request-id"), "trace-123.ABC_def");
    await settle();
    assert.equal(access(cap)[0]!.requestId, "trace-123.ABC_def");
  });
});

test("request id: unsafe incoming ids are rejected and replaced by a UUID", async () => {
  const unsafe = ["has space", "a".repeat(129), "<script>alert(1)</script>", "semi;colon", "ünïcode", "id/with/slash", "x,y", ""];
  await withServer({}, async (base, cap) => {
    for (const bad of unsafe) {
      const res = await fetch(`${base}/health`, { headers: { "x-request-id": bad } });
      const id = res.headers.get("x-request-id")!;
      assert.notEqual(id, bad, `unsafe id ${JSON.stringify(bad)} must not be echoed`);
      assert.match(id, UUID);
    }
    await settle();
    for (const l of access(cap)) assert.match(String(l.requestId), UUID);
  });
  assert.ok(SAFE_REQUEST_ID.test("a".repeat(128)) && !SAFE_REQUEST_ID.test("a".repeat(129)));
});

test("access line shape: method, path without query, status, durationMs, requestId, tenantId only when authenticated", async () => {
  await withServer({}, async (base, cap) => {
    await fetch(`${base}/health?token=QUERY-SECRET-1#frag`);
    await fetch(`${base}/search?q=QUERY-SECRET-2&x=1`, { headers: { authorization: `Bearer ${KEY}` } });
    await fetch(`${base}/search?q=QUERY-SECRET-3`, { headers: { authorization: "Bearer wrong-key-FAKE" } });
    await settle();
    const [health, authed, denied] = access(cap);
    assert.deepEqual(Object.keys(health!).sort(), ["durationMs", "level", "method", "msg", "path", "requestId", "status", "time"]);
    assert.equal(health!.method, "GET");
    assert.equal(health!.path, "/health");
    assert.equal(health!.status, 200);
    assert.equal(health!.level, "info");
    assert.ok(typeof health!.durationMs === "number" && (health!.durationMs as number) >= 0);
    assert.ok(!Number.isNaN(Date.parse(String(health!.time))));
    assert.equal(authed!.path, "/search");
    assert.equal(authed!.tenantId, "tenant-1");
    assert.equal(denied!.status, 401);
    assert.equal(denied!.level, "warn");
    assert.ok(!("tenantId" in denied!));
    for (const l of cap.lines) assert.ok(!/QUERY-SECRET|wrong-key|good-ask-key|\?/.test(l), `leak in ${l}`);
  });
});

test("redaction end to end: API key, Authorization, cookie, x-api-key, query string, request body never reach the output", async () => {
  await withServer({ keyStore: fakeKeyStore({ [FAKE_KEY]: { tenantId: "tenant-1", scopes: ["ask"] } }) }, async (base, cap) => {
    await fetch(`${base}/ask?apikey=${FAKE_KEY}&secret=QSECRET`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${FAKE_KEY}`, cookie: "sid=COOKIE-SECRET-77", "x-api-key": "XAPIKEY-SECRET-88" },
      body: JSON.stringify({ query: "BODY-SECRET-99", password: "BODY-PW-11" }),
    });
    await fetch(`${base}/ask`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "XAPIKEY-SECRET-88" }, body: "{not json BODY-SECRET-99" });
    await settle();
    assert.ok(cap.lines.length >= 2);
    const all = cap.lines.join("");
    for (const s of [FAKE_KEY, "COOKIE-SECRET-77", "XAPIKEY-SECRET-88", "QSECRET", "BODY-SECRET-99", "BODY-PW-11"]) assert.ok(!all.includes(s), `${s} leaked`);
    assert.equal(access(cap)[0]!.tenantId, "tenant-1");
  });
});

test("logger redacts by key at any depth and by value inside strings and errors", () => {
  const prev = process.env.MONGODB_URL;
  process.env.MONGODB_URL = "mongodb://envuser:EnvPassw0rd@db.internal:27017/lkb";
  try {
    const cap = capture();
    const err = new Error(`connect failed for ${FAKE_MONGO} and also ${process.env.MONGODB_URL} Bearer ${FAKE_KEY}`);
    cap.logger.child({ requestId: "r1" }).error(`boom ${FAKE_MONGO}`, {
      err,
      authorization: `Bearer ${FAKE_KEY}`,
      Cookie: "sid=C-77",
      "x-api-key": FAKE_KEY,
      headers: { authorization: `Bearer ${FAKE_KEY}`, cookie: "sid=C-77" },
      body: { text: "BODYTEXT" },
      query: { token: "Q-TOKEN" },
      nested: { deep: { apiKey: FAKE_KEY, password: "PW-1", ok: "visible" } },
      mongodbUrl: FAKE_MONGO,
      url: `https://example.test/cb?code=OAUTH-CODE&state=S`,
      note: `x-api-key: ${FAKE_KEY} api_key=${FAKE_KEY}`,
      time: "spoofed", level: "spoofed", msg: "spoofed",
    });
    const all = cap.lines.join("");
    for (const s of [FAKE_KEY, "SuperSecretPw9", "EnvPassw0rd", "C-77", "BODYTEXT", "Q-TOKEN", "PW-1", "OAUTH-CODE", "dbuser", "envuser"]) assert.ok(!all.includes(s), `${s} leaked in ${all}`);
    const line = cap.json()[0]!;
    assert.equal(line.requestId, "r1");
    assert.equal(line.level, "error");
    assert.notEqual(line.time, "spoofed");
    assert.match(String(line.msg), /^boom /);
    assert.equal((line.nested as { deep: { ok: string } }).deep.ok, "visible");
    assert.match(String((line.err as { stack: string }).stack), /connect failed/);
    assert.equal(cap.lines.length, 1);
    assert.ok(cap.lines[0]!.endsWith("\n"));
  } finally {
    if (prev === undefined) delete process.env.MONGODB_URL; else process.env.MONGODB_URL = prev;
  }
});

test("levels: LOG_LEVEL parsing, default info, filtering, circular fields do not throw", () => {
  assert.equal(resolveLevel("warn"), "warn");
  assert.equal(resolveLevel("DEBUG"), "debug");
  assert.equal(resolveLevel("nonsense"), "info");
  const cap = capture("warn");
  cap.logger.debug("d"); cap.logger.info("i"); cap.logger.warn("w"); cap.logger.error("e");
  assert.deepEqual(cap.json().map((l) => l.level), ["warn", "error"]);
  const circ: Record<string, unknown> = { a: 1 }; circ.self = circ;
  assert.doesNotThrow(() => cap.logger.error("circ", circ));
  const silent = capture("silent"); silent.logger.error("x"); assert.equal(silent.lines.length, 0);
});

test("error path: logs requestId + stack (redacted), client body is exactly the fixed 500 body with no stack", async () => {
  const boom = { verify: async () => { throw new Error(`store exploded ${FAKE_MONGO}`); } };
  await withServer({ keyStore: boom }, async (base, cap) => {
    const res = await fetch(`${base}/search?q=x`, { headers: { authorization: `Bearer ${KEY}`, "x-request-id": "req-err-1" } });
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-request-id"), "req-err-1");
    assert.deepEqual(await res.json(), { error: "internal_error", message: "internal error" });
    await settle();
    const errLine = cap.json().find((l) => l.msg === "unhandled error")!;
    assert.equal(errLine.requestId, "req-err-1");
    assert.equal(errLine.level, "error");
    const e = errLine.err as { name: string; message: string; stack: string };
    assert.equal(e.name, "Error");
    assert.match(e.stack, /store exploded/);
    assert.match(e.stack, /\n\s+at /);
    const acc = access(cap)[0]!;
    assert.equal(acc.status, 500);
    assert.equal(acc.level, "error");
    const all = cap.lines.join("");
    assert.ok(!all.includes("SuperSecretPw9") && !all.includes("dbuser") && !all.includes(KEY));
  });
});
