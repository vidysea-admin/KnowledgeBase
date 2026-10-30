// scripts/whatsapp/sync-links.mongo.test.mjs - W9 real-Mongo proof. Skipped unless W9_TEST_MONGO_URL names a REPLICA SET (review ingest uses
// transactions). Writes only to a throwaway database named lkb_test_w9_*; a database called lkb/lkb_prod is refused structurally.
//   node --test --import tsx scripts/whatsapp/sync-links.mongo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { runCycle, createWiredDeps } from "./sync-links.mjs";

const { applyWhatsappLinks } = createRequire(import.meta.url)("../../migrations/20261029120000-whatsapp-links.cjs");
const url = process.env.W9_TEST_MONGO_URL;
const opts = { skip: url ? false : "W9_TEST_MONGO_URL not set (needs a replica-set test Mongo)" };
const OA = "1".repeat(24), OB = "2".repeat(24), OC = "3".repeat(24), JG = "111111-1@g.us";
const LA = "a".repeat(24), LS = "b".repeat(24), LB = "c".repeat(24);

test("real Mongo: two links of one tenant sync only their own owner, suspended and other-tenant links never, re-run adds nothing", opts, async () => {
  const name = `lkb_test_w9_${Date.now()}`;
  assert.match(name, /^lkb_test_w9_\d+$/u); assert.notEqual(name, "lkb");
  const client = await new MongoClient(url).connect(), root = mkdtempSync(join(tmpdir(), "w9-mongo-")), db = client.db(name);
  try {
    await applyWhatsappLinks(db); // validators + unique partial indexes, as the migration will apply them
    await db.collection("whatsapp_candidates").createIndex({ tenantId: 1, _id: 1 });
    const at = "2026-10-30T10:00:00.000Z";
    const link = (tenantId, _id, userId, state, owner) => ({ tenantId, _id, userId, label: "t", state, live: ["active", "suspended"].includes(state), studentData: "no", archiverOwnerId: owner,
      approvedBy: "admin", approvedAt: at, activatedAt: at, ...(state === "suspended" ? { suspendedAt: at, suspendedBy: "admin", suspendedReason: "admin_action" } : {}), createdAt: at, updatedAt: at });
    await db.collection("whatsapp_links").insertMany([link("tenant-a", LA, "u1", "active", OA), link("tenant-a", LS, "u2", "suspended", OB), link("tenant-b", LB, "u3", "active", OC)]);
    const listed = [];
    const fetched = [];
    const storeOptions = {
      listGroups: async (owner) => { listed.push(owner); return [{ groupJid: JG, ownerUserId: owner, subject: "S", trackedPersonCount: 1 }]; },
      fetchMessages: async (_jid, owner) => { fetched.push(owner); return [{ messageId: `m-${owner}`, personId: `p-${owner}`, displayName: "Expert", text: `Scholarship closes Friday for ${owner.slice(0, 4)}.`, ts: "2026-10-14T10:00:00.000Z" }]; },
    };
    const deps = await createWiredDeps({ db, env: {}, root, log: () => {}, archiver: null, storeOptions });
    const first = await runCycle(deps);
    assert.deepEqual(first.map((r) => r.status), ["ok", "ok"]);
    assert.deepEqual([...new Set(fetched)].sort(), [OA, OC].sort(), "the suspended link's owner was never queried");
    const a = first.find((r) => r.linkId === LA);
    assert.equal(a.groups[0].fetched, 1); assert.equal(a.groups[0].newTurns, 1); assert.ok(a.groups[0].candidatesCreated >= 1);
    for (const [tenant, owner] of [["tenant-a", OA], ["tenant-b", OC]]) {
      const turns = await db.collection("turns").find({ tenantId: tenant }).toArray();
      assert.deepEqual(turns.map((t) => t.speakerRef), [`p-${owner}`], "each tenant holds only its own owner's turns");
    }
    assert.equal(await db.collection("whatsapp_sync_runs").countDocuments({ linkId: LS }), 0);
    assert.equal(await db.collection("whatsapp_sync_runs").countDocuments({ tenantId: "tenant-a" }), 1);
    const before = { turns: await db.collection("turns").countDocuments(), cands: await db.collection("whatsapp_candidates").countDocuments() };
    const second = await runCycle(deps);
    for (const r of second) assert.deepEqual([r.groups[0].newTurns, r.groups[0].candidatesCreated, r.groups[0].skippedDeleted], [0, 0, 0]);
    assert.deepEqual({ turns: await db.collection("turns").countDocuments(), cands: await db.collection("whatsapp_candidates").countDocuments() }, before, "idempotent: counts unchanged");
    const health = (await db.collection("whatsapp_links").findOne({ _id: LA })).health;
    assert.equal(health.lastRunAt.length > 0, true); assert.ok(health.lastSuccessAt); assert.deepEqual(health.flags, []);
    assert.equal((await db.collection("whatsapp_links").findOne({ _id: LS })).health, undefined, "suspended link untouched");
    assert.equal(await db.collection("whatsapp_sync_runs").countDocuments(), 4, "every run row passed the collection's strict validator");
  } finally { await db.dropDatabase(); await client.close(); rmSync(root, { recursive: true, force: true }); }
});
