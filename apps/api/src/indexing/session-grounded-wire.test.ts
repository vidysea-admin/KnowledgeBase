/**
 * T-040 wiring (D-162): grounded notes + judge through indexSession, insert-first / preserve-reviewed writes
 * (ISS-U25DECISIONS-001), tenant scoping, degradation, flag resolution, and the /citations route rendering a
 * claim that indexSession wrote. FAKE model + FAKE judge + fake db only: no network, no MongoDB, no browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexSession } from "./session.js";
import { fakeDb, embedOk, type Call } from "./testutils.js";
import { resolveGroundedNotes, resolveJudgeMaxCostUsd } from "../composition/production.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";

const T = (id: string, speakerRef: string, text: string, tStart: number) => ({ _id: id, tenantId: "t", sessionId: "s1", speakerRef, tStart, tEnd: tStart + 2, text });
const Q = "When does the registration window open?";
const A = "The registration window opens on the first of April.";
const DEC = "We decided to keep the fee at the current level.";
const FEE = "The programme fee is 1,000 rupees today.";
const turns = [T("q", "spk:0", Q, 0), T("a", "spk:1", A, 3), T("d", "spk:1", DEC, 6), T("f", "spk:1", FEE, 9), T("chat", "spk:2", "Thanks, that was helpful for everyone.", 12)];
const ev = (id: string, quote: string) => ({ turnId: id, sessionId: "s1", quote });
const item = (kind: string, id: string, quote: string) => ({ kind, text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(id, quote)] });
type Job = { messages: { content: string }[] };

function fakeModel() {
  return async (job: Job) => {
    const p = JSON.parse(job.messages[1]!.content);
    const claim = (id: string, q: string) => ({ text: q, origin: "speaker-statement", verification: "unverified", evidence: [ev(id, q)] });
    let r: Record<string, unknown>;
    if (p.phase === "extract-summary") r = { processed: p.inventory, items: [item("insight", "f", FEE), item("decision", "d", DEC)],
      qa: [{ question: Q, questionEvidence: [ev("q", Q)], answer: A, answerEvidence: [ev("a", A)], status: "answered" }] };
    else if (p.phase === "extract-claims") r = { processed: p.inventory, claims: [claim("f", FEE), claim("d", DEC)] };
    else r = { processed: p.inventory, complete: true, noContent: false, noClaims: false, verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    return { text: JSON.stringify(r), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
  };
}
type Batch = { id: string; kind: string; note: string }[];
const judgeSame = async (batch: Batch) => ({ verdicts: batch.map((b) => ({ id: b.id, verdict: "same" as const, reason: "ok" })), costUsd: 0.01, inputTokens: 10, outputTokens: 5, model: "fake/judge" });
const judgeRejectDecision = async (batch: Batch) => ({ verdicts: batch.map((b) => ({ id: b.id, verdict: b.note.includes("decided") ? ("different" as const) : ("same" as const), reason: "polarity" })), costUsd: 0.01 });
const WRITES = ["deleteMany", "insertOne", "insertMany", "replaceOne"];
function setup(opts: Parameters<typeof fakeDb>[0] = {}) {
  const { db, calls } = fakeDb(opts), collection = db.collection.bind(db);
  db.collection = ((name: string) => (name === "turns" ? { ...collection(name), find: () => ({ toArray: async () => turns }) } : collection(name))) as typeof db.collection;
  return { db, calls };
}
const run = (db: ReturnType<typeof setup>["db"], extra: Record<string, unknown> = {}) =>
  indexSession("t", "s1", { db, complete: fakeModel() as never, embed: embedOk, strictWebinar: true, dropUnverified: true, noteJudge: judgeSame as never, ...extra });

test("judge on: notes persisted, judge totals reported, every note citation resolves to a real turn and time", async () => {
  const { db, calls } = setup();
  const res = await run(db);
  assert.equal(res.completion?.complete, true);
  assert.ok(res.groundedNotes!.judge!.judged > 0 && res.groundedNotes!.judge!.costUsd > 0);
  const page = calls.find((c) => c.coll === "session_pages" && c.op === "insertOne")!.docs![0]! as Record<string, any>;
  const byId = new Map(turns.map((x) => [x._id, x]));
  const cites = [...page.citedItems.flatMap((i: any) => i.evidence), ...page.qa.flatMap((q: any) => [...q.questionEvidence, ...q.answerEvidence])];
  assert.ok(cites.length >= 4);
  for (const c of cites) { const turn = byId.get(c.turnId); assert.ok(turn && turn.sessionId === c.sessionId && turn.text.includes(c.quote) && Number.isFinite(turn.tStart)); }
  for (const c of calls) for (const d of c.docs ?? []) if (["session_pages", "claims", "chunks"].includes(c.coll)) assert.equal((d as any).tenantId, "t");
});

test("judge rejects a polarity-flipped decision: dropped from page and claims, never persisted", async () => {
  const { db, calls } = setup();
  const res = await run(db, { noteJudge: judgeRejectDecision });
  assert.ok(res.groundedNotes!.judge!.dropped >= 1);
  const written = JSON.stringify(calls.filter((c) => c.coll === "session_pages" || c.coll === "claims").map((c) => c.docs ?? []));
  assert.ok(!written.includes("decided"), "rejected decision must not be written");
  assert.ok(written.includes("programme fee"));
});

test("judge that throws fails closed: nothing persisted, existing notes untouched, status failed", async () => {
  const { db, calls } = setup({ existingSessionPage: { _id: "old", sessionId: "s1" } });
  await assert.rejects(run(db, { noteJudge: async () => { throw new Error("judge down"); } }), /strict webinar index incomplete/);
  assert.ok(!calls.some((c) => ["session_pages", "claims", "chunks", "tree_index"].includes(c.coll) && WRITES.includes(c.op)));
  assert.ok(calls.some((c) => c.coll === "sessions" && c.op === "updateOne" && JSON.stringify(c.update).includes("failed")));
});

test("re-run preserves verified claims, inserts before deleting, and deletes only machine rows by _id", async () => {
  const evid = [{ turnId: "f", sessionId: "s1", quote: FEE }];
  const claims = [{ _id: "c-human", tenantId: "t", status: "verified", text: "The programme costs one thousand rupees today.", evidence: evid }, { _id: "c-dup", tenantId: "t", status: "verified", text: FEE, evidence: evid },
    { _id: "c-old", tenantId: "t", status: "needs-review", text: "Old machine claim", evidence: evid }];
  const { db, calls } = setup({ claims, existingSessionPage: { _id: "p1", tenantId: "t", sessionId: "s1", summary: FEE,
    keyInsights: [], decisions: [], actionItems: [], evidence: evid } });
  const res = await run(db);
  assert.deepEqual(res.groundedNotes!.claims, { preserved: 2, replaced: 1, inserted: 1 });
  const inserted = calls.find((c) => c.coll === "claims" && c.op === "insertMany")!;
  assert.deepEqual(inserted.docs!.map((d) => d.text), [DEC], "text equal to a verified claim is not duplicated");
  const del = calls.filter((c) => c.coll === "claims" && c.op === "deleteMany");
  assert.equal(del.length, 1); assert.deepEqual((del[0]!.filter as any)._id, { $in: ["c-old"] });
  assert.ok(calls.indexOf(inserted) < calls.indexOf(del[0]!), "insert happens before delete");
  const pageDel = calls.filter((c) => c.coll === "session_pages" && c.op === "deleteMany");
  assert.equal(pageDel.length, 1); assert.deepEqual((pageDel[0]!.filter as any)._id, { $in: ["p1"] });
  assert.ok(calls.findIndex((c) => c.coll === "session_pages" && c.op === "insertOne") < calls.indexOf(pageDel[0]!));
});

test("a failing claims insert leaves every old claim in place (no delete is issued)", async () => {
  const { db, calls } = setup({ claims: [{ _id: "c-old", tenantId: "t", status: "needs-review", text: "Old", evidence: [{ turnId: "f", sessionId: "s1" }] }] });
  const base = db.collection.bind(db);
  db.collection = ((n: string) => (n === "claims" ? { ...base(n), insertMany: async () => { throw new Error("write failed"); } } : base(n))) as typeof db.collection;
  await assert.rejects(run(db), /write failed/);
  assert.ok(!calls.some((c: Call) => c.coll === "claims" && c.op === "deleteMany"));
});

test("flag OFF: legacy delete-then-insert path and result shape are unchanged; a judge alone does not switch grounded mode on", async () => {
  const { db: db2, calls: calls2 } = fakeDb();
  const legacy = (async (j: { kind: string }) => ({ text: j.kind === "claims" ? "[]" : JSON.stringify({ summary: "S", keyInsights: [], decisions: [], actionItems: [] }), usage: {}, provider: "f", model: "f" }));
  const r2 = await indexSession("t", "s1", { retrievalMode: "vector", db: db2, complete: legacy as never, embed: embedOk, noteJudge: judgeSame as never });
  assert.equal("groundedNotes" in r2, false);
  const del = calls2.findIndex((c) => c.coll === "session_pages" && c.op === "deleteMany" && JSON.stringify(c.filter) === JSON.stringify({ sessionId: "s1", tenantId: "t" }));
  assert.ok(del >= 0 && del < calls2.findIndex((c) => c.coll === "session_pages" && c.op === "insertOne"));
  // strict but no dropUnverified: behaves as before (old strict path), no groundedNotes key
  const { db } = setup();
  const strictOnly = await indexSession("t", "s1", { db, complete: fakeModel() as never, embed: embedOk, strictWebinar: true, noteJudge: judgeSame as never });
  assert.equal("groundedNotes" in strictOnly, false);
});

test("flag resolution: OFF unless the caller or KB_GROUNDED_NOTES=1 turns it on; cost cap parsing", () => {
  assert.equal(resolveGroundedNotes(undefined, {}), false);
  assert.equal(resolveGroundedNotes(undefined, { KB_GROUNDED_NOTES: "1" }), true);
  assert.equal(resolveGroundedNotes(false, { KB_GROUNDED_NOTES: "1" }), false);
  assert.equal(resolveGroundedNotes(true, {}), true);
  assert.equal(resolveJudgeMaxCostUsd({}), undefined);
  assert.equal(resolveJudgeMaxCostUsd({ KB_NOTE_JUDGE_MAX_USD: "0.5" }), 0.5);
  assert.equal(resolveJudgeMaxCostUsd({ KB_NOTE_JUDGE_MAX_USD: "-1" }), undefined);
  assert.equal(resolveJudgeMaxCostUsd({ KB_NOTE_JUDGE_MAX_USD: "abc" }), undefined);
});

test("GET /citations/:claimId renders a claim written by grounded indexSession with the cited turn id and times", async () => {
  const { db, calls } = setup();
  await run(db);
  const claim = calls.find((c) => c.coll === "claims" && c.op === "insertMany")!.docs![0]! as any;
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ k: { tenantId: "t", scopes: ["citations"] } }),
    citations: { getCitation: async (tenantId: string, id: string) => tenantId === "t" && id === claim._id
      ? { claim, evidence: claim.evidence.map((e: any) => ({ turnId: e.turnId, sessionId: e.sessionId, turn: turns.find((x) => x._id === e.turnId) ?? null, session: null })) } : null },
  }));
  try {
    const res = await fetch(`${server.baseUrl}/citations/${claim._id}`, { headers: { authorization: "Bearer k" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.claim.evidence[0].quote, body.evidence[0].turn.text);
    assert.equal(typeof body.evidence[0].turn.tStart, "number"); assert.equal(typeof body.evidence[0].turn.tEnd, "number");
    assert.equal(body.claim.origin, "speaker-statement");
  } finally { await server.close(); }
});

test("when the judge rejects every fresh claim, old machine claims are kept and the new generation is refused", async () => {
  const { db, calls } = setup({ claims: [{ _id: "c-old", tenantId: "t", status: "needs-review", text: "Old machine claim", evidence: [{ turnId: "f", sessionId: "s1" }] }] });
  const rejectClaims = async (batch: Batch) => ({ verdicts: batch.map((b) => ({ id: b.id, verdict: b.kind === "claim" ? ("different" as const) : ("same" as const), reason: "r" })) });
  await assert.rejects(run(db, { noteJudge: rejectClaims }), /no accepted fresh claims/);
  assert.ok(!calls.some((c) => c.coll === "claims" && WRITES.includes(c.op)));
});
