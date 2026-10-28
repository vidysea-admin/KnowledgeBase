/**
 * T-040 grounded notes: the drop-unverified generation path (summarizeSession / extractClaims with
 * { strictWebinar, dropUnverified }). A FAKE model only: no provider, no network, no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { summarizeSession } from "../summarize.js";
import { extractClaims } from "../claims.js";
import { auditGroundedNotes, citationTimes } from "./evidence.js";

import { FEE, DEC, ACT, Q, A, THANKS, SID, base, ev, item, kindOf, model, reply, run, turn, type Obj, type Script } from "./grounded-notes-fixtures.js";

test("verifier gate: a fabricated quote is dropped, the verbatim sibling is emitted, nothing is degraded", async () => {
  const turns = base();
  const m = model({ extract: () => ({ items: [item("insight", "t1", FEE), item("insight", "t1", "The programme fee is 9,000 rupees today."), item("decision", "t2", DEC), item("action", "t3", ACT)] }) });
  const r = await run(turns, m);
  assert.equal(r.degraded, null);
  assert.deepEqual(r.page.citedItems!.map((i) => i.kind), ["insight", "decision", "action"]);
  assert.equal(r.dropped!.length, 1); assert.match(r.dropped![0]!.reason, /quote refused: not-found/);
  assert.ok(!JSON.stringify(r.page).includes("9,000"));
  assert.deepEqual(r.page.decisions, [DEC]); assert.deepEqual(r.page.actionItems, [ACT]);
  assert.deepEqual(auditGroundedNotes(r.page, turns), []);
  for (const i of r.page.citedItems!) for (const e of i.evidence) assert.ok(turns.find((t) => t._id === e.turnId)!.text.includes(e.quote));
});

test("every strict-verifier refusal and binding failure drops the item (table)", async () => {
  const turns = base();
  const cases: [string, Obj][] = [
    ["mid-word start", item("insight", "t1", "rogramme fee is 1,000 rupees today.")],
    ["mid-token cut", item("insight", "t1", "The programme fee is 1")],
    ["too short", item("insight", "t3", "Priya will")],
    ["stitched ellipsis", item("insight", "t1", "The programme fee ... 1,000 rupees today.")],
    ["spans two turns", item("insight", "t1", `${FEE} ${DEC}`)],
    ["unknown turn", item("insight", "nope", FEE)],
    ["wrong turn", item("insight", "t2", FEE)],
    ["foreign session", { ...item("insight", "t1", FEE), evidence: [ev("t1", FEE, "other")] }],
    ["no evidence", { ...item("insight", "t1", FEE), evidence: [] }],
    ["unknown kind", item("fact", "t1", FEE)],
    ["origin lies", item("insight", "t1", FEE, { origin: "screen-ocr" })],
    ["verification lies", item("insight", "t1", FEE, { verification: "verified" })],
    ["paraphrased text", item("insight", "t1", FEE, { text: "Fees are about a thousand." })],
    ["text adds a fact", item("insight", "t1", FEE, { text: `${FEE} Scholarships exist.` })],
    ["not an object", "garbage" as never],
  ];
  const m = model({ extract: () => ({ items: [item("insight", "t2", DEC), ...cases.map(([, c]) => c)] }) });
  const r = await run(turns, m);
  assert.equal(r.degraded, null);
  assert.equal(r.page.citedItems!.length, 1, "only the verified sibling survives");
  assert.equal(r.dropped!.length, cases.length, JSON.stringify(r.dropped));
  assert.deepEqual(auditGroundedNotes(r.page, turns), []);
});

test("typographic variants are accepted but the emitted quote is the exact source slice", async () => {
  const src = "She said we’ll review the “growth plan” — carefully — next week.";
  const turns = [turn("t1", "spk:0", src)];
  const q = "She said we'll review the \"growth plan\" - carefully - next week.";
  const r = await run(turns, model({ extract: () => ({ items: [item("insight", "t1", q)] }) }));
  assert.equal(r.degraded, null); assert.equal(r.page.citedItems!.length, 1);
  const expected = src;
  assert.equal(r.page.citedItems![0]!.evidence[0]!.quote, expected);
  assert.equal(r.page.citedItems![0]!.text, expected);
});

test("timestamps: each citation resolves to its own turn's start/end, screen origin stays unverified", async () => {
  const ocr = "[Screen OCR; unverified] Fee 1000 INR per seat.";
  const screen = { ...turn("scr", "screen", ocr, 30, 31), screenEvidence: { frameId: "f1", file: "screen-frames/a/frame-1.jpg", hash: "a".repeat(64), tStart: 30 } };
  const turns = [...base(), screen];
  const m = model({ extract: () => ({ items: [item("insight", "t1", FEE), item("decision", "t2", DEC), item("insight", "scr", ocr, { origin: "screen-ocr" })] }) });
  const r = await run(turns, m);
  assert.equal(r.degraded, null);
  const times = r.page.citedItems!.map((i) => citationTimes(i.evidence, turns)[0]!);
  assert.deepEqual(times.map((t) => [t.turnId, t.tStart, t.tEnd]), [["t1", 0, 5], ["t2", 10, 14], ["scr", 30, 31]]);
  const scr = r.page.citedItems!.find((i) => i.evidence[0].turnId === "scr")!;
  assert.equal(scr.origin, "screen-ocr"); assert.equal(scr.verification, "unverified");
});

test("Q&A: answered only with verified answer evidence, otherwise unanswered with null answer and no evidence", async () => {
  const turns = [turn("q1", "spk:0", Q, 0, 2), turn("a1", "spk:1", A, 3, 6), turn("pad", "spk:1", THANKS, 7, 8)];
  const cases: [string, (qs: Obj[]) => Obj[], string][] = [
    ["verified answer", (qs) => qs.map((x) => ({ id: x.id, answer: A, answerEvidence: [ev("a1", A)] })), "answered"],
    ["fabricated answer quote", (qs) => qs.map((x) => ({ id: x.id, answer: "The deadline is the first of May.", answerEvidence: [ev("a1", "The deadline is the first of May.")] })), "unanswered"],
    ["answer without evidence", (qs) => qs.map((x) => ({ id: x.id, answer: A, answerEvidence: [] })), "unanswered"],
    ["answer text not its quote", (qs) => qs.map((x) => ({ id: x.id, answer: "March fifteenth.", answerEvidence: [ev("a1", A)] })), "unanswered"],
    ["null answer", (qs) => qs.map((x) => ({ id: x.id, answer: null, answerEvidence: [] })), "unanswered"],
  ];
  const asked = { question: Q, questionEvidence: [ev("q1", Q)], answer: null, answerEvidence: [], status: "unanswered" };
  for (const [label, answers, expected] of cases) {
    const m = model({ extract: (spans) => ({ items: [item("insight", "pad", THANKS)], qa: spans.some((s) => s.turnId === "q1") ? [asked] : [] }), answers });
    const r = await run(turns, m);
    assert.equal(r.degraded, null, label);
    const entry = r.page.qa!.find((x) => x.question === Q)!;
    assert.equal(entry.status, expected, label);
    if (expected === "unanswered") { assert.equal(entry.answer, null, label); assert.deepEqual(entry.answerEvidence, [], label); }
    else { assert.equal(entry.answer, A); assert.equal(entry.answerEvidence[0]!.turnId, "a1"); assert.equal(entry.questionEvidence[0]!.turnId, "q1"); }
    assert.deepEqual(auditGroundedNotes(r.page, turns), [], label);
  }
  // a fabricated QUESTION quote drops the whole entry
  const fake = "What is the fee for the course?";
  const m = model({ extract: () => ({ items: [item("insight", "pad", THANKS)], qa: [{ ...asked, question: fake, questionEvidence: [ev("q1", fake)] }] }) });
  const r = await run(turns, m);
  assert.deepEqual(r.page.qa, []); assert.equal(r.dropped![0]!.what, "qa");
});

test("judge: wrong-category and unsupported items are dropped; an irrelevant answer reverts to unanswered", async () => {
  const turns = [turn("q1", "spk:0", Q, 0, 2), turn("a1", "spk:1", A, 3, 6), ...base().map((t, i) => ({ ...t, _id: `b${i}`, tStart: 10 + i, tEnd: 10 + i }))];
  const mk = (verdict: Script["verdict"]) => model({ verdict,
    extract: (spans) => ({ items: [item("decision", "b1", DEC), item("insight", "b0", FEE)].filter((i) => spans.some((s) => s.turnId === i.evidence[0]!.turnId)),
      qa: spans.some((s) => s.turnId === "q1") ? [{ question: Q, questionEvidence: [ev("q1", Q)], answer: A, answerEvidence: [ev("a1", A)], status: "answered" }] : [] }) });
  const ok = await run(turns, mk(undefined));
  assert.equal(ok.page.citedItems!.length, 2); assert.equal(ok.page.qa![0]!.status, "answered");
  const catWrong = await run(turns, mk((id, _m, p) => (kindOf(p, id) === "decision" ? { categoryCorrect: false } : {})));
  assert.deepEqual(catWrong.page.citedItems!.map((i) => i.kind), ["insight"]); assert.deepEqual(catWrong.page.decisions, []);
  const unsupported = await run(turns, mk((id, _m, p) => (kindOf(p, id) === "decision" ? { supported: false } : {})));
  assert.equal(unsupported.degraded, null); assert.deepEqual(unsupported.page.citedItems!.map((i) => i.kind), ["insight"]);
  // a page left with no verified insight is not emitted at all (validateRuntimePage requires one)
  const noInsight = await run(turns, mk((id, _m, p) => (kindOf(p, id) === "insight" ? { supported: false } : {})));
  assert.ok(noInsight.degraded); assert.equal(noInsight.page.citedItems, undefined);
  const badQuestion = await run(turns, mk((id, _m, p) => ((p.items as Obj[]).find((i) => i.id === id)?.questionEvidence ? { supported: false } : {})));
  assert.equal(badQuestion.degraded, null); assert.deepEqual(badQuestion.page.qa, []); assert.ok(badQuestion.dropped!.some((d) => d.what === "qa"));
  const irrelevant = await run(turns, mk((id, _m, p) => ((p.items as Obj[]).find((i) => i.id === id)?.answerEvidence ? { answerRelevant: false } : {})));
  assert.equal(irrelevant.page.qa![0]!.status, "unanswered"); assert.equal(irrelevant.page.qa![0]!.answer, null);
  assert.ok(irrelevant.dropped!.some((d) => d.what === "qa-answer"));
});

test("a late answer found in a later window is judged; a rejected late answer leaves the question unanswered", async () => {
  const filler = Array.from({ length: 60 }, (_, i) => turn(`f${i}`, "spk:1", `Filler sentence number ${i} about unrelated programme logistics. `.repeat(8), 10 + i, 10 + i));
  const turns = [turn("q1", "spk:0", Q, 0, 2), ...filler, turn("a1", "spk:1", A, 100, 101)];
  const mk = (reject: boolean) => model({ extract: (spans) => ({ items: [], qa: spans.some((s) => s.turnId === "q1") ? [{ question: Q, questionEvidence: [ev("q1", Q)], answer: null, answerEvidence: [], status: "unanswered" }] : [],
      ...(spans.some((s) => s.turnId === "a1") ? { items: [item("insight", "a1", A)] } : {}) }),
    answers: (qs, spans) => qs.map((x) => (spans.some((s) => s.turnId === "a1") ? { id: x.id, answer: A, answerEvidence: [ev("a1", A)] } : { id: x.id, answer: null, answerEvidence: [] })),
    verdict: (_id, mode) => (reject && mode === "pending-qa" ? { answerRelevant: false } : {}),
    mutate: (ph, r) => { if (ph === "judge") r.noContent = r.verdicts.length === 0; } });
  const good = await run(turns, mk(false));
  assert.equal(good.degraded, null, good.degraded?.reason); assert.equal(good.page.qa![0]!.status, "answered"); assert.equal(good.page.qa![0]!.answerEvidence[0]!.turnId, "a1");
  const bad = await run(turns, mk(true));
  assert.equal(bad.degraded, null, bad.degraded?.reason); assert.equal(bad.page.qa![0]!.status, "unanswered"); assert.equal(bad.page.qa![0]!.answer, null);
});

test("a quote that is real but lies outside the submitted window spans is dropped in that window", async () => {
  const sentences = Array.from({ length: 300 }, (_, i) => `Sentence number ${i} explains programme detail ${i}.`);
  const long = sentences.join(" ");
  const last = sentences[299]!;
  const turns = [turn("long", "spk:1", long, 0, 50)];
  const windowsSeen: number[] = [];
  const m = model({ extract: (spans) => { windowsSeen.push(spans.length); return { items: [item("insight", "long", last), item("insight", "long", sentences[3]!)] }; } });
  const r = await run(turns, m);
  assert.equal(r.degraded, null, r.degraded?.reason);
  assert.ok(windowsSeen.length >= 2, "the turn must span several windows");
  assert.ok(r.dropped!.some((d) => /outside the submitted spans/.test(d.reason)), JSON.stringify(r.dropped));
  assert.deepEqual(r.page.citedItems!.map((i) => i.text).sort(), [last, sentences[3]!].sort());
  assert.deepEqual(auditGroundedNotes(r.page, turns), []);
});

test("protocol failures still degrade the whole page (coverage, incomplete judge, informative gap)", async () => {
  const turns = base();
  const ext = () => ({ items: [item("insight", "t1", FEE)] });
  const faults: [string, Script["mutate"]][] = [
    ["coverage hole", (ph, r) => { if (ph === "extract-summary") r.processed = []; }],
    ["judge missing verdict", (ph, r) => { if (ph === "judge") r.verdicts.pop(); }],
    ["judge unknown id", (ph, r) => { if (ph === "judge") r.verdicts[0].id = "zzz"; }],
    ["items not an array", (ph, r) => { if (ph === "extract-summary") r.items = "x"; }],
  ];
  for (const [label, mutate] of faults) {
    const r = await run(turns, model({ extract: ext, mutate }));
    assert.ok(r.degraded, label); assert.equal(r.page.citedItems, undefined, label);
  }
  // every proposal fabricated while the judge says the window is informative: gap -> degraded, nothing emitted
  const r = await run(turns, model({ extract: () => ({ items: [item("insight", "t1", "Invented sentence that is not there.")] }), mutate: (ph, x) => { if (ph === "judge") x.noContent = false; } }));
  assert.ok(r.degraded); assert.equal(r.page.citedItems, undefined);
});

test("D-185: judge complete=false is advisory -- grounded items still ship and the omission is reported", async () => {
  const r = await run(base(), model({ extract: () => ({ items: [item("insight", "t1", FEE)] }), mutate: (ph, x) => { if (ph === "judge") x.complete = false; } }));
  assert.equal(r.degraded, null); assert.equal(r.page.citedItems!.length, 1);
  assert.ok(r.dropped!.some((d) => /coverage advisory/.test(d.reason)));
});

test("default strict mode is unchanged: without dropUnverified a bad item degrades the page", async () => {
  const m = model({ extract: () => ({ items: [item("insight", "t1", FEE), item("insight", "t1", "Invented sentence that is not there.")] }) });
  const strict = await run(base(), m, false);
  assert.ok(strict.degraded); assert.equal(strict.dropped, undefined);
});

test("seeded property: garbled model quotes never reach the page unless they are verbatim source text", async () => {
  const src = "Our counsellors help students compare universities, scholarships and visa options before applying.";
  const turns = [turn("t1", "spk:0", src)];
  let seed = 20261012; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const words = src.split(" ");
  const variants = Array.from({ length: 200 }, () => {
    const w = [...words], k = Math.floor(rnd() * 3);
    if (k === 0) w.splice(1 + Math.floor(rnd() * (w.length - 2)), 0, "definitely");
    else if (k === 1) w[Math.floor(rnd() * w.length)] = "xyz";
    else w.splice(1 + Math.floor(rnd() * (w.length - 2)), 1);
    return w.join(" ");
  });
  const r = await run(turns, model({ extract: () => ({ items: [item("insight", "t1", src), ...variants.map((v) => item("insight", "t1", v))] }) }));
  assert.equal(r.degraded, null);
  for (const i of r.page.citedItems!) for (const e of i.evidence) assert.ok(src.includes(e.quote), e.quote);
  assert.ok(r.page.citedItems!.length >= 1 && r.dropped!.length >= 150, `emitted ${r.page.citedItems!.length}, dropped ${r.dropped!.length}`);
});

test("claims: fabricated claims are dropped, verified claims carry quote + origin, judge rejections drop", async () => {
  const turns = base();
  const claim = (turnId: string, quote: string, extra: Obj = {}) => ({ text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(turnId, quote)], ...extra });
  const m = model({ extract: () => ({ claims: [claim("t1", FEE), claim("t2", "We decided to open the intake in June."), claim("t3", ACT, { origin: "screen-ocr" }), claim("t2", DEC)] }),
    verdict: (id, _m, p) => ((p.items as Obj[]).find((i) => i.id === id)?.text === DEC ? { supported: false } : {}) });
  const r = await extractClaims(turns, m, { strictWebinar: true, dropUnverified: true });
  assert.equal(r.degraded, null);
  assert.deepEqual(r.claims.map((c) => c.text), [FEE]);
  assert.equal(r.claims[0]!.evidence![0]!.quote, FEE); assert.equal(r.claims[0]!.origin, "speaker-statement");
  assert.equal(r.dropped!.length, 3);
});

// ---- schema validation (JSON Schema Draft 2020-12 via python jsonschema, the approach of schema/validate.py)
const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const PY = "import json,sys\nfrom jsonschema import Draft202012Validator\ns=json.load(open(sys.argv[1],encoding='utf-8'))\nd=json.load(sys.stdin)\nprint(json.dumps([e.message for e in Draft202012Validator(s).iter_errors(d)]))";
function schemaErrors(collection: string, doc: unknown): string[] | undefined {
  const r = spawnSync("python", ["-I", "-c", PY, `${ROOT}schema/${collection}.schema.json`], { input: JSON.stringify(doc), encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) return undefined; // python/jsonschema unavailable
  return JSON.parse(r.stdout) as string[];
}

test("emitted pages and claims validate against schema/*.schema.json; legacy pages stay valid and audit clean", async () => {
  const turns = [turn("q1", "spk:0", Q, 0, 2), turn("a1", "spk:1", A, 3, 6), ...base().map((t, i) => ({ ...t, _id: `b${i}`, tStart: 10 + i, tEnd: 10 + i }))];
  const m = model({ extract: (spans) => ({ items: [item("insight", "b0", FEE), item("decision", "b1", DEC), item("action", "b2", ACT)].filter((i) => spans.some((s) => s.turnId === i.evidence[0]!.turnId)),
    claims: [{ text: FEE, origin: "speaker-statement", verification: "unverified", evidence: [ev("b0", FEE)] }],
    qa: spans.some((s) => s.turnId === "q1") ? [{ question: Q, questionEvidence: [ev("q1", Q)], answer: A, answerEvidence: [ev("a1", A)], status: "answered" }] : [] }) });
  const r = await run(turns, m);
  const claims = await extractClaims(turns, m, { strictWebinar: true, dropUnverified: true });
  assert.equal(r.degraded, null); assert.equal(claims.degraded, null); assert.equal(r.page.qa!.length, 1);
  const p = r.page;
  const doc = { _id: "p1", tenantId: "t1", sessionId: SID, summary: p.summary, keyInsights: p.keyInsights, decisions: p.decisions, actionItems: p.actionItems, citedItems: p.citedItems, qa: p.qa,
    evidence: [...p.citedItems!.flatMap((i) => i.evidence), ...p.qa!.flatMap((x) => [...x.questionEvidence, ...x.answerEvidence])] };
  const errs = schemaErrors("session_pages", doc);
  if (errs === undefined) return void console.log("SKIP schema validation: python/jsonschema unavailable");
  assert.deepEqual(errs, []);
  const claimDoc = { _id: "c1", tenantId: "t1", text: claims.claims[0]!.text, status: "needs-review", evidence: claims.claims[0]!.evidence, origin: claims.claims[0]!.origin };
  assert.deepEqual(schemaErrors("claims", claimDoc), []);
  // negative control: the validator really rejects an unanswered entry that carries an answer
  const bad = structuredClone(doc); bad.qa![0]!.status = "unanswered";
  assert.ok(schemaErrors("session_pages", bad)!.length > 0);
  // old pages: the legacy fixture validates and has nothing to audit
  const legacy = JSON.parse(readFileSync(`${ROOT}schema/fixtures/session_pages/valid.json`, "utf8"));
  assert.deepEqual(schemaErrors("session_pages", legacy), []); assert.deepEqual(auditGroundedNotes(legacy, turns), []);
});

test("auditGroundedNotes flags tampered pages (independent oracle)", async () => {
  const turns = base();
  const page = (await run(turns, model({ extract: () => ({ items: [item("insight", "t1", FEE)] }) }))).page;
  assert.deepEqual(auditGroundedNotes(page, turns), []);
  const tamper = (f: (p: any) => void) => { const p = structuredClone(page) as any; f(p); return auditGroundedNotes(p, turns); };
  assert.ok(tamper((p) => { p.citedItems[0].evidence[0].quote = "The programme fee is 9,000 rupees today."; }).length);
  assert.ok(tamper((p) => { p.citedItems[0].evidence[0].turnId = "t2"; }).length);
  assert.ok(tamper((p) => { p.citedItems[0].text = "Paraphrase of the fee."; }).length);
  assert.ok(tamper((p) => { p.citedItems[0].origin = "screen-ocr"; }).length);
  assert.ok(tamper((p) => { p.qa = [{ id: "x", question: FEE, questionEvidence: p.citedItems[0].evidence, answer: "yes", answerEvidence: [], status: "unanswered" }]; }).length);
});

// ---- cycle 1: ISS-T040GEN-002 sentence/clause-span rule (manifest t040-strict-quote-verifier-and-windowing.md:82) ----
