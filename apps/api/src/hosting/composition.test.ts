import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "mongodb";
import type { HostingIntegrationInput } from "../composition/integrations/hosting.js";
import { buildHostingIntegrations } from "../composition/integrations/hosting.js";
import { hostingFixture } from "./test-kit.js";
import { buildLastRun } from "../../../../packages/ingest/src/retention/retention-last-run.js";
import { writeTenantRetentionSummary } from "../../../../packages/ingest/src/retention/production/private-summary.js";

function input(root: string, env: NodeJS.ProcessEnv) {
  const scopes = ["hosting", "keys", "webhooks", "operations"];
  const rows = new Map<string, { _id: string; tenantId: string; revokedAt: string | null; scopes: string[] }>([
    ["ownerA", { _id: "ownerA", tenantId: "A", revokedAt: null, scopes }],
    ["memberA", { _id: "memberA", tenantId: "A", revokedAt: null, scopes }],
    ["ownerB", { _id: "ownerB", tenantId: "B", revokedAt: null, scopes }],
  ]);
  let reads = 0, writes = 0;
  const db = { databaseName: "hosting_fixture", collection: () => ({ find(filter: Record<string, unknown>) {
    reads++;
    const selected = [...rows.values()].filter(row => Object.entries(filter).every(([key, value]) => key === "scopes" ? typeof value === "string" && row.scopes.includes(value) : row[key as keyof typeof row] === value));
    const cursor = { project: () => cursor, maxTimeMS: () => cursor, limit: () => cursor,
      next: async () => selected[0] ?? null, toArray: async () => selected };
    return cursor;
  } }) } as unknown as Db;
  const unexpected = (): never => { throw new Error("Unrelated provider/index dependency must not run"); };
  const options: HostingIntegrationInput = { db, env, root,
    index: async () => unexpected(),
    ask: { tree: { load: async () => unexpected() }, askDeps: { complete: async () => unexpected(), scoreFn: unexpected, treeSearchFn: unexpected, write: async () => unexpected() } },
    routing: { chains: {}, providers: {}, jobWrite: async () => unexpected() },
    keyStore: { async verify(raw: string) { const row = rows.get(raw); return !row || row.revokedAt ? null : { tenantId: row.tenantId, keyId: row._id, scopes: [...scopes] }; } },
    keys: {
      listKeys: async () => [],
      createKey: async (tenant: string) => { writes++; const id = `created-${writes}`; rows.set(id, { _id: id, tenantId: tenant, revokedAt: null, scopes }); return { id, rawKey: "once-only" }; },
      revokeKey: async (tenant: string, id: string) => { const row = rows.get(id); if (!row || row.tenantId !== tenant) return false; writes++; row.revokedAt = new Date().toISOString(); return true; },
    },
  };
  return { options, owner: { tenantId: "A", keyId: "ownerA", scopes }, member: { tenantId: "A", keyId: "memberA", scopes },
    reads: () => reads, writes: () => writes };
}
function configured(root: string): NodeJS.ProcessEnv {
  return { LKB_HOSTING_STATE_DIR: join(root, "roles"), LKB_COUNSELLOR_STATE_DIR: join(root, "accounts"),
    LKB_HOSTING_ENCRYPTION_KEY: "11".repeat(32), LKB_HOSTING_BOOTSTRAP_ADMINS: JSON.stringify({ A: ["ownerA"], B: ["ownerB"] }),
    LKB_HOSTING_WEBHOOK_ORIGINS: JSON.stringify(["https://hooks.example.test"]) };
}

test("production integration construction is passive and unavailable configuration never permits key mutation", async () => {
  const f = hostingFixture();
  try {
    const v = input(f.root, configured(f.root)), integration = buildHostingIntegrations(v.options);
    assert.ok(integration.hosting); assert.ok(integration.counsellorAccounts); assert.ok(integration.operationsSchedules);
    assert.equal(v.reads(), 0); assert.equal(v.writes(), 0);
    assert.equal(existsSync(join(f.root, "roles")), false); assert.equal(existsSync(join(f.root, "accounts")), false);
    const missing = buildHostingIntegrations({ ...v.options, env: {} });
    await assert.rejects(missing.keys!.createKey("A", "label", ["keys"], v.owner), /hosting_unavailable/);
    const invalid = buildHostingIntegrations({ ...v.options, env: { ...v.options.env, LKB_COUNSELLOR_STATE_DIR: "relative/path" } });
    await assert.rejects(invalid.keyStore!.verify("ownerA"), /hosting_unavailable/);
    assert.equal(v.writes(), 0);
  } finally { f.close(); }
});

