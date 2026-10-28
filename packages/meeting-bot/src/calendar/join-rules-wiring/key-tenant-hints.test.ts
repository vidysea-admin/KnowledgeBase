/**
 * unit `t037-join-rules-enable-preconditions` — the "key tenant NOT verified" log line names the known cause of a failure
 * (key lacks `gmail`; 503 from candidate discovery) so a fail-closed total stop can be
 * diagnosed from the log. Diagnostic text only: the outcome (null = unverified) is unchanged for every status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createKeyTenantLoader } from "./key-tenant.js";

const BASE = "http://api.test:3300", KEY = "lv_secretkey_value";

async function load(reply: { status: number; body?: string; headers?: Array<[string, string]> } | "throw") {
  const logs: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (reply === "throw") throw new TypeError(`boom ${KEY}`);
    const hd = new Headers(); for (const [k, v] of reply.headers ?? []) hd.append(k, v);
    return new Response(reply.body ?? "", { status: reply.status, headers: hd });
  }) as typeof fetch;
  try { return { tenant: await createKeyTenantLoader(BASE, KEY, (m) => logs.push(m))(), logs }; }
  finally { globalThis.fetch = real; }
}

test("known failing statuses are named in the log line; the result is still null (unverified)", async () => {
  const cases: Array<[number, RegExp]> = [
    [401, /-> 401; the API rejected the key/],
    [403, /-> 403; the key lacks the `gmail` scope/],
    [503, /-> 503; .*not a tenant mismatch/],
  ];
  for (const [status, re] of cases) {
    const r = await load({ status, body: "SECRET-BODY-TEXT" });
    assert.equal(r.tenant, null, String(status));
    assert.equal(r.logs.length, 1, String(status));
    assert.match(r.logs[0]!, /key tenant NOT verified/);
    assert.match(r.logs[0]!, re, String(status));
  }
});

test("other statuses keep the plain `GET /meeting-candidates -> N` line with no cause text", async () => {
  for (const status of [404, 500, 502, 504, 429, 302]) {
    const r = await load({ status });
    assert.equal(r.tenant, null, String(status));
    assert.match(r.logs[0]!, new RegExp(`GET /meeting-candidates -> ${status}\\)`), String(status));
  }
});

test("an error status that ALSO carries a valid tenant header is still unverified (the header is read only on 2xx)", async () => {
  for (const status of [403, 503]) {
    const r = await load({ status, headers: [["X-LKB-Tenant", "ten-a"]] });
    assert.equal(r.tenant, null, String(status));
  }
});

test("log lines carry neither the key, the response body nor the tenant header value", async () => {
  for (const reply of [{ status: 403, body: "SECRET-BODY-TEXT", headers: [["X-LKB-Tenant", "ten-leak"]] as Array<[string, string]> },
    { status: 503, body: "SECRET-BODY-TEXT" }, "throw" as const]) {
    const r = await load(reply);
    assert.equal(r.tenant, null);
    for (const l of r.logs) { assert.ok(!l.includes(KEY) && !l.includes("SECRET-BODY-TEXT") && !l.includes("ten-leak"), l); }
  }
});

test("a verified tenant stays silent and unchanged", async () => {
  const r = await load({ status: 200, headers: [["X-LKB-Tenant", "ten-a"]] });
  assert.equal(r.tenant, "ten-a"); assert.deepEqual(r.logs, []);
});
