/**
 * Real-Mongo proof for W8 (plan acceptance 6): unlink vs approve vs repeated unlink (the sync-driven retry) race on a real replica set.
 * Opt-in: WA_REVIEW_TEST_MONGO_URL must point at a TEST replica set (transactions are required by the approval path). Creates the throwaway
 * database `lkb_test_wa_unlink_<hex>`, applies the W1 + W8 migrations and drops it afterwards; no other database is touched. Without the variable the
 * test is SKIPPED, which is a gap and not a pass.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import type { Sessions, Sources, Turns } from "@lkb/core";
import { createArchiverClient } from "../archiver/client.js";
import { loadArchiverConfig } from "../archiver/config.js";
import { startFakeArchiver } from "../archiver/fake-archiver.js";
import { detectWhatsAppReviewCandidates } from "../review/detection.js";
import { materializeWhatsAppClaim, whatsAppClaimId } from "../review/materializer.js";
import { createLinkDataPort, createMongoWhatsAppReviewRepository } from "../review/store.js";
import { reviewInput, REVIEW_TIME } from "../review/test-fixtures.js";
import { createMongoLinksStore } from "./router.js";
import { createLinksService, type Principal } from "./service.js";
import { NOTICE } from "./links.testsupport.js";

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
const require = createRequire(import.meta.url);
const m1 = require("../../../../../migrations/20261029120000-whatsapp-links.cjs") as { up(db: Db): Promise<void> };
const m2 = require("../../../../../migrations/20261030120000-whatsapp-links-unlink-pending.cjs") as { up(db: Db): Promise<void> };
const TENANT = `wa-unlink-${randomUUID()}`;
const member = (userId: string): Principal => ({ tenantId: TENANT, kind: "session", userId, actor: `user:${userId}`, link: true, admin: false });
const admin: Principal = { tenantId: TENANT, kind: "session", userId: "u-admin", actor: "user:u-admin", link: true, admin: true };
const linkId = (r: unknown): string => ((r as { value: { link: { id: string } } }).value).link.id;

test("W8 real-Mongo: unlink vs approval vs repeated unlink x20 - eligibility moves once, consent ends withdrawn, no claim is born from a withdrawn source", { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a TEST replica set)", timeout: 180000 }, async () => {
  const name = `lkb_test_wa_unlink_${randomBytes(4).toString("hex")}`;
  assert.match(name, /^lkb_test_wa_unlink_[0-9a-f]{8}$/);
  const client = await new MongoClient(url!).connect(), fake = await startFakeArchiver();
  const tally = { approvalFirst: 0, unlinkFirst: 0 };
  try {
    const db = client.db(name);
    assert.ok((await db.command({ hello: 1 })).setName, "replica set required; standalone is not acceptance");
    await m1.up(db); await m2.up(db);
    const archiver = createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!);
    const store = createMongoLinksStore(db);
    const svc = createLinksService({ store, archiver, data: createLinkDataPort(db), notice: () => NOTICE, countActiveAdmins: async () => 2, userStatus: async () => ({ status: "active", role: "member" }) });
    const reviews = createMongoWhatsAppReviewRepository(db, { materialize: materializeWhatsAppClaim });
    const bystander = linkId(await svc.request(member("u-bystander"), { label: "Other", noticeVersion: NOTICE.version }));

    for (let i = 0; i < 20; i++) {
      const user = `u-${i}`, id = linkId(await svc.request(member(user), { label: "Phone", noticeVersion: NOTICE.version }));
      assert.equal((await svc.approve(admin, id, {})).ok, true);
      assert.equal(await store.setOwnerId(TENANT, id, randomBytes(12).toString("hex")), "set");
      assert.ok(await store.transition(TENANT, id, { from: ["approved"], to: "active", set: { activatedAt: REVIEW_TIME }, require: ["owner_id"] }));
      const base = reviewInput(`Scholarship ${i} closes Friday.`, TENANT), sourceId = `src-${i}`;
      const input = { source: { ...base.source, _id: sourceId, captureMode: "provided", hash: randomUUID(), sourceMeta: { whatsappLinkId: id }, consent: { given: true, recordedBy: "test-owner" }, createdAt: REVIEW_TIME } as Sources,
        session: { ...base.session, _id: `ses-${i}`, sourceId, title: "t", date: "2026-10-14", status: { transcribe: "done", index: "pending" } } as unknown as Sessions,
        turns: base.turns.map(t => ({ ...t, _id: `turn-${i}`, sessionId: `ses-${i}` })) as unknown as Turns[] };
      await db.collection<Sources>("sources").insertOne(input.source); await db.collection<Sessions>("sessions").insertOne(input.session); await db.collection<Turns>("turns").insertMany([...input.turns]);
      const row = detectWhatsAppReviewCandidates(TENANT, input as never, REVIEW_TIME)[0]!;
      await reviews.insert(TENANT, [row]);

      const [approval] = await Promise.allSettled([reviews.decide(TENANT, row._id, "approved", "reviewer"), svc.unlink(member(user), id, {}), svc.unlink(admin, id, {}), svc.unlink(member(user), id, {})]);
      const cand = (await db.collection("whatsapp_candidates").findOne({ _id: row._id as never }))!, claims = await db.collection("claims").countDocuments({ tenantId: TENANT, _id: whatsAppClaimId(row._id) } as never);
      const link = (await store.get(TENANT, id))!, src = (await db.collection<Sources>("sources").findOne({ _id: sourceId, tenantId: TENANT }))!;
      assert.equal(link.state, "unlinked"); assert.equal(link.live, false);
      assert.equal(src.consent?.given, false, "consent always ends withdrawn");
      assert.equal(await db.collection("whatsapp_events").countDocuments({ linkId: id, eventType: "link.unlinked" }), 1, "one transition, one event, however many unlinks raced");
      if (approval!.status === "fulfilled" && cand["status"] === "approved") { tally.approvalFirst++; assert.equal(claims, 1, "approval committed before the withdrawal: the claim stays (Q6=6a)"); }
      else { tally.unlinkFirst++; assert.equal(cand["status"], "rejected", "quarantined by the unlink"); assert.equal(claims, 0, "no claim from a withdrawn source"); }
      await assert.rejects(reviews.decide(TENANT, row._id, "approved", "late-reviewer"), /./, "an approval after the unlink fails closed");
      assert.equal((await db.collection("whatsapp_candidates").findOne({ _id: row._id as never }))!["status"], cand["status"], "a late approval changes nothing");
      assert.equal(((await svc.unlink(member(user), id, {})) as unknown as { value: { changed: boolean } }).value.changed, false, "repeat is idempotent");
    }
    assert.equal((await store.get(TENANT, bystander))!.state, "requested", "an unrelated link is untouched");
    assert.equal(JSON.stringify(await db.collection("whatsapp_events").find({}).toArray()).includes("Scholarship"), false, "no message text in events");
    console.log(`W8 race tally over 20 rounds: ${JSON.stringify(tally)}`);
  } finally { await client.db(name).dropDatabase(); await client.close(); await fake.stop(); }
});
