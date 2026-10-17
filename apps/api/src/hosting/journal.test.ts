import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, readdirSync, symlinkSync, writeFileSync, mkdirSync, fsyncSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HostingJournal } from "./journal.js";
import { hostingFixture } from "./test-kit.js";

test("append/fsync failure blocks callback and fresh runtime, not silent successful replay", async () => {
  const f = hostingFixture();
  try {
    const lazyRoot = join(f.root, "configured-not-created");
    new HostingJournal(lazyRoot);
    assert.equal(existsSync(lazyRoot), false);
    const service = f.make(new HostingJournal(f.root, () => { throw new Error("storage fault"); }));
    let after = 0;
    await assert.rejects(service.changeAccountRole(f.ownerA, "memberA", "admin", async () => {}, async () => { after++; }), /audit_recovery_required/);
    assert.equal(after, 0);
    await assert.rejects(f.make().getRoles(f.ownerA), /audit_recovery_required/);
  } finally { f.close(); }
});

test("truncated and modified tenant journal is refused; no repair drops audit evidence", async () => {
  const f = hostingFixture();
  try {
    await f.service.setRole(f.ownerA, "memberA", "viewer");
    const file = join(f.root, readdirSync(f.root)[0]!, "audit.jsonl"), original = readFileSync(file, "utf8");
    appendFileSync(file, '{"partial":');
    await assert.rejects(f.make().getRoles(f.ownerA), /audit_recovery_required/);
    assert.equal(readFileSync(file, "utf8"), original + '{"partial":');
    writeFileSync(file, original.replace('"role":"viewer"', '"role":"admin"'));
    await assert.rejects(f.make().getRoles(f.ownerA), /audit_recovery_required/);
  } finally { f.close(); }
});

test("symlink ancestry cannot redirect durable state; abandoned locks refuse until operator recovery", async () => {
  const f = hostingFixture();
  try {
    const real = join(f.root, "real"); mkdirSync(real, { mode: 0o700 });
    const alias = join(f.root, "alias"); symlinkSync(real, alias, "junction");
    assert.throws(() => new HostingJournal(alias), /unsafe_state_directory/);
    await f.service.setRole(f.ownerA, "memberA", "viewer");
    const tenant = readdirSync(f.root).find((x) => /^[0-9a-f]{64}$/.test(x))!;
    writeFileSync(join(f.root, tenant, "writer.lock"), "abandoned", { mode: 0o600 });
    await assert.rejects(f.make().getRoles(f.ownerA), /hosting_busy/);
  } finally { f.close(); }
});

test("crash after audited role append leaves pending target unable to regrant", async () => {
  const f = hostingFixture();
  try {
    await f.service.options.journal.transaction("A", "ownerA", new Date().toISOString(), async () => ({ value: undefined,
      operation: "role.set", target: "memberA", outcome: "account_pending", data: { keyId: "memberA", role: null, accountPending: true } }));
    await assert.rejects(f.make().setRole(f.ownerA, "memberA", "admin"), /account_recovery_required/);
    await assert.rejects(f.make().isIdentityActive("A", "memberA"), /identity_recovery_required/);
    assert.equal(await f.make().getRole(f.ownerA, "memberA"), null);
  } finally { f.close(); }
});

test("failure in account completion append does not manufacture completion", async () => {
  const f = hostingFixture();
  try {
    let appends = 0;
    const service = f.make(new HostingJournal(f.root, (fd) => { if (++appends === 2) throw new Error("completion fault"); fsyncSync(fd); }));
    await assert.rejects(service.changeAccountRole(f.ownerA, "memberA", null, async () => {}, async () => "metadata committed"), /account_recovery_required/);
    await assert.rejects(f.make().getRoles(f.ownerA), /audit_recovery_required/);
  } finally { f.close(); }
});