test("production integration consumes verified actor for audited keys and global account lifecycle after fresh construction", async () => {
  const f = hostingFixture();
  try {
    const v = input(f.root, configured(f.root)), integration = buildHostingIntegrations(v.options);
    const service = integration.hosting!.service;
    await assert.rejects(integration.keys!.createKey("A", "label", ["keys"], v.member), /forbidden/);
    await assert.rejects(integration.keys!.createKey("A", "label", ["ask"], v.owner), /scope_elevation_forbidden/);
    await assert.rejects(integration.keys!.createKey("B", "label", ["keys"], v.owner), /verified_identity_unavailable/);
    const created = await integration.keys!.createKey("A", "label", ["keys"], v.owner);
    assert.equal(created.rawKey, "once-only"); assert.equal(v.writes(), 1);
    assert.deepEqual((await service.audit(v.owner)).records.map(row => row.operation), ["key.change.intent", "key.change.complete"]);
    const accounts = integration.counsellorAccounts!.service;
    const account = await accounts.create(v.owner, "memberA", { displayName: "Member", email: "member@example.test" });
    await accounts.grant(v.owner, account.id, account.revision, "viewer");
    assert.ok(await integration.keyStore!.verify("memberA"));
    await accounts.deactivate(v.owner, account.id, account.revision);
    assert.equal(await integration.keyStore!.verify("memberA"), null);
    const restarted = buildHostingIntegrations(v.options);
    assert.equal(await restarted.keyStore!.verify("memberA"), null);
    await assert.rejects(restarted.hosting!.service.setRole(v.owner, "memberA", "admin"), /account_inactive/);
    assert.equal(JSON.stringify(await restarted.hosting!.service.audit(v.owner)).includes("once-only"), false);
  } finally { f.close(); }
});

test("configured production retention reader consumes actual private writer output with exact tenant and no global fallback", async () => {
  const f = hostingFixture();
  try {
    const v = input(f.root, { LKB_RETENTION_DATA_ROOT: f.root });
    const integration = buildHostingIntegrations(v.options);
    assert.equal(integration.hosting, undefined);
    assert.deepEqual(await integration.retentionStatus!.readRetentionStatus!("A"), { status: "never-run" });
    const summary = buildLastRun({ mode: "dry-run", startedAt: "2026-10-14T11:00:00.000Z", finishedAt: "2026-10-14T11:01:00.000Z",
      exitCode: 0, summary: { candidates: 2, deleted: 0, bytes: 0, vetoed: 0, failed: 0 }, lines: [] }, "private/report.json");
    assert.equal(writeTenantRetentionSummary(f.root, "A", summary).ok, true);
    const result = await integration.retentionStatus!.readRetentionStatus!("A");
    assert.equal(result.status, "available");
    if (result.status === "available") assert.equal(result.summary.candidates, 2);
    assert.equal(JSON.stringify(result).includes("private/report.json"), false);
    assert.deepEqual(await integration.retentionStatus!.readRetentionStatus!("B"), { status: "never-run" });
    const restarted = buildHostingIntegrations(v.options);
    assert.equal((await restarted.retentionStatus!.readRetentionStatus!("A")).status, "available");
    assert.equal(buildHostingIntegrations({ ...v.options, env: {} }).retentionStatus, undefined);
    assert.equal(buildHostingIntegrations({ ...v.options, env: { LKB_RETENTION_DATA_ROOT: "relative" } }).retentionStatus, undefined);
    assert.equal(v.reads(), 0); assert.equal(v.writes(), 0);
  } finally { f.close(); }
});
