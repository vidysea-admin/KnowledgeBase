/**
 * Real-Mongo proof of what the in-memory store cannot show (W5): the unique partial index decides the one-live-link race (R-2),
 * the closed whatsapp_links / whatsapp_events schemas accept every row and event the service writes, CAS transitions pick one
 * winner, archiverOwnerId is unique across tenants, and a concurrent connect provisions once. Opt-in: set
 * WA_REVIEW_TEST_MONGO_URL to a TEST mongod. Creates a throwaway database `lkb_test_wa_links_<hex>`, applies the W1 migration
 * and drops it afterwards; no other database is touched. Without the variable the test is SKIPPED (a gap, not a pass).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { createArchiverClient } from "../archiver/client.js";
import { loadArchiverConfig } from "../archiver/config.js";
import { startFakeArchiver } from "../archiver/fake-archiver.js";
import { createLinkDataPort } from "../review/store.js";
import { createMongoLinksStore } from "./router.js";
import { createLinksService, type Principal } from "./service.js";
import { NOTICE } from "./links.testsupport.js";

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
const require = createRequire(import.meta.url);
const migration = require("../../../../../migrations/20261029120000-whatsapp-links.cjs") as { up(db: Db): Promise<void> };
const member = (userId: string, tenantId = "tenant-1"): Principal => ({ tenantId, kind: "session", userId, actor: `user:${userId}`, link: true, admin: false });
const linkId = (r: unknown): string => ((r as { value: { link: { id: string } } }).value).link.id;
const admin: Principal = { tenantId: "tenant-1", kind: "session", userId: "u-admin", actor: "user:u-admin", link: true, admin: true };

test("W5 real-Mongo: index-decided races, closed schemas, CAS winners, single provisioning", { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a TEST mongod)" }, async () => {
  const name = `lkb_test_wa_links_${randomBytes(4).toString("hex")}`;
  assert.match(name, /^lkb_test_wa_links_[0-9a-f]{8}$/);
  const client = await new MongoClient(url!).connect(), fake = await startFakeArchiver();
  const saved = { w: process.env.MONGO_WORK_DB, u: process.env.MONGODB_URL, d: process.env.MONGODB_DB };
  process.env.MONGO_WORK_DB = name; process.env.MONGODB_URL = url!; delete process.env.MONGODB_DB; // the migration's work-database guard (kept intact): point it at this test's throwaway database
  try {
    const db = client.db(name); await migration.up(db);
    const archiver = createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!);
    const store = createMongoLinksStore(db);
    const svc = createLinksService({ store, archiver, data: createLinkDataPort(db), notice: () => NOTICE, countActiveAdmins: async () => 2, userStatus: async () => ({ status: "active", role: "member" }) });
    const ask = (p: Principal) => svc.request(p, { label: "Phone", noticeVersion: NOTICE.version });

    const race = await Promise.all(Array.from({ length: 6 }, () => ask(member("u-race"))));
    assert.equal(race.filter(r => r.ok).length, 1, "the unique partial index lets exactly one request live (R-2)");
    assert.deepEqual([...new Set(race.filter(r => !r.ok).map(r => (r as { error: string }).error))], ["link_exists"]);

    const id = linkId(await ask(member("u-one")));
    const approvals = await Promise.all([1, 2, 3].map(() => svc.approve(admin, id, {})));
    assert.equal(approvals.filter(r => r.ok).length, 1, "approve is a CAS");

    const connects = await Promise.all(Array.from({ length: 5 }, () => svc.connect(member("u-one"), id)));
    assert.ok(connects.every(r => r.ok), JSON.stringify(connects.find(r => !r.ok)));
    const row = await store.get("tenant-1", id);
    assert.match(row!.archiverOwnerId!, /^[0-9a-f]{24}$/);
    fake.control.setStatus(row!.archiverOwnerId!, "connected", { hint: "47" });
    await Promise.all([1, 2, 3, 4].map(() => svc.connect(member("u-one"), id)));
    assert.equal(await db.collection("whatsapp_events").countDocuments({ linkId: id, eventType: "link.connected" }), 1, "the activation CAS has one winner");
    assert.equal((await store.get("tenant-1", id))!.state, "active");

    assert.equal(await store.setOwnerId("tenant-2", id, row!.archiverOwnerId!), "gone", "another tenant cannot touch the row");
    const other = linkId(await ask(member("u-two")));
    await svc.approve(admin, other, {});
    assert.equal(await store.setOwnerId("tenant-1", other, row!.archiverOwnerId!), "conflict", "archiverOwnerId is unique across links");

    assert.equal((await svc.suspend(admin, id, {})).ok, true);
    assert.equal((await svc.resume(admin, id)).ok, true);
    assert.equal((await svc.unlink(member("u-one"), id, {})).ok, true);
    assert.equal((await svc.request(member("u-one"), { label: "Again", noticeVersion: NOTICE.version })).ok, true, "an unlinked link frees the slot");
    assert.equal(JSON.stringify(await db.collection("whatsapp_events").find({}).toArray()).includes("awaiting_qr"), false);
  } finally {
    for (const [k, v] of [["MONGO_WORK_DB", saved.w], ["MONGODB_URL", saved.u], ["MONGODB_DB", saved.d]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await client.db(name).dropDatabase(); await client.close(); await fake.stop();
  }
});
