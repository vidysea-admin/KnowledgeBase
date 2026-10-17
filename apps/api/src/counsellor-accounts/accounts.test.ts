import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { HostingJournal } from "../hosting/journal.js";
import { HostingService } from "../hosting/service.js";
import { HostingError, type HostingPrincipal } from "../hosting/types.js";
import { CounsellorAccountStore } from "./store.js";
import { CounsellorAccountsService } from "./service.js";
import { createCounsellorAccountRouter } from "./router.js";
import { createAccountAwareKeyStore } from "./key-store.js";
import { requireAuth, requireScope } from "../auth.js";

const owner: HostingPrincipal = { tenantId: "tenant-a", keyId: "owner-a", scopes: ["hosting"] };
const otherOwner: HostingPrincipal = { tenantId: "tenant-b", keyId: "owner-b", scopes: ["hosting"] };
const subject: HostingPrincipal = { tenantId: "tenant-a", keyId: "counsellor-a", scopes: ["hosting"] };
const code = (value: string) => (error: unknown) => error instanceof HostingError && error.code === value;
const refused = (error: unknown) => error instanceof HostingError && [403, 409, 503].includes(error.status);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lkb-accounts-"));
  const hostRoot = join(root, "hosting"), accountRoot = join(root, "accounts");
  mkdirSync(hostRoot, { mode: 0o700 }); mkdirSync(accountRoot, { mode: 0o700 });
  const registry = new Map([ ["tenant-a", new Set(["owner-a", "counsellor-a", "viewer-a"])], ["tenant-b", new Set(["owner-b", "counsellor-b"])] ]);
  function reconstruct(sync?: (fd: number) => void) {
    const hosting = new HostingService({ journal: new HostingJournal(hostRoot), bootstrap: new Map([["tenant-a", new Set(["owner-a"])], ["tenant-b", new Set(["owner-b"])]]),
      origins: new Set(["https://callbacks.example.com"]), encryptionKey: Buffer.alloc(32, 9), keyExists: async (tenant, id) => registry.get(tenant)?.has(id) ?? false });
    const store = new CounsellorAccountStore(new HostingJournal(accountRoot, sync));
    hosting.setAccountStatusProvider(async (tenant, id) => await store.identityStatus(tenant, id) ?? "unbound");
    const service = new CounsellorAccountsService(store, hosting, { activeKeyIds: async tenant => [...registry.get(tenant) ?? []] });
    return { hosting, store, service };
  }
  return { root, hostRoot, accountRoot, registry, reconstruct, ...reconstruct(), clean: () => rmSync(root, { recursive: true, force: true }) };
}

test("actual durable lifecycle and authoritative consumer survive reconstruction; inactive account loses access", async () => {
  const f = fixture(); try {
    const a = await f.service.create(owner, subject.keyId, { displayName: "Counsellor", email: "C@EXAMPLE.COM" });
    assert.equal(a.email, "c@example.com"); assert.equal(a.revision, 1);
    await f.service.grant(owner, a.id, 1, "editor");
    assert.equal((await f.service.get(owner, a.id)).role, "editor");
    assert.equal((await f.service.list(subject)).length, 1);
    const updated = await f.service.update(owner, a.id, 1, { displayName: "Updated", email: "c@example.com" });
    assert.equal(updated.revision, 2);
    const restored = f.reconstruct();
    assert.equal((await restored.service.get(owner, a.id)).displayName, "Updated");
    assert.equal((await restored.service.get(owner, a.id)).role, "editor");
    const inactive = await restored.service.deactivate(owner, a.id, 2);
    assert.equal(inactive.status, "inactive"); assert.equal(inactive.revision, 3);
    await assert.rejects(restored.service.list(subject), refused);
    await assert.rejects(restored.hosting.setRole(owner, subject.keyId, "admin"), refused);
    await assert.rejects(restored.service.grant(owner, a.id, 3, "admin"), code("account_inactive"));
    const restarted = f.reconstruct();
    await assert.rejects(restarted.service.list(subject), refused);
    const active = await restarted.service.activate(owner, a.id, 3);
    assert.equal(active.revision, 4); assert.equal((await restarted.service.get(owner, a.id)).role, null);
    await assert.rejects(restarted.service.list(subject), refused);
    await restarted.service.grant(owner, a.id, 4, "viewer");
    assert.equal((await restarted.service.list(subject)).length, 1);
    await restarted.service.deactivate(owner, a.id, 4, true);
    assert.equal((await restarted.service.list(owner)).length, 0);
    await assert.rejects(restarted.service.get(owner, a.id), code("account_not_found"));
    await assert.rejects(restarted.service.list(subject), refused);
    await assert.rejects(restarted.hosting.setRole(owner, subject.keyId, "viewer"), refused);
    const audit = await restarted.service.audit(owner);
    assert.deepEqual(audit.map(a => a.operation), ["account.create", "account.update", "account.deactivate", "account.activate", "account.delete"]);
    assert.ok(audit.every(a => a.actorId === owner.keyId && a.outcome === "committed"));
    assert.ok(!JSON.stringify(audit).includes("c@example.com"));
    const grants = await restarted.hosting.audit(owner);
    assert.equal(grants.records.filter(r => r.operation === "role.set").length, 4);
  } finally { f.clean(); }
});

