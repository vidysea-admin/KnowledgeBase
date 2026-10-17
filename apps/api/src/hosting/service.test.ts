import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hostingFixture } from "./test-kit.js";

test("hosting authority is verified tenant/key plus server role, never privilege or tenant input", async () => {
  const f = hostingFixture();
  try {
    await assert.rejects(f.service.setRole(f.memberA, "memberA", "admin"), /forbidden/);
    await assert.rejects(f.service.setRole({ ...f.ownerA, scopes: [] }, "memberA", "admin"), /forbidden/);
    await assert.rejects(f.service.register({ ...f.ownerA, scopes: ["hosting"] }, "https://hooks.example.test/", ["session.indexed"]), /forbidden/);
    await assert.rejects(f.service.setRole(f.ownerA, "memberB", "admin"), /key_not_found/);
    await assert.rejects(f.service.setRole(f.ownerA, "ownerA", null), /operator_managed/);
    await assert.rejects(f.service.withPermission(f.ownerA, "operations:run", async () => undefined), /forbidden/);
    await f.service.withPermission({ ...f.ownerA, scopes: [...f.ownerA.scopes, "operations"] }, "operations:run", async () => undefined);
    await f.service.setRole(f.ownerA, "memberA", "viewer");
    assert.equal(await f.service.getRole(f.ownerA, "memberA"), "viewer");
    await assert.rejects(f.service.setRole(f.memberA, "editorA", "admin"), /forbidden/);
    await assert.rejects(f.service.audit(f.memberA), /forbidden/);
    await assert.rejects(f.service.withPermission({ ...f.memberA, scopes: [...f.memberA.scopes, "operations"] }, "operations:run", async () => undefined), /forbidden/);
    await assert.rejects(f.service.setRole(f.ownerA, "memberA", "owner" as "admin"), /invalid_role/);
    assert.deepEqual((await f.service.getRoles(f.ownerB)).roles, [{ keyId: "ownerB", role: "owner" }]);
    f.revoked.add("A:ownerA");
    await assert.rejects(f.service.getRoles(f.ownerA), /forbidden/);
  } finally { f.close(); }
});

test("role/profile commit is read-checked, audited first, and rejects ordinary regrant after incomplete callback", async () => {
  const f = hostingFixture();
  try {
    await f.service.setRole(f.ownerA, "memberA", "admin");
    let calls = 0;
    await assert.rejects(f.service.changeAccountRole(f.ownerA, "memberA", null, async () => {}, async () => { calls++; throw new Error("private database detail"); }), /account_recovery_required/);
    assert.equal(calls, 1);
    await assert.rejects(f.make().setRole(f.ownerA, "memberA", "admin"), /audit_recovery_required/);
    const text = readFileSync(join(f.root, readdirSync(f.root)[0]!, "audit.jsonl"), "utf8");
    assert.equal(text.includes("private database detail"), false);
    assert.equal(JSON.parse(text.trim().split("\n").at(-1)!).data.role, null);
    assert.equal(JSON.parse(text.trim().split("\n").at(-1)!).data.accountPending, true);
  } finally { f.close(); }
});

test("successful account callback completes pending marker; inactive and revoked account identities fail closed", async () => {
  const f = hostingFixture();
  try {
    await f.service.changeAccountRole(f.ownerA, "memberA", "editor", async () => {}, async () => "committed");
    assert.equal(await f.make().getRole(f.ownerA, "memberA"), "editor");
    const records = (await f.service.audit(f.ownerA)).records;
    assert.deepEqual(records.map((r) => r.operation), ["role.set", "account.complete"]);
    f.status.set("A:memberA", "inactive");
    assert.equal(await f.service.isIdentityActive("A", "memberA"), false);
    await assert.rejects(f.service.setRole(f.ownerA, "memberA", "admin"), /account_inactive/);
    await assert.rejects(f.service.withPermission(f.memberA, "accounts:read", async () => "leak"), /forbidden/);
    f.revoked.add("A:memberA");
    assert.equal(await f.service.getRole(f.ownerA, "memberA"), null);
    await f.service.setRole(f.ownerA, "memberA", null);
  } finally { f.close(); }
});

