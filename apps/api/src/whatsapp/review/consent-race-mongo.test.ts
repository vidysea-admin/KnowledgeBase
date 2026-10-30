/** Opt-in native replica-set acceptance. Never substitutes mock serialization for Mongo isolation. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import type { Sources, Sessions, Turns } from "@lkb/core";
import { createMongoWhatsAppReviewRepository, withdrawWhatsAppSourceConsent } from "./store.js";
import { materializeWhatsAppClaim, whatsAppClaimId } from "./materializer.js";
import { detectWhatsAppReviewCandidates } from "./detection.js";
import { createKnowledgeVisibility, type VisibilityClaim } from "../../visibility/knowledge.js";
import { reviewInput, REVIEW_TIME } from "./test-fixtures.js";

const enabled = process.env.LKB_WHATSAPP_CONSENT_MONGO_RUN === "1";
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { resolve, promise }; };

test("ISS-WAVECTORLESS-002 native consent/approval serialization, retries and withdrawal visibility", { skip: !enabled, timeout: 45000 }, async () => {
  const uri = process.env.LKB_WHATSAPP_CONSENT_MONGO_URI;
  const database = process.env.LKB_WHATSAPP_CONSENT_MONGO_DB;
  assert.ok(uri && database && /^lkb_wa_consent_test_[a-z0-9_]+$/u.test(database), "explicit isolated acceptance database required");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db(database); const hello = await db.command({ hello: 1 });
    assert.ok(hello.setName, "replica set required; standalone is not acceptance");
    for (const order of ["withdrawal-first", "approval-first", "publisher-failure"] as const) {
      const tenantId = `wa-consent-${randomUUID()}`;
      const input = reviewInput(undefined, tenantId);
      const source: Sources = { ...input.source, captureMode: "provided", hash: randomUUID(),
        consent: { given: true, recordedBy: "test-owner" }, createdAt: REVIEW_TIME };
      await db.collection<Sources>("sources").insertOne(source);
      await db.collection<Sessions>("sessions").insertOne({ ...input.session, title: "Native consent acceptance", date: "2026-10-14",
        status: { transcribe: "done", index: "pending" } });
      await db.collection<Turns>("turns").insertMany([...input.turns]);
      const row = detectWhatsAppReviewCandidates(tenantId, input, REVIEW_TIME)[0]!;
      let armed = false; const reached = deferred(); const resume = deferred();
      // Pause after the real source snapshot read, exactly as the recorded attack requires.
      const gatedDb = new Proxy(db, { get(target, key) {
        if (key === "collection") return (name: string) => {
          const collection = target.collection(name);
          return name !== "sources" ? collection : new Proxy(collection, { get(coll, member) {
            if (member === "findOne") return async (...args: Parameters<typeof collection.findOne>) => {
              const result = await collection.findOne(...args);
              if (armed) { armed = false; reached.resolve(); await resume.promise; }
              return result;
            };
            const value = Reflect.get(coll, member, coll); return typeof value === "function" ? value.bind(coll) : value;
          } });
        };
        const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
      } }) as Db;
      const store = createMongoWhatsAppReviewRepository(gatedDb, { materialize: async context => {
        await materializeWhatsAppClaim(context);
        if (order === "publisher-failure") throw new Error("native publisher rollback probe");
      } });
      try {
        await store.insert(tenantId, [row]);
        if (order === "withdrawal-first") {
          armed = true; const approval = store.decide(tenantId, row._id, "approved", "test-reviewer");
          const rejection = assert.rejects(approval, /source\/session evidence unavailable|authorization fence/);
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([reached.promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("source-read barrier not reached")), 10000); })]);
            await db.collection<Sources>("sources").updateOne({ _id: input.source._id, tenantId }, { $set: { "consent.given": false } });
          } finally { if (timer) clearTimeout(timer); resume.resolve(); }
          await rejection;
          assert.equal((await db.collection("whatsapp_candidates").findOne({ tenantId }))!.status, "needs-review");
          assert.equal(await db.collection("claims").countDocuments({ tenantId }), 0);
          assert.equal((await db.collection<Sources>("sources").findOne({ _id: input.source._id, tenantId }))!.consent.given, false);
        } else if (order === "approval-first") {
          assert.equal((await store.decide(tenantId, row._id, "approved", "test-reviewer")).result, "ok");
          const claim = await db.collection<VisibilityClaim>("claims").findOne({ _id: whatsAppClaimId(row._id), tenantId });
          assert.ok(claim); assert.equal(await createKnowledgeVisibility(db).claimVisible(tenantId, claim), true);
          await db.collection<Sources>("sources").updateOne({ _id: input.source._id, tenantId }, { $set: { "consent.given": false } });
          assert.equal(await createKnowledgeVisibility(db).claimVisible(tenantId, claim), false);
          await assert.rejects(store.decide(tenantId, row._id, "approved", "test-reviewer"), /source\/session evidence unavailable/);
          assert.equal(await db.collection("claims").countDocuments({ tenantId }), 1);
        } else {
          await assert.rejects(store.decide(tenantId, row._id, "approved", "test-reviewer"), /native publisher rollback probe/);
          assert.equal(await db.collection("claims").countDocuments({ tenantId }), 0);
          assert.equal((await db.collection<Sources>("sources").findOne({ _id: input.source._id, tenantId }))!.sourceMeta?.whatsappReviewFence, undefined);
          assert.equal((await db.collection("whatsapp_candidates").findOne({ tenantId }))!.status, "needs-review");
        }
      } finally {
        resume.resolve();
        // Delete only this run's random tenant in explicitly isolated test database.
        for (const name of ["claims", "whatsapp_candidates", "turns", "sessions", "sources"]) await db.collection(name).deleteMany({ tenantId });
      }
    }
  } finally { await client.close(); }
});

/** ISS-WAVECTORLESS-002 real-Mongo race: withdrawal and approval fired concurrently, many times.
 * Linearization contract per race: either approval commits first (claim exists, revision 2, then the
 * withdrawal applies on top) or withdrawal commits first (approval refused, no claim, revision 1).
 * Never an approved candidate/claim over a source whose consent was already withdrawn. */
