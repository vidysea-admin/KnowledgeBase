/** W8 (R-7/R-8): the link-scoped data port over the fixture db - which sources a link owns, quarantine, and consent withdrawal through the existing CAS. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLinkDataPort, createMongoWhatsAppReviewRepository, whatsAppLinkSourceIds } from "./store.js";
import { detectWhatsAppReviewCandidates, type WhatsAppReviewInput } from "./detection.js";
import type { Db } from "mongodb";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "./test-fixtures.js";

const A = "a".repeat(24), B = "b".repeat(24), OWNER_A = "c".repeat(24);
/** One source per call: its own source/session/turn ids so several can share a fixture. */
function input(tag: string, tenantId: string, meta: { linkId?: string; recordedBy?: string }): WhatsAppReviewInput {
  const base = reviewInput(`Scholarship ${tag} closes Friday.`, tenantId);
  const sourceId = `src-${tag}`;
  return {
    source: { ...base.source, _id: sourceId, ...(meta.linkId ? { sourceMeta: { whatsappLinkId: meta.linkId } } : {}), consent: { given: true, recordedBy: meta.recordedBy ?? "test-owner" } } as never,
    session: { ...base.session, _id: `ses-${tag}`, sourceId } as never,
    turns: base.turns.map(t => ({ ...t, _id: `turn-${tag}`, sessionId: `ses-${tag}` })) as never,
  };
}
const inputs = [
  input("a1", "tenant-a", { linkId: A }), input("a2", "tenant-a", { linkId: A }), input("b1", "tenant-a", { linkId: B }),
  input("leg", "tenant-a", { recordedBy: `whatsapp-owner:${OWNER_A}` }), input("x", "tenant-a", { linkId: B, recordedBy: `whatsapp-owner:${OWNER_A}` }), input("t2", "tenant-b", { linkId: A }),
];
async function seeded() {
  const f = reviewMongoFixture(inputs);
  const repo = createMongoWhatsAppReviewRepository(f.db);
  for (const i of inputs) await repo.insert(i.source.tenantId, detectWhatsAppReviewCandidates(i.source.tenantId, i, REVIEW_TIME));
  return f;
}
const statusBySource = (f: Awaited<ReturnType<typeof seeded>>) => Object.fromEntries(f.rows("whatsapp_candidates").map(r => [String(r["sourceId"]), String(r["status"])]));
const consentOf = (f: Awaited<ReturnType<typeof seeded>>, id: string) => (f.rows("sources").find(s => s["_id"] === id) as Record<string, any>).consent;

test("W8 link sources: stamped sources of THIS link in THIS tenant, plus unstamped legacy ones recorded by its archiver owner; never another link's or tenant's", async () => {
  const f = await seeded();
  assert.deepEqual((await whatsAppLinkSourceIds(f.db, "tenant-a", A)).sort(), ["src-a1", "src-a2"], "no owner id: only the stamped sources");
  assert.deepEqual((await whatsAppLinkSourceIds(f.db, "tenant-a", A, OWNER_A)).sort(), ["src-a1", "src-a2", "src-leg"], "a legacy source recorded by the owner joins; src-x (recorded by the same owner but stamped with link B) does not");
  assert.deepEqual((await whatsAppLinkSourceIds(f.db, "tenant-a", B, OWNER_A)).sort(), ["src-b1", "src-leg", "src-x"], "link B's own sources; the unstamped legacy one follows the owner id the caller passes");
  assert.deepEqual(await whatsAppLinkSourceIds(f.db, "tenant-b", A), ["src-t2"], "tenant-b sees only its own");
  assert.deepEqual(await whatsAppLinkSourceIds(f.db, "tenant-a", "d".repeat(24), "e".repeat(24)), []);
});