test("durable registry returns secret once; projections and audit omit ciphertext and payload", async () => {
  const f = hostingFixture();
  try {
    const url = `https://hooks.example.test/${"a".repeat(400)}`;
    await assert.rejects(f.service.register(f.ownerA, `https://hooks.example.test/${"é".repeat(400)}`, ["session.indexed"]), /invalid_destination/);
    const result = await f.service.register(f.ownerA, url, ["session.indexed"]);
    const other = f.make();
    const listed = await other.subscriptions(f.ownerA);
    assert.equal(listed.subscriptions[0]?.id, result.id);
    assert.equal(listed.subscriptions[0]?.url, url);
    assert.equal(JSON.stringify(listed).includes(result.signingSecret), false);
    assert.equal(JSON.stringify(listed).includes("sealedSecret"), false);
    await other.publish(f.ownerA, "event-1", "session.indexed", { privateText: "not-in-audit" });
    const audit = JSON.stringify(await other.audit(f.ownerA));
    assert.equal(audit.includes(result.signingSecret), false); assert.equal(audit.includes("not-in-audit"), false);
    assert.equal(audit.includes("sealedSecret"), false);
    assert.deepEqual((await other.subscriptions(f.ownerB)).subscriptions, []);
    await assert.rejects(other.revoke(f.ownerB, result.id), /not_found/);
    await other.revoke(f.ownerA, result.id);
    assert.equal((await other.deliveries(f.ownerA)).deliveries[0]?.status, "cancelled");
  } finally { f.close(); }
});

test("event replay is identity bound; roles and callbacks serialize rather than losing updates", async () => {
  const f = hostingFixture();
  try {
    await f.service.register(f.ownerA, "https://hooks.example.test/hook", ["claim.verified"]);
    const one = await f.service.publish(f.ownerA, "same-id", "claim.verified", { value: 1 });
    assert.deepEqual((await f.service.publish(f.ownerA, "same-id", "claim.verified", { value: 1 })).deliveryIds, one.deliveryIds);
    await assert.rejects(f.service.publish(f.ownerA, "same-id", "claim.verified", { value: 2 }), /identity_conflict/);
    let release!: () => void;
    const held = f.service.withPermission(f.ownerA, "accounts:manage", async () => { await new Promise<void>((r) => { release = r; }); });
    await new Promise((r) => setTimeout(r, 0));
    try { await assert.rejects(f.make().setRole(f.ownerA, "memberA", "admin"), /hosting_busy/); }
    finally { release(); await held; }
  } finally { f.close(); }
});

test("key mutation has role/scope authority and durable intent/completion without raw credential audit", async () => {
  const f = hostingFixture();
  try {
    let changes = 0;
    const p = { ...f.ownerA, scopes: [...f.ownerA.scopes, "keys"] };
    const key = await f.service.keyMutation(p, "create", null, async () => { changes++; return { id: "created-id", rawKey: "raw-test-once" }; }, (value) => value.id);
    assert.equal(key.rawKey, "raw-test-once"); assert.equal(changes, 1);
    const rows = (await f.service.audit(f.ownerA)).records;
    assert.deepEqual(rows.map((r) => r.operation), ["key.change.intent", "key.change.complete"]);
    assert.equal(rows.at(-1)?.target, "created-id");
    assert.equal(readFileSync(join(f.root, readdirSync(f.root)[0]!, "audit.jsonl"), "utf8").includes(key.rawKey), false);
    await f.service.setRole(f.ownerA, "memberA", "viewer");
    await assert.rejects(f.service.keyMutation({ ...f.memberA, scopes: [...f.memberA.scopes, "keys"] }, "create", null, async () => { changes++; return { id: "bad" }; }, (value) => value.id), /forbidden/);
    assert.equal(changes, 1);
    await assert.rejects(f.service.keyMutation(p, "revoke", "ownerA", async () => { changes++; return true; }, () => "ownerA"), /operator_managed/);
    assert.equal(changes, 1);
    await assert.rejects(f.service.keyMutation(p, "revoke", "created-id", async () => { throw new Error("private storage/credential detail"); }, () => "created-id"), /key_recovery_required/);
    await assert.rejects(f.make().keyMutation(p, "create", null, async () => ({ id: "bad" }), (value) => value.id), /audit_recovery_required/);
  } finally { f.close(); }
});
