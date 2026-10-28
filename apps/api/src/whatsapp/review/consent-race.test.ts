/** Protocol/rollback tests only. Native Mongo interleaving proof lives separately. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoWhatsAppReviewRepository } from "./store.js";
import { detectWhatsAppReviewCandidates } from "./detection.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "./test-fixtures.js";

test("approval and idempotent retry write fresh UUID fences in the same transaction without republishing", async () => {
  const base = reviewInput(); const input = { ...base, source: { ...base.source, sourceMeta: { retainedAuthorization: "owner" } } };
  const f = reviewMongoFixture([input]); const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
  await store.insert("tenant-a", [row]);
  assert.equal((await store.decide("tenant-a", row._id, "approved", "reviewer")).result, "ok");
  const first = f.rows("sources")[0]!.sourceMeta as Record<string, unknown>;
  assert.match(String(first.whatsappReviewFence), /^[0-9a-f]{8}-[0-9a-f-]{27}$/u);
  assert.equal(first.retainedAuthorization, "owner");
  const retried = await store.decide("tenant-a", row._id, "approved", "reviewer");
  assert.equal(retried.result, "ok"); if (retried.result === "ok") assert.equal(retried.changed, false);
  const second = f.rows("sources")[0]!.sourceMeta as Record<string, unknown>;
  assert.notEqual(first.whatsappReviewFence, second.whatsappReviewFence);
  assert.equal(f.rows("published").length, 1);
  const fences = f.calls.filter(c => c.collection === "sources" && c.operation === "updateOne");
  assert.equal(fences.length, 2);
  const expectedRevision = [{ $in: [null, 0] }, 1];
  fences.forEach((fence, i) => {
    assert.deepEqual(fence.filter, { _id: input.source._id, tenantId: "tenant-a", kind: "whatsapp-batch", path: input.source.path, "consent.given": true, "sourceMeta.authorizationRevision": expectedRevision[i] });
    assert.ok(fence.session);
  });
  assert.equal(second.authorizationRevision, 2);
  const publish = f.calls.find(c => c.collection === "published"); assert.equal(publish!.session, fences[0]!.session);
});

test("unacknowledged, unmatched or unmodified source fencing cannot publish", async () => {
  for (const result of [
    { acknowledged: false, matchedCount: 1, modifiedCount: 1 },
    { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
    { acknowledged: true, matchedCount: 1, modifiedCount: 0 },
  ]) {
    const input = reviewInput(); const f = reviewMongoFixture([input]);
    const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
    const db = new Proxy(f.db, { get(target, key) {
      if (key === "collection") return (name: string) => {
        const collection = target.collection(name);
        return name !== "sources" ? collection : new Proxy(collection, { get(coll, member) {
          if (member === "updateOne") return async () => result;
          const value = Reflect.get(coll, member, coll); return typeof value === "function" ? value.bind(coll) : value;
        } });
      };
      return Reflect.get(target, key, target);
    } }) as Db;
    const store = createMongoWhatsAppReviewRepository(db, { materialize: c => f.publish(c.candidate, c.session) });
    await store.insert("tenant-a", [row]);
    await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /authorization fence/);
    assert.equal(f.rows("whatsapp_candidates")[0]!.status, "needs-review");
    assert.equal(f.rows("published").length, 0);
  }
});

test("publisher failure rolls back source fence, candidate decision and materialisation together", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => {
    await f.publish(c.candidate, c.session); throw new Error("publisher unavailable");
  } });
  await store.insert("tenant-a", [row]);
  const before = f.rows("sources");
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /publisher unavailable/);
  assert.deepEqual(f.rows("sources"), before);
  assert.equal(f.rows("whatsapp_candidates")[0]!.status, "needs-review");
  assert.equal(f.rows("published").length, 0);
});

test("unsupported transactions fail closed without a standalone publication fallback", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  await createMongoWhatsAppReviewRepository(f.db).insert("tenant-a", [row]);
  let ended = 0;
  const db = new Proxy(f.db, { get(target, key) {
    if (key === "client") return { startSession: () => ({
      withTransaction: async () => { throw new Error("transactions unsupported"); }, endSession: async () => { ended++; },
    }) };
    return Reflect.get(target, key, target);
  } }) as Db;
  const store = createMongoWhatsAppReviewRepository(db, { materialize: c => f.publish(c.candidate, c.session) });
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /transactions unsupported/);
  assert.equal(f.rows("published").length, 0); assert.equal(ended, 1);
  assert.equal(f.rows("whatsapp_candidates")[0]!.status, "needs-review");
});

test("foreign tenant cannot reach or change another source authorization fence", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
  await store.insert("tenant-a", [row]); const before = f.rows("sources");
  assert.deepEqual(await store.decide("tenant-b", row._id, "approved", "reviewer"), { result: "not_found" });
  assert.deepEqual(f.rows("sources"), before);
  assert.equal(f.calls.filter(c => c.collection === "sources" && c.operation === "updateOne").length, 0);
});
