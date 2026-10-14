/**
 * Real-Mongo transaction/restart proof. Skipped unless WA_REVIEW_TEST_MONGO_URL names a REPLICA SET
 * (transactions need one). Writes only to a throwaway database named lkb_test_wa_review_*; the
 * production database `lkb` is refused structurally and is never opened.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { createWhatsAppReviewWiring } from "./compose.js";
import { auditWhatsAppQuarantine } from "./quarantine.js";

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
const OWNER = "6a8d0c692fcc75f0e911b878";
const opts = { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a replica-set test Mongo)" };

test("real Mongo: candidate-only ingest, atomic approve, restart and re-ingest preserve decisions, tenant isolation", opts, async () => {
  const name = `lkb_test_wa_review_${Date.now()}`;
  assert.match(name, /^lkb_test_wa_review_\d+$/u); assert.notEqual(name, "lkb");
  const wire = (client: MongoClient) => createWhatsAppReviewWiring({
    appDb: () => client.db(name), resolveOwner: async () => OWNER,
    listGroups: async () => [{ groupJid: "g@g.us", ownerUserId: OWNER, subject: "G", trackedPersonCount: 1 }],
    fetchMessages: async () => [{ messageId: "m1", personId: "p1", displayName: "Expert", text: "Scholarship closes Friday.", ts: "2026-10-14T10:00:00.000Z" }],
  });
  const first = await new MongoClient(url!).connect();
  try {
    await first.db(name).collection("whatsapp_candidates").createIndex({ tenantId: 1, _id: 1 });
    const w1 = wire(first);
    await w1.whatsapp.ingestGroup("tenant-a", "g@g.us");
    const [cand] = await w1.repository.list("tenant-a");
    assert.ok(cand); assert.equal(await first.db(name).collection("claims").countDocuments(), 0);
    assert.equal((await w1.repository.decide("tenant-a", cand._id, "approved", "key:1")).result, "ok");
    assert.equal(await first.db(name).collection("claims").countDocuments({ tenantId: "tenant-a" }), 1);
    const [a, b] = await Promise.all([w1.repository.decide("tenant-a", cand._id, "rejected", "key:2"), w1.repository.decide("tenant-a", cand._id, "rejected", "key:3")]);
    assert.ok([a, b].every(r => r.result === "conflict"), "approved candidate cannot be rejected");
    await first.close();
    const second = await new MongoClient(url!).connect(); // simulated process restart
    try {
      const w2 = wire(second);
      await w2.whatsapp.ingestGroup("tenant-a", "g@g.us");
      const got = await w2.repository.get("tenant-a", cand._id);
      assert.equal(got?.status, "approved");
      assert.equal(await second.db(name).collection("whatsapp_candidates").countDocuments({ tenantId: "tenant-a" }), 1);
      assert.equal(await w2.repository.get("tenant-b", cand._id), null);
      assert.equal((await w2.repository.decide("tenant-b", cand._id, "approved", "key:9")).result, "not_found");
      assert.deepEqual(await auditWhatsAppQuarantine(second.db(name), "tenant-a"), []);
    } finally { await second.db(name).dropDatabase(); await second.close(); }
  } finally { await first.close().catch(() => undefined); }
});
