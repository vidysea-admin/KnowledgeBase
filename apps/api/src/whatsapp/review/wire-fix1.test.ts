/** Fix cycle 1: ISS-WA-REVIEW-WIRE-001 (upstream deletion), -002 (retry-safe invalidation), -003 (unasserted guards). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { WhatsAppMessage } from "@lkb/ingest";
import { createWhatsAppReviewWiring } from "./compose.js";
import { WA_APPROVED_CLAIM_STATUS, materializeWhatsAppClaim, revokeWhatsAppClaim, whatsAppClaimId } from "./materializer.js";
import { invalidateStaleWhatsAppCandidates } from "./invalidate.js";
import { auditWhatsAppQuarantine } from "./quarantine.js";
import { wireMongoFixture } from "./wire-fixtures.js";
import { SnapshotShrinkError, whatsAppLogId } from "./invalidate.js";
import { createReviewedWhatsAppDeps } from "./ingest.js";

const OWNER = "6a8d0c692fcc75f0e911b878";
const T0 = "2026-10-14T10:00:00.000Z";
type Hook = (collection: string, op: string, filter: unknown) => void;
function observe(db: Db, hook: Hook): Db {
  return new Proxy(db, { get(target, key) {
    if (key !== "collection") return (target as never)[key];
    return (name: string) => new Proxy(target.collection(name), { get(c, op) {
      const value = (c as never)[op] as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => { hook(name, String(op), args[0]); return (value as (...a: unknown[]) => unknown).apply(c, args); };
    } });
  } });
}
function setup(texts: string[], hook: Hook = () => undefined, extra: { maxDeleteFraction?: number } = {}) {
  const fx = wireMongoFixture();
  let messages: WhatsAppMessage[] = texts.map((text, i) => ({ messageId: `m${i}`, personId: "p1", displayName: "Expert", text, ts: new Date(Date.parse(T0) + i * 1000).toISOString() }));
  const db = observe(fx.db, hook);
  const wiring = createWhatsAppReviewWiring({
    appDb: () => db, resolveOwner: async () => OWNER, ...extra, now: () => "2026-10-14T11:00:00.000Z",
    listGroups: async () => [{ groupJid: "g@g.us", ownerUserId: OWNER, subject: "G", trackedPersonCount: 1 }],
    fetchMessages: async () => messages,
  });
  return { fx, db, wiring, set: (next: string[]) => { messages = messages.filter((_, i) => i < next.length).map((m, i) => ({ ...m, text: next[i]! })); }, drop: (i: number) => { messages = messages.filter((_, j) => j !== i); } };
}

test("ISS-001 verbatim: approve both, drop m1 upstream, re-ingest -> claims 2 -> 1, turn gone, pending gone, history logged", async () => {
  const { fx, wiring, drop } = setup(["Scholarship closes Friday.", "Interview prep is on Monday.", "Pending only note stays."], undefined, { maxDeleteFraction: 0.7 });
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  for (const c of (await wiring.repository.list("tenant-a")).filter(c => !c.text.startsWith("Pending"))) await wiring.repository.decide("tenant-a", c._id, "approved", "key:1");
  assert.equal(fx.rows("claims").length, 2); assert.equal(fx.rows("turns").length, 3);
  drop(1); drop(1); // m1 (approved) and m2 (pending-only) removed upstream
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  assert.equal(fx.rows("claims").length, 1, "deleted message's claim must be revoked");
  assert.deepEqual(fx.rows("claims").map(c => c.text), ["Scholarship closes Friday."]);
  assert.equal(fx.rows("turns").length, 1);
  assert.deepEqual((await wiring.repository.list("tenant-a")).map(c => c.text), []);
  const log = fx.rows("whatsapp_review_log").filter(r => r.kind === "upstream-deleted");
  assert.equal(log.length, 2); assert.ok(log.every(r => typeof r.textSha256 === "string" && !JSON.stringify(r).includes("Interview")), "history keeps a hash, never the deleted text");
  assert.equal(fx.rows("whatsapp_review_log").filter(r => r.kind === "pending-invalidation").length, 0, "marker cleared on success");
  assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-a"), []);
});

test("ISS-001: a deleted message is never re-proposed and re-ingest is idempotent", async () => {
  const { fx, wiring, drop } = setup(["Scholarship closes Friday.", "Interview prep is on Monday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  drop(1);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"); await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  assert.deepEqual((await wiring.repository.list("tenant-a")).map(c => c.text), ["Scholarship closes Friday."]);
  assert.equal(fx.rows("whatsapp_candidates").length, 1);
});

test("ISS-002: failed invalidation leaves a marker and a flagged stale claim; repair converges and is idempotent", async () => {
  let failCandidates = false;
  const { fx, wiring, set } = setup(["Scholarship closes Friday."], (collection, op) => { if (failCandidates && collection === "whatsapp_candidates" && op === "find") throw new Error("db blip"); });
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [c] = await wiring.repository.list("tenant-a");
  await wiring.repository.decide("tenant-a", c!._id, "approved", "key:1");
  set(["Scholarship closes Sunday."]); failCandidates = true;
  await assert.rejects(wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"), /db blip/);
  assert.equal(fx.rows("claims").length, 1, "stale claim survived the failure...");
  assert.equal(fx.rows("whatsapp_review_log").filter(r => r.kind === "pending-invalidation").length, 1, "...but a marker records the incomplete run");
  assert.ok((await auditWhatsAppQuarantine(fx.db, "tenant-a")).some(v => /no longer matches/u.test(v.reason)), "audit flags the stale claim");
  failCandidates = false;
  assert.deepEqual(await wiring.repairPendingInvalidations("tenant-a"), ["g@g.us"]);
  assert.equal(fx.rows("claims").length, 0); assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-a"), []);
  assert.deepEqual(await wiring.repairPendingInvalidations("tenant-a"), []);
});

test("ISS-003: materialiser labels, refuses non-approved and excluded candidates (direct calls)", async () => {
  const { fx, wiring } = setup(["Scholarship closes Friday.", "Private medical details about my family."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const pending = await wiring.repository.list("tenant-a");
  const plain = pending.find(c => c.text.startsWith("Scholarship"))!; const excluded = pending.find(c => c.text.startsWith("Private"))!;
  const session = {} as never;
  await assert.rejects(materializeWhatsAppClaim({ candidate: plain, db: fx.db, session }), /approved/u);
  await assert.rejects(materializeWhatsAppClaim({ candidate: { ...excluded, status: "approved", decision: { action: "approved", actor: "k", at: T0 } }, db: fx.db, session }), /excluded/u);
  await assert.rejects(materializeWhatsAppClaim({ candidate: { ...plain, decision: { action: "approved", actor: "k", at: T0 } }, db: fx.db, session }), /approved/u, "status must be approved even when a decision is present");
  await assert.rejects(materializeWhatsAppClaim({ candidate: { ...plain, status: "approved" }, db: fx.db, session }), /approved/u, "decision must be approved too");
  assert.equal(fx.rows("claims").length, 0);
  await materializeWhatsAppClaim({ candidate: { ...plain, status: "approved", decision: { action: "approved", actor: "k", at: T0 } }, db: fx.db, session });
  const [claim] = fx.rows("claims");
  assert.equal(claim!.status, WA_APPROVED_CLAIM_STATUS); assert.equal(claim!._id, whatsAppClaimId(plain._id)); assert.equal(claim!.origin, "speaker-statement");
  assert.equal(claim!.source, "whatsapp"); assert.equal(claim!.status, "verified"); assert.equal(claim!.tenantId, "tenant-a");
});

test("ISS-003: invalidation and revocation are tenant-scoped on every query and never touch another tenant", async () => {
  const filters: { collection: string; op: string; filter: Record<string, unknown> }[] = [];
  const { fx, db, wiring, set } = setup(["Scholarship closes Friday."], (collection, op, filter) => filters.push({ collection, op, filter: filter as Record<string, unknown> }));
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [c] = await wiring.repository.list("tenant-a");
  await wiring.repository.decide("tenant-a", c!._id, "approved", "key:1");
  // tenant-b holds a claim with the SAME id and a candidate on the SAME source id.
  fx.put("claims", { _id: whatsAppClaimId(c!._id), tenantId: "tenant-b", text: "b", status: "verified", evidence: [{ turnId: "x", sessionId: "y" }] });
  fx.put("whatsapp_candidates", { ...c!, tenantId: "tenant-b", status: "needs-review", decision: undefined });
  set(["Scholarship closes Sunday."]);
  filters.length = 0;
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  assert.ok(fx.rows("claims").some(r => r.tenantId === "tenant-b"), "tenant-b claim untouched");
  assert.ok(fx.rows("whatsapp_candidates").some(r => r.tenantId === "tenant-b"), "tenant-b candidate untouched");
  assert.equal(fx.rows("claims").filter(r => r.tenantId === "tenant-a").length, 0);
  const touching = filters.filter(f => ["claims", "whatsapp_candidates", "turns"].includes(f.collection) && ["find", "findOne", "deleteOne", "countDocuments"].includes(f.op));
  assert.ok(touching.length > 0);
  for (const f of touching) assert.equal(f.filter.tenantId, "tenant-a", `${f.collection}.${f.op} must be tenant-scoped`);
  // direct revoke is scoped as well
  await revokeWhatsAppClaim(db, "tenant-a", { _id: c!._id }, {} as never);
  assert.ok(fx.rows("claims").some(r => r.tenantId === "tenant-b"));
  await invalidateStaleWhatsAppCandidates(db, "tenant-a", "unrelated-source");
  assert.ok(fx.rows("whatsapp_candidates").some(r => r.tenantId === "tenant-b"));
});

test("ISS-005 (Umesh: \"mark it verified with soruce as whatsapp\"): approved claim is verified, source=whatsapp, tenant-stamped; audit flags missing provenance", async () => {
  const { fx, wiring } = setup(["Scholarship closes Friday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [c] = await wiring.repository.list("tenant-a");
  await wiring.repository.decide("tenant-a", c!._id, "approved", "key:1");
  const [claim] = fx.rows("claims");
  assert.equal(claim!.status, "verified"); assert.equal(claim!.source, "whatsapp"); assert.equal(claim!.tenantId, "tenant-a");
  assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-a"), []);
  await fx.db.collection("claims").updateOne({ _id: claim!._id as string, tenantId: "tenant-a" } as never, { $set: { source: "webinar" } } as never);
  assert.ok((await auditWhatsAppQuarantine(fx.db, "tenant-a")).some(v => /source=whatsapp/u.test(v.reason)));
});

const texts4 = ["Scholarship closes Friday.", "Interview prep is on Monday.", "Visa slots open in May.", "Mentor call is on Tuesday."];

test("ISS-008: markers and history ids are tenant-structured; a leftover marker of tenant A cannot block tenant B on a unique _id", async () => {
  const fx = wireMongoFixture();
  const messages: WhatsAppMessage[] = [{ messageId: "m0", personId: "p1", displayName: "E", text: "Scholarship closes Friday.", ts: T0 }];
  let failA = false;
  const wire = (owner: string, db: Db) => createWhatsAppReviewWiring({ appDb: () => db, resolveOwner: async () => owner, now: () => "2026-10-14T11:00:00.000Z",
    listGroups: async () => [{ groupJid: "g@g.us", ownerUserId: owner, subject: "G", trackedPersonCount: 1 }], fetchMessages: async () => messages });
  const a = wire(OWNER, observe(fx.db, (c, op) => { if (failA && c === "whatsapp_candidates" && op === "find") throw new Error("blip"); }));
  const b = wire("7b9e1d703fcc75f0e911b999", fx.db);
  await a.whatsapp.ingestGroup("tenant-a", "g@g.us");
  failA = true; await assert.rejects(a.whatsapp.ingestGroup("tenant-a", "g@g.us"), /blip/);
  const markersA = fx.rows("whatsapp_review_log").filter(r => r.kind === "pending-invalidation");
  assert.equal(markersA.length, 1); assert.equal(markersA[0]!._id, whatsAppLogId("tenant-a", "pending-invalidation", "g@g.us"));
  await b.whatsapp.ingestGroup("tenant-b", "g@g.us"); // would throw E11000 with an un-prefixed marker id
  const markers = fx.rows("whatsapp_review_log").filter(r => r.kind === "pending-invalidation");
  assert.deepEqual(markers.map(m => m.tenantId), ["tenant-a"], "tenant-b marker cleared, tenant-a repair state untouched");
  assert.notEqual(whatsAppLogId("a", "b:c"), whatsAppLogId("a:1", "b:c"));
  assert.notEqual(whatsAppLogId("ab", "c"), whatsAppLogId("a", "bc"));
});

test("ISS-009: an empty upstream snapshot is refused, logged, alerted, and only an explicit force deletes", async () => {
  const { fx, wiring, drop } = setup(["Scholarship closes Friday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [c] = await wiring.repository.list("tenant-a");
  await wiring.repository.decide("tenant-a", c!._id, "approved", "key:1");
  drop(0);
  const alerts: string[] = []; const original = console.error; console.error = (...a: unknown[]) => { alerts.push(a.join(" ")); };
  try { await assert.rejects(wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"), (e: unknown) => e instanceof SnapshotShrinkError); } finally { console.error = original; }
  assert.equal(fx.rows("claims").length, 1); assert.equal(fx.rows("turns").length, 1);
  assert.ok(alerts.some(a => /ALERT whatsapp-review/u.test(a)));
  assert.equal(fx.rows("whatsapp_review_log").filter(r => r.kind === "snapshot-refused").length, 1);
  assert.equal(fx.rows("whatsapp_review_log").filter(r => r.kind === "pending-invalidation").length, 1, "marker stays so the refusal is visible and retried");
  await wiring.forceIngestGroup("tenant-a", "g@g.us");
  assert.equal(fx.rows("claims").length, 0); assert.equal(fx.rows("turns").length, 0);
});

test("ISS-009: an empty snapshot is refused even when the fraction threshold is 1", async () => {
  const { fx, wiring, drop } = setup(["Scholarship closes Friday."], undefined, { maxDeleteFraction: 1 });
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"); drop(0);
  const original = console.error; console.error = () => undefined;
  try { await assert.rejects(wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"), SnapshotShrinkError); } finally { console.error = original; }
  assert.equal(fx.rows("turns").length, 1);
});

test("ISS-009: mass shrink over the threshold is refused; threshold is configurable; one legitimate deletion passes", async () => {
  const mass = setup(texts4);
  await mass.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  mass.drop(1); mass.drop(1); mass.drop(1); // 3 of 4 deleted
  const original = console.error; console.error = () => undefined;
  try { await assert.rejects(mass.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"), SnapshotShrinkError); } finally { console.error = original; }
  assert.equal(mass.fx.rows("turns").length, 4);
  const exact = setup(texts4); await exact.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  exact.drop(0); exact.drop(0); // exactly 50%: not over, allowed
  await exact.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"); assert.equal(exact.fx.rows("turns").length, 2);
  const tuned = setup(texts4, undefined, { maxDeleteFraction: 0.9 }); await tuned.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  tuned.drop(1); tuned.drop(1); tuned.drop(1); await tuned.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us"); assert.equal(tuned.fx.rows("turns").length, 1);
  const single = setup(texts4); await single.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  single.drop(2); await single.wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  assert.equal(single.fx.rows("turns").length, 3); assert.equal(single.fx.rows("whatsapp_review_log").filter(r => r.kind === "upstream-deleted").length, 1);
});

test("ISS-010: a deleted message text is redacted from the decided candidate row; hash and decision remain", async () => {
  const { fx, wiring, drop } = setup(["Scholarship closes Friday.", "Interview prep is on Monday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const doomed = (await wiring.repository.list("tenant-a")).find(c => c.text.startsWith("Interview"))!;
  await wiring.repository.decide("tenant-a", doomed._id, "approved", "key:1");
  drop(1); await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const row = fx.rows("whatsapp_candidates").find(r => r._id === doomed._id)!;
  assert.equal(row.status, "approved"); assert.ok(row.decision); assert.equal(row.contentHash, doomed.contentHash);
  for (const name of ["whatsapp_candidates", "whatsapp_review_log", "claims", "turns"]) assert.ok(!JSON.stringify(fx.rows(name)).includes("Interview prep"), `${name} must not retain the deleted text`);
});

test("ISS-011: a missing snapshot fails closed with data untouched; the affected-candidate lookup is tenant-scoped", async () => {
  const filters: { collection: string; op: string; filter: Record<string, unknown> }[] = [];
  const { fx, db, wiring, drop } = setup(["Scholarship closes Friday.", "Interview prep is on Monday."], (collection, op, filter) => filters.push({ collection, op, filter: filter as Record<string, unknown> }));
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const before = JSON.stringify([fx.rows("turns"), fx.rows("claims"), fx.rows("whatsapp_candidates")]);
  const blind = createReviewedWhatsAppDeps({ base: { listGroups: async () => [], ingestGroup: async () => ({ sessionId: "s", sourceId: "x", turnCount: 0 }) } as never, appDb: () => db,
    repository: wiring.repository, withSnapshot: async run => ({ value: await run(), messageIds: undefined }) });
  await assert.rejects(blind.ingestGroup("tenant-a", "g@g.us"), /snapshot unavailable/u);
  assert.equal(JSON.stringify([fx.rows("turns"), fx.rows("claims"), fx.rows("whatsapp_candidates")]), before);
  filters.length = 0; drop(1); await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const lookups = filters.filter(f => f.collection === "whatsapp_candidates" && f.op === "find" && "evidence.turnId" in f.filter);
  assert.ok(lookups.length > 0); for (const f of lookups) assert.equal(f.filter.tenantId, "tenant-a");
});