test("W8 quarantine: only this link's still-pending candidates become rejected by system:wa-unlink; other links, tenants and decided rows are untouched; repeat is a no-op", async () => {
  const f = await seeded();
  const port = createLinkDataPort(f.db, { now: () => REVIEW_TIME });
  await f.db.collection("whatsapp_candidates").updateOne({ sourceId: "src-a2" }, { $set: { status: "approved" } });
  assert.equal(await port.quarantineCandidates("tenant-a", A, undefined), 1, "src-a2 was already approved: a decided row is not re-decided");
  assert.deepEqual(statusBySource(f), { "src-a1": "rejected", "src-a2": "approved", "src-b1": "needs-review", "src-leg": "needs-review", "src-x": "needs-review", "src-t2": "needs-review" });
  const moved = f.rows("whatsapp_candidates").find(r => r["sourceId"] === "src-a1") as Record<string, any>;
  assert.deepEqual(moved.decision, { action: "rejected", actor: "system:wa-unlink", at: REVIEW_TIME });
  assert.equal(await port.quarantineCandidates("tenant-a", A, undefined), 0, "idempotent");
  assert.equal(await port.quarantineCandidates("tenant-a", A, OWNER_A), 1, "the legacy source joins once the owner id is known");
  assert.equal(statusBySource(f)["src-t2"], "needs-review", "another tenant is never touched");
});

test("W8 withdraw: each owned source goes through the consent CAS (revision bumped once), nothing else is withdrawn, repeat does not bump again", async () => {
  const f = await seeded();
  const port = createLinkDataPort(f.db);
  assert.equal(await port.withdrawSources("tenant-a", A, OWNER_A, "user:u-member"), 3);
  for (const id of ["src-a1", "src-a2", "src-leg"]) assert.deepEqual(consentOf(f, id), { given: false, recordedBy: "user:u-member", note: "link_unlinked" }, id);
  for (const id of ["src-b1", "src-x", "src-t2"]) assert.equal(consentOf(f, id).given, true, `${id} untouched`);
  const rev = () => (f.rows("sources").find(s => s["_id"] === "src-a1") as Record<string, any>).sourceMeta.authorizationRevision;
  const before = rev(); await port.withdrawSources("tenant-a", A, OWNER_A, "user:u-member");
  assert.equal(rev(), before, "idempotent: an already withdrawn source is not re-written");
});

test("W8 withdraw + approve race: a candidate approved after the unlink withdrew consent fails closed (no publication)", async () => {
  const f = await seeded();
  const publish = (c: any) => f.publish(c.candidate, c.session);
  await createLinkDataPort(f.db).withdrawSources("tenant-a", A, undefined, "user:u-member");
  const row = f.rows("whatsapp_candidates").find(r => r["sourceId"] === "src-a1") as never;
  await assert.rejects(createMongoWhatsAppReviewRepository(f.db, { materialize: publish }).decide("tenant-a", (row as Record<string, any>)["_id"], "approved", "reviewer"));
  assert.equal(f.rows("published").length, 0);
});

/** Deterministic interleaving sweep (fixture Mongo isolation model; the native replica-set proof is links/unlink.mongo.test.ts, gated): the unlink's quarantine + consent
 * withdrawal against an approval, released at every point of the approval transaction. Mirrors consent-race.test.ts for the withdrawal-only path. */
