import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClientSession, Db } from "mongodb";
import type { Claims, Sessions, Sources, TreeIndexNode, TreeIndexRootDocument, Turns } from "@lkb/core";
import { detectWhatsAppReviewCandidates, type WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { materializeWhatsAppClaim, whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { createKnowledgeVisibility } from "./knowledge.js";
import { headId } from "../transcript-review/store.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";

type Row = Record<string, unknown>;
type Read = { collection: string; filter: Row };
function values(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => values(item, path));
  if (!path.length) return [value];
  if (!value || typeof value !== "object") return [];
  return values((value as Row)[path[0]!], path.slice(1));
}
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => values(row, key.split(".")).some(actual => {
    if (expected && typeof expected === "object" && "$in" in expected) return (expected as { $in: unknown[] }).$in.includes(actual);
    return actual === expected;
  }));
}
function fixture(approved = true) {
  const tenantId = "tenant-a", sourceId = "source-wa", sessionId = "session-wa";
  const first: Turns = { _id: "turn-approved", tenantId, sessionId, speakerRef: "expert", speakerLabel: "Asha", tStart: 0, tEnd: 0,
    text: "Scholarship closes Friday.", occurredAt: "2026-10-14T10:00:00.000Z" };
  const sibling: Turns = { ...first, _id: "turn-sibling", text: "UNREVIEWED sibling fee is 99.", tStart: 1, tEnd: 1 };
  const source = { _id: sourceId, tenantId, kind: "whatsapp-batch", path: "group@g.us", consent: { given: true, recordedBy: "test-owner" } } as Sources;
  const session: Sessions = { _id: sessionId, tenantId, sourceId, title: "PRIVATE group title", participants: ["PRIVATE person"], date: "2026-10-14",
    status: { transcribe: "done", index: "pending" } };
  const candidates = detectWhatsAppReviewCandidates(tenantId, { source, session, turns: [first, sibling] }, "2026-10-14T11:00:00.000Z");
  const candidate: WhatsAppReviewCandidate = { ...candidates[0]!, ...(approved ? { status: "approved", decision: { action: "approved", actor: "reviewer-fingerprint", at: "2026-10-14T11:00:00.000Z" } } : {}) };
  const claim = published(candidate);
  const docTurn: Turns = { _id: "turn-doc", tenantId, sessionId: "session-doc", speakerRef: "document", tStart: 0, tEnd: 20, text: "Document tuition is 12." };
  const docSession: Sessions = { ...session, _id: "session-doc", sourceId: "source-doc", title: "Public document", status: { transcribe: "done", index: "done" } };
  const docClaim: Claims = { _id: "claim-doc", tenantId, text: "Document tuition is 12.", status: "verified", evidence: [{ sessionId: docTurn.sessionId, turnId: docTurn._id, quote: docTurn.text }] };
  const rows: Record<string, Row[]> = {
    sources: [source, { _id: "source-doc", tenantId, kind: "document" }], sessions: [session, docSession], turns: [first, sibling, docTurn],
    whatsapp_candidates: [candidate, candidates[1]!], claims: approved ? [claim, docClaim] : [docClaim], whatsapp_review_log: [],
  } as unknown as Record<string, Row[]>;
  const calls: Read[] = [];
  let beforeRead: ((read: Read) => void) | undefined;
  const db = { collection(name: string) { return {
    async updateOne(filter: Row, update: { $set: Row }) {
      if (name === "tree_index") {
        // Native publication (actual materializer path) writes one tenant tree root inside the transaction.
        const list = rows[name] ?? (rows[name] = []), current = list.find(row => row._id === update.$set._id);
        if (current) Object.assign(current, structuredClone(update.$set)); else list.push(structuredClone(update.$set));
        return { acknowledged: true, matchedCount: current ? 1 : 0, modifiedCount: current ? 1 : 0, upsertedCount: current ? 0 : 1 };
      }
      assert.equal(name, "claims"); assert.equal(filter.tenantId, tenantId);
      const list = rows[name] ?? (rows[name] = []), current = list.find(row => matches(row, filter));
      if (current) Object.assign(current, structuredClone(update.$set));
      else list.push(structuredClone({ ...filter, ...update.$set }));
      return { modifiedCount: current ? 1 : 0, upsertedCount: current ? 0 : 1 };
    },
    async findOne(filter: Row) { const read = { collection: name, filter: structuredClone(filter) }; calls.push(read); beforeRead?.(read); return structuredClone(rows[name]?.find(row => matches(row, filter)) ?? null); },
    find(filter: Row) { const read = { collection: name, filter: structuredClone(filter) }; calls.push(read); return { async toArray() { beforeRead?.(read); return structuredClone(rows[name]?.filter(row => matches(row, filter)) ?? []); } }; },
  }; } } as unknown as Pick<Db, "collection">;
  return { rows, db, calls, tenantId, source, session, first, sibling, claim, candidate, docTurn, docSession, docClaim,
    visibility: createKnowledgeVisibility(db), hook(fn: (read: Read) => void) { beforeRead = fn; } };
}
function published(candidate: WhatsAppReviewCandidate): Claims {
  return { _id: whatsAppClaimId(candidate._id), tenantId: candidate.tenantId, text: candidate.text, source: "whatsapp", status: "verified", origin: "speaker-statement",
    evidence: candidate.evidence.map(e => ({ turnId: e.turnId, sessionId: e.sessionId, quote: e.quote })) as Claims["evidence"],
    waReview: { candidateId: candidate._id, kind: candidate.kind, approvedBy: candidate.decision?.actor, approvedAt: candidate.decision?.at } };
}
const node = (id: string, level: TreeIndexNode["level"], title: string, summary: string, children: TreeIndexNode[] = [], ref?: string): TreeIndexNode => ({
  node_id: id, level, title, summary, children, ...(ref ? { evidence: { sessionRef: ref } } : {}),
});

