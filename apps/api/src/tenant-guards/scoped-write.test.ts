/**
 * apps/api/src/tenant-guards/scoped-write.test.ts - ISS-AUTHTENANT2-001 (ISS-AUTHTENANT-002 remainder): the four write sites that
 * used to hand-build their tenant filters (tree_index replaceOne in indexing/session.ts; WhatsApp sources/sessions replaceOne and turns
 * bulkWrite in whatsapp/store.ts) now go through scopedCollection. For each, tenant B - with rows of tenant A that collide on the exact
 * filter B's write would use - cannot overwrite, or upsert into, A's rows. Filter-evaluating fake; no MongoDB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { BlindDb, bindDb, recordingSource, type Row } from "../ask/tenant-test-kit.js";
import { createMongoWhatsAppDeps } from "../whatsapp/store.js";
import { indexSession } from "../indexing/session.js";
import { completeWith } from "../indexing/testutils.js";

const A = "tA", B = "tB", OWNER = "111111111111111111111111";
const snapOf = (rows: Row[], t: string) => JSON.stringify(rows.filter((r) => r.tenantId === t));

// ---- tree_index: A's row sits EXACTLY where B's root filter looks ({node_id:"tenant:tB", level:"tenant"}) - a legacy/colliding row.
const SESSION = (t: string) => ({ _id: "s1", tenantId: t, sourceId: "src1", title: "Test Session", date: "2026-09-07", org: "Acme University", status: { transcribe: "done", index: "pending" } });
const TURN = (t: string) => ({ _id: `${t}-t1`, tenantId: t, sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "A real sentence." });
const PAGE = (t: string) => ({ _id: `${t}-p1`, tenantId: t, sessionId: "s1", summary: "Notes about New Zealand visas.", keyInsights: ["New Zealand visa rules changed."], decisions: [], actionItems: [], evidence: [{ turnId: `${t}-t1`, sessionId: "s1" }] });
const A_ROOT: Row = { _id: "root-a", tenantId: A, node_id: `tenant:${B}`, level: "tenant", title: "A-OWNED-ROOT", summary: "", children: [] };

test("tree_index upsert: B's indexSession cannot overwrite A's colliding root; B gets its OWN stamped root", async () => {
  const db = new BlindDb({ sessions: [SESSION(B)], sources: [recordingSource(B)], turns: [TURN(B)], session_pages: [PAGE(B)], tree_index: [structuredClone(A_ROOT)], chunks: [], claims: [] });
  bindDb(db);
  const before = snapOf(db.all("tree_index"), A);
  await indexSession(B, "s1", { complete: completeWith() as never, db: db.asDb() });
  // Generation publication writes the root with insertOne (a new generation row) where it once upserted with replaceOne.
  const writes = db.queries.filter((q) => q.coll === "tree_index" && (q.op === "replaceOne" || q.op === "insertOne"));
  assert.equal(writes.length, 1, "the root write actually fired");
  if (writes[0]!.op === "replaceOne") assert.equal(writes[0]!.filter.tenantId, B, "filter carries B");
  assert.ok(db.queries.filter((q) => q.coll === "tree_index" && q.op !== "insertOne").every((q) => q.filter.tenantId === B), "every root read/filter carries B");
  assert.equal(snapOf(db.all("tree_index"), A), before, "A's root byte-identical");
  const mine = db.all("tree_index").filter((r) => r.tenantId === B);
  assert.equal(mine.length, 1, "B's root was upserted under B");
  assert.equal((writes[0]!.doc as Row).tenantId, B);
});

// ---- WhatsApp
function waDeps(db: BlindDb) {
  return createMongoWhatsAppDeps(undefined, {
    resolveOwner: async () => OWNER,
    appDb: () => db.asDb() as unknown as Db,
    listGroups: async (o: string) => [{ groupJid: "g1", ownerUserId: o, subject: "G", trackedPersonCount: 1 }] as never,
    fetchMessages: async () => [{ messageId: "m1", personId: "p1", displayName: "P", text: "hello", ts: "2026-10-09T01:02:03.000Z" }] as never,
  });
}

test("WhatsApp sources/sessions replaceOne and turns bulkWrite: B cannot overwrite A's rows that share B's exact ids", async () => {
  // Learn the ids B's ingest will write, then seed A rows on exactly those ids (and the legacy bare-hash source id).
  const probe = new BlindDb({ sources: [], sessions: [], turns: [] }); bindDb(probe);
  const r = await waDeps(probe).ingestGroup(B, "g1");
  const sourceIds = new Set([r.sourceId, probe.all("sessions")[0]!._id as string]), turnIds = probe.all("turns").map((t) => t._id as string);
  const forgedA = (id: string, coll: string): Row => ({ _id: id, tenantId: A, marker: `A-${coll}`, sourceId: "A-src", text: "A-TEXT" });
  const db = new BlindDb({
    sources: [...sourceIds].map((id) => forgedA(id, "sources")),
    sessions: [forgedA(probe.all("sessions")[0]!._id as string, "sessions")],
    turns: turnIds.map((id) => forgedA(id, "turns")),
  });
  bindDb(db);
  const before = ["sources", "sessions", "turns"].map((c) => snapOf(db.all(c), A));
  await waDeps(db).ingestGroup(B, "g1");
  for (const [i, c] of ["sources", "sessions", "turns"].entries()) {
    assert.equal(snapOf(db.all(c), A), before[i], `${c}: A's rows byte-identical`);
    const mine = db.all(c).filter((x) => x.tenantId === B);
    assert.ok(mine.length >= 1, `${c}: B's rows were upserted under B`);
  }
  const writes = db.queries.filter((q) => q.op === "replaceOne" || q.op === "bulkWrite");
  assert.ok(writes.some((q) => q.op === "replaceOne") && writes.some((q) => q.op === "bulkWrite"));
  for (const q of writes) { assert.equal(q.filter.tenantId, B, `${q.coll}.${q.op} filter`); assert.equal((q.doc as Row).tenantId, B, `${q.coll}.${q.op} document`); assert.equal(q.returned, 0, `${q.coll}.${q.op} matched nothing of A's`); }

  // Sources are now inserted with an upsert updateOne + $setOnInsert (consent of an existing row is never rewritten).
  const upserts = db.queries.filter((q) => q.op === "updateOne");
  assert.ok(upserts.length > 0, "the sources upsert fired");
  for (const q of upserts) { assert.equal(q.filter.tenantId, B, `${q.coll}.updateOne filter`); assert.equal(q.returned, 0, `${q.coll}.updateOne matched nothing of A's`);
    assert.equal(((q.doc as { $setOnInsert?: Row }).$setOnInsert ?? {}).tenantId, B, `${q.coll}.updateOne inserted document`); }
});

test("WhatsApp legacy fallback read is tenant-scoped: A's legacy bare-hash source is not adopted by B", async () => {
  const probe = new BlindDb({ sources: [], sessions: [], turns: [] }); bindDb(probe);
  const first = await waDeps(probe).ingestGroup(B, "g1");
  const hash = probe.all("sessions")[0]!._id as string;
  const db = new BlindDb({ sources: [{ _id: hash, tenantId: A, marker: "A-LEGACY" }], sessions: [], turns: [] }); bindDb(db);
  const r = await waDeps(db).ingestGroup(B, "g1");
  assert.equal(r.sourceId, first.sourceId, "B wrote under its tenant-scoped id, not A's legacy id");
  assert.deepEqual(db.all("sources").filter((s) => s.tenantId === A), [{ _id: hash, tenantId: A, marker: "A-LEGACY" }]);
});
