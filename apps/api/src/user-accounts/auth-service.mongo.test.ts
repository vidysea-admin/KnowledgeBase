// user-accounts A4 (D-206): real-Mongo proof of what the in-memory AuthStore cannot show - the compare-and-set lockout counter under PARALLEL
// guesses, atomic single-use token redemption under parallel requests, the global unique email across tenants (E11000 -> identical signup reply),
// and that the audit rows written through the real collection carry no secret. Opt-in: set LKB_UA_AUTH_MONGO_URI to a LOOPBACK mongod.
// Creates its own throwaway database `lkb_ua_auth_test_<hex>`, applies the A1 migration, drops it afterwards. Nothing else is touched.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { findUserById, recordAuthEvent } from "@lkb/db";
import { MongoClient, type Db } from "mongodb";
import { createMongoAuthStore, createMongoSessionStore } from "../composition/integrations/user-accounts.js";
import { createAuthService } from "./auth-service.js";
import { fastPassword } from "./auth-service.testsupport.js";
import { createSessionService } from "./sessions.js";

const uri = process.env.LKB_UA_AUTH_MONGO_URI;
const enabled = typeof uri === "string" && uri.length > 0;
const require = createRequire(import.meta.url);
const migration = require("../../../../migrations/20261029100000-user-accounts.cjs") as { up(db: Db): Promise<void> };
const SECRET = "s".repeat(48), PW = "correct horse battery staple";

test("auth store + service on a real mongod", { skip: !enabled, timeout: 120_000 }, async (t) => {
  const url = new URL(uri!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "loopback mongod only");
  const dbName = `lkb_ua_auth_test_${randomBytes(6).toString("hex")}`;
  assert.match(dbName, /^lkb_ua_auth_test_[a-z0-9_]+$/);
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  const saved = { w: process.env.MONGO_WORK_DB, u: process.env.MONGODB_URL, d: process.env.MONGODB_DB };
  process.env.MONGO_WORK_DB = dbName; process.env.MONGODB_URL = uri!; delete process.env.MONGODB_DB;
  try {
    await migration.up(db);
    const store = createMongoAuthStore(db), password = fastPassword();
    const sessions = createSessionService({ store: createMongoSessionStore(db), users: { getUser: (tenantId, userId) => findUserById(tenantId, userId, db) }, audit: (tenantId, e) => recordAuthEvent(tenantId, e, db) });
    const svc = createAuthService({ store, sessions, password, csrfSecret: SECRET });

    await t.test("signup: new, existing and other-tenant address give a byte-equal reply; one user row", async () => {
      const a = await svc.signup("tA", { email: "dup@example.org", password: PW, displayName: "A" });
      const b = await svc.signup("tA", { email: "dup@example.org", password: PW, displayName: "A2" });
      const c = await svc.signup("tB", { email: "dup@example.org", password: PW, displayName: "B" });
      assert.deepEqual([JSON.stringify(a), JSON.stringify(b)], [JSON.stringify(c), JSON.stringify(c)]);
      assert.equal(await db.collection("users").countDocuments({ emailNormalized: "dup@example.org" }), 1);
    });

    await t.test("lockout: 12 PARALLEL wrong passwords lock the address once, never-registered address included (compare-and-set)", async () => {
      await Promise.all(Array.from({ length: 12 }, () => svc.login("tA", { email: "ghost@example.org", password: "wrong wrong wrong" })));
      const rows = await db.collection("auth_throttles").find({}).toArray();
      assert.equal(rows.length, 1); assert.equal(rows[0]!.lockCount, 1); assert.ok(typeof rows[0]!.lockedUntil === "string");
      assert.equal(JSON.stringify(rows).includes("ghost@example.org"), false, "the raw address is never stored");
    });

    await t.test("tokens: 10 PARALLEL redemptions of one admin-issued reset link succeed exactly once", async () => {
      await svc.signup("tA", { email: "tok@example.org", password: PW, displayName: "T" });
      const user = await db.collection("users").findOne({ emailNormalized: "tok@example.org" });
      const link = (await svc.issueToken("tA", "password_reset", String(user!._id), "admin-1"))!;
      const outs = await Promise.all(Array.from({ length: 10 }, () => svc.resetPassword("tA", { token: link.token, newPassword: "another long passphrase 2026" })));
      assert.equal(outs.filter((o) => o.status === 200).length, 1);
      assert.equal(outs.filter((o) => o.status === 400).length, 9);
    });

    await t.test("audit rows hold no password, token or cookie substring", async () => {
      const text = JSON.stringify(await db.collection("auth_events").find({}).toArray());
      for (const secret of [PW, "another long passphrase 2026", "__Secure-lkb_sid"]) assert.equal(text.includes(secret), false, secret);
    });
  } finally {
    try { await db.dropDatabase(); } finally { await client.close(); }
    for (const [k, v] of [["MONGO_WORK_DB", saved.w], ["MONGODB_URL", saved.u], ["MONGODB_DB", saved.d]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
