import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import type { Claims, Sessions, Sources, Turns } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { detectWhatsAppReviewCandidates } from "../whatsapp/review/detection.js";
import { whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { createMongoClaimsListDeps, MAX_CLAIMS_SCAN, type ClaimsListReaders } from "./store.js";

type Row = Record<string, unknown>;
function values(row: unknown, path: string[]): unknown[] {
  if (Array.isArray(row)) return row.flatMap(item => values(item, path));
  if (!path.length) return [row];
  if (!row || typeof row !== "object") return [];
  return values((row as Row)[path[0]!], path.slice(1));
}
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => values(row, key.split(".")).some(actual => {
    if (expected && typeof expected === "object") {
      if ("$in" in expected) return (expected as { $in: unknown[] }).$in.includes(actual);
      if ("$gt" in expected) return typeof actual === "string" && actual > String((expected as Row).$gt);
    }
    return actual === expected;
  }));
}
function fixture() {
  const tenantId = "tenant-a";
  const source = { _id: "source-wa", tenantId, kind: "whatsapp-batch", path: "group@g.us", consent: { given: true, recordedBy: "test-owner" } } as Sources;
  const session: Sessions = { _id: "session-wa", tenantId, sourceId: source._id, title: "PRIVATE group title", participants: ["PRIVATE person"],
    date: "2026-10-14", status: { transcribe: "done", index: "pending" } };
  const turn: Turns = { _id: "turn-wa", tenantId, sessionId: session._id, speakerRef: "expert", speakerLabel: "Asha", tStart: 0, tEnd: 0,
    text: "Scholarship closes Friday.", occurredAt: "2026-10-14T10:00:00.000Z" };
  const pending = detectWhatsAppReviewCandidates(tenantId, { source, session, turns: [turn] }, "2026-10-14T11:00:00.000Z")[0]!;
  const candidate = { ...pending, status: "approved", decision: { action: "approved", actor: "reviewer-fingerprint", at: "2026-10-14T11:00:00.000Z" } };
  const [firstEvidence, ...otherEvidence] = candidate.evidence;
  if (!firstEvidence) throw new Error("Fixture candidate evidence missing");
  const claimEvidence = (e: typeof firstEvidence) => ({ turnId: e.turnId, sessionId: e.sessionId, quote: e.quote });
  const approved: Claims = { _id: whatsAppClaimId(candidate._id), tenantId, text: candidate.text, source: "whatsapp", status: "verified", origin: "speaker-statement",
    evidence: [claimEvidence(firstEvidence), ...otherEvidence.map(claimEvidence)],
    waReview: { candidateId: candidate._id, kind: candidate.kind, approvedBy: candidate.decision.actor, approvedAt: candidate.decision.at },
    topicRefs: ["PRIVATE cached topic"], confidence: 0.99 };
  const docTurn: Turns = { _id: "turn-doc", tenantId, sessionId: "session-doc", speakerRef: "document", tStart: 0, tEnd: 1, text: "Public tuition is 12." };
  const doc: Claims = { _id: "doc-1", tenantId, text: docTurn.text, status: "verified", evidence: [{ sessionId: docTurn.sessionId, turnId: docTurn._id, quote: docTurn.text }] };
  const rows: Record<string, Row[]> = {
    sources: [source, { _id: "source-doc", tenantId, kind: "document" }], sessions: [session, { ...session, _id: docTurn.sessionId, sourceId: "source-doc", title: "Public document" }],
    turns: [turn, docTurn], claims: [approved, doc], whatsapp_candidates: [candidate], whatsapp_review_log: [],
  } as unknown as Record<string, Row[]>;
  const reads: { name: string; filter: Row; limit?: number; skip?: number }[] = [];
  let hook: ((name: string, filter: Row) => void) | undefined;
  const db = { collection(name: string) { return {
    async findOne(filter: Row) { hook?.(name, filter); reads.push({ name, filter }); return structuredClone((rows[name] ?? []).find(row => matches(row, filter)) ?? null); },
    find(filter: Row) {
      const call = { name, filter, limit: undefined as number | undefined, skip: undefined as number | undefined }; reads.push(call);
      let skip = 0, limit = Infinity, sorted = false;
      const cursor = { sort() { sorted = true; return cursor; }, skip(n: number) { skip = n; call.skip = n; return cursor; },
        limit(n: number) { limit = n; call.limit = n; return cursor; }, async toArray() {
          hook?.(name, filter);
          let found = (rows[name] ?? []).filter(row => matches(row, filter));
          if (sorted) found = [...found].sort((a, b) => String(a._id) < String(b._id) ? -1 : String(a._id) > String(b._id) ? 1 : 0);
          return structuredClone(found.slice(skip, skip + limit));
        } };
      return cursor;
    },
  }; } } as unknown as Db;
  const readers = { claims: scopedCollection<Claims>(db, "claims"), sessions: scopedCollection<Sessions>(db, "sessions") } as unknown as ClaimsListReaders;
  return { tenantId, rows, approved, doc, turn, candidate, reads, db, readers,
    store: createMongoClaimsListDeps(readers, () => db), hook(fn: typeof hook) { hook = fn; } };
}
const query = { limit: 1, offset: 0 };
test("claims list publishes only approved WA content with generic title and no cached metadata", async () => {
  const f = fixture();
  f.rows.claims![0]!.privatePayload = "PRIVATE claim extra";
  (f.rows.claims![0]!.evidence as Row[])[0]!.privatePayload = "PRIVATE evidence extra";
  f.rows.claims![1]!.privatePayload = "PRIVATE document extra";
  const result = await f.store.listClaims(f.tenantId, { limit: 10, offset: 0 });
  assert.equal(result.claims.length, 2);
  const wa = result.claims.find(c => c._id === f.approved._id)!;
  assert.equal(wa.text, f.turn.text); assert.equal(wa.evidence[0]!.sessionTitle, "Reviewed expert guidance");
  assert.equal(wa.confidence, undefined); assert.equal(wa.topicRefs, undefined);
  assert.deepEqual(Object.keys(wa).sort(), ["_id", "evidence", "status", "text"]);
  assert.deepEqual(Object.keys(wa.evidence[0]!).sort(), ["sessionId", "sessionTitle", "turnId"]);
  const doc = result.claims.find(c => c._id === f.doc._id)!;
  assert.deepEqual(Object.keys(doc).sort(), ["_id", "evidence", "status", "text"]);
  assert.deepEqual(Object.keys(doc.evidence[0]!).sort(), ["sessionId", "sessionTitle", "turnId"]);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.ok(f.reads.every(r => r.filter.tenantId === f.tenantId));
  assert.ok(f.reads.filter(r => r.name === "claims").every(r => typeof r.filter._id === "string" || (r.limit !== undefined && r.limit <= 200)),
    "WA citation proof must not perform an unbounded all-approved-claims scan");
});
test("rejected, pending, withdrawn and source-drift WA snapshots do not affect paging", async () => {
  for (const mode of ["rejected", "pending", "withdrawn", "drift", "invalidation"]) {
    const f = fixture();
    if (mode === "rejected") f.rows.whatsapp_candidates![0]!.status = "rejected";
    if (mode === "pending") f.rows.whatsapp_candidates![0]!.status = "needs-review";
    if (mode === "withdrawn") delete f.rows.claims![0]!.waReview;
    if (mode === "drift") f.rows.turns![0]!.text = "PRIVATE changed turn";
    if (mode === "invalidation") f.rows.whatsapp_review_log!.push({ tenantId: f.tenantId, kind: "pending-invalidation", groupJid: "group@g.us" });
    const result = await f.store.listClaims(f.tenantId, query);
    assert.deepEqual(result.claims.map(c => c._id), [f.doc._id], mode);
    assert.equal(result.truncated, false, mode);
  }
});
test("hidden claims before/between safe claims neither consume offset nor prove truncation", async () => {
  const f = fixture();
  f.rows.claims = [f.doc as unknown as Row, { ...f.doc, _id: "doc-2" } as unknown as Row,
    ...Array.from({ length: 401 }, (_, i) => ({ ...f.doc, _id: `blocked-${String(i).padStart(4, "0")}`, source: "whatsapp", text: "PRIVATE unreviewed" }))];
  assert.deepEqual((await f.store.listClaims(f.tenantId, query)).claims.map(c => c._id), ["doc-1"]);
  assert.equal((await f.store.listClaims(f.tenantId, query)).truncated, true);
  const second = await f.store.listClaims(f.tenantId, { ...query, offset: 1 });
  assert.deepEqual(second.claims.map(c => c._id), ["doc-2"]); assert.equal(second.truncated, false);
  assert.ok(f.reads.filter(r => r.name === "claims" && r.limit).every(r => r.skip === 0 && r.limit! <= 200));
});
test("missing or foreign evidence sessions remove the whole claim without title or count", async () => {
  const f = fixture(); f.rows.claims = [{ ...f.doc, evidence: [{ turnId: "missing", sessionId: "foreign" }] } as unknown as Row];
  f.rows.sessions!.push({ _id: "foreign", tenantId: "tenant-b", title: "PRIVATE foreign" });
  assert.deepEqual(await f.store.listClaims(f.tenantId, query), { claims: [], ...query, truncated: false });
});
test("scan cap refuses incomplete results rather than guessing a hidden-row count", async () => {
  const f = fixture();
  f.rows.claims = Array.from({ length: MAX_CLAIMS_SCAN + 1 }, (_, i) => ({ ...f.doc, _id: `bad-${String(i).padStart(5, "0")}`, tenantId: f.tenantId,
    evidence: [] } as unknown as Row));
  await assert.rejects(f.store.listClaims(f.tenantId, query), /Claims are unavailable/);
  assert.equal(f.reads.filter(r => r.name === "claims" && r.limit).length, MAX_CLAIMS_SCAN / 200);
});
test("late revocation cannot leave a previously selected public claim or truncation signal", async () => {
  const f = fixture(); let reads = 0;
  f.hook((name, filter) => { if (name === "claims" && filter._id === f.approved._id && ++reads === 4) f.rows.whatsapp_candidates![0]!.status = "rejected"; });
  await assert.rejects(f.store.listClaims(f.tenantId, { limit: 10, offset: 0 }), /Claims are unavailable/);
});
test("injected readers require a real database capability; invalid tenants never read", async () => {
  const f = fixture();
  await assert.rejects(createMongoClaimsListDeps(f.readers, () => { throw new Error("not connected"); }).listClaims(f.tenantId, query));
  await assert.rejects(f.store.listClaims(" tenant-a", query)); assert.equal(f.reads.length, 0);
});
