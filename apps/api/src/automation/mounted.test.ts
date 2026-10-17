import test from "node:test";
import assert from "node:assert/strict";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { hostingFixture } from "../hosting/test-kit.js";
import { ApplicationFixtureDatabase } from "./form-fixture.js";
import { createMongoApplicationStore } from "./form-store.js";
import { ApplicationFormRuntime } from "./form-runtime.js";
import type { VerifiedKey } from "../auth.js";

test("shared createServer mounts approved form intake/execution/status behind auth and current hosting authority", async () => {
  const f = hostingFixture(), db = new ApplicationFixtureDatabase(); let effects = 0;
  const scopes = ["hosting", "automation:read", "automation:write", "automation:operate"];
  const owner: VerifiedKey = { tenantId: "A", keyId: "ownerA", scopes }, member: VerifiedKey = { tenantId: "A", keyId: "memberA", scopes }, other: VerifiedKey = { tenantId: "B", keyId: "ownerB", scopes };
  const field = { name: "courseRef", value: "MATH", source: { documentId: "fixture-source", page: 1, start: 0, end: 4, revision: "a".repeat(64) } };
  const runtime = new ApplicationFormRuntime(createMongoApplicationStore(db.collection), [{ id: "registered-fixture", version: "v1", requiredFields: ["courseRef"], allowedFields: ["courseRef"], configurationDigest: "d".repeat(64),
    verifyField: async (tenant, value) => tenant === "A" && JSON.stringify(value) === JSON.stringify(field),
    adapter: { duplicateGuarantee: "operation-id", submit: async () => { effects++; return { receiptId: "fixture-receipt" }; }, verifyReceipt: async input => input.tenantId === "A" && input.receiptId === "fixture-receipt" } }]);
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore({ owner, member, other }), applicationForms: { runtime,
    withPermission: (key, permission, callback) => f.service.withPermission({ tenantId: key.tenantId, keyId: key.keyId!, scopes: key.scopes }, permission, callback) } }));
  const call = (path: string, key = "owner", method = "GET", body?: unknown) => fetch(`${server.baseUrl}/automation/forms${path}`, { method, headers: { authorization: `Bearer ${key}`, connection: "close", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await fetch(`${server.baseUrl}/automation/forms/targets`, { headers: { connection: "close" } })).status, 401);
    assert.equal((await call("/targets", "member")).status, 403);
    assert.equal((await call("/targets")).status, 200);
    assert.equal((await call("/definitions", "owner", "PUT", { targetId: "registered-fixture", enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 })).status, 200);
    const intake = { targetId: "registered-fixture", idempotencyKey: "mounted-fixture", fields: [field] };
    const response = await call("/operations", "owner", "POST", intake); assert.equal(response.status, 200);
    const created = await response.json() as { operation: { id: string; version: number } }, path = `/operations/${created.operation.id}`;
    assert.equal((await call(path, "other")).status, 404);
    assert.equal((await call("/operations", "owner", "POST", { ...intake, fields: [] })).status, 409);
    const approved = await (await call(`${path}/approve`, "owner", "POST", { expectedVersion: created.operation.version })).json() as { operation: { version: number } };
    f.revoked.add("A:ownerA"); assert.equal((await call(`${path}/execute`, "owner", "POST", { expectedVersion: approved.operation.version })).status, 403); assert.equal(effects, 0);
    f.revoked.delete("A:ownerA"); assert.equal((await call(`${path}/execute`, "owner", "POST", { expectedVersion: approved.operation.version })).status, 200); assert.equal(effects, 1);
    const status = await call(path), projection = await status.text(); assert.equal(status.headers.get("cache-control"), "private, no-store"); assert.ok(projection.includes("succeeded")); assert.ok(!projection.includes("MATH")); assert.ok(!projection.includes("fixture-receipt"));
    assert.equal((await call("/monitor", "owner", "POST", {})).status, 200); assert.equal(effects, 1);
  } finally { await server.close(); f.close(); }
});
