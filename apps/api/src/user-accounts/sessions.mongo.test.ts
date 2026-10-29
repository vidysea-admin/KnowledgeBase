// user-accounts A3 (D-206): real-Mongo proof of what the in-memory store cannot show - CAS rotation under parallel requests,
// the global tokenHash lookup (ISS-415) served by indexes, cross-tenant duplicate email (E11000 -> generic mapper), replay
// revocation + audit row. Opt-in: set LKB_UA_SESSION_MONGO_URI to a LOOPBACK mongod. Creates its own throwaway database
// `lkb_ua_session_test_<hex>`, applies the A1 migration through its work-database guard, drops it afterwards. Nothing else is touched.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { findUserById, insertUser, recordAuthEvent } from "@lkb/db";
import { MongoClient, type Db } from "mongodb";
import { createMongoSessionStore } from "../composition/integrations/user-accounts.js";
import { isDuplicateEmailError } from "./principal.js";
import { createSessionService, ROTATE_AFTER_MS, ROTATION_GRACE_MS } from "./sessions.js";
import { fakeClock } from "./sessions.testsupport.js";
import { sha256Hex } from "../hash.js";

const uri = process.env.LKB_UA_SESSION_MONGO_URI;
const enabled = typeof uri === "string" && uri.length > 0;
const require = createRequire(import.meta.url);
const migration = require("../../../../migrations/20261029100000-user-accounts.cjs") as { up(db: Db): Promise<void> };
const PHC = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo";

