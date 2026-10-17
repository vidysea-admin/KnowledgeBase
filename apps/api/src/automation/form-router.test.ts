import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { requireAuth, type VerifiedKey } from "../auth.js";
import { ApplicationFixtureDatabase } from "./form-fixture.js";
import { createMongoApplicationStore } from "./form-store.js";
import { ApplicationFormRuntime } from "./form-runtime.js";
import { createApplicationFormsRouter } from "./form-router.js";
test("mounted approved-form consumer applies verified identity, live role/scope checks and protected evidence review", async () => {
  const scopes = ["hosting", "automation:read", "automation:write", "automation:operate"];
  const keys: Record<string, VerifiedKey> = { admin: { tenantId: "tenant-a", keyId: "admin-key", scopes }, viewer: { tenantId: "tenant-a", keyId: "viewer-key", scopes }, other: { tenantId: "tenant-b", keyId: "other-key", scopes }, legacy: { tenantId: "tenant-a", scopes } };
  let adminActive = true, calls = 0;
  const db = new ApplicationFixtureDatabase(), field = { name: "courseRef", value: "MATH", source: { documentId: "approved-source", page: 1, start: 0, end: 4, revision: "a".repeat(64) } };
  const runtime = new ApplicationFormRuntime(createMongoApplicationStore(db.collection), [{ id: "approved-university", version: "v1", requiredFields: ["courseRef"], allowedFields: ["courseRef"], configurationDigest: "d".repeat(64), verifyField: async (tenant, value) => tenant === "tenant-a" && JSON.stringify(value) === JSON.stringify(field), adapter: { duplicateGuarantee: "operation-id", submit: async () => { calls++; return { receiptId: "receipt-private" }; }, verifyReceipt: async () => true } }]);
  const app = express(); app.use(express.json({ limit: "8kb" })); app.use(requireAuth({ verify: async key => keys[key] ?? null }));
  app.use(createApplicationFormsRouter({ runtime, async withPermission(key, permission, callback) { if (key.keyId === "viewer-key" && permission !== "automation:read" || key.keyId === "admin-key" && !adminActive) throw Object.assign(new Error("secret-role-error"), { status: 403 }); return callback(); } }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (path: string, key = "admin", method = "GET", body?: unknown) => fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await request("/automation/forms/targets", "unknown")).status, 401);
    assert.equal((await request("/automation/forms/targets", "legacy")).status, 503);
    const config = { targetId: "approved-university", enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 };
    assert.equal((await request("/automation/forms/definitions", "viewer", "PUT", config)).status, 403);
    assert.equal((await request("/automation/forms/definitions", "admin", "PUT", config)).status, 200);
    assert.equal((await request("/automation/forms/operations", "admin", "POST", { targetId: "approved-university", idempotencyKey: "request-1", fields: [field], actorId: "fake-owner" })).status, 400);
    const created = await (await request("/automation/forms/operations", "admin", "POST", { targetId: "approved-university", idempotencyKey: "request-1", fields: [field] })).json() as { operation: { id: string; version: number } };
    const path = `/automation/forms/operations/${created.operation.id}`;
    assert.equal((await request(path, "other")).status, 404);
    assert.equal((await request(`${path}/review`, "viewer")).status, 403);
    const review = await request(`${path}/review`), metadata = await review.text(); assert.equal(review.status, 200); assert.ok(metadata.includes("approved-source")); assert.ok(!metadata.includes("MATH"));
    adminActive = false; assert.equal((await request(`${path}/approve`, "admin", "POST", { expectedVersion: created.operation.version })).status, 403); assert.equal(calls, 0);
    adminActive = true; const approved = await (await request(`${path}/approve`, "admin", "POST", { expectedVersion: created.operation.version })).json() as { operation: { version: number } };
    assert.equal((await request(`${path}/execute`, "admin", "POST", { expectedVersion: approved.operation.version })).status, 200); assert.equal(calls, 1);
    const status = await (await request(path)).text(); for (const hidden of ["MATH", "approved-source", "admin-key", "receipt-private", "ownerToken"]) assert.ok(!status.includes(hidden));
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
