// user-accounts A6 (D-206): real-Mongo proof of what the in-memory store cannot show - the last-admin race (same instance and two
// instances), tenant scoping through scopedCollection, single-use token consumption of an admin-issued link, throttle unlock, session
// revocation. Opt-in: set LKB_UA_ADMIN_MONGO_URI to a LOOPBACK mongod. Creates its own throwaway database `lkb_ua_admin_test_<hex>`,
// applies the A1 migration, drops it afterwards. Nothing else is touched. Without the variable the test is SKIPPED (a gap, not a pass).
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { authThrottles, buildThrottle, consumeToken, findUserById, insertUser, listAuthEvents, recordAuthEvent, users } from "@lkb/db";
import { MongoClient, type Db } from "mongodb";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createMongoSessionStore } from "../composition/integrations/user-accounts.js";
import { createServer } from "../server.js";
import { sha256Hex } from "../hash.js";
import { createAdminRouter } from "./admin-router.js";
import { createAdminService, createMongoAdminStore } from "./admin-service.js";
import { COOKIE_NAME_SECURE } from "./cookie.js";
import { csrfTokenFor } from "./csrf.js";
import { createSessionAuth } from "./principal.js";
import { createSessionService } from "./sessions.js";

const uri = process.env.LKB_UA_ADMIN_MONGO_URI;
const enabled = typeof uri === "string" && uri.length > 0;
const require = createRequire(import.meta.url);
const migration = require("../../../../migrations/20261029100000-user-accounts.cjs") as { up(db: Db): Promise<void> };
const PHC = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo";
const ORIGIN = "https://kb.example.org", SECRET = "k".repeat(48);
const subjectHash = (t: string, e: string) => createHash("sha256").update(`mongo-test:${t}:${e}`).digest("hex");

