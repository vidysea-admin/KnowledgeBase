import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { requireAuth, type VerifiedKey } from "../auth.js";
import { AutomationRuntime } from "./runtime.js";
import { createMongoAutomationStore } from "./store.js";
import { createAutomationRouter } from "./router.js";
import { AutomationFixtureDatabase } from "./fixture-store.js";
const scopes = ["automation:read", "automation:write", "automation:operate", "hosting"];
test("mounted HTTP consumer enforces auth, current permissions, tenant ownership, replay and sanitized outcomes", async () => {
  const db = new AutomationFixtureDatabase(), runtime = new AutomationRuntime(createMongoAutomationStore(db.collection));
  const keys: Record<string, VerifiedKey> = {
    admin: { tenantId: "tenant-a", scopes, keyId: "key-admin" },
    other: { tenantId: "tenant-b", scopes, keyId: "key-other" },
    limited: { tenantId: "tenant-a", scopes: ["automation:read"], keyId: "key-viewer" },
    stale: { tenantId: "tenant-a", scopes, keyId: "key-disabled" },
    legacy: { tenantId: "tenant-a", scopes },
  };
  const app = express(); app.use(express.json({ limit: "8kb" })); app.use(requireAuth({ verify: async key => keys[key] ?? null }));
  app.use(createAutomationRouter({ runtime, withPermission: async (p, _permission, callback) => {
    if (!p.keyId || p.keyId === "key-disabled") throw Object.assign(new Error("secret-cause"), { status: 403 });
    return callback();
  } }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const request = (path: string, key = "admin", method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await request("/automation/runs", "bad")).status, 401);
    assert.equal((await request("/automation/runs", "legacy")).status, 503);
    assert.equal((await request("/automation/runs", "stale")).status, 403);
    assert.equal((await request("/automation/runs?tenantId=tenant-b")).status, 400);
    assert.equal((await request("/automation/definitions/application-readiness", "limited", "PUT", { enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 })).status, 403);
    assert.equal((await request("/automation/definitions/application-readiness", "admin", "PUT", { enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 })).status, 200);
    const body = { idempotencyKey: "http-1", kind: "application-readiness", input: { applicationRef: "private-reference", requiredDocuments: ["identity"], availableDocuments: [] } };
    const response = await request("/automation/runs", "admin", "POST", body); assert.equal(response.status, 201);
    const created = await response.json() as { run: { id: string; version: number } };
    assert.equal((await request("/automation/runs", "admin", "POST", body)).status, 200);
    assert.equal((await request("/automation/runs", "admin", "POST", { ...body, input: { ...body.input, availableDocuments: ["identity"] } })).status, 409);
    assert.equal((await request(`/automation/runs/${created.run.id}`, "other")).status, 404);
    assert.equal((await request(`/automation/runs/${created.run.id}/execute`, "admin", "POST", { expectedVersion: created.run.version })).status, 200);
    const status = await request(`/automation/runs/${created.run.id}`), served = await status.text();
    assert.equal(status.status, 200); assert.equal(status.headers.get("cache-control"), "private, no-store");
    assert.ok(served.includes("succeeded")); assert.ok(served.includes("identity"));
    for (const forbidden of ["private-reference", "key-admin", "ownerToken", "payloadDigest", "tenantId"]) assert.ok(!served.includes(forbidden), forbidden);
    assert.equal((await request("/automation/monitor", "admin", "POST", {})).status, 200);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
