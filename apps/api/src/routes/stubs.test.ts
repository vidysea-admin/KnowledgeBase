/**
 * apps/api/src/routes/stubs.test.ts — `notConfigured(feature)`: the stable 503 body for an integration this deployment has not
 * configured (G-A1). Exercised through the real createServer perimeter (requireAuth + requireScope) with the default test deps,
 * which carry no connector-workflow runtime: the live audit (2026-10-26) saw /connectors die on a raw 404 for exactly that.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";

test("AC-3 connector-workflow: an unconfigured deployment answers 503 not_configured behind auth, never 404", async () => {
  const keyStore = fakeKeyStore({ src: { tenantId: "tenant-A", scopes: ["sources"] }, other: { tenantId: "tenant-A", scopes: ["ask"] } });
  const server = await startTestServer(buildTestDeps({ keyStore }));
  try {
    const call = async (method: string, path: string, key: string | null) => {
      const res = await fetch(server.baseUrl + path, { method, headers: { connection: "close", ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(method === "GET" ? {} : { "content-type": "application/json" }) }, ...(method === "GET" ? {} : { body: "{}" }) });
      return { status: res.status, raw: await res.text() };
    };
    const routes: Array<[string, string]> = [["GET", "/connector-workflow"], ["POST", "/connector-workflow/intake"],
      ["POST", "/connector-workflow/recording-requests"], ["PUT", "/connector-workflow/recording-requests/x"], ["POST", "/connector-workflow/watched/verify"]];
    for (const [method, path] of routes) {
      assert.equal((await call(method, path, null)).status, 401, `${method} ${path} unauthenticated`);
      assert.equal((await call(method, path, "other")).status, 403, `${method} ${path} wrong scope`);
      const ok = await call(method, path, "src");
      assert.equal(ok.status, 503, `${method} ${path}`);
      assert.deepEqual(JSON.parse(ok.raw), { error: "not_configured", feature: "connector-workflow" });
    }
  } finally { await server.close(); }
});