test("tenant foreign IDs, lower role, unknown key, spoofed profile authority, stale revisions and duplicates refuse", async () => {
  const f = fixture(); try {
    const a = await f.service.create(owner, subject.keyId, { displayName: "A", email: "a@example.com" });
    await f.hosting.setRole(owner, "viewer-a", "viewer");
    const viewer = { ...owner, keyId: "viewer-a" };
    await assert.rejects(f.service.create(viewer, "owner-a", { displayName: "Forged", email: "f@example.com" }), code("forbidden"));
    await assert.rejects(f.service.audit(viewer), code("forbidden"));
    await assert.rejects(f.service.grant(viewer, a.id, 1, "admin"), code("forbidden"));
    await assert.rejects(f.service.get(otherOwner, a.id), code("account_not_found"));
    await assert.rejects(f.service.update(otherOwner, a.id, 1, { displayName: "X", email: "x@example.com" }), code("account_not_found"));
    await assert.rejects(f.service.grant(otherOwner, a.id, 1, "admin"), code("account_not_found"));
    await assert.rejects(f.service.create(owner, "counsellor-b", { displayName: "Foreign", email: "f@example.com" }), code("account_identity_not_found"));
    await assert.rejects(f.service.create(owner, "viewer-a", { displayName: "A", email: "a@example.com" }), code("account_exists"));
    await assert.rejects(f.service.create(owner, subject.keyId, { displayName: "A", email: "b@example.com" }), code("account_exists"));
    await assert.rejects(f.service.update(owner, a.id, 99, { displayName: "A", email: "b@example.com" }), code("account_revision_conflict"));
    await assert.rejects(f.service.create(owner, "viewer-a", { displayName: "F", email: "f@example.com", tenantId: "tenant-b" }), code("unexpected_body_field"));
    await assert.rejects(f.service.grant(owner, a.id, 1, "owner" as never), code("invalid_account_role"));
    await assert.rejects(f.service.list({ ...owner, scopes: ["accounts", "admin"] }), code("forbidden"));
    const ownProfile = await f.service.create(owner, owner.keyId, { displayName: "Owner", email: "owner@example.com" });
    await assert.rejects(f.service.deactivate(owner, ownProfile.id, 1), code("owner_binding_is_operator_managed"));
    assert.equal((await f.service.get(owner, ownProfile.id)).status, "active");
    f.registry.get("tenant-a")!.delete(owner.keyId);
    await assert.rejects(f.service.list(owner), code("forbidden"));
  } finally { f.clean(); }
});

test("audit sync failure refuses and quarantines state; deactivation profile failure retains durable role revocation", async () => {
  const f = fixture(); try {
    const a = await f.service.create(owner, subject.keyId, { displayName: "A", email: "a@example.com" });
    await f.service.grant(owner, a.id, 1, "viewer");
    const failed = f.reconstruct(() => { throw new Error("disk sync failed"); });
    await assert.rejects(failed.service.deactivate(owner, a.id, 1), code("account_recovery_required"));
    const restored = f.reconstruct();
    await assert.rejects(restored.service.list(subject), refused);
    await assert.rejects(restored.service.get(owner, a.id), code("audit_recovery_required"));
    await assert.rejects(restored.hosting.setRole(owner, subject.keyId, "viewer"), refused);
    const tenantHash = createHash("sha256").update(owner.tenantId).digest("hex");
    const records = readFileSync(join(f.hostRoot, tenantHash, "audit.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(records.filter(r => r.operation === "role.set").at(-1).data.role, null);
  } finally { f.clean(); }
});

test("hosting audit failure prevents account callback; authority lock prevents stale concurrent grant", async () => {
  const f = fixture(); try {
    const a = await f.service.create(owner, subject.keyId, { displayName: "A", email: "a@example.com" });
    await f.service.grant(owner, a.id, 1, "viewer");
    const failedHosting = new HostingService({ ...f.hosting.options, journal: new HostingJournal(f.hostRoot, () => { throw new Error("no audit"); }) });
    const failed = new CounsellorAccountsService(f.store, failedHosting, { activeKeyIds: async () => [subject.keyId] });
    await assert.rejects(failed.deactivate(owner, a.id, 1), code("audit_recovery_required"));
    assert.equal((await f.store.get(owner.tenantId, owner.keyId, a.id)).status, "active");
  } finally { f.clean(); }
  const g = fixture(); try {
    const a = await g.service.create(owner, subject.keyId, { displayName: "A", email: "a@example.com" });
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }), released = new Promise<void>(resolve => { release = resolve; });
    const pending = g.hosting.changeAccountRole(owner, subject.keyId, null, async () => { enter(); await released; }, () => g.store.status(owner.tenantId, owner.keyId, a.id, 1, "inactive"));
    await entered;
    await assert.rejects(g.service.grant(owner, a.id, 1, "admin"), code("hosting_busy"));
    release(); await pending;
    await assert.rejects(g.service.grant(owner, a.id, 2, "admin"), code("account_inactive"));
  } finally { g.clean(); }
});

