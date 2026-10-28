/** Protocol/rollback tests, plus a deterministic interleaving sweep over the fixture's Mongo isolation model
 * (ISS-WAVECTORLESS-002). The opt-in consent-race-mongo.test.ts remains the native replica-set proof. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { Sources } from "@lkb/core";
import { createMongoWhatsAppReviewRepository, withdrawWhatsAppSourceConsent } from "./store.js";
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

/** Releases a competing actor's operations at exact points of the approval transaction's life. */
function approvalClock() {
  let done = 0; let finished = false; const waiters: { at: number; go: () => void }[] = [];
  const settle = () => { for (const w of waiters.splice(0)) if (finished || w.at <= done) w.go(); else waiters.push(w); };
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  return {
    beforeSessionOp: async (completed: number) => { done = completed; settle(); await tick(); await tick(); },
    reach: (at: number) => at <= done || finished ? Promise.resolve() : new Promise<void>(go => { waiters.push({ at, go }); }),
    finish: () => { finished = true; settle(); },
  };
}
/** Gates the withdrawal's own sources reads/writes on the approval clock: read at `readAt`, first write at `writeAt`. */
function gatedWithdrawalDb(db: Db, clock: ReturnType<typeof approvalClock>, readAt: number, writeAt: number): Db {
  let wrote = false;
  return new Proxy(db, { get(target, key) {
    if (key === "collection") return (name: string) => {
      const collection = target.collection(name);
      return name !== "sources" ? collection : new Proxy(collection, { get(coll, member) {
        if (member === "findOne") return async (...args: unknown[]) => { await clock.reach(readAt); return (coll.findOne as (...a: unknown[]) => unknown)(...args); };
        if (member === "updateOne") return async (...args: unknown[]) => { if (!wrote) { wrote = true; await clock.reach(writeAt); } return (coll.updateOne as (...a: unknown[]) => unknown)(...args); };
        const value = Reflect.get(coll, member, coll); return typeof value === "function" ? value.bind(coll) : value;
      } });
    };
    return Reflect.get(target, key, target);
  } }) as Db;
}
const REFUSAL = /source\/session evidence unavailable|authorization fence/u;

