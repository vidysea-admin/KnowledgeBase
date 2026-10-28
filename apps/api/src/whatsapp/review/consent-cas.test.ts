/** ISS-WAVECTORLESS-001/-002: fail-closed consent and the source authorization revision CAS (fixture protocol tests). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoWhatsAppReviewRepository, withdrawWhatsAppSourceConsent } from "./store.js";
import { detectWhatsAppReviewCandidates } from "./detection.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "./test-fixtures.js";

type Fixture = ReturnType<typeof reviewMongoFixture>;
/** Runs `before` once, immediately before the first updateOne on `sources` reaches the driver. */
function hookSourcesUpdate(f: Fixture, before: () => Promise<void>): Db {
  let fired = false;
  return new Proxy(f.db, { get(target, key) {
    if (key === "collection") return (name: string) => {
      const collection = target.collection(name);
      if (name !== "sources") return collection;
      return new Proxy(collection, { get(coll, member) {
        if (member === "updateOne") return async (...args: unknown[]) => {
          if (!fired) { fired = true; await before(); }
          return (coll.updateOne as (...a: unknown[]) => unknown)(...args);
        };
        const value = Reflect.get(coll, member, coll); return typeof value === "function" ? value.bind(coll) : value;
      } });
    };
    return Reflect.get(target, key, target);
  } }) as Db;
}
const setup = (mutate?: (input: ReturnType<typeof reviewInput>) => void) => {
  const input = reviewInput(); mutate?.(input);
  const f = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  return { input, f, row };
};
/** A competing authorization writer: bumps the source revision without touching consent. */
const bumpRevision = (f: Fixture, sourceId: string) =>
  f.db.collection<{ _id: string; tenantId: string; sourceMeta?: { authorizationRevision?: number } }>("sources").updateOne({ _id: sourceId, tenantId: "tenant-a" }, { $inc: { "sourceMeta.authorizationRevision": 1 } });
const source = (f: Fixture) => f.rows("sources")[0] as Record<string, any>;

test("ISS-WAVECTORLESS-002: withdrawal committed after the approval's source read aborts approval (CAS lost)", async () => {
  const { input, f, row } = setup();
  const sourceId = input.source._id;
  await createMongoWhatsAppReviewRepository(f.db).insert("tenant-a", [row]);
  const racing = hookSourcesUpdate(f, () => withdrawWhatsAppSourceConsent(f.db, "tenant-a", sourceId, "owner-withdrawal"));
  const store = createMongoWhatsAppReviewRepository(racing, { materialize: c => f.publish(c.candidate, c.session) });
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /authorization fence/);
  assert.equal(f.rows("published").length, 0);
  assert.equal(f.rows("whatsapp_candidates")[0]!.status, "needs-review");
  assert.deepEqual(source(f).consent, { given: false, recordedBy: "owner-withdrawal" });
  assert.equal(source(f).sourceMeta.authorizationRevision, 1);
});

test("ISS-WAVECTORLESS-002: an approval that committed first bumps the revision, so a stale withdrawal retries and still lands", async () => {
  const { input, f, row } = setup();
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
  await store.insert("tenant-a", [row]);
  const racing = hookSourcesUpdate(f, async () => { await store.decide("tenant-a", row._id, "approved", "reviewer"); });
  await withdrawWhatsAppSourceConsent(racing, "tenant-a", input.source._id, "owner-withdrawal", "stop");
  assert.deepEqual(source(f).consent, { given: false, recordedBy: "owner-withdrawal", note: "stop" });
  assert.equal(source(f).sourceMeta.authorizationRevision, 2, "approval fence then withdrawal each incremented once");
  assert.equal(f.rows("published").length, 1, "approval committed before the withdrawal; fresh trusted readers deny it");
});