function gate(db: Db, at: { candidates: number; sources: number }, reach: (n: number) => Promise<void>): Db {
  const fired = new Set<string>();
  return new Proxy(db, { get(target, key) {
    if (key !== "collection") return Reflect.get(target, key, target);
    return (name: string) => {
      const collection = target.collection(name);
      const point = name === "whatsapp_candidates" ? at.candidates : name === "sources" ? at.sources : -1;
      if (point < 0) return collection;
      return new Proxy(collection, { get(coll, member) {
        if (member === "updateOne" || member === "findOne") return async (...args: unknown[]) => {
          if (member === "updateOne" || name === "sources") { const k = `${name}.${String(member)}`; if (!fired.has(k)) { fired.add(k); await reach(point); } }
          return (coll[member] as (...a: unknown[]) => unknown)(...args);
        };
        const value = Reflect.get(coll, member, coll); return typeof value === "function" ? value.bind(coll) : value;
      } });
    };
  } }) as Db;
}
test("W8 interleaving sweep: unlink (quarantine then consent withdrawal) vs approval at every point of the approval transaction", async t => {
  const probe = input("p", "tenant-a", { linkId: A }), pf = reviewMongoFixture([probe], {});
  const prow = detectWhatsAppReviewCandidates("tenant-a", probe, REVIEW_TIME)[0]!, prepo = createMongoWhatsAppReviewRepository(pf.db, { materialize: c => pf.publish(c.candidate, c.session) });
  await prepo.insert("tenant-a", [prow]);
  const p0 = pf.isolationStats().sessionOps; await prepo.decide("tenant-a", prow._id, "approved", "reviewer");
  const ops = pf.isolationStats().sessionOps - p0;
  assert.ok(ops >= 6);
  const tally = { approvalFirst: 0, unlinkFirst: 0 }; let runs = 0;
  for (let readAt = 0; readAt <= ops + 1; readAt++) for (const lag of [0, 2, 5]) {
    let done = 0, finished = false; const waiters: Array<{ at: number; go: () => void }> = [];
    const settle = () => { for (const w of waiters.splice(0)) if (finished || w.at <= done) w.go(); else waiters.push(w); };
    const tick = () => new Promise<void>(r => setImmediate(r));
    const inp = input("s", "tenant-a", { linkId: A }), f = reviewMongoFixture([inp], { beforeSessionOp: async (n: number) => { done = n; settle(); await tick(); await tick(); } });
    const row = detectWhatsAppReviewCandidates("tenant-a", inp, REVIEW_TIME)[0]!;
    const repo = createMongoWhatsAppReviewRepository(f.db, { materialize: c => f.publish(c.candidate, c.session) });
    await repo.insert("tenant-a", [row]);
    const base = f.isolationStats().sessionOps, label = `readAt=${readAt} lag=${lag}`;
    const reach = (n: number) => (n <= done || finished ? Promise.resolve() : new Promise<void>(go => { waiters.push({ at: n, go }); }));
    const port = createLinkDataPort(gate(f.db, { candidates: base + readAt, sources: base + readAt + lag }, reach), { now: () => REVIEW_TIME });
    const unlink = (async () => { await port.quarantineCandidates("tenant-a", A, undefined); await port.withdrawSources("tenant-a", A, undefined, "user:u-member"); })();
    const approval = repo.decide("tenant-a", row._id, "approved", "reviewer").finally(() => { finished = true; settle(); });
    const [a, u] = await Promise.allSettled([approval, unlink]);
    runs++;
    assert.equal(u.status, "fulfilled", `${label}: the unlink always lands (${String((u as PromiseRejectedResult).reason)})`);
    const src = f.rows("sources")[0] as { consent: { given: boolean }; sourceMeta?: { authorizationRevision?: number } };
    const status = f.rows("whatsapp_candidates")[0]!["status"], published = f.rows("published").length;
    assert.equal(src.consent.given, false, `${label}: consent ends withdrawn`);
    assert.ok(status === "approved" || status === "rejected", `${label}: ends decided (${String(status)})`);
    assert.equal(published, status === "approved" ? 1 : 0, `${label}: approved <=> published (never a claim over a quarantined candidate)`);
    if (status === "approved") { tally.approvalFirst++; assert.equal(a.status, "fulfilled", label); assert.equal(src.sourceMeta?.authorizationRevision, 2, `${label}: fence + withdrawal`); }
    else { tally.unlinkFirst++; assert.equal(src.sourceMeta?.authorizationRevision, 1, `${label}: only the withdrawal bumped`); }
  }
  t.diagnostic(`interleavings=${runs} approvalOps=${ops} outcomes=${JSON.stringify(tally)}`);
  assert.equal(runs, (ops + 2) * 3);
  assert.ok(tally.approvalFirst > 0 && tally.unlinkFirst > 0, `both linearizations must occur: ${JSON.stringify(tally)}`);
});