test("ISS-WAVECTORLESS-002 concurrent withdrawal vs approval x50 on a real replica set", { skip: !enabled, timeout: 180000 }, async t => {
  const uri = process.env.LKB_WHATSAPP_CONSENT_MONGO_URI;
  const database = process.env.LKB_WHATSAPP_CONSENT_MONGO_DB;
  assert.ok(uri && database && /^lkb_wa_consent_test_[a-z0-9_]+$/u.test(database), "explicit isolated acceptance database required");
  const iterations = Number(process.env.LKB_WHATSAPP_CONSENT_RACE_ITERATIONS ?? 50);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const tally = { approvalFirst: 0, withdrawalFirst: 0 };
  try {
    const db = client.db(database);
    assert.ok((await db.command({ hello: 1 })).setName, "replica set required; standalone is not acceptance");
    for (let i = 0; i < iterations; i++) {
      const tenantId = `wa-race-${randomUUID()}`;
      const input = reviewInput(undefined, tenantId);
      const sources = db.collection<Sources>("sources");
      await sources.insertOne({ ...input.source, captureMode: "provided", hash: randomUUID(),
        consent: { given: true, recordedBy: "test-owner" }, createdAt: REVIEW_TIME });
      await db.collection<Sessions>("sessions").insertOne({ ...input.session, title: "Native consent race", date: "2026-10-14",
        status: { transcribe: "done", index: "pending" } });
      await db.collection<Turns>("turns").insertMany([...input.turns]);
      const row = detectWhatsAppReviewCandidates(tenantId, input, REVIEW_TIME)[0]!;
      // Order evidence: what the approval transaction itself saw of the source at the moment it published.
      // withTransaction may retry; the last attempt is the one that committed when approval returns ok.
      const seenInTxn: Array<{ consent: boolean | undefined; revision: unknown }> = [];
      const store = createMongoWhatsAppReviewRepository(db, { materialize: async context => {
        await materializeWhatsAppClaim(context);
        const inTxn = await context.db.collection<Sources>("sources").findOne({ _id: input.source._id, tenantId }, { session: context.session });
        seenInTxn.push({ consent: inTxn?.consent.given, revision: (inTxn?.sourceMeta as Record<string, unknown> | undefined)?.authorizationRevision });
      } });
      try {
        await store.insert(tenantId, [row]);
        const jitter = (i * 7) % 9; // 0..8 ms, deterministic spread of the withdrawal's start across the approval's life
        const [approval, withdrawal] = await Promise.allSettled([
          store.decide(tenantId, row._id, "approved", "test-reviewer"),
          (async () => { if (jitter) await new Promise(r => setTimeout(r, jitter)); await withdrawWhatsAppSourceConsent(db, tenantId, input.source._id, "test-owner"); })(),
        ]);
        assert.equal(withdrawal.status, "fulfilled", `iteration ${i}: withdrawal must always land: ${withdrawal.status === "rejected" ? String(withdrawal.reason) : ""}`);
        if (approval.status === "rejected") assert.match(String(approval.reason), /source\/session evidence unavailable|authorization fence/, `iteration ${i}: only a consent refusal may reject approval`);
        const approvalWon = approval.status === "fulfilled";
        if (approvalWon) assert.equal((approval as PromiseFulfilledResult<Awaited<ReturnType<typeof store.decide>>>).value.result, "ok");
        const source = (await sources.findOne({ _id: input.source._id, tenantId }))!;
        const revision = (source.sourceMeta as Record<string, unknown> | undefined)?.authorizationRevision;
        const candidate = (await db.collection("whatsapp_candidates").findOne({ tenantId }))!;
        const claims = await db.collection("claims").countDocuments({ tenantId });
        assert.equal(source.consent.given, false, `iteration ${i}: withdrawal is monotonic, consent must end withdrawn`);
        if (approvalWon) {
          tally.approvalFirst++;
          assert.equal(candidate.status, "approved", `iteration ${i}`); assert.equal(claims, 1, `iteration ${i}`);
          assert.equal(revision, 2, `iteration ${i}: approval fence and withdrawal must each bump the revision exactly once`);
          // The committed approval must have published against a source that was still consented (not one withdrawn before it).
          assert.deepEqual(seenInTxn.at(-1), { consent: true, revision: 1 }, `iteration ${i}: approval published over a source already withdrawn or unfenced`);
        } else {
          tally.withdrawalFirst++;
          assert.equal(candidate.status, "needs-review", `iteration ${i}: refused approval must not change the candidate`);
          assert.equal(claims, 0, `iteration ${i}: no claim may exist over a withdrawn source`);
          assert.equal(revision, 1, `iteration ${i}: only the withdrawal bumped the revision`);
        }
        assert.equal(claims, candidate.status === "approved" ? 1 : 0, `iteration ${i}: approved <=> claim`);
      } finally {
        // Delete only this race's random tenant in the explicitly isolated test database.
        for (const name of ["claims", "whatsapp_candidates", "turns", "sessions", "sources"]) await db.collection(name).deleteMany({ tenantId });
      }
    }
    t.diagnostic(`race outcomes over ${iterations}: ${JSON.stringify(tally)}`);
    assert.equal(tally.approvalFirst + tally.withdrawalFirst, iterations, "exactly one of the two wins every race");
  } finally { await client.close(); }
});
