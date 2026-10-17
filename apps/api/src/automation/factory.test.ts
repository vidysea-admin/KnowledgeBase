import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { buildAutomationIntegrations, type AutomationIntegrationInput } from "../composition/integrations/automation.js";
import { hostingFixture } from "../hosting/test-kit.js";
import { tenantSourceId } from "../../../../packages/ingest/src/source.js";
import type { VerifiedKey } from "../auth.js";

/** Driver-shaped isolated fixture exercises the actual tenant wrapper/factory, never a configured database. */
function driverFixture() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const map = (name: string) => { if (!collections.has(name)) collections.set(name, new Map()); return collections.get(name)!; };
  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => row[key] === value);
  const db = { collection(name: string) {
    const rows = map(name);
    return {
      async findOne(filter: Record<string, unknown>) { return structuredClone([...rows.values()].find(row => matches(row, filter)) ?? null); },
      async insertOne(row: Record<string, unknown>) { if (rows.has(String(row._id))) throw Object.assign(new Error("duplicate"), { code: 11000 }); rows.set(String(row._id), structuredClone(row)); return { acknowledged: true }; },
      async replaceOne(filter: Record<string, unknown>, row: Record<string, unknown>) { const current = [...rows.values()].find(row => matches(row, filter)); if (!current) return { acknowledged: true, matchedCount: 0 }; rows.set(String(row._id), structuredClone(row)); return { acknowledged: true, matchedCount: 1 }; },
      find(filter: Record<string, unknown>) {
        let limit = 100;
        const cursor = { sort(_order: object) { return cursor; }, maxTimeMS(_ms: number) { return cursor; }, limit(n: number) { limit = n; return cursor; },
          async next() { return structuredClone([...rows.values()].find(row => matches(row, filter)) ?? null); },
          async toArray() { return structuredClone([...rows.values()].filter(row => matches(row, filter)).slice(0, limit)); } };
        return cursor;
      },
    };
  } } as unknown as Db;
  return { db, map };
}

test("production automation factory grounds canonical sources, current hosting roles and credential/source approval generations", async () => {
  const f = hostingFixture(), driver = driverFixture(), revision = "a".repeat(64), documentId = tenantSourceId("A", revision);
  const pageDigest = createHash("sha256").update("MATH").digest("hex");
  driver.map("document_documents").set(documentId, { _id: documentId, tenantId: "A", sourceId: documentId, version: revision, title: "Approved fixture", format: "pdf", pages: [{ pageNumber: 1, text: "MATH" }], highlights: [], createdAt: "2026-10-14T12:00:00Z" });
  const env: NodeJS.ProcessEnv = { LKB_APPLICATION_FORMS_ENABLED: "1", LKB_APPLICATION_ALLOWED_ORIGINS: '["https://forms.example.test"]', LKB_APPLICATION_FIXTURE_TOKEN: "fixture-only-secret" };
  const target = { id: "approved-target", version: "v1", endpoint: "https://forms.example.test/applications", tokenEnv: "LKB_APPLICATION_FIXTURE_TOKEN", requiredFields: ["courseRef"], allowedFields: ["courseRef"], duplicateGuarantee: "none", approvedSources: [{ tenantId: "A", documentId, revision, page: 1, pageDigest }] };
  env.LKB_APPLICATION_TARGETS = JSON.stringify([target]);
  const input = { db: driver.db, env, hosting: { service: f.service } } as AutomationIntegrationInput;
  const key: VerifiedKey = { tenantId: "A", keyId: "memberA", scopes: ["hosting", "automation:read", "automation:write", "automation:operate"] };
  const p = { tenantId: "A", actorId: "memberA" }, field = { name: "courseRef", value: "MATH", source: { documentId, revision, page: 1, start: 0, end: 4 } };
  try {
    assert.deepEqual(buildAutomationIntegrations({ ...input, hosting: undefined }), {});
    const deps = buildAutomationIntegrations(input).applicationForms!; assert.ok(deps);
    assert.equal(driver.map("application_operations").size, 0, "construction cannot write");
    await assert.rejects(deps.withPermission(key, "automation:manage", async () => deps.runtime.configure(p, { targetId: target.id, enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 })), /forbidden/);
    await f.service.setRole(f.ownerA, "memberA", "admin");
    await deps.withPermission(key, "automation:manage", async () => deps.runtime.configure(p, { targetId: target.id, enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 }));
    const draft = await deps.withPermission(key, "automation:manage", async () => deps.runtime.submit(p, { targetId: target.id, idempotencyKey: "fixture", fields: [field] }));
    const approved = await deps.withPermission(key, "automation:operate", async () => deps.runtime.approve(p, draft.operation._id, draft.operation.version));
    assert.equal(approved.status, "approved");
    await f.service.setRole(f.ownerA, "memberA", "viewer");
    await assert.rejects(deps.withPermission(key, "automation:operate", async () => deps.runtime.execute(p, approved._id, approved.version)), /forbidden/);
    await f.service.setRole(f.ownerA, "memberA", "admin");
    const changed = buildAutomationIntegrations({ ...input, env: { ...env, LKB_APPLICATION_FIXTURE_TOKEN: "rotated-fixture-secret" } }).applicationForms!;
    await assert.rejects(changed.withPermission(key, "automation:operate", async () => changed.runtime.execute(p, approved._id, approved.version)), /conflict/);
    const sourceChanged = buildAutomationIntegrations({ ...input, env: { ...env, LKB_APPLICATION_TARGETS: JSON.stringify([{ ...target, approvedSources: [{ ...target.approvedSources[0], pageDigest: "b".repeat(64) }] }]) } }).applicationForms!;
    await assert.rejects(sourceChanged.withPermission(key, "automation:operate", async () => sourceChanged.runtime.execute(p, approved._id, approved.version)), /conflict/);
    driver.map("document_documents").get(documentId)!.pages = [{ pageNumber: 1, text: "FAKE" }];
    const forged = await deps.runtime.submit(p, { targetId: target.id, idempotencyKey: "bad-page", fields: [field] });
    await assert.rejects(deps.withPermission(key, "automation:operate", async () => deps.runtime.approve(p, forged.operation._id, forged.operation.version)), /conflict/);
    const unconfigured = buildAutomationIntegrations({ ...input, env: { ...env, LKB_APPLICATION_FIXTURE_TOKEN: "" } }); assert.equal(unconfigured.applicationForms, undefined);
    assert.equal(driver.map("application_operations").get(approved._id)!.status, "approved", "no target submission occurred");
  } finally { f.close(); }
});