test("ISS-WAVECTORLESS-002: withdrawal never loses to concurrent approvals, in either scheduling order (15 rounds)", async () => {
  for (let round = 0; round < 15; round++) {
    const { input, f, row } = setup();
    const store = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
    await store.insert("tenant-a", [row]);
    const approve = store.decide("tenant-a", row._id, "approved", "reviewer").then(r => r.result, () => "refused");
    const approveAgain = store.decide("tenant-a", row._id, "approved", "reviewer").then(r => r.result, () => "refused");
    const withdraw = withdrawWhatsAppSourceConsent(f.db, "tenant-a", input.source._id, "owner-withdrawal");
    const order = round % 2 ? [withdraw, approve, approveAgain] : [approve, approveAgain, withdraw];
    await Promise.all(order);
    assert.equal(source(f).consent.given, false, `round ${round}: withdrawal must survive`);
    assert.equal(source(f).consent.recordedBy, "owner-withdrawal");
    assert.ok(f.rows("published").length <= 1);
    await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /unavailable/, `round ${round}: later approval refused`);
  }
});

test("withdrawal retries are bounded and fail visibly instead of reporting success", async () => {
  const { input, f } = setup();
  const db = new Proxy(f.db, { get(target, key) {
    if (key === "collection") return (name: string) => {
      const collection = target.collection(name);
      return name !== "sources" ? collection : new Proxy(collection, { get(coll, member) {
        if (member === "updateOne") return async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
        const value = Reflect.get(coll, member, coll); return typeof value === "function" ? value.bind(coll) : value;
      } });
    };
    return Reflect.get(target, key, target);
  } }) as Db;
  await assert.rejects(withdrawWhatsAppSourceConsent(db, "tenant-a", input.source._id, "owner"), /lost the revision race/);
  assert.equal(source(f).consent.given, true);
});

test("ISS-WAVECTORLESS-001: absent, malformed or withdrawn consent and invalid revisions fail closed on every write path", async () => {
  for (const mutate of [
    (i: ReturnType<typeof reviewInput>) => { delete (i.source as Record<string, unknown>).consent; },
    (i: ReturnType<typeof reviewInput>) => { (i.source as Record<string, unknown>).consent = { given: "yes", recordedBy: "x" }; },
    (i: ReturnType<typeof reviewInput>) => { (i.source as Record<string, unknown>).consent = { given: false, recordedBy: "x" }; },
    (i: ReturnType<typeof reviewInput>) => { (i.source as Record<string, unknown>).sourceMeta = { authorizationRevision: "7" }; },
    (i: ReturnType<typeof reviewInput>) => { (i.source as Record<string, unknown>).sourceMeta = { authorizationRevision: -1 }; },
  ]) {
    const { f, row } = setup(mutate);
    const store = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
    await assert.rejects(store.insert("tenant-a", [row]), /unavailable|revision invalid/);
    assert.equal(f.rows("whatsapp_candidates").length, 0);
  }
});

test("ISS-WAVECTORLESS-002: any intervening authorization revision bump (even with consent still given) aborts approval", async () => {
  const { input, f, row } = setup();
  await createMongoWhatsAppReviewRepository(f.db).insert("tenant-a", [row]);
  const racing = hookSourcesUpdate(f, async () => {
    await bumpRevision(f, input.source._id);
  });
  const store = createMongoWhatsAppReviewRepository(racing, { materialize: c => f.publish(c.candidate, c.session) });
  await assert.rejects(store.decide("tenant-a", row._id, "approved", "reviewer"), /authorization fence/);
  assert.equal(f.rows("published").length, 0);
  assert.equal(source(f).sourceMeta.authorizationRevision, 1, "the competing writer's bump survives; approval rolled back");
});

test("ISS-WAVECTORLESS-002: a revision bump between the withdrawal's read and write forces a retry, never a stale apply", async () => {
  const { input, f } = setup();
  const racing = hookSourcesUpdate(f, async () => { await bumpRevision(f, input.source._id); });
  await withdrawWhatsAppSourceConsent(racing, "tenant-a", input.source._id, "owner-withdrawal");
  const writes = f.calls.filter(c => c.collection === "sources" && c.operation === "updateOne");
  assert.equal(writes.length, 3, "competing bump, stale withdrawal attempt, retried withdrawal");
  assert.deepEqual(writes[1]!.filter["sourceMeta.authorizationRevision"], { $in: [null, 0] }, "first attempt is conditional on the revision it read");
  assert.equal(writes[2]!.filter["sourceMeta.authorizationRevision"], 1, "retry re-reads and conditions on the newer revision");
  assert.equal(source(f).sourceMeta.authorizationRevision, 2, "bump then withdrawal each incremented once");
  assert.deepEqual(source(f).consent, { given: false, recordedBy: "owner-withdrawal" });
});