test("pending WA material contributes to no trusted turn, citation, claim or aggregate", async () => {
  const f = fixture(false);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first, f.sibling]), []);
  assert.equal(await f.visibility.sessionVisible(f.tenantId, f.session._id), false);
  assert.equal(await f.visibility.sourceVisible(f.tenantId, f.source._id), false);
  assert.equal(await f.visibility.safeCitationSession(f.tenantId, f.session._id), null);
  f.rows.claims!.push(f.claim as unknown as Row); // A verified label without the actual approval still grants nothing.
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), false);
});
test("only approved candidate turn is eligible, with literal substring citations and no sibling", async () => {
  const f = fixture();
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), true);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, "closes Friday"), true);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.sibling._id, f.sibling.text), false);
  assert.deepEqual((await f.visibility.filterTurns(f.tenantId, [f.first, f.sibling, f.docTurn])).map(t => t._id), [f.first._id, f.docTurn._id]);
  assert.equal(await f.visibility.sessionVisible(f.tenantId, f.session._id), false);
  assert.equal(await f.visibility.sourceVisible(f.tenantId, f.source._id), false);
});
test("unrelated source behavior retains current validated session, turns and claim", async () => {
  const f = fixture();
  assert.equal(await f.visibility.sessionVisible(f.tenantId, f.docSession._id), true);
  assert.equal(await f.visibility.sourceVisible(f.tenantId, f.docSession.sourceId), true);
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.docClaim), true);
  assert.deepEqual(await f.visibility.safeCitationSession(f.tenantId, f.docSession._id), f.docSession);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.docTurn.sessionId, f.docTurn._id, "tuition is 12"), true);
});
test("actual materialized approved WA loses every trusted projection when source consent is withdrawn", async () => {
  const f = fixture(); f.rows.claims = [f.docClaim as unknown as Row];
  f.rows.sources![0]!.consent = { given: true, recordedBy: "source-owner" };
  await materializeWhatsAppClaim({ candidate: f.candidate, db: f.db as Db, session: { inTransaction: () => true } as unknown as ClientSession });
  const claim = f.rows.claims.find(row => row._id === whatsAppClaimId(f.candidate._id)) as unknown as Claims;
  assert.equal(await f.visibility.claimVisible(f.tenantId, claim), true);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), true);
  assert.ok(JSON.stringify(await f.visibility.trustedTree(f.tenantId, null)).includes(f.first.text));
  f.rows.sources![0]!.consent = { given: false, recordedBy: "source-owner" };
  assert.equal(await f.visibility.claimVisible(f.tenantId, claim), false);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.equal(await f.visibility.safeCitationSession(f.tenantId, f.session._id, claim), null);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first]), []);
  assert.ok(!JSON.stringify(await f.visibility.trustedTree(f.tenantId, null)).includes(f.first.text));
});
test("every lookup is tenant-qualified and foreign input never becomes visible", async () => {
  const f = fixture();
  assert.equal(await f.visibility.claimVisible("tenant-b", f.claim), false);
  assert.equal(await f.visibility.eligibleTurn("tenant-b", f.session._id, f.first._id, f.first.text), false);
  assert.deepEqual(await f.visibility.filterTurns("tenant-b", [f.first, f.docTurn]), []);
  assert.equal(await f.visibility.safeCitationSession("tenant-b", f.session._id), null);
  assert.equal(await f.visibility.sourceVisible("tenant-b", f.source._id), false);
  assert.ok(f.calls.every(call => typeof call.filter.tenantId === "string"));
});
for (const change of ["rejected", "pending", "withdrawn", "pending-invalidation"] as const) test(`fresh eligibility refuses ${change} without a durable allow cache`, async () => {
  const f = fixture(); assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), true);
  if (change === "withdrawn") f.rows.claims = [f.docClaim as unknown as Row];
  else if (change === "pending-invalidation") f.rows.whatsapp_review_log!.push({ tenantId: f.tenantId, kind: "pending-invalidation", groupJid: f.source.path });
  else f.rows.whatsapp_candidates![0]!.status = change === "pending" ? "needs-review" : "rejected";
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), false);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first]), []);
});
for (const field of ["text", "speakerRef", "speakerLabel", "occurredAt"] as const) test(`current source ${field} drift invalidates old WA approval`, async () => {
  const f = fixture(); f.rows.turns![0]![field] = "changed";
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), false);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
});
for (const change of ["text", "status", "audit", "evidence"] as const) test(`tampered materialized claim ${change} cannot grant trust`, async () => {
  const f = fixture(); const claim = f.rows.claims![0]!;
  if (change === "text") claim.text = "not the approved proposal";
  if (change === "status") claim.status = "needs-review";
  if (change === "audit") (claim.waReview as Row).approvedBy = "unverified caller";
  if (change === "evidence") (claim.evidence as Row[])[0]!.turnId = f.sibling._id;
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.equal(await f.visibility.claimVisible(f.tenantId, claim as unknown as Claims), false);
});
test("review provenance cannot be bypassed through source relabelling or session repointing", async () => {
  const f = fixture(); f.rows.sources![0]!.kind = "recording";
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.equal(await f.visibility.sourceVisible(f.tenantId, f.source._id), false);
  f.rows.sources![0]!.kind = "whatsapp-batch"; f.rows.sessions![0]!.sourceId = "source-doc";
  assert.equal(await f.visibility.sessionVisible(f.tenantId, f.session._id), false);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first]), []);
});
test("withdrawal during evidence validation cannot survive an earlier claim snapshot", async () => {
  const f = fixture(); let reads = 0;
  f.hook(read => { if (read.collection === "turns" && ++reads === 2) f.rows.claims = [f.docClaim as unknown as Row]; });
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
});
test("database errors and malformed tenants fail closed without exposing an error", async () => {
  const f = fixture(); f.hook(() => { throw new Error("private connection information"); });
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), false);
  assert.equal(await f.visibility.safeCitationSession(f.tenantId, f.session._id), null);
  assert.equal(await f.visibility.sourceVisible(" bad tenant ", f.source._id), false);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first]), []);
});
test("safe approved citation session omits raw title, participants and arbitrary metadata", async () => {
  const f = fixture(); f.rows.sessions![0]!.privateSummary = f.sibling.text;
  const result = await f.visibility.safeCitationSession(f.tenantId, f.session._id);
  assert.equal(result?.title, "Reviewed expert guidance"); assert.equal(result?.date, f.session.date);
  assert.equal(result?.status.index, "pending");
  assert.equal(result?.participants, undefined); assert.equal(result?.privateSummary, undefined);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});
