// user-accounts A1 (D-206): real-Mongo proof of what a fake cannot show - the migration's validators, the unique
// indexes, single-use token consumption under concurrency and TTL expiry. Opt-in: set LKB_UA_SCHEMA_MONGO_URI to a
// LOOPBACK mongod. The test creates its own throwaway database `lkb_ua_schema_test_<hex>`, applies the migration to it
// through the migration's own work-database guard, and drops it afterwards. It never touches any other database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { authEvents, buildAuthEvent, recordAuthEvent } from "./auth-events.js";
import { authThrottles, buildThrottle } from "./auth-throttles.js";
import { buildSession, findSessionById, insertSession, revocationFields, revokeSession, userSessions } from "./user-sessions.js";
import { buildToken, consumeToken, insertToken, userTokens } from "./user-tokens.js";
import { buildUser, findUserById, insertUser, users } from "./users.js";

const uri = process.env.LKB_UA_SCHEMA_MONGO_URI;
const enabled = typeof uri === "string" && uri.length > 0;
const require = createRequire(import.meta.url);
const migration = require("../../../../migrations/20261029100000-user-accounts.cjs") as { up(db: Db): Promise<void>; down(): Promise<void> };
const H = (c: string) => c.repeat(64);
const PHC = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo";
type RawDoc = { _id: string; [k: string]: unknown };
const TTL_WAIT_MS = 150_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Test-local mirror of the UA-2 normaliser (the real one is A2's); used only to build inputs the store accepts. */
const norm = (s: string) => s.trim().normalize("NFKC").toLowerCase();
const isDup = (e: unknown) => (e as { code?: number }).code === 11000;
const isValidationFailure = (e: unknown) => (e as { code?: number }).code === 121;

test("user-accounts collections on a real mongod", { skip: !enabled, timeout: TTL_WAIT_MS + 60_000 }, async (t) => {
  const url = new URL(uri!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "loopback mongod only");
  const dbName = `lkb_ua_schema_test_${randomBytes(6).toString("hex")}`;
  assert.match(dbName, /^lkb_ua_schema_test_[a-z0-9_]+$/);
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  const raw = (name: string) => db.collection<RawDoc>(name);
  const env = { MONGO_WORK_DB: process.env.MONGO_WORK_DB, MONGODB_URL: process.env.MONGODB_URL, MONGODB_DB: process.env.MONGODB_DB };
  process.env.MONGO_WORK_DB = dbName; process.env.MONGODB_URL = uri!; delete process.env.MONGODB_DB;
  try {
    await t.test("migration applies and re-applies idempotently, then refuses rollback", async () => {
      await migration.up(db);
      await migration.up(db);
      const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
      for (const n of ["users", "user_sessions", "user_tokens", "auth_throttles", "auth_events"]) assert.ok(names.includes(n), n);
      const idx = async (n: string) => (await raw(n).indexes()).map((i) => ({ key: i.key, unique: !!i.unique, ttl: i.expireAfterSeconds }));
      assert.ok((await idx("users")).some((i) => i.unique && JSON.stringify(i.key) === '{"emailNormalized":1}'));
      assert.ok((await idx("user_sessions")).some((i) => i.unique && JSON.stringify(i.key) === '{"tokenHash":1}'));
      assert.ok((await idx("user_tokens")).some((i) => i.unique && JSON.stringify(i.key) === '{"tokenHash":1}'));
      for (const n of ["user_sessions", "user_tokens", "auth_throttles", "auth_events"]) assert.ok((await idx(n)).some((i) => JSON.stringify(i.key) === '{"purgeAt":1}' && i.ttl === 0), `${n} TTL index`);
      await assert.rejects(migration.down());
    });

    await t.test("the users validator accepts every status and rejects the invalid shapes", async () => {
      const ok = (status: "unverified" | "pending" | "rejected" | "disabled", n: string) => insertUser("toc", { emailNormalized: `${n}@example.com`, displayName: n, passwordHash: PHC, status }, db);
      for (const s of ["unverified", "pending", "rejected", "disabled"] as const) await ok(s, `status-${s}`);
      for (const r of ["admin", "member", "viewer"] as const) await insertUser("toc", { emailNormalized: `role-${r}@example.com`, displayName: r, passwordHash: PHC, status: "active", role: r }, db);
      const good = { ...buildUser({ emailNormalized: "raw-base@example.com", displayName: "B", passwordHash: PHC, status: "active", role: "member" }), tenantId: "toc" };
      const bad: Record<string, RawDoc> = {
        missingTenant: (() => { const { tenantId: _t, ...rest } = good; return { ...rest, _id: "m1", emailNormalized: "m1@example.com" }; })(),
        unknownField: { ...good, _id: "m2", emailNormalized: "m2@example.com", isAdmin: true },
        roleOutsideEnum: { ...good, _id: "m3", emailNormalized: "m3@example.com", role: "owner" },
        activeWithoutRole: (() => { const { role: _r, ...rest } = good; return { ...rest, _id: "m4", emailNormalized: "m4@example.com" }; })(),
        activeNullRole: { ...good, _id: "m5", emailNormalized: "m5@example.com", role: null },
        plaintextPassword: { ...good, _id: "m6", emailNormalized: "m6@example.com", passwordHash: "correct horse battery staple" },
        badStatus: { ...good, _id: "m7", emailNormalized: "m7@example.com", status: "approved" },
      };
      for (const [name, doc] of Object.entries(bad)) await assert.rejects(raw("users").insertOne(doc), isValidationFailure, name);
      assert.equal(await raw("users").countDocuments({ _id: { $in: ["m1", "m2", "m3", "m4", "m5", "m6", "m7"] } }), 0);
      await raw("users").insertOne({ ...good, _id: "m-ok", emailNormalized: "m-ok@example.com" });
    });

    await t.test("the sessions validator rejects a session without familyId, partial revocation and a non-Date purgeAt", async () => {
      const s = { ...buildSession({ userId: "u-1", tokenHash: H("1") }), tenantId: "toc" };
      const { familyId: _f, ...noFamily } = s;
      await assert.rejects(raw("user_sessions").insertOne({ ...noFamily, _id: "x1", tokenHash: H("2") }), isValidationFailure, "no familyId");
      await assert.rejects(raw("user_sessions").insertOne({ ...s, _id: "x2", tokenHash: H("3"), tenantId: undefined }), isValidationFailure, "no tenantId");
      await assert.rejects(raw("user_sessions").insertOne({ ...s, _id: "x3", tokenHash: H("4"), token: "raw-cookie" }), isValidationFailure, "unknown field");
      await assert.rejects(raw("user_sessions").insertOne({ ...s, _id: "x4", tokenHash: H("5"), revokedAt: s.createdAt, revokedReason: "logout" }), isValidationFailure, "revoked without purgeAt");
      await assert.rejects(raw("user_sessions").insertOne({ ...s, _id: "x5", tokenHash: H("6"), purgeAt: new Date() }), isValidationFailure, "purgeAt without revocation");
      await assert.rejects(raw("user_sessions").insertOne({ ...s, _id: "x6", tokenHash: H("7"), revokedAt: s.createdAt, revokedReason: "logout", purgeAt: s.createdAt }), isValidationFailure, "purgeAt as a string");
      await raw("user_sessions").insertOne({ ...s, _id: "x-ok", tokenHash: H("8"), ...revocationFields("admin") });
    });

    await t.test("unique email: case, Unicode composition, surrounding spaces and a different tenant all collide (UA-2)", async () => {
      await insertUser("toc", { emailNormalized: norm("José.Student@Example.com"), displayName: "Jose", passwordHash: PHC }, db);
      for (const [tenant, variant] of [["toc", "  JOSÉ.STUDENT@EXAMPLE.COM  "], ["toc", "José.Student@example.com"], ["toc", "ｊｏｓｅ́.student@example.com"], ["other-tenant", "josé.student@example.com"]] as const) {
        await assert.rejects(insertUser(tenant, { emailNormalized: norm(variant), displayName: "dup", passwordHash: PHC }, db), isDup, `${tenant}:${JSON.stringify(variant)}`);
      }
      await assert.rejects(insertUser("toc", { emailNormalized: "JOSÉ@example.com", displayName: "x", passwordHash: PHC }, db), /normalised form/, "un-normalised input never reaches the index");
      assert.equal(await raw("users").countDocuments({ emailNormalized: norm("José.Student@Example.com") }), 1);
    });

    await t.test("tokenHash is unique on sessions and tokens", async () => {
      await insertSession("toc", { userId: "u-9", tokenHash: H("a") }, db);
      await assert.rejects(insertSession("toc", { userId: "u-9", tokenHash: H("a") }, db), isDup);
      await assert.rejects(insertSession("other-tenant", { userId: "u-8", tokenHash: H("a") }, db), isDup, "even across tenants");
      await insertToken("toc", { userId: "u-9", purpose: "verify_email", tokenHash: H("b") }, db);
      await assert.rejects(insertToken("toc", { userId: "u-9", purpose: "password_reset", tokenHash: H("b") }, db), isDup);
      await assert.rejects(insertToken("other-tenant", { userId: "u-8", purpose: "verify_email", tokenHash: H("b") }, db), isDup);
    });

    await t.test("a cross-tenant findOne by id returns null for every new collection", async () => {
      const u = await insertUser("tenant-a", { emailNormalized: "iso@example.com", displayName: "Iso", passwordHash: PHC }, db);
      const s = await insertSession("tenant-a", { userId: u._id, tokenHash: H("c") }, db);
      const tk = await insertToken("tenant-a", { userId: u._id, purpose: "verify_email", tokenHash: H("d") }, db);
      await authThrottles("tenant-a", db).insertOne(buildThrottle({ subjectHash: H("e"), failures: 1 }, new Date(), "th-iso"));
      await recordAuthEvent("tenant-a", { type: "signup", outcome: "ok", actorUserId: u._id }, db);
      const ev = (await authEvents("tenant-a", db).find({}).toArray())[0]!;
      assert.ok(await findUserById("tenant-a", u._id, db));
      assert.equal(await findUserById("tenant-b", u._id, db), null);
      assert.equal(await findSessionById("tenant-b", s._id, db), null);
      assert.equal(await userTokens("tenant-b", db).findOne({ _id: tk._id }), null);
      assert.equal(await authThrottles("tenant-b", db).findOne({ _id: "th-iso" }), null);
      assert.equal((await authEvents("tenant-b", db).find({ _id: ev._id }).toArray()).length, 0);
      assert.equal(await users("tenant-b", db).findOne({}), null, "tenant-b has no users at all");
    });

    await t.test("consumeToken is single-use under 12 concurrent attempts; revokeSession is compare-and-swap", async () => {
      await insertToken("toc", { userId: "u-race", purpose: "password_reset", tokenHash: H("f") }, db);
      const spent = await Promise.all(Array.from({ length: 12 }, () => consumeToken("toc", H("f"), "password_reset", db)));
      assert.equal(spent.filter((x) => x === "u-race").length, 1, JSON.stringify(spent));
      assert.equal(spent.filter((x) => x === null).length, 11);
      const s = await insertSession("toc", { userId: "u-race", tokenHash: H("9") }, db);
      const wins = await Promise.all(Array.from({ length: 12 }, (_, i) => revokeSession("toc", s._id, i % 2 ? "admin" : "logout", db)));
      assert.equal(wins.filter(Boolean).length, 1);
    });

    await t.test("TTL: revoked sessions and expired tokens/throttles/events are removed by Mongo; active ones never are", { timeout: TTL_WAIT_MS + 30_000 }, async () => {
      const past = new Date(Date.now() - 60_000), future = new Date(Date.now() + 3_600_000), at = new Date();
      const revokedPast = { ...buildSession({ userId: "u-ttl", tokenHash: H("1") }, at, "ttl-sess-past"), tenantId: "toc", revokedAt: at.toISOString(), revokedReason: "logout" as const, purgeAt: past };
      const revokedFuture = { ...buildSession({ userId: "u-ttl", tokenHash: H("2") }, at, "ttl-sess-future"), tenantId: "toc", ...revocationFields("admin", at) };
      const active = { ...buildSession({ userId: "u-ttl", tokenHash: H("3") }, new Date(Date.now() - 400 * 86_400_000), "ttl-sess-active"), tenantId: "toc" };
      await raw("user_sessions").insertMany([revokedPast, revokedFuture, active]);
      await raw("user_tokens").insertMany([{ ...buildToken({ userId: "u-ttl", purpose: "verify_email", tokenHash: H("4") }, at, "ttl-tok-past"), tenantId: "toc", purgeAt: past }, { ...buildToken({ userId: "u-ttl", purpose: "verify_email", tokenHash: H("5") }, at, "ttl-tok-future"), tenantId: "toc" }]);
      await raw("auth_throttles").insertMany([{ ...buildThrottle({ subjectHash: H("6"), failures: 1 }, at, "ttl-thr-past"), tenantId: "toc", purgeAt: past }, { ...buildThrottle({ subjectHash: H("7"), failures: 1 }, at, "ttl-thr-future"), tenantId: "toc" }]);
      await raw("auth_events").insertMany([{ ...buildAuthEvent({ type: "login_ok", outcome: "ok" }, at, "ttl-ev-past"), tenantId: "toc", purgeAt: past }, { ...buildAuthEvent({ type: "login_ok", outcome: "ok" }, at, "ttl-ev-future"), tenantId: "toc" }]);
      const ids = { user_sessions: ["ttl-sess-past"], user_tokens: ["ttl-tok-past"], auth_throttles: ["ttl-thr-past"], auth_events: ["ttl-ev-past"] } as const;
      const goneAll = async () => { for (const [coll, list] of Object.entries(ids)) if (await raw(coll).countDocuments({ _id: { $in: [...list] } })) return false; return true; };
      const deadline = Date.now() + TTL_WAIT_MS;
      while (!(await goneAll()) && Date.now() < deadline) await sleep(2000);
      assert.equal(await goneAll(), true, "Mongo's TTL monitor removed every row whose purgeAt is in the past");
      assert.ok(await raw("user_sessions").findOne({ _id: "ttl-sess-active" }), "an active session (no purgeAt) is never removed");
      assert.ok(await raw("user_sessions").findOne({ _id: "ttl-sess-future" }), "a revoked session before its purgeAt stays");
      assert.ok(await raw("user_tokens").findOne({ _id: "ttl-tok-future" }));
      assert.ok(await raw("auth_throttles").findOne({ _id: "ttl-thr-future" }));
      assert.ok(await raw("auth_events").findOne({ _id: "ttl-ev-future" }));
      assert.ok(await userSessions("toc", db).findOne({ _id: "ttl-sess-active" }));
    });
  } finally {
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
