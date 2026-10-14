/**
 * T-040 grounded notes, sentence-span / negation replays (split out of grounded-notes.test.ts; test bodies unchanged).
 * A FAKE model only: no provider, no network, no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditGroundedNotes } from "./evidence.js";
import { DEC, Q, THANKS, ev, item, model, run, turn } from "./grounded-notes-fixtures.js";

const emitted = async (text: string, quote: string) => {
  const turns = [turn("t1", "spk:0", text), turn("t2", "spk:1", DEC, 10, 14)];
  const r = await run(turns, model({ extract: () => ({ items: [item("insight", "t1", quote), item("insight", "t2", DEC)] }) }));
  if (r.degraded) throw new Error(JSON.stringify(r.degraded));
  return { r, kept: r.page.citedItems!.some((i) => i.evidence[0].turnId === "t1"), turns };
};
test("ISS-T040GEN-002 replay: a quote that drops a governing negation is dropped (checker's reproductions, verbatim)", async () => {
  for (const [src, quote] of [["We do not recommend applying in March", "recommend applying in March"], ["I do not think it is safe to wait", "think it is safe to wait"], ["Never apply before the deadline opens", "apply before the deadline opens"]] as const) {
    const { r, kept, turns } = await emitted(src, quote);
    assert.equal(kept, false, quote); assert.equal(r.degraded, null);
    assert.equal(r.page.citedItems!.length, 1, "the sibling survives");
    assert.ok(r.dropped!.some((d) => /whole sentence or clause/.test(d.reason)), JSON.stringify(r.dropped));
    assert.deepEqual(auditGroundedNotes(r.page, turns), []);
  }
});
test("sentence-span rule: whole sentences and clauses on punctuation still pass; cuts and omitted qualifiers do not", async () => {
  const S = "Apply early, because seats fill quickly. We do not recommend applying in March.";
  const ok: [string, string][] = [
    [S, "Apply early, because seats fill quickly."], [S, "We do not recommend applying in March."], [S, "We do not recommend applying in March"],
    [S, "because seats fill quickly."], ["Honestly, the fee is 1,000 rupees today.", "the fee is 1,000 rupees today."],
    ["Hello all. \"The fee is 1,000 rupees today.\" Thanks.", "The fee is 1,000 rupees today."],
    ["Fee kitna hai, wo bataya nahi gaya.", "wo bataya nahi gaya."], ["Yeh option achha hai। Fees 1000 rupees hai।", "Fees 1000 rupees hai।"],
  ];
  const bad: [string, string, string][] = [
    [S, "recommend applying in March.", "starts-mid-sentence"], [S, "Apply early, because seats fill", "ends-mid-sentence"],
    ["The revenue is not up this quarter, sadly.", "The revenue is not up", "ends-mid-sentence"],
    ["Revenue is up this quarter, not down in March.", "Revenue is up this quarter", "omits-qualifier"],
    ["We can apply, unless the portal closes early.", "We can apply", "omits-qualifier"],
    ["Only if you apply early, you get a discount.", "you get a discount.", "omits-qualifier"],
    ["I don't think so, we should apply in March.", "we should apply in March.", "omits-qualifier"],
    ["We won't apply, the portal is closed today.", "the portal is closed today.", "omits-qualifier"],
    ["Wo option achha nahi hai, fees 1000 rupees hai.", "fees 1000 rupees hai.", "omits-qualifier"],
    ["Aaj nahi, kal apply karo please.", "kal apply karo please.", "omits-qualifier"],
    ["If you apply early, you get a discount here.", "you get a discount here.", "omits-qualifier"],
  ];
  const { sentenceSpanProblem } = await import("./sentence-span.js");
  for (const [text, q] of ok) { const i = text.indexOf(q); assert.ok(i >= 0, q); assert.equal(sentenceSpanProblem(text, i, i + q.length), null, q); }
  for (const [text, q, why] of bad) { const i = text.indexOf(q); assert.ok(i >= 0, q); assert.equal(sentenceSpanProblem(text, i, i + q.length), why, q); }
  for (const [text, q] of ok) assert.equal((await emitted(text, q)).kept, true, q);
  for (const [text, q] of bad) assert.equal((await emitted(text, q)).kept, false, q);
});
test("a number joiner is not a sentence break, and a Q&A answer that cuts a negation reverts to unanswered", async () => {
  const { sentenceSpanProblem } = await import("./sentence-span.js");
  const t = "Fees are not 3.5 lakh; fees are 4.5 lakh."; const q = "fees are 4.5 lakh.";
  assert.equal(sentenceSpanProblem(t, t.indexOf(q), t.indexOf(q) + q.length), "omits-qualifier", "the not before 3.5 is in the same sentence");
  const t2 = "Fees are not 3.5 rupees. Fees are 4.5 rupees."; assert.equal(sentenceSpanProblem(t2, t2.indexOf("Fees are 4"), t2.length), null); // (a <=4-letter word like "lakh" before a capital merges when a marker is on the left, ISS-T040GEN-010)
  const NEG = "We do not accept applications after the fifteenth of March.", cut = "accept applications after the fifteenth of March.";
  const turns = [turn("q1", "spk:0", Q, 0, 2), turn("a1", "spk:1", NEG, 3, 6), turn("pad", "spk:1", THANKS, 7, 8)];
  const asked = { question: Q, questionEvidence: [ev("q1", Q)], answer: null, answerEvidence: [], status: "unanswered" };
  const m = model({ extract: (spans) => ({ items: [item("insight", "pad", THANKS)], qa: spans.some((s) => s.turnId === "q1") ? [asked] : [] }),
    answers: (qs) => qs.map((x) => ({ id: x.id, answer: cut, answerEvidence: [ev("a1", cut)] })) });
  const r = await run(turns, m);
  const entry = r.page.qa!.find((x) => x.question === Q)!;
  assert.equal(entry.status, "unanswered"); assert.equal(entry.answer, null); assert.deepEqual(entry.answerEvidence, []);
});
test("a quote that occurs twice is judged per occurrence: one clean occurrence is enough", async () => {
  const { kept } = await emitted("Not good, apply early today. Fine, apply early today.", "apply early today");
  assert.equal(kept, true);
  assert.equal((await emitted("Not good, apply early today. Then apply early today.", "apply early today")).kept, false);
});

// ---- Fix cycle 2: ISS-T040GEN-006 (abbreviation periods) and ISS-T040GEN-007 ----
const spanOf = async (text: string, q: string) => { const { sentenceSpanProblem } = await import("./sentence-span.js"); const i = text.indexOf(q); assert.ok(i >= 0, q); return sentenceSpanProblem(text, i, i + q.length); };
test("ISS-T040GEN-006 replay: the checker's 5 abbreviation reproductions are dropped (verbatim)", async () => {
  const cases: [string, string][] = [
    ["I do not think e.g. March works for everyone.", "March works for everyone."],
    ["We do not accept applications from the U.S. after March first.", "after March first."],
    ["We do not recommend it vs. applying in March works.", "applying in March works."],
    ["We do not recommend this approx. 3.5 lakh fee.", "3.5 lakh fee."],
    ["He said we do not recommend it, Dr. Rao recommends applying in March.", "Rao recommends applying in March."],
  ];
  for (const [text, q] of cases) {
    assert.notEqual(await spanOf(text, q), null, q);
    const { r, kept } = await emitted(text, q);
    assert.equal(kept, false, q); assert.equal(r.degraded, null);
  }
});
test("abbreviation-aware sentence splitting: more abbreviations, fail-closed when ambiguous, real sentences still pass", async () => {
  const bad: [string, string][] = [
    ["We do not do this i.e. the March one works.", "the March one works."], ["We do not apply etc. and then March works.", "and then March works."],
    ["We do not meet Mr. Rao on Monday.", "Rao on Monday."], ["We do not meet Mrs. Rao on Monday.", "Rao on Monday."], ["We do not meet Ms. Rao on Monday.", "Rao on Monday."],
    ["We do not meet Prof. Rao on Monday.", "Rao on Monday."], ["We do not go to St. Xavier campus tomorrow.", "Xavier campus tomorrow."],
    ["We do not go to the U.K. campus tomorrow.", "campus tomorrow."], ["We do not meet at 5 p.m. tomorrow afternoon.", "tomorrow afternoon."],
    ["We do not meet at 5 a.m. tomorrow morning.", "tomorrow morning."], ["We do not ask J. Rao for March approval.", "Rao for March approval."],
    ["We do not like No. 5 on the March list.", "5 on the March list."], ["1. We do not want April. 2. March works fine here.", "March works fine here."],
    ["We do not accept the B.Tech. Rao route works.", "Rao route works."], ["We do not recommend it. e.g. apply in March works.", "apply in March works."],
    ["We do not recommend it. maybe apply in March works.", "maybe apply in March works."],
  ];
  for (const [text, q] of bad) assert.notEqual(await spanOf(text, q), null, q);
  // a real boundary still splits: the next sentence is judged on its own
  for (const [text, q] of [["We do not recommend waiting. Apply in March works.", "Apply in March works."], ["Dr. Rao said March works. We do not recommend April for anyone.", "Dr. Rao said March works."], ["Cost is 3.5 rupees. We do not recommend April for anyone.", "Cost is 3.5 rupees."], ["We do not want item 3. March works fine here.", "March works fine here."], ["No. 5 is excellent. Apply in March works.", "Apply in March works."], ["I said yes. Apply in March works.", "Apply in March works."]] as const)
    assert.equal(await spanOf(text, q), null, q);
});
test("MARKER is a real unicode regex: each \p class blocks glued letters, digits and underscore, and braces do not block", async () => {
  const tail = ", apply in March today."; const q = "apply in March today.";
  for (const glued of ["Wenot", "Ünot", "नnot", "2not", "٣not", "_not", "notx", "not_", "notü", "not2", "pnot", "lnot", "notp", "notl"]) assert.equal(await spanOf(`We ${glued} sure${tail}`, q), null, glued);
  for (const open of ["{not}", "}not{", "(not)", "[not]", "-not-", "'not'", "\"not\""]) assert.equal(await spanOf(`We ${open} sure${tail}`, q), "omits-qualifier", open);
  assert.equal(await spanOf(`We do नहीं, but not${tail}`, q), "omits-qualifier");
});
test("curly n’t is a negation marker exactly like the straight one", async () => {
  const q = "apply in March today.";
  for (const w of ["don’t", "won’t", "isn’t", "can’t", "don't", "won't"]) assert.equal(await spanOf(`We ${w} think so, apply in March today.`, q), "omits-qualifier", w);
  assert.equal(await spanOf(`We don’t think so, apply in March today.`, q), "omits-qualifier");
  assert.equal(await spanOf(`We do tnot think so, apply in March today.`, q), null);
});
test("ISS-T040GEN-007b: a quote followed in the same turn by a short negating reply is dropped", async () => {
  for (const [text, q] of [["Fees are 1000 rupees. Absolutely not.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. No.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. Never.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. Nahi.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. I don’t think so.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. \"Absolutely not.\"", "Fees are 1000 rupees."]] as const) {
    assert.equal(await spanOf(text, q), "negated-by-reply", text);
    assert.equal((await emitted(text, q)).kept, false, text);
  }
  for (const [text, q] of [["Fees are 1000 rupees. Absolutely, apply early and carefully today now.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. And hostel costs extra.", "Fees are 1000 rupees."], ["Fees are 1000 rupees. We do not recommend April for anyone here today.", "Fees are 1000 rupees."]] as const)
    assert.equal(await spanOf(text, q), null, text);
  // ISS-T040GEN-011: a SHORT non-additive follow-up ("Yes, absolutely." / "Sure.") leaves the statement unconfirmed; it is dropped, never shipped
  for (const text of ["Fees are 1000 rupees. Yes, absolutely.", "Fees are 1000 rupees. Sure.", "Fees are 1000 rupees. Yes, apply early."]) assert.equal(await spanOf(text, "Fees are 1000 rupees."), "unconfirmed-by-short-reply", text);
});
// ---- cycle 3: structural fixes (ISS-T040GEN-008, -009) ----
test("ISS-T040GEN-008 replay: the checker's six unlisted-abbreviation cases are dropped (every word-aligned quote)", async () => {
  const { sentenceSpanProblem } = await import("./sentence-span.js");
  const cases: [string, string][] = [
    ["We do not accept Pvt. Colleges applications after March first.", "Colleges applications after March first."],
    ["I do not recommend Univ. Admissions in March for everyone.", "Admissions in March for everyone."],
    ["We never take Asst. Professors in March for this program.", "Professors in March for this program."],
    ["I do not think Ave. Road students apply in March.", "Road students apply in March."],
    ["I do not think the Pkwy. Campus works for everyone in March.", "Campus works for everyone in March."],
    ["We do not apply in the Q1. March works for everyone else.", "March works for everyone else."],
  ];
  for (const [text, q] of cases) {
    const i = text.indexOf(q); assert.ok(i >= 0, q);
    assert.notEqual(sentenceSpanProblem(text, i, i + q.length), null, q);
    assert.equal((await emitted(text, q)).kept, false, q);
    // the whole sentence still ships (its own negation is inside it)
    assert.equal(sentenceSpanProblem(text, 0, text.length), null, text);
  }
});
test("boundary rule: a period breaks only after an ordinary lowercase word or a sentence-final number; every other token fails closed", async () => {
  const { sentenceSpanProblem } = await import("./sentence-span.js");
  const span = (text: string, q: string) => sentenceSpanProblem(text, text.indexOf(q), text.indexOf(q) + q.length);
  // breaks (second sentence stands alone, first sentence's cut is a clean edge)
  for (const [t, a, b] of [["Apply in march. We do not recommend April for anyone.", "Apply in march.", "We do not recommend April for anyone."], ["Fees are 1000 rupees. We do not recommend April for anyone.", "Fees are 1000 rupees.", "We do not recommend April for anyone."], ["I don't remember. Apply in March please.", "Apply in March please.", ""]] as const) {
    assert.equal(span(t, a), null, t);
    if (b) assert.equal(span(t, b), null, t);
  }
  // never breaks: capitalised, mixed-case, digit-bearing, single-letter, unlisted abbreviation tokens, even before a capital word
  for (const tok of ["Pvt", "Univ", "Asst", "Ave", "Pkwy", "Q1", "PhD", "iPhone", "Xyz", "J", "A1", "UNIV", "Mar", "x", "i"]) {
    const t = `We do not accept ${tok}. Colleges applications after March first.`, q = "Colleges applications after March first.";
    assert.notEqual(span(t, q), null, tok);
  }
  // a plain number ending a sentence is a break, a list number opening one is not
  assert.equal(span("The fee is 1000. We do not recommend April for anyone.", "We do not recommend April for anyone."), null);
  assert.equal(span("1. Apply early for the March intake.", "Apply early for the March intake."), "starts-mid-sentence");
  // an ordinary lowercase word, apostrophes inside it, is a break
  assert.equal(span("We do not apply, it's finished. Colleges applications open in March.", "Colleges applications open in March."), null);
  // known lowercase abbreviation does not break even when typed in lower case
  assert.notEqual(span("We do not accept govt. Colleges applications after March first.", "Colleges applications after March first."), null);
});
test("ISS-T040GEN-009: a quote inside a question sentence is never evidence for a statement item (any reply), but still is for a question", async () => {
  const { sentenceSpanProblem } = await import("./sentence-span.js");
  for (const [text, q] of [["Apply in March? Wrong.", "Apply in March?"], ["Apply in March? Incorrect.", "Apply in March?"], ["Apply in March? I disagree.", "Apply in March?"], ["Apply in March? Bad idea.", "Apply in March?"], ["Apply in March? That is false.", "Apply in March?"], ["Should we apply, or wait? Sure.", "Should we apply,"], ["Should we apply in March?", "Should we apply in March?"], ["so ok. Should we apply in March? \"Yes.\"", "Should we apply in March?"]] as const) {
    const i = text.indexOf(q);
    assert.equal(sentenceSpanProblem(text, i, i + q.length), "is-question", text);
    assert.equal((await emitted(text, q)).kept, false, text);
    assert.equal(sentenceSpanProblem(text, i, i + q.length, { allowQuestion: true }) === "is-question", false, text);
  }
  // a statement before or after the question is untouched
  assert.equal(await spanOf("Fees are 1000 rupees. Should we apply in March or wait until the next intake? Yes.", "Fees are 1000 rupees."), null);
});
// ---- cycle 4: ISS-T040GEN-010 and ISS-T040GEN-011 (structural) ----
test("ISS-T040GEN-010 replay: unlisted LOWER-CASE abbreviations before a capital word do not break (checker's cases verbatim)", async () => {
  for (const [ab, nxt] of [["pvt.", "Colleges"], ["univ.", "Colleges"], ["mgmt.", "Quota"], ["pg.", "Courses"], ["asst.", "Dean"], ["qtr.", "Fees"]] as const) {
    const text = `We do not accept ${ab} ${nxt} applications after March first.`, tail = `${nxt} applications after March first.`;
    assert.equal(await spanOf(text, tail), "starts-mid-sentence", text);
    assert.equal((await emitted(text, tail)).kept, false, text);
    assert.equal(await spanOf(text, text), null, "the whole sentence still ships: " + text);
  }
  // cost, stated: a <=4-letter word that really ends a sentence merges when a marker is on the left; with no marker on the left it still breaks
  assert.equal(await spanOf("We do not like it. Fees are 1000 rupees.", "Fees are 1000 rupees."), "starts-mid-sentence");
  assert.equal(await spanOf("We do not like that. Fees are 1000 rupees.", "Fees are 1000 rupees."), "starts-mid-sentence"); assert.equal(await spanOf("We do not like waiting. Fees are 1000 rupees.", "Fees are 1000 rupees."), null);
  assert.equal(await spanOf("It is good now. Fees are 1000 rupees today.", "Fees are 1000 rupees today."), null);
  // a >4-letter lower-case word is an ordinary word: still a break
  assert.equal(await spanOf("We do not accept pvtly. Colleges applications after March first.", "Colleges applications after March first."), null);
});
test("ISS-T040GEN-011 replay: a statement followed by a rejection, a retraction cue or a short non-continuation is dropped (checker's cases verbatim)", async () => {
  const S = "Fees are 1000 rupees.";
  for (const [rest, why] of [
    ["Wrong.", "retracted-by-reply"], ["Ignore that.", "retracted-by-reply"], ["Not for freshers at this college though.", "retracted-by-reply"],
    ["Scratch that, it is 1200 rupees.", "retracted-by-reply"], ["Scratch that, fees are 1200 rupees for everyone here today.", "retracted-by-reply"],
    ["I mean 1200 rupees for freshers in this college.", "retracted-by-reply"], ["Sorry, I misspoke about that fee earlier today.", "retracted-by-reply"],
    ["Actually it is 1200 rupees for everyone in the college.", "retracted-by-reply"], ["Correction, it is 1200 rupees for everyone here.", "retracted-by-reply"],
    ["That is not true for any college in the city.", "retracted-by-reply"], ["Nahi, it is 1200 rupees for freshers in this college.", "negated-by-reply"],
    ["And scratch that, it is 1200 rupees for everyone here.", "retracted-by-reply"], ["Incorrect.", "retracted-by-reply"], ["I disagree.", "retracted-by-reply"],
    ["Wrong figure for the whole college and all of its branches.", "retracted-by-reply"],
  ] as const) {
    const text = `${S} ${rest}`, got = await spanOf(text, S);
    assert.notEqual(got, null, text); assert.equal((await emitted(text, S)).kept, false, text);
    if (why !== "negated-by-reply") assert.equal(got, why, text);
  }
  // a clause quote followed by a retraction clause
  assert.equal(await spanOf("Fees are 1000 rupees, wrong, it is 1200 rupees for everyone.", "Fees are 1000 rupees,"), "retracted-by-reply");
  // additive / unrelated longer follow-ups still ship, the last sentence of a turn ships
  for (const text of ["Fees are 1000 rupees. And the hostel costs extra for everyone.", "Fees are 1000 rupees. Also, the hostel costs extra for all students.", "Fees are 1000 rupees. The hostel costs extra for all students here.", "Fees are 1000 rupees."]) assert.equal(await spanOf(text, S), null, text);
  // the threshold is a parameter: N=0 turns the short rule off, N=8 widens it
  const { sentenceSpanProblem } = await import("./sentence-span.js"), t = "Fees are 1000 rupees. The hostel costs extra for you.";
  assert.equal(sentenceSpanProblem(t, 0, S.length, { shortFollowWords: 0 }), null); assert.equal(sentenceSpanProblem(t, 0, S.length, { shortFollowWords: 8 }), "unconfirmed-by-short-reply");
});

// ---- cycle 1 (checker FAIL cycle 0): D-015 -- re-run each issue's OWN recorded reproductions verbatim from qa/issues.t040gen.jsonl ----
test("ISS-T040GEN-010/-011/-012: every reproduction recorded in the ledger row is refused (counts by id)", async () => {
  const { readFileSync } = await import("node:fs"), { sentenceSpanProblem } = await import("./sentence-span.js");
  const rows = readFileSync(new URL("../../../../../qa/issues.t040gen.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const expected: Record<string, number> = { "ISS-T040GEN-010": 1, "ISS-T040GEN-011": 3, "ISS-T040GEN-012": 2 };
  const report: string[] = [];
  for (const [id, min] of Object.entries(expected)) {
    const row = rows.find((r) => r.id === id); assert.ok(row, id);
    let last = ""; const cases: (readonly [string, string])[] = []; // `"T" ships "Q"` / `"T" -> "Q"`, and `"T" ships it` (re-uses the previous Q)
    for (const m of String(row.evidence).matchAll(/"([^"]+)"\s*(?:ships|->)\s*(?:"([^"]+)"|it\b)/g)) { last = m[2] ?? last; cases.push([m[1]!, last] as const); }
    assert.ok(cases.length >= min, `${id}: parsed ${cases.length} recorded cases, expected >= ${min}`);
    let refused = 0;
    for (const [text, quote] of cases) { const i = text.indexOf(quote); assert.ok(i >= 0, quote); if (sentenceSpanProblem(text, i, i + quote.length) !== null) refused++; }
    report.push(`${id}: ${refused}/${cases.length} refused`);
    assert.equal(refused, cases.length, `${id}: ${report.at(-1)}`);
  }
  console.log(report.join("; "));
});
test("ISS-T040GEN-012: marker AFTER an unlisted lower-case abbreviation -- the left fragment and the whole merged sentence behave (checker's variants + controls)", async () => {
  const { sentenceSpanProblem } = await import("./sentence-span.js");
  const leftShips: [string, string][] = [
    ["Admission is open for pvt. Colleges do not take March applications.", "Admission is open for pvt."],
    ["Admission is open for pvt. Colleges only if you apply early.", "Admission is open for pvt."],
    ["Seats are open in pvt. Colleges but not in govt ones.", "Seats are open in pvt."],
    ["Admission is open for univ. Colleges do not take March applications.", "Admission is open for univ."],
    ["Seats are open in mgmt. Quota but not in govt ones.", "Seats are open in mgmt."],
    ["Admission is open for pg. Courses unless you apply early.", "Admission is open for pg."],
    ["Admission is open for asst. Deans never in March.", "Admission is open for asst."],
  ];
  for (const [text, q] of leftShips) assert.notEqual(sentenceSpanProblem(text, 0, q.length), null, q);
  // the whole merged sentence still ships (recall), and an abbreviation with no marker anywhere is still a plain break
  assert.equal(sentenceSpanProblem(leftShips[0]![0], 0, leftShips[0]![0].length), null);
  const plain = "Admission is open for pvt. Colleges in March are usually quite crowded every year.";
  assert.equal(sentenceSpanProblem(plain, 0, "Admission is open for pvt.".length), null);
  assert.equal(sentenceSpanProblem("Apply early. Seats fill quickly in the popular colleges.", 0, "Apply early.".length), null);
});