test("metadata attachment approval does not publish unrelated source-message content", async () => {
  const f = fixture(false);
  const input = { source: f.source, session: f.session, turns: [f.first], attachments: [{ turnId: f.first._id, name: "deadline.pdf" }] };
  const attachment = detectWhatsAppReviewCandidates(f.tenantId, input, "2026-10-14T11:00:00.000Z").find(c => c.kind === "attachment")!;
  const candidate: WhatsAppReviewCandidate = { ...attachment, status: "approved", decision: { action: "approved", actor: "reviewer", at: "2026-10-14T11:00:00.000Z" } };
  const claim = published(candidate); f.rows.whatsapp_candidates!.push(candidate as unknown as Row); f.rows.claims!.push(claim as unknown as Row);
  assert.equal(await f.visibility.claimVisible(f.tenantId, claim), true);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.session._id, f.first._id, f.first.text), false);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first]), []);
});
test("trusted tree drops legacy WA nodes and mixed parent summaries, then admits only reviewed facts", async () => {
  const f = fixture();
  const oldWa = node("tenant-a/year:2026/session:session-wa", "session", "PRIVATE group title", f.sibling.text, [], f.session._id);
  const doc = node("tenant-a/year:2026/session:session-doc", "session", "Public document", f.docTurn.text, [], f.docSession._id);
  const year = node("tenant-a/year:2026", "year", "PRIVATE aggregate title", `Mixed ${f.sibling.text}`, [oldWa, doc]);
  const root: TreeIndexRootDocument = { ...node("tenant:tenant-a", "tenant", "PRIVATE root title", f.sibling.text, [year]), tenantId: f.tenantId };
  const original = structuredClone(root), result = await f.visibility.trustedTree(f.tenantId, root);
  assert.ok(result); assert.deepEqual(root, original); assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.ok(!JSON.stringify(result).includes(f.sibling.text)); assert.ok(JSON.stringify(result).includes(f.docTurn.text));
  const detached = result.children.find(child => child.title === "Reviewed expert guidance")!;
  assert.equal(detached.summary, f.first.text); assert.equal(detached.evidence?.sessionRef, f.session._id);
  assert.deepEqual(detached.evidence?.turnRefs, [f.first._id]); assert.deepEqual(detached.evidence?.claimIds, [f.claim._id]);
  f.rows.claims = [f.docClaim as unknown as Row];
  const withdrawn = await f.visibility.trustedTree(f.tenantId, root);
  assert.ok(!JSON.stringify(withdrawn).includes(f.first.text));
});
test("trusted tree does not borrow foreign tenant identities or absent source associations", async () => {
  const f = fixture();
  const foreign: TreeIndexRootDocument = { ...node("tenant:tenant-b", "tenant", "foreign", "foreign private", []), tenantId: "tenant-b" };
  assert.equal(await f.visibility.trustedTree(f.tenantId, foreign), null);
  f.rows.claims = [];
  const missing = node("tenant-a/session:absent", "session", "unverified", "private absent text", [], "absent");
  const root: TreeIndexRootDocument = { ...node("tenant:tenant-a", "tenant", "Knowledge", "", [missing]), tenantId: f.tenantId };
  const result = await f.visibility.trustedTree(f.tenantId, root); assert.ok(!JSON.stringify(result).includes("private absent text"));
});
test("a valid nonWA parent cannot retain tainted cached title/summary after WA descendants are pruned", async () => {
  const f = fixture();
  const unsafe = node("tenant-a/session:session-doc/topic:legacy-wa", "topic", "UNAPPROVED topic", f.sibling.text, [], f.session._id);
  const middle = node("tenant-a/session:session-doc/org:mixed", "org", "UNAPPROVED parent title", f.sibling.text, [unsafe], f.docSession._id);
  const parent = node("tenant-a/session:session-doc", "session", "UNAPPROVED ancestor title", f.sibling.text, [middle], f.docSession._id);
  const root: TreeIndexRootDocument = { ...node("tenant:tenant-a", "tenant", "Knowledge", "", [parent]), tenantId: f.tenantId };
  const result = await f.visibility.trustedTree(f.tenantId, root);
  assert.ok(result); assert.ok(!JSON.stringify(result).includes("UNAPPROVED")); assert.ok(!JSON.stringify(result).includes(f.sibling.text));
  const retained = result.children.find(child => child.evidence?.sessionRef === f.docSession._id)!;
  assert.equal(retained.summary, ""); assert.equal(retained.children[0]?.summary, "");
});
test("nonWA eligibility consumes the real corrected projection without rewriting immutable originals", async () => {
  const f = fixture(); const original = JSON.stringify(f.rows.turns), corrected = "Reviewed document tuition is 15.";
  f.rows.transcript_reviews = [{ _id: headId(f.tenantId, f.docTurn.sessionId), tenantId: f.tenantId, sessionId: f.docTurn.sessionId,
    overlay: [{ turnId: f.docTurn._id, text: corrected, speakerRef: "document-reviewed", speakerLabel: "Reviewed source" }] }];
  const [effective] = await readEffectiveTurns(f.db, f.tenantId, [f.docTurn], f.docTurn.sessionId);
  assert.equal(effective!.text, corrected);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [effective!]), [effective]);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.docTurn]), []);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.docTurn.sessionId, f.docTurn._id, corrected), true);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.docTurn.sessionId, f.docTurn._id, f.docTurn.text), false);
  assert.equal(JSON.stringify(f.rows.turns), original);
});
test("an effective WA correction withdraws old approval even while raw source evidence still matches", async () => {
  const f = fixture(); assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), true);
  f.rows.transcript_reviews = [{ _id: headId(f.tenantId, f.first.sessionId), tenantId: f.tenantId, sessionId: f.first.sessionId,
    overlay: [{ turnId: f.first._id, text: `${f.first.text} Corrected deadline is Monday.`, speakerRef: f.first.speakerRef, speakerLabel: f.first.speakerLabel }] }];
  assert.equal(await f.visibility.claimVisible(f.tenantId, f.claim), false);
  assert.equal(await f.visibility.eligibleTurn(f.tenantId, f.first.sessionId, f.first._id, f.first.text), false);
  assert.deepEqual(await f.visibility.filterTurns(f.tenantId, [f.first]), []);
  assert.equal(await f.visibility.safeCitationSession(f.tenantId, f.first.sessionId), null);
  assert.ok(!JSON.stringify(await f.visibility.trustedTree(f.tenantId, null)).includes(f.first.text));
  assert.equal(f.rows.turns![0]!.text, f.first.text);
});
