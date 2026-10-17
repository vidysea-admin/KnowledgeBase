/**
 * T-040: indexSession with { strictWebinar, dropUnverified } persists only verified, item-level cited notes.
 * Fake db + FAKE model (no provider, no network, no MongoDB). Replays the recorded reproductions of
 * ISS-WEBINARRELEASE-001 that concern persistence: a page whose evidence is the generic all-turn list, and
 * decisions/actions without item-level evidence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexSession } from "../session.js";
import { fakeDb, embedOk } from "../testutils.js";

const T = (id: string, speakerRef: string, text: string, tStart: number) => ({ _id: id, tenantId: "t", sessionId: "s1", speakerRef, tStart, tEnd: tStart + 2, text });
const Q = "When does the registration window open?";
const A = "The registration window opens on the first of April.";
const DEC = "We decided to keep the fee at the current level.";
const FEE = "The programme fee is 1,000 rupees today.";
const turns = [T("q", "spk:0", Q, 0), T("a", "spk:1", A, 3), T("d", "spk:1", DEC, 6), T("f", "spk:1", FEE, 9), T("chat", "spk:2", "Thanks, that was helpful for everyone.", 12)];
const ev = (id: string, quote: string) => ({ turnId: id, sessionId: "s1", quote });
const item = (kind: string, id: string, quote: string) => ({ kind, text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(id, quote)] });

function fakeModel(opts: { fabricate?: boolean } = {}) {
  return async (job: { messages: { content: string }[] }) => {
    const p = JSON.parse(job.messages[1]!.content);
    const claim = (id: string, q: string) => ({ text: q, origin: "speaker-statement", verification: "unverified", evidence: [ev(id, q)] });
    let r: Record<string, unknown>;
    if (p.phase === "extract-summary") r = { processed: p.inventory,
      items: [item("insight", "f", FEE), item("decision", "d", DEC), ...(opts.fabricate ? [item("insight", "f", "The programme fee is 9,000 rupees today.")] : [])],
      qa: [{ question: Q, questionEvidence: [ev("q", Q)], answer: A, answerEvidence: [ev("a", A)], status: "answered" }] };
    else if (p.phase === "extract-claims") r = { processed: p.inventory, claims: [claim("f", FEE), ...(opts.fabricate ? [claim("f", "Admission is free for everyone in 2027.")] : [])] };
    else r = { processed: p.inventory, complete: true, noContent: false, noClaims: false, verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    return { text: JSON.stringify(r), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
  };
}
function dbWithTurns() {
  const { db, calls } = fakeDb(), collection = db.collection.bind(db);
  db.collection = ((name: string) => (name === "turns" ? { ...collection(name), find: () => ({ toArray: async () => turns }) } : collection(name))) as typeof db.collection;
  return { db, calls };
}

test("dropUnverified persists only verified item-level citations; fabricated proposals never reach the database", async () => {
  const { db, calls } = dbWithTurns();
  const result = await indexSession("t", "s1", { db, complete: fakeModel({ fabricate: true }) as never, embed: embedOk, strictWebinar: true, dropUnverified: true });
  assert.equal(result.completion?.complete, true);
  assert.equal(result.summary?.dropped, 1); assert.equal(result.claims?.dropped, 1);
  const page = calls.find((c) => c.coll === "session_pages" && c.op === "insertOne")!.docs![0]! as Record<string, any>;
  assert.deepEqual(page.citedItems.map((i: any) => i.kind), ["insight", "decision"]);
  assert.deepEqual(page.decisions, [DEC]); assert.deepEqual(page.actionItems, []);
  assert.equal(page.qa[0].status, "answered"); assert.equal(page.qa[0].answerEvidence[0].quote, A);
  const written = JSON.stringify(calls.map((c) => c.docs ?? []));
  assert.ok(!written.includes("9,000") && !written.includes("Admission is free"), "fabricated text must not be persisted anywhere");
  const claim = calls.find((c) => c.coll === "claims" && c.op === "insertMany")!.docs!;
  assert.equal(claim.length, 1); assert.equal((claim[0] as any).evidence[0].quote, FEE); assert.equal((claim[0] as any).origin, "speaker-statement");
  // ISS-WEBINARRELEASE-001 (persisted page carried generic all-turn evidence): evidence is exactly the cited turns
  assert.deepEqual([...new Set(page.evidence.map((e: any) => e.turnId))].sort(), ["a", "d", "f", "q"]);
  assert.ok(page.evidence.every((e: any) => typeof e.quote === "string" && e.quote.length > 0));
  assert.deepEqual(page.coveredTurnIds.sort(), ["a", "chat", "d", "f", "q"].sort());
  for (const c of calls) for (const d of c.docs ?? []) if (["session_pages", "claims", "chunks"].includes(c.coll)) assert.equal((d as any).tenantId, "t");
});

test("without dropUnverified the same fabricated proposal still fails the strict index and writes nothing (unchanged)", async () => {
  const { db, calls } = dbWithTurns();
  await assert.rejects(indexSession("t", "s1", { db, complete: fakeModel({ fabricate: true }) as never, embed: embedOk, strictWebinar: true }), /strict webinar index incomplete/);
  assert.ok(!calls.some((c) => ["session_pages", "claims", "chunks", "tree_index"].includes(c.coll) && ["deleteMany", "insertOne", "insertMany", "replaceOne"].includes(c.op)));
});

test("old behaviour is untouched: the default (non-strict) path writes a legacy page with no citedItems or qa", async () => {
  const { db, calls } = fakeDb();
  const complete = async (job: { kind: string }) => ({ text: job.kind === "claims" ? "[]" : JSON.stringify({ summary: "S", keyInsights: [], decisions: [], actionItems: [] }), usage: { inputTokens: 0, outputTokens: 0 }, provider: "f", model: "f", costUsd: 0 });
  await indexSession("t", "s1", { db, complete: complete as never, embed: embedOk, dropUnverified: true });
  const page = calls.find((c) => c.coll === "session_pages" && c.op === "insertOne")!.docs![0]! as Record<string, unknown>;
  assert.equal(page.citedItems, undefined); assert.equal(page.qa, undefined); assert.equal(page.summary, "S");
});
