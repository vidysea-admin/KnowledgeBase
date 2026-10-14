import { test } from "node:test";
import assert from "node:assert/strict";
import type { WhatsAppMessage } from "@lkb/ingest";
import { createWhatsAppReviewWiring } from "./compose.js";
import { auditWhatsAppQuarantine } from "./quarantine.js";
import { createMongoWhatsAppReviewRepository } from "./store.js";
import { wireMongoFixture } from "./wire-fixtures.js";

const OWNER = "6a8d0c692fcc75f0e911b878";
const T0 = "2026-10-14T10:00:00.000Z";
function setup(texts: string[]) {
  const fx = wireMongoFixture();
  let messages: WhatsAppMessage[] = texts.map((text, i) => ({ messageId: `m${i}`, personId: "p1", displayName: "Expert", text, ts: new Date(Date.parse(T0) + i * 1000).toISOString() }));
  const wiring = createWhatsAppReviewWiring({
    appDb: () => fx.db, resolveOwner: async () => OWNER, now: () => "2026-10-14T11:00:00.000Z",
    listGroups: async () => [{ groupJid: "g@g.us", ownerUserId: OWNER, subject: "G", trackedPersonCount: 1 }],
    fetchMessages: async () => messages,
  });
  return { fx, wiring, edit: (i: number, text: string) => { messages = messages.map((m, j) => (j === i ? { ...m, text } : m)); } };
}

test("ingest stores raw source and pending candidates only; no trusted row, no indexer", async () => {
  const { fx, wiring } = setup(["Scholarship closes Friday.", "Topic: Visas. We decided to start Monday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  assert.equal(fx.rows("sources").length, 1); assert.equal(fx.rows("turns").length, 2);
  const cands = fx.rows("whatsapp_candidates");
  assert.equal(cands.length, 4); assert.ok(cands.every(c => c.status === "needs-review" && c.tenantId === "tenant-a"));
  for (const name of ["claims", "chunks", "session_pages", "tree_index"]) assert.equal(fx.rows(name).length, 0, name);
  assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-a"), []);
});

test("approving one candidate materialises exactly one claim; sibling and rejected stay out", async () => {
  const { fx, wiring } = setup(["Topic: Visas. We decided to start Monday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [a, b, c] = await wiring.repository.list("tenant-a");
  assert.equal((await wiring.repository.decide("tenant-a", a!._id, "approved", "key:1")).result, "ok");
  assert.equal((await wiring.repository.decide("tenant-a", b!._id, "rejected", "key:1")).result, "ok");
  const claims = fx.rows("claims");
  assert.equal(claims.length, 1); assert.equal(claims[0]!.text, a!.text);
  assert.equal((claims[0]!.evidence as { turnId: string }[])[0]!.turnId, a!.evidence[0].turnId);
  assert.equal((await wiring.repository.get("tenant-a", c!._id))!.status, "needs-review");
  assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-a"), []);
});

test("quarantine audit finds planted unapproved claim, chunk, page and tree leak", async () => {
  const { fx, wiring } = setup(["Scholarship closes Friday."]);
  const { sessionId, sourceId } = await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  fx.put("claims", { _id: "c1", tenantId: "tenant-a", text: "x", status: "needs-review", evidence: [{ turnId: "t", sessionId }] });
  fx.put("chunks", { _id: "k1", tenantId: "tenant-a", sourceRef: sourceId, turnRefs: ["t"], chunkIndex: 0 });
  fx.put("session_pages", { _id: "p1", tenantId: "tenant-a", sessionId, summary: "s", evidence: [] });
  fx.put("tree_index", { _id: "tree", tenantId: "tenant-a", children: [{ ref: sessionId }] });
  fx.put("claims", { _id: "other", tenantId: "tenant-b", text: "x", status: "needs-review", evidence: [{ turnId: "t", sessionId }] });
  const found = (await auditWhatsAppQuarantine(fx.db, "tenant-a")).map(v => v.collection).sort();
  assert.deepEqual(found, ["chunks", "claims", "session_pages", "tree_index"]);
  assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-b"), []);
});

test("unchanged re-ingest keeps decisions and creates no duplicates", async () => {
  const { fx, wiring } = setup(["Scholarship closes Friday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [a] = await wiring.repository.list("tenant-a");
  await wiring.repository.decide("tenant-a", a!._id, "rejected", "key:1");
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const rows = fx.rows("whatsapp_candidates");
  assert.equal(rows.length, 1); assert.equal(rows[0]!.status, "rejected"); assert.equal(fx.rows("claims").length, 0);
});

test("source edit removes pending proposals and revokes an approved claim", async () => {
  const { fx, wiring, edit } = setup(["Scholarship closes Friday.", "Interview prep is on Monday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const approved = (await wiring.repository.list("tenant-a")).find(c => c.text.startsWith("Scholarship"))!;
  await wiring.repository.decide("tenant-a", approved._id, "approved", "key:1");
  assert.equal(fx.rows("claims").length, 1);
  edit(0, "Scholarship closes Sunday."); edit(1, "Interview prep moved to Tuesday.");
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  assert.equal(fx.rows("claims").length, 0, "approved claim of an edited turn must be revoked");
  const live = (await wiring.repository.list("tenant-a")).map(c => c.text).sort();
  assert.deepEqual(live, ["Interview prep moved to Tuesday.", "Scholarship closes Sunday."]);
  assert.deepEqual(await auditWhatsAppQuarantine(fx.db, "tenant-a"), []);
});

test("failed materialisation leaves the candidate pending and publishes nothing", async () => {
  const { fx, wiring } = setup(["Scholarship closes Friday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [a] = await wiring.repository.list("tenant-a");
  const failing = createMongoWhatsAppReviewRepository(fx.db, { materialize: async () => { throw new Error("boom"); } });
  await assert.rejects(failing.decide("tenant-a", a!._id, "approved", "key:1"), /boom/);
  assert.equal((await wiring.repository.get("tenant-a", a!._id))!.status, "needs-review"); assert.equal(fx.rows("claims").length, 0);
});

test("another tenant cannot read or decide a candidate", async () => {
  const { wiring } = setup(["Scholarship closes Friday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [a] = await wiring.repository.list("tenant-a");
  assert.equal(await wiring.repository.get("tenant-b", a!._id), null);
  assert.equal((await wiring.repository.decide("tenant-b", a!._id, "approved", "key:2")).result, "not_found");
  assert.deepEqual(await wiring.repository.list("tenant-b"), []);
});

test("personal/excluded candidate cannot be approved or materialised", async () => {
  const { fx, wiring } = setup(["Private medical details about my family."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us");
  const [a] = await wiring.repository.list("tenant-a");
  assert.equal((await wiring.repository.decide("tenant-a", a!._id, "approved", "key:1")).result, "excluded");
  assert.equal(fx.rows("claims").length, 0);
});
