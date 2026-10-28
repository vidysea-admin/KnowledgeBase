/**
 * apps/api/src/cors.test.ts — CORS for the join-rules precondition headers (unit `iss-t037ui-001-join-rules-api-etag`).
 * The web app is another origin: a browser blocks a PUT carrying If-Match / If-None-Match unless the preflight allows them, and hides
 * the ETag response header from scripts unless it is exposed. Origins must not widen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils.js";
import { buildTestDeps, fakeKeyStore } from "./fixtures.js";

const ORIGIN = "https://app.example";
const KEYS = { "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] } };
const list = (v: string | null) => (v ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);

async function withServer(fn: (base: string) => Promise<void>) {
  const server = await startTestServer({ ...buildTestDeps({ keyStore: fakeKeyStore(KEYS) }), corsOrigins: [ORIGIN] });
  try { await fn(server.baseUrl); } finally { await server.close(); }
}

test("preflight from an allowed origin: PUT allowed, If-Match and If-None-Match allowed (with the old headers), ETag exposed, 204, no credentials", async () => {
  await withServer(async base => {
    const r = await fetch(`${base}/calendar/join-rules`, { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "PUT", "access-control-request-headers": "authorization,content-type,if-match,if-none-match" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
    const headers = list(r.headers.get("access-control-allow-headers"));
    for (const h of ["content-type", "authorization", "if-match", "if-none-match", "x-lkb-work-db"]) assert.ok(headers.includes(h), `allow-headers lacks ${h}: ${headers}`);
    assert.ok(list(r.headers.get("access-control-allow-methods")).includes("put"));
    for (const h of ["etag", "x-lkb-work-db", "x-lkb-tenant"]) assert.ok(list(r.headers.get("access-control-expose-headers")).includes(h), `expose-headers lacks ${h}`);
    assert.equal(r.headers.get("access-control-allow-credentials"), null);
    assert.match(r.headers.get("vary") ?? "", /Origin/i);
  });
});

test("the actual cross-origin response exposes ETag too (the preflight alone is not enough)", async () => {
  await withServer(async base => {
    const r = await fetch(`${base}/health`, { headers: { origin: ORIGIN } });
    for (const h of ["etag", "x-lkb-work-db", "x-lkb-tenant"]) assert.ok(list(r.headers.get("access-control-expose-headers")).includes(h), `expose-headers lacks ${h}`);
  });
});

test("origins are NOT widened: a disallowed or missing origin gets no CORS headers at all (so no allowed headers, no exposed ETag)", async () => {
  await withServer(async base => {
    for (const origin of ["https://evil.example", "null", ORIGIN + ".evil.example", undefined]) {
      const r = await fetch(`${base}/calendar/join-rules`, { method: "OPTIONS", headers: { ...(origin ? { origin } : {}), "access-control-request-method": "PUT", "access-control-request-headers": "if-match" } });
      for (const h of ["access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "access-control-expose-headers"])
        assert.equal(r.headers.get(h), null, `${String(origin)}: ${h}`);
    }
  });
});


test("work-DB candidate GET and scan preflight expose authorized operator context across origins", async () => {
  const work = "calendar_cors_work";
  const deps = buildTestDeps({keyStore: fakeKeyStore({operator: {tenantId: "tenant-a", scopes: ["gmail"]}})});
  const server = await startTestServer({...deps, corsOrigins: [ORIGIN], meetingCandidates: {...deps.meetingCandidates,
    getWorkDatabase: () => work, listCandidates: async () => [], scanGmail: async () => ({created: 0, autoApproved: 0})}});
  try {
    const result = await fetch(server.baseUrl+"/meeting-candidates", {headers: {origin: ORIGIN, authorization: "Bearer operator"}});
    assert.equal(result.status, 200); assert.equal(result.headers.get("X-LKB-Work-DB"), work); assert.equal(result.headers.get("X-LKB-Tenant"), "tenant-a");
    for (const h of ["etag", "x-lkb-work-db", "x-lkb-tenant"]) assert.ok(list(result.headers.get("access-control-expose-headers")).includes(h));
    const preflight = await fetch(server.baseUrl+"/gmail/scan", {method: "OPTIONS", headers: {origin: ORIGIN,
      "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,x-lkb-work-db"}});
    assert.equal(preflight.status, 204); assert.ok(list(preflight.headers.get("access-control-allow-headers")).includes("x-lkb-work-db"));
    const scan = await fetch(server.baseUrl+"/gmail/scan", {method: "POST", headers: {origin: ORIGIN, authorization: "Bearer operator", "X-LKB-Work-DB": work}});
    assert.equal(scan.status, 200);
  } finally { await server.close(); }
});