test("admin API on a real mongod", { skip: !enabled, timeout: 180_000 }, async (t) => {
  const url = new URL(uri!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "loopback mongod only");
  const dbName = `lkb_ua_admin_test_${randomBytes(6).toString("hex")}`;
  assert.match(dbName, /^lkb_ua_admin_test_[a-z0-9_]+$/);
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  let closeHttp: () => Promise<void> = async () => {};
  const saved = { w: process.env.MONGO_WORK_DB, u: process.env.MONGODB_URL, d: process.env.MONGODB_DB };
  process.env.MONGO_WORK_DB = dbName; process.env.MONGODB_URL = uri!; delete process.env.MONGODB_DB; // the migration's work-database guard
  try {
    await migration.up(db);
    const sessions = createSessionService({ store: createMongoSessionStore(db), users: { getUser: (tn, id) => findUserById(tn, id, db) } });
    const adminStore = createMongoAdminStore(db);
    const svc = () => createAdminService({ store: adminStore, subjectHash, publicOrigin: ORIGIN, basePath: "/knowledgebase" });
    const adminRouter = createAdminRouter({ store: adminStore, subjectHash, publicOrigin: ORIGIN, basePath: "/knowledgebase" });
    const userAccounts = { session: createSessionAuth({ sessions, cookie: { basePath: "", production: true }, csrf: { secret: SECRET, allowedOrigins: [ORIGIN] } }), adminRouter };
    const app = createServer(buildTestDeps({ keyStore: fakeKeyStore({}), userAccounts }));
    const http = app.listen(0, "127.0.0.1"); await new Promise((r) => http.once("listening", r));
    closeHttp = () => new Promise<void>((r) => http.close(() => r()));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const live = new Map<string, { token: string; sessionId: string }>();
    const login = async (tenantId: string, userId: string) => { const { token, session } = await sessions.create(tenantId, userId); live.set(userId, { token, sessionId: session._id }); };
    const call = async (as: string, method: string, path: string, body?: unknown) => {
      const s = live.get(as)!;
      const res = await fetch(base + path, { method, headers: { connection: "close", cookie: `${COOKIE_NAME_SECURE}=${s.token}`, origin: ORIGIN, "x-lkb-csrf": csrfTokenFor(s.sessionId, SECRET), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await res.text();
      return { status: res.status, text, json: (() => { try { return JSON.parse(text) as Record<string, any>; } catch { return null; } })() };
    };
    let n = 0;
    const mk = async (tenantId: string, status: "active" | "pending" | "unverified", role?: "admin" | "member" | "viewer") => {
      const tag = `u${++n}_${randomBytes(3).toString("hex")}`;
      const { _id: id } = await insertUser(tenantId, { emailNormalized: `${tag}@example.org`, displayName: tag, passwordHash: PHC, status, ...(role ? { role } : {}) }, db);
      await login(tenantId, id);
      return id;
    };
    const adminCount = (tenantId: string) => users(tenantId, db).countDocuments({ status: "active", role: "admin" });
    const wipe = async (tenantId: string) => { await users(tenantId, db).deleteMany({}); };

    await t.test("[A6-3] concurrent cross-demotion of both admins over HTTP (real Mongo) leaves exactly one admin, 10 rounds", async () => {
      for (let i = 0; i < 10; i++) {
        const tn = `race${i}`;
        const x = await mk(tn, "active", "admin"), y = await mk(tn, "active", "admin");
        const [r1, r2] = await Promise.all([call(x, "POST", `/admin/users/${y}/role`, { role: "member" }), call(y, "POST", `/admin/users/${x}/role`, { role: "member" })]);
        assert.equal(await adminCount(tn), 1, `round ${i}: ${r1.status}/${r2.status}`);
        assert.ok([r1.status, r2.status].includes(200));
      }
    });

    await t.test("[A6-3] two service instances (separate locks) racing demote/disable never leave zero admins, 40 rounds", async () => {
      const outcomes = new Map<string, number>();
      for (let i = 0; i < 40; i++) {
        const tn = `inst${i}`;
        const x = await mk(tn, "active", "admin"), y = await mk(tn, "active", "admin");
        const [a, b] = await Promise.all(i % 2 === 0
          ? [svc().setRole({ tenantId: tn, userId: x }, y, { role: "member" }), svc().setRole({ tenantId: tn, userId: y }, x, { role: "member" })]
          : [svc().disable({ tenantId: tn, userId: x }, y), svc().disable({ tenantId: tn, userId: y }, x)]);
        const left = await adminCount(tn);
        assert.ok(left >= 1, `round ${i}: no admin left (${a.ok}/${b.ok})`);
        const key = `${a.ok ? "ok" : (a as { error: string }).error}/${b.ok ? "ok" : (b as { error: string }).error}->${left}`;
        outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
      }
      console.log("two-instance outcomes:", JSON.stringify([...outcomes]));
    });

    await t.test("[A6-2] tenant isolation on real scoped collections: B's admin gets 404 for A's users on every route; nothing changes", async () => {
      const a = await mk("tenA", "active", "admin"), p = await mk("tenA", "pending"), b = await mk("tenB", "active", "admin");
      assert.equal((await call(b, "GET", `/admin/users/${p}`)).status, 404);
      for (const [action, body] of [["approve", { role: "member" }], ["reject", {}], ["disable", {}], ["revoke-sessions", {}], ["unlock", {}], ["issue-link", { purpose: "password_reset" }]] as Array<[string, unknown]>)
        assert.equal((await call(b, "POST", `/admin/users/${p}/${action}`, body)).status, 404, action);
      assert.equal((await findUserById("tenA", p, db))!.status, "pending");
      assert.ok(!(await call(b, "GET", "/admin/users?limit=200")).text.includes(p));
      assert.equal((await listAuthEvents("tenA", {}, db)).rows.length, 0);
      assert.equal((await call(a, "POST", `/admin/users/${p}/approve`, { role: "viewer" })).status, 200);
      assert.equal((await findUserById("tenA", p, db))!.role, "viewer");
      assert.equal((await listAuthEvents("tenB", {}, db)).rows.length, 0);
    });

    await t.test("[A6-5] disable / revoke-sessions: the target's next request is 401 against the real session store", async () => {
      const tn = "tenS";
      const adm = await mk(tn, "active", "admin"), m = await mk(tn, "active", "member"), v = await mk(tn, "active", "viewer");
      assert.equal((await call(m, "GET", "/admin/users")).status, 403);
      assert.equal((await call(adm, "POST", `/admin/users/${m}/disable`, {})).json?.revokedSessions, 1);
      assert.equal((await call(m, "GET", "/admin/users")).status, 401);
      assert.equal((await call(v, "GET", "/admin/users")).status, 403);
      assert.equal((await call(adm, "POST", `/admin/users/${v}/revoke-sessions`, {})).json?.revokedSessions, 1);
      assert.equal((await call(v, "GET", "/admin/users")).status, 401);
      const types = (await listAuthEvents(tn, {}, db)).rows.map((e) => e.type).sort();
      assert.deepEqual(types, ["disabled", "session_revoked"]);
    });

    await t.test("[A5-replacement] an admin-issued link is single-use against the real user_tokens collection; re-issue voids the older link; no raw token is persisted", async () => {
      const tn = "tenL";
      const adm = await mk(tn, "active", "admin"), un = await mk(tn, "unverified");
      const r0 = await call(adm, "POST", `/admin/users/${un}/issue-link`, { purpose: "verify_email" });       const first = r0.json?.link as string;
      const second = (await call(adm, "POST", `/admin/users/${un}/issue-link`, { purpose: "verify_email" })).json?.link as string;
      assert.match(first, /^https:\/\/kb\.example\.org\/knowledgebase\/verify#token=/);
      const tok = (l: string) => l.split("#token=")[1]!;
      assert.equal(await consumeToken(tn, sha256Hex(tok(first)), "verify_email", db), null, "the superseded link is dead");
      assert.equal(await consumeToken(tn, sha256Hex(tok(second)), "password_reset", db), null, "wrong purpose");
      assert.equal(await consumeToken("otherTenant", sha256Hex(tok(second)), "verify_email", db), null, "other tenant");
      assert.equal(await consumeToken(tn, sha256Hex(tok(second)), "verify_email", db), un, "the live link verifies once");
      assert.equal(await consumeToken(tn, sha256Hex(tok(second)), "verify_email", db), null, "...and only once");
      const dump = JSON.stringify([await db.collection("user_tokens").find({}).toArray(), await db.collection("auth_events").find({}).toArray()]);
      assert.ok(!dump.includes(tok(first)) && !dump.includes(tok(second)), "no raw token in user_tokens or auth_events");
      const row = await db.collection("user_tokens").findOne({ tokenHash: sha256Hex(tok(second)) });
      assert.deepEqual([row?.issuedVia, row?.issuedBy, row?.tenantId], ["admin", adm, tn]);
    });

    await t.test("[A6-1] unlock deletes the real auth_throttles row of this tenant and leaves another tenant's row with the same subject", async () => {
      const adm = await mk("tenU", "active", "admin"), m = await mk("tenU", "active", "member");
      const email = (await findUserById("tenU", m, db))!.emailNormalized;
      const h = subjectHash("tenU", email);
      await authThrottles("tenU", db).insertOne(buildThrottle({ subjectHash: h, failures: 5, lockedUntil: new Date(Date.now() + 600_000) }));
      await authThrottles("tenV", db).insertOne(buildThrottle({ subjectHash: h, failures: 5 }));
      const r = await call(adm, "POST", `/admin/users/${m}/unlock`, {});
      assert.deepEqual([r.status, r.json?.cleared], [200, true]);
      assert.equal(await authThrottles("tenU", db).countDocuments({ subjectHash: h }), 0);
      assert.equal(await authThrottles("tenV", db).countDocuments({ subjectHash: h }), 1);
    });

    await t.test("[A6-2] audit and listing paginate on the real collections", async () => {
      const tn = "tenP";
      const adm = await mk(tn, "active", "admin");
      const ps = [await mk(tn, "pending"), await mk(tn, "pending"), await mk(tn, "pending")];
      const l1 = await call(adm, "GET", "/admin/users?status=pending&limit=2");
      assert.equal(l1.json?.users.length, 2);
      const l2 = await call(adm, "GET", `/admin/users?status=pending&limit=2&cursor=${l1.json?.next}`);
      assert.deepEqual([l2.json?.users.length, l2.json?.next, l1.json?.pendingCount], [1, null, 3]);
      for (const p of ps) assert.equal((await call(adm, "POST", `/admin/users/${p}/approve`, { role: "member" })).status, 200);
      await recordAuthEvent(tn, { type: "login_ok", outcome: "ok" }, db);
      const a1 = await call(adm, "GET", "/admin/audit?limit=3");
      const a2 = await call(adm, "GET", `/admin/audit?limit=3&cursor=${a1.json?.next}`);
      assert.deepEqual([a1.json?.events.length, a2.json?.events.length, a2.json?.next], [3, 1, null]);
      assert.ok(!/purgeAt|passwordHash|argon2/.test(a1.text + a2.text + l1.text));
    });

    for (const tn of ["tenA", "tenB", "tenS", "tenL", "tenU", "tenP"]) await wipe(tn);
  } finally {
    await closeHttp();
    await client.db(dbName).dropDatabase();
    await client.close();
    for (const [k, v] of [["MONGO_WORK_DB", saved.w], ["MONGODB_URL", saved.u], ["MONGODB_DB", saved.d]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