test("ISS-WAVECTORLESS-002: deterministic interleaving sweep, withdrawal vs approval, every point of the approval transaction", async t => {
  // Dry run (no competitor) measures how many session operations one uninterrupted approval performs.
  const probe = reviewInput(); const probeFixture = reviewMongoFixture([probe], {});
  const probeRow = detectWhatsAppReviewCandidates("tenant-a", probe, REVIEW_TIME)[0]!;
  const probeStore = createMongoWhatsAppReviewRepository(probeFixture.db, { materialize: c => probeFixture.publish(c.candidate, c.session) });
  await probeStore.insert("tenant-a", [probeRow]);
  const probeBase = probeFixture.isolationStats().sessionOps;
  await probeStore.decide("tenant-a", probeRow._id, "approved", "reviewer");
  const approvalOps = probeFixture.isolationStats().sessionOps - probeBase;
  assert.ok(approvalOps >= 6, `an approval performs several session operations (${approvalOps})`);

  const tally = { approvalFirst: 0, withdrawalFirst: 0 }; let conflicts = 0; let runs = 0;
  for (let readAt = 0; readAt <= approvalOps + 1; readAt++) for (const lag of [0, 1, 2, 4, 8]) {
    const clock = approvalClock();
    const input = reviewInput(); const f = reviewMongoFixture([input], { beforeSessionOp: clock.beforeSessionOp });
    const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
    const seen: { consent: unknown; revision: unknown }[] = [];
    const store = createMongoWhatsAppReviewRepository(f.db, { materialize: async c => {
      await f.publish(c.candidate, c.session);
      const inTxn = await c.db.collection<Sources>("sources").findOne({ _id: input.source._id, tenantId: "tenant-a" }, { session: c.session });
      seen.push({ consent: inTxn?.consent?.given, revision: (inTxn?.sourceMeta as Record<string, unknown> | undefined)?.authorizationRevision });
    } });
    await store.insert("tenant-a", [row]);
    // Offsets count session ops from the start of this approval; insert() already performed some.
    const base = f.isolationStats().sessionOps; const label = `readAt=${readAt} lag=${lag}`;
    const withdrawal = withdrawWhatsAppSourceConsent(gatedWithdrawalDb(f.db, clock, base + readAt, base + readAt + lag), "tenant-a", input.source._id, "owner-withdrawal");
    const approval = store.decide("tenant-a", row._id, "approved", "reviewer").finally(clock.finish);
    const [approvalResult, withdrawalResult] = await Promise.allSettled([approval, withdrawal]);
    runs++; conflicts += f.isolationStats().conflicts;
    assert.equal(withdrawalResult.status, "fulfilled", `${label}: withdrawal must always land`);
    if (approvalResult.status === "rejected") assert.match(String(approvalResult.reason), REFUSAL, `${label}: only a consent refusal may reject approval`);
    const src = f.rows("sources")[0] as { consent: { given: boolean }; sourceMeta?: { authorizationRevision?: number } };
    const status = f.rows("whatsapp_candidates")[0]!.status; const published = f.rows("published").length;
    assert.equal(src.consent.given, false, `${label}: withdrawal is monotonic`);
    assert.equal(published, status === "approved" ? 1 : 0, `${label}: approved <=> published`);
    if (approvalResult.status === "fulfilled") {
      tally.approvalFirst++;
      assert.equal(status, "approved", label); assert.equal(src.sourceMeta?.authorizationRevision, 2, `${label}: fence and withdrawal each bump once`);
      assert.deepEqual(seen.at(-1), { consent: true, revision: 1 }, `${label}: the committed approval published over a source still consented and fenced`);
    } else {
      tally.withdrawalFirst++;
      assert.equal(status, "needs-review", label); assert.equal(src.sourceMeta?.authorizationRevision, 1, `${label}: only the withdrawal bumped`);
    }
  }
  t.diagnostic(`interleavings=${runs} approvalOps=${approvalOps} outcomes=${JSON.stringify(tally)} writeConflictRetries=${conflicts}`);
  assert.equal(runs, (approvalOps + 2) * 5);
  assert.ok(tally.approvalFirst > 0 && tally.withdrawalFirst > 0, `both linearizations must occur: ${JSON.stringify(tally)}`);
  assert.ok(conflicts > 0, "the sweep must exercise WriteConflict retries");
});

test("ISS-WAVECTORLESS-002: a withdrawal landing between the approval's fence and its commit waits, then retries on the new revision", async () => {
  const input = reviewInput();
  let started = false; let withdrawal: Promise<void> | undefined;
  const f: ReturnType<typeof reviewMongoFixture> = reviewMongoFixture([input], { beforeSessionOp: async () => {
    // The first session op after the fence write (uncommitted revision 1, row locked) starts the withdrawal.
    const fenced = (f.rows("sources")[0] as { sourceMeta?: { authorizationRevision?: number } }).sourceMeta?.authorizationRevision === 1;
    if (fenced && !started) {
      started = true;
      withdrawal = withdrawWhatsAppSourceConsent(f.db, "tenant-a", input.source._id, "owner-withdrawal");
      await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    }
  } });
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
  await store.insert("tenant-a", [row]);
  assert.equal((await store.decide("tenant-a", row._id, "approved", "reviewer")).result, "ok");
  assert.ok(withdrawal, "the interleaving point was reached");
  await withdrawal;
  const src = f.rows("sources")[0] as { consent: { given: boolean }; sourceMeta: { authorizationRevision: number } };
  assert.equal(src.consent.given, false);
  assert.equal(src.sourceMeta.authorizationRevision, 2, "approval fence, then the retried withdrawal");
  assert.equal(f.rows("published").length, 1, "the approval committed before the withdrawal became visible");
});

test("ISS-WAVECTORLESS-002: tenancy holds, a foreign tenant cannot withdraw another tenant's source", async () => {
  const input = reviewInput(); const f = reviewMongoFixture([input], {});
  const before = f.rows("sources");
  await assert.rejects(withdrawWhatsAppSourceConsent(f.db, "tenant-b", input.source._id, "intruder"), /source not found for withdrawal/);
  assert.deepEqual(f.rows("sources"), before, "no consent or revision change for the owning tenant");
});
