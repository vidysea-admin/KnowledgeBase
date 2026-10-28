/**
 * D-151 (pending append), ISS-T040JUDGE-002: when the note judge (D-144) is enabled the rule-based lexical negation checks ALSO run.
 * A note is dropped if either the judge or the rules reject it; the sidecar records which (judge, rules, both).
 * FAKE judges and a FAKE model only: no provider, no network, no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { summarizeSession } from "../summarize.js";
import { auditGroundedNotes } from "./evidence.js";
import { lexicalNegationProblem, sentenceSpanProblem } from "./sentence-span.js";
import type { NoteJudge, NoteJudgeInput } from "./judge.js";
import { ATTACKS } from "./judge-corpus.js";

type Obj = Record<string, any>;
const SID = "s1";
const turn = (id: string, speakerRef: string, text: string, tStart: number): Turns => ({ _id: id, tenantId: "t1", sessionId: SID, speakerRef, tStart, tEnd: tStart + 1, text });
const reply = (o: unknown): CompleteResult => ({ text: JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const item = (turnId: string, quote: string) => ({ kind: "insight", text: quote, origin: "speaker-statement", verification: "unverified", evidence: [{ turnId, sessionId: SID, quote }] });
function model(extract: () => Obj) {
  return async (job: Job): Promise<CompleteResult> => {
    const p = JSON.parse(job.messages[1]!.content) as Obj;
    if (p.phase === "extract-summary" || p.phase === "extract-claims") return reply({ processed: p.inventory, items: [], qa: [], claims: [], ...extract() });
    if (p.phase === "reconcile-questions") return reply({ processed: p.inventory, answers: p.questions.map((q: Obj) => ({ id: q.id, answer: null, answerEvidence: [] })) });
    return reply({ processed: p.inventory, complete: true, noContent: p.items.length === 0, noClaims: p.items.length === 0, verdicts: p.items.map((i: Obj) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) });
  };
}
const judgeOf = (decide: (i: NoteJudgeInput) => "same" | "different"): { judge: NoteJudge; seen: NoteJudgeInput[] } => {
  const seen: NoteJudgeInput[] = [];
  return { seen, judge: async (batch) => { seen.push(...batch); return { verdicts: batch.map((i) => ({ id: i.id, verdict: decide(i), reason: `fake:${decide(i)}` })), costUsd: 0.01 }; } };
};
const FEE = "The programme fee is 1,000 rupees today.";
async function run(text: string, quote: string, judge?: NoteJudge) {
  const turns = [turn("c0", "spk:0", FEE, 0), turn("a1", "spk:1", text, 10)];
  const r = await summarizeSession(turns, model(() => ({ items: [item("c0", FEE), item("a1", quote)] })), { strictWebinar: true, dropUnverified: true, ...(judge ? { noteJudge: judge } : {}) });
  assert.equal(r.degraded, null);
  assert.ok(r.page.citedItems!.some((i) => i.text === FEE), "the faithful control ships");
  return { r, turns, shipped: r.page.citedItems!.some((i) => i.evidence.some((e) => e.turnId === "a1")), entry: r.judgeSidecar?.entries.find((e) => e.note.startsWith(quote.slice(0, 20))) };
}
// Rejected by the rules only (the ISS-T040JUDGE-002 classes).
const RULE_ONLY: [string, string][] = [["Apply in March; not for freshers.", "Apply in March;"], ["March mein apply kijiye. Nahi.", "March mein apply kijiye."], ["Fees are 1000 rupees. No.", "Fees are 1000 rupees."]];

test("D-151: a judge is injected and says same, yet a note the lexical rules reject is DROPPED (rules only), and the sidecar says so", async () => {
  for (const [text, quote] of RULE_ONLY) {
    const { judge, seen } = judgeOf(() => "same");
    const o = await run(text, quote, judge);
    assert.equal(o.shipped, false, text);
    assert.ok(seen.some((i) => i.note === quote), "the judge still saw the note, which is what lets the sidecar say both");
    assert.equal(o.entry?.dropBy, "rules"); assert.equal(o.entry?.verdict, "same"); assert.ok(o.entry?.rule);
    assert.ok(o.r.dropped!.some((d) => /^note rules /.test(d.reason)), JSON.stringify(o.r.dropped));
    assert.equal(o.r.judgeSidecar!.rulesDropped, 1); assert.equal(o.r.judgeSidecar!.kept, 1); // only the faithful control counts as kept
  }
});

test("D-151: a note only the judge rejects is dropped (judge only)", async () => {
  const text = "We decided to open the intake in March.";
  const { judge } = judgeOf((i) => (i.note === text ? "different" : "same"));
  const o = await run(text, text, judge);
  assert.equal(o.shipped, false); assert.equal(o.entry?.dropBy, "judge"); assert.equal(o.entry?.rule, undefined);
  assert.ok(o.r.dropped!.some((d) => /^note judge different/.test(d.reason))); assert.equal(o.r.judgeSidecar!.rulesDropped, 0);
});

test("D-151: a note both the judge and the rules reject is dropped and recorded as both", async () => {
  const [text, quote] = RULE_ONLY[0]!;
  const { judge } = judgeOf((i) => (i.note === quote ? "different" : "same"));
  const o = await run(text, quote, judge);
  assert.equal(o.shipped, false); assert.equal(o.entry?.dropBy, "both"); assert.equal(o.entry?.verdict, "different"); assert.ok(o.entry?.rule);
  assert.ok(o.r.dropped!.some((d) => /^note judge\+rules /.test(d.reason))); assert.equal(o.r.judgeSidecar!.dropped, 1); assert.equal(o.r.judgeSidecar!.rulesDropped, 0);
});

test("D-151: a note both the judge and the rules accept ships, with a clean audit and no drop entry", async () => {
  const text = "We decided to open the intake in March.";
  const { judge } = judgeOf(() => "same");
  const o = await run(text, text, judge);
  assert.equal(o.shipped, true); assert.equal(o.r.dropped!.length, 0); assert.deepEqual(o.r.judgeSidecar!.entries, []);
  assert.deepEqual(auditGroundedNotes(o.r.page, o.turns, { judged: true }), []);
});

test("D-151: the default no-judge path is unchanged (same drops, same reasons, no sidecar)", async () => {
  for (const [text, quote] of RULE_ONLY) {
    const o = await run(text, quote);
    assert.equal(o.shipped, false); assert.equal(o.r.judgeSidecar, undefined);
    assert.ok(o.r.dropped!.some((d) => /quote is not a whole sentence or clause: (omits-qualifier|negated-by-reply)/.test(d.reason)), JSON.stringify(o.r.dropped));
  }
});

test("D-151: sentenceSpanProblem(judged) is still structural only; lexicalNegationProblem is the split-out rule half", () => {
  const t = "Apply in March; not for freshers.";
  assert.equal(sentenceSpanProblem(t, 0, 15, { judged: true }), null); assert.equal(sentenceSpanProblem(t, 0, 15), "omits-qualifier"); assert.equal(lexicalNegationProblem(t, 0, 15), "omits-qualifier");
});

test("D-151: replay every recorded ISS-T040GEN-* case (incl. -012) against an ALWAYS-same judge; per id, how many lax-shipped cases the rules now catch", async () => {
  const ids = [...new Set(ATTACKS.map((a) => a.id))];
  const lines: string[] = []; let laxBefore = 0, caughtNow = 0;
  for (const id of ids) {
    const cases = ATTACKS.filter((a) => a.id === id);
    let before = 0, caught = 0;
    for (const a of cases) {
      const s = a.text.indexOf(a.quote); assert.ok(s >= 0);
      const shippedBefore = sentenceSpanProblem(a.text, s, s + a.quote.length, { judged: true }) === null; // old judged-mode behaviour: structural rules only
      const { judge } = judgeOf(() => "same");
      const now = (await run(a.text, a.quote, judge)).shipped;
      if (shippedBefore) { before++; if (!now) caught++; }
      assert.equal(!now, !shippedBefore || lexicalNegationProblem(a.text, s, s + a.quote.length) !== null, `${a.text} => ${a.quote}`);
    }
    laxBefore += before; caughtNow += caught;
    lines.push(`${id}: ${before}/${cases.length} shipped with an always-same judge before D-151; the rules now catch ${caught}/${before}`);
  }
  console.log(lines.join("\n") + `\nTOTAL: ${laxBefore} shipped before, rules now catch ${caughtNow}`);
  // was 11 before t040reject cycle 1: the structural layer (ISS-T040GEN-010/-012 merge rule) now refuses the abbreviation cases itself, so fewer ship with a lax judge.\n  assert.equal(laxBefore, 4, "the 4 recorded cases that still ship structurally and only the lexical rules catch");
});

// ---------------- claims (D-151 covers notes AND claims) ----------------
import { extractClaims } from "../claims.js";
const claimOf = (turnId: string, quote: string) => ({ text: quote, origin: "speaker-statement", verification: "unverified", evidence: [{ turnId, sessionId: SID, quote }] });
async function runClaim(text: string, quote: string, judge?: NoteJudge) {
  const turns = [turn("c0", "spk:0", FEE, 0), turn("a1", "spk:1", text, 10)];
  const r = await extractClaims(turns, model(() => ({ claims: [claimOf("c0", FEE), claimOf("a1", quote)] })), { strictWebinar: true, dropUnverified: true, ...(judge ? { noteJudge: judge } : {}) });
  assert.equal(r.degraded, null);
  assert.ok(r.claims.some((c) => c.text === FEE), "the faithful control ships");
  return { r, shipped: r.claims.some((c) => c.evidenceTurnIds.includes("a1")), entry: r.judgeSidecar?.entries.find((e) => e.note.startsWith(quote.slice(0, 20))) };
}

test("D-151 claims: judge says same but the rules reject: dropped, dropBy rules; judge-only dropped; both recorded; both accept ships", async () => {
  for (const [text, quote] of RULE_ONLY) {
    const o = await runClaim(text, quote, judgeOf(() => "same").judge);
    assert.equal(o.shipped, false, text); assert.equal(o.entry?.dropBy, "rules"); assert.equal(o.r.judgeSidecar!.rulesDropped, 1);
    assert.ok(o.r.dropped!.some((d) => /^note rules /.test(d.reason)));
  }
  const ok = "We decided to open the intake in March.";
  const jo = await runClaim(ok, ok, judgeOf((i) => (i.note === ok ? "different" : "same")).judge);
  assert.equal(jo.shipped, false); assert.equal(jo.entry?.dropBy, "judge");
  const [t, q] = RULE_ONLY[0]!;
  const both = await runClaim(t, q, judgeOf((i) => (i.note === q ? "different" : "same")).judge);
  assert.equal(both.shipped, false); assert.equal(both.entry?.dropBy, "both");
  const fine = await runClaim(ok, ok, judgeOf(() => "same").judge);
  assert.equal(fine.shipped, true); assert.deepEqual(fine.r.judgeSidecar!.entries, []);
});

test("D-151 claims: the no-judge path is unchanged", async () => {
  for (const [text, quote] of RULE_ONLY) {
    const o = await runClaim(text, quote);
    assert.equal(o.shipped, false); assert.equal(o.r.judgeSidecar, undefined);
    assert.ok(o.r.dropped!.some((d) => /quote is not a whole sentence or clause/.test(d.reason)));
  }
});