test("sessions on a real mongod", { skip: !enabled, timeout: 120_000 }, async (t) => {
  const url = new URL(uri!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "loopback mongod only");
  const dbName = `lkb_ua_session_test_${randomBytes(6).toString("hex")}`;
  assert.match(dbName, /^lkb_ua_session_test_[a-z0-9_]+$/);
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  const saved = { w: process.env.MONGO_WORK_DB, u: process.env.MONGODB_URL, d: process.env.MONGODB_DB };
  process.env.MONGO_WORK_DB = dbName; process.env.MONGODB_URL = uri!; delete process.env.MONGODB_DB;
  const now0 = new Date();
  try {
    await migration.up(db);
    const clock = fakeClock(now0.toISOString());
    const store = createMongoSessionStore(db);
    const svc = createSessionService({ store, users: { getUser: (tenantId, userId) => findUserById(tenantId, userId, db) }, now: clock.now, audit: (tenantId, e) => recordAuthEvent(tenantId, e, db, clock.now()) });
    const uA = await insertUser("tA", { emailNormalized: "a@example.org", displayName: "A", passwordHash: PHC, status: "active", role: "member" }, db, clock.now());
    const uB = await insertUser("tB", { emailNormalized: "b@example.org", displayName: "B", passwordHash: PHC, status: "active", role: "admin" }, db, clock.now());
    const sessions = db.collection("user_sessions");

    await t.test("duplicate email in ANOTHER tenant is E11000 and maps to the generic duplicate outcome (ISS-415 part 2)", async () => {
      await assert.rejects(insertUser("tB", { emailNormalized: "a@example.org", displayName: "Dup", passwordHash: PHC }, db, clock.now()), (e) => { assert.equal(isDuplicateEmailError(e), true); return true; });
      await assert.rejects(insertUser("tA", { emailNormalized: "b@example.org", displayName: "Dup", passwordHash: PHC }, db, clock.now()), (e) => isDuplicateEmailError(e));
    });

    await t.test("global hash lookup resolves the tenant; a session never resolves under another tenant's user (ISS-415 part 1, UA-27)", async () => {
      const a = await svc.create("tA", uA._id);
      const ok = await svc.authenticate(a.token); assert.ok(ok.ok && ok.auth.tenantId === "tA" && ok.auth.userId === uA._id);
      const cross = await svc.create("tA", uB._id); // tB's user id inside a tA session
      const bad = await svc.authenticate(cross.token); assert.ok(!bad.ok && bad.status === 401 && bad.code === "unauthorized");
      const dup = { ...(await sessions.findOne({ tokenHash: sha256Hex(a.token) }))!, _id: "dup-id", tenantId: "tB" };
      await assert.rejects(sessions.insertOne(dup as never), (e) => (e as { code?: number }).code === 11000, "tokenHash is globally unique");
    });

    await t.test("the three lookups are served by indexes, never a collection scan (forged cookies must stay cheap)", async () => {
      const h = sha256Hex("probe");
      const plans = await Promise.all([{ tokenHash: h }, { previousTokenHash: { $eq: h, $type: "string" } }, { retiredTokenHashes: h, "retiredTokenHashes.0": { $exists: true } }].map(async (f) => JSON.stringify((await sessions.find(f).explain("queryPlanner") as { queryPlanner: { winningPlan: unknown } }).queryPlanner.winningPlan)));
      for (const p of plans) { assert.match(p, /IXSCAN/); assert.doesNotMatch(p, /COLLSCAN/); }
    });

    await t.test("parallel requests with one cookie after 24 h: exactly one rotation, family not forked, replay after grace revokes + audits (A3 #4)", async () => {
      const s = await svc.create("tA", uA._id);
      clock.advance(ROTATE_AFTER_MS + 1000);
      const outs = await Promise.all(Array.from({ length: 10 }, () => svc.authenticate(s.token)));
      assert.ok(outs.every((o) => o.ok), "every parallel request succeeds (grace / CAS loser re-resolves)");
      const rotated = outs.filter((o) => o.ok && o.rotatedToken !== undefined);
      assert.equal(rotated.length, 1, "exactly one CAS winner");
      assert.equal(await sessions.countDocuments({ familyId: s.session.familyId }), 1, "one row, no fork");
      const row = (await sessions.findOne({ _id: s.session._id as never }))!;
      assert.deepEqual(row.retiredTokenHashes, [sha256Hex(s.token)]); assert.equal(row.tokenHash, sha256Hex((rotated[0] as { rotatedToken: string }).rotatedToken));
      clock.advance(ROTATION_GRACE_MS + 1000);
      const replay = await svc.authenticate(s.token); assert.ok(!replay.ok && replay.code === "session_revoked");
      const after = (await sessions.findOne({ _id: s.session._id as never }))!;
      assert.equal(after.revokedReason, "reuse_detected"); assert.ok(after.purgeAt instanceof Date, "purgeAt is a BSON Date so TTL can act");
      const ev = await db.collection("auth_events").find({ type: "reuse_detected", targetUserId: uA._id }).toArray();
      assert.equal(ev.length, 1); assert.equal(ev[0]!.detail, "family_revoked");
      const next = await svc.authenticate((rotated[0] as { rotatedToken: string }).rotatedToken); assert.ok(!next.ok, "the legitimate new token is revoked with the family");
    });

    await t.test("revocation is immediate; another tenant cannot revoke; revokeAllForUser honours the exception", async () => {
      const uC = await insertUser("tA", { emailNormalized: "c@example.org", displayName: "C", passwordHash: PHC, status: "active", role: "viewer" }, db, clock.now());
      const a = await svc.create("tA", uC._id), b = await svc.create("tA", uC._id);
      assert.equal(await svc.revoke("tB", a.session._id, "admin"), false);
      assert.equal(await svc.revokeAllForUser("tA", uC._id, "password_change", b.session._id), 1);
      assert.ok(!(await svc.authenticate(a.token)).ok); assert.ok((await svc.authenticate(b.token)).ok);
    });
  } finally {
    process.env.MONGO_WORK_DB = saved.w; process.env.MONGODB_URL = saved.u; process.env.MONGODB_DB = saved.d;
    if (saved.w === undefined) delete process.env.MONGO_WORK_DB; if (saved.u === undefined) delete process.env.MONGODB_URL; if (saved.d === undefined) delete process.env.MONGODB_DB;
    await db.dropDatabase(); await client.close();
  }
});
