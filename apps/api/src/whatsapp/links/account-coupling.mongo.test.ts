/**
 * Real-Mongo composition proof for W8 R-10: `buildUserAccounts(env, db, log)` with NO injected hook (the production composition) over a real replica set.
 * Disabling / demoting an owner through the real /admin HTTP surface suspends their ACTIVE whatsapp_links row in Mongo (account_inactive, system actor,
 * one event, closed schemas accept it); re-enabling resumes nothing; another tenant's and another user's links are untouched.
 * Opt-in: WA_REVIEW_TEST_MONGO_URL must point at a TEST mongod. Creates the throwaway database `lkb_test_wa_acct_<hex>`, applies the user-accounts and W1 + W8
 * migrations and drops it afterwards. Without the variable the test is SKIPPED, which is a gap and not a pass.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { insertUser } from "@lkb/db";
import { MongoClient, type Db } from "mongodb";
import { buildUserAccounts } from "../../composition/integrations/user-accounts.js";
import { buildTestDeps, fakeKeyStore } from "../../fixtures.js";
import { createServer } from "../../server.js";
import { COOKIE_NAME_SECURE } from "../../user-accounts/cookie.js";
import { csrfTokenFor } from "../../user-accounts/csrf.js";
import { createMongoLinksStore } from "./router.js";
import { REVIEW_TIME } from "../review/test-fixtures.js";

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
const require = createRequire(import.meta.url);
const ua1 = require("../../../../../migrations/20261029100000-user-accounts.cjs") as { up(db: Db): Promise<void> };
const m1 = require("../../../../../migrations/20261029120000-whatsapp-links.cjs") as { up(db: Db): Promise<void> };
const m2 = require("../../../../../migrations/20261030120000-whatsapp-links-unlink-pending.cjs") as { up(db: Db): Promise<void> };
const PHC = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo";
const ORIGIN = "https://kb.example.org", SECRET = "k".repeat(48), TA = "toc", TB = "other";

test("W8 R-10 real-Mongo composition: /admin disable and viewer-demotion suspend the owner's ACTIVE link through buildUserAccounts' default hook; enable resumes nothing", { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a TEST mongod)", timeout: 120000 }, async () => {
  const name = `lkb_test_wa_acct_${randomBytes(4).toString("hex")}`;
  assert.match(name, /^lkb_test_wa_acct_[0-9a-f]{8}$/);
  const client = await new MongoClient(url!).connect();
  const saved = { w: process.env.MONGO_WORK_DB, u: process.env.MONGODB_URL, d: process.env.MONGODB_DB };
  process.env.MONGO_WORK_DB = name; process.env.MONGODB_URL = url!; delete process.env.MONGODB_DB; // the migrations' work-database guard (kept intact)
  let closeHttp: () => Promise<void> = async () => {};
  try {
    const db = client.db(name);
    await ua1.up(db); await m1.up(db); await m2.up(db);
    const warned: string[] = [], log = { warn: (m: string) => { warned.push(m); }, error: (m: string) => { warned.push(m); } };
    const ua = buildUserAccounts({ AUTH_CSRF_SECRET: SECRET, USER_SIGNUP_TENANT: TA, APP_PUBLIC_ORIGIN: ORIGIN, NODE_ENV: "production" }, db, log);
    assert.ok(ua, "user accounts composed");
    const app = createServer(buildTestDeps({ keyStore: fakeKeyStore({}), corsOrigins: [ORIGIN], userAccounts: ua }));
    const http = app.listen(0, "127.0.0.1"); await new Promise(r => http.once("listening", r));
    closeHttp = () => new Promise<void>(r => http.close(() => r()));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const mk = async (tenantId: string, role: "admin" | "member") => { const tag = `u${randomBytes(3).toString("hex")}`; return (await insertUser(tenantId, { emailNormalized: `${tag}@example.org`, displayName: tag, passwordHash: PHC, status: "active", role }, db))._id; };
    const adminId = await mk(TA, "admin"), spare = await mk(TA, "admin"), owner = await mk(TA, "member"), owner2 = await mk(TA, "member"), bystander = await mk(TA, "member"), otherTenant = await mk(TB, "member");
    void spare;
    const { token, session } = await ua!.sessions.create(TA, adminId);
    const post = async (path: string, body: unknown = {}) => {
      const res = await fetch(base + path, { method: "POST", headers: { connection: "close", "content-type": "application/json", cookie: `${COOKIE_NAME_SECURE}=${token}`, origin: ORIGIN, "x-lkb-csrf": csrfTokenFor(session._id, SECRET) }, body: JSON.stringify(body) });
      return { status: res.status, text: await res.text() };
    };
    const store = createMongoLinksStore(db);
    const live = async (tenantId: string, userId: string) => (await store.insert(tenantId, { userId, label: "Phone", state: "active", live: true, approvedBy: "user:seed-admin", approvedAt: REVIEW_TIME, activatedAt: REVIEW_TIME, archiverOwnerId: randomBytes(12).toString("hex"), noticeVersion: "v1", noticeShownAt: REVIEW_TIME, requestedAt: REVIEW_TIME } as never)) as unknown as { _id: string };
    const l1 = await live(TA, owner), l2 = await live(TA, owner2), lb = await live(TA, bystander), lo = await live(TB, otherTenant);
    const state = async (tenantId: string, id: string) => (await store.get(tenantId, id))!;

    const off = await post(`/admin/users/${owner}/disable`);
    assert.equal(off.status, 200, off.text);
    const s1 = await state(TA, l1._id);
    assert.deepEqual([s1.state, s1.live, s1.suspendedReason, s1.suspendedBy], ["suspended", true, "account_inactive", "system:account"]);
    assert.equal(await db.collection("whatsapp_events").countDocuments({ linkId: l1._id, eventType: "link.suspended" }), 1, "one event; the closed events schema accepted it");
    assert.equal((await post(`/admin/users/${owner}/enable`)).status, 200);
    assert.equal((await state(TA, l1._id)).state, "suspended", "re-enabling resumes nothing");

    assert.equal((await post(`/admin/users/${owner2}/role`, { role: "viewer" })).status, 200);
    assert.equal((await state(TA, l2._id)).state, "suspended", "demotion to viewer suspends");
    assert.equal((await state(TA, lb._id)).state, "active", "another user's link is untouched");
    assert.equal((await state(TB, lo._id)).state, "active", "another tenant's link is untouched");
    assert.equal(await db.collection("whatsapp_events").countDocuments({ eventType: "link.suspended" }), 2);
    assert.deepEqual(warned, [], "no hook failure was logged");
  } finally {
    await closeHttp();
    for (const [k, v] of [["MONGO_WORK_DB", saved.w], ["MONGODB_URL", saved.u], ["MONGODB_DB", saved.d]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await client.db(name).dropDatabase(); await client.close();
  }
});