test("tombstone recreation requires explicit grant; revoked identity and corrupt durable metadata fail closed", async () => {
  const f = fixture(); try {
    const a = await f.service.create(owner, subject.keyId, { displayName: "A", email: "a@example.com" });
    await f.service.grant(owner, a.id, 1, "viewer");
    await f.service.deactivate(owner, a.id, 1, true);
    const restored = f.reconstruct();
    const replacement = await restored.service.create(owner, subject.keyId, { displayName: "Replacement", email: "r@example.com" });
    assert.notEqual(replacement.id, a.id); assert.equal((await restored.service.get(owner, replacement.id)).role, null);
    await assert.rejects(restored.service.list(subject), refused);
    await restored.service.grant(owner, replacement.id, 1, "viewer");
    assert.equal((await f.reconstruct().service.list(subject)).length, 1);
    f.registry.get(owner.tenantId)!.delete(subject.keyId);
    await assert.rejects(restored.service.grant(owner, replacement.id, 1, "admin"), code("key_not_found"));
    // An already-revoked, bound identity remains administratively removable; it cannot be restored.
    await restored.service.deactivate(owner, replacement.id, 1, true);
    await assert.rejects(restored.service.create(owner, subject.keyId, { displayName: "No", email: "no@example.com" }), code("account_identity_not_found"));
  } finally { f.clean(); }
  const g = fixture(); try {
    const journal = new HostingJournal(g.accountRoot);
    await journal.transaction(owner.tenantId, owner.keyId, "2026-10-14T00:00:00.000Z", async () => ({ value: null,
      operation: "account.create", target: "corrupt", outcome: "committed", data: { id: "corrupt", keyId: subject.keyId, email: "bad" } }));
    const restored = g.reconstruct();
    await assert.rejects(restored.store.identityStatus(owner.tenantId, subject.keyId), code("account_recovery_required"));
    const guarded = createAccountAwareKeyStore({ verify: async () => subject }, restored.store);
    await assert.rejects(guarded.verify("fixture-token"), code("accounts_identity_unavailable"));
    await assert.rejects(restored.hosting.setRole(owner, subject.keyId, "viewer"), refused);
  } finally { g.clean(); }
});

test("mounted authenticated HTTP consumer uses verified key identity; source body cannot grant identity", async () => {
  const f = fixture();
  const keys = new Map<string, HostingPrincipal>([["owner-token", owner], ["subject-token", subject], ["other-token", otherOwner]]);
  const keyStore = createAccountAwareKeyStore({ verify: async key => keys.get(key) ?? null }, f.store);
  const app = express(); app.use(express.json()); app.use("/counsellor-accounts", createCounsellorAccountRouter({ service: f.service, keys: keyStore }));
  app.get("/other-consumer", requireAuth(keyStore), requireScope("hosting"), (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/counsellor-accounts`;
  async function request(path: string, token = "owner-token", method = "GET", body?: unknown) {
    const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }
  try {
    assert.equal((await request("", "invalid")).status, 401);
    const created = await request("", "owner-token", "POST", { keyId: subject.keyId, displayName: "HTTP", email: "http@example.com" });
    assert.equal(created.status, 201); const id = created.body.account.id;
    assert.equal((await request(`/${id}`, "other-token")).status, 404);
    assert.equal((await request(`/${id}/role`, "owner-token", "PUT", { role: "viewer", expectedRevision: 1, tenantId: "tenant-b" })).status, 400);
    assert.equal((await request(`/${id}/role`, "owner-token", "PUT", { role: "viewer", expectedRevision: 1 })).status, 200);
    assert.equal((await request("", "subject-token")).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/other-consumer`, { headers: { authorization: "Bearer subject-token" } })).status, 200);
    assert.equal((await request(`/${id}/deactivate`, "owner-token", "POST", { expectedRevision: 1 })).status, 200);
    assert.equal((await request("", "subject-token")).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/other-consumer`, { headers: { authorization: "Bearer subject-token" } })).status, 401);
    const audit = await request("/audit"); assert.equal(audit.status, 200); assert.equal(audit.body.audit.length, 2);
    assert.ok(!JSON.stringify(audit.body).includes("owner-token"));
    keys.set("missing-id", { tenantId: owner.tenantId, scopes: ["hosting"] } as HostingPrincipal);
    assert.equal((await request("", "missing-id")).status, 401);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); f.clean(); }
});
