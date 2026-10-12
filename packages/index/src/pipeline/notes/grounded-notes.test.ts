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

type Obj = Record<string, any>;
const SID = "s1";
function turn(id: string, speakerRef: string, text: string, tStart = 0, tEnd = tStart + 1, sessionId = SID): Turns {
  return { _id: id, tenantId: "t1", sessionId, speakerRef, tStart, tEnd, text };
}
const reply = (o: unknown): CompleteResult => ({ text: JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const ev = (turnId: string, quote: string, sessionId = SID) => ({ turnId, sessionId, quote });

interface Script {
  /** the fake model's extraction for one window */
  extract: (spans: Obj[], p: Obj) => { items?: Obj[]; qa?: Obj[]; claims?: Obj[] };
  answers?: (questions: Obj[], spans: Obj[]) => Obj[];
  verdict?: (id: string, mode: string, p: Obj) => Partial<{ supported: boolean; categoryCorrect: boolean; answerRelevant: boolean }>;
  mutate?: (phase: string, r: Obj) => void;
}
/** A scripted fake model for the summarize + claims seams. */
function model(s: Script) {
  return async (job: Job): Promise<CompleteResult> => {
    const p = JSON.parse(job.messages[1]!.content) as Obj;
    let r: Obj;
    if (p.phase === "extract-summary" || p.phase === "extract-claims") r = { processed: p.inventory, items: [], qa: [], claims: [], ...s.extract(p.spans, p) };
    else if (p.phase === "reconcile-questions") r = { processed: p.inventory, answers: (s.answers?.(p.questions, p.spans) ?? p.questions.map((q: Obj) => ({ id: q.id, answer: null, answerEvidence: [] }))) };
    else r = { processed: p.inventory, complete: true, noContent: p.items.length === 0, noClaims: p.items.length === 0,
      verdicts: p.items.map((i: Obj) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true, ...s.verdict?.(i.id, p.mode, p) })) };
    s.mutate?.(p.phase, r);
    return reply(r);
  };
}
const item = (kind: string, turnId: string, quote: string, extra: Obj = {}) => ({ kind, text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(turnId, quote)], ...extra });
const run = (turns: Turns[], m: ReturnType<typeof model>, drop = true) => summarizeSession(turns, m, { strictWebinar: true, dropUnverified: drop });
const kindOf = (p: Obj, id: string) => (p.items as Obj[]).find((i) => i.id === id)?.kind;

const FEE = "The programme fee is 1,000 rupees today.";
const DEC = "We decided to open the intake in March.";
const ACT = "Priya will send the brochure by Friday.";
const base = () => [turn("t1", "spk:0", FEE, 0, 5), turn("t2", "spk:1", DEC, 10, 14), turn("t3", "spk:1", ACT, 20, 24)];
const Q = "What is the application deadline for the scholarship?";
const A = "The scholarship deadline is the fifteenth of March.";
const THANKS = "Thank you everyone for joining today.";

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
    ["judge incomplete", (ph, r) => { if (ph === "judge") r.complete = false; }],
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
  const S = "Apply early, because seats fill fast. We do not recommend applying in March.";
  const ok: [string, string][] = [
    [S, "Apply early, because seats fill fast."], [S, "We do not recommend applying in March."], [S, "We do not recommend applying in March"],
    [S, "because seats fill fast."], ["Honestly, the fee is 1,000 rupees today.", "the fee is 1,000 rupees today."],
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
  const t2 = "Fees are not 3.5 lakh. Fees are 4.5 lakh."; assert.equal(sentenceSpanProblem(t2, t2.indexOf("Fees are 4"), t2.length), null);
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
  for (const [text, q] of [["We do not recommend it. Apply in March works.", "Apply in March works."], ["Dr. Rao said March works. We do not recommend April for anyone.", "Dr. Rao said March works."], ["Cost is 3.5 lakh. We do not recommend April for anyone.", "Cost is 3.5 lakh."], ["We do not want item 3. March works fine here.", "March works fine here."], ["No. 5 is good. Apply in March works.", "Apply in March works."], ["I said no. Apply in March works.", "Apply in March works."]] as const)
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
  for (const [text, q] of [["Apply in March? Absolutely not.", "Apply in March?"], ["Should we apply in March? Definitely not!", "Should we apply in March?"], ["Apply in March? No.", "Apply in March?"], ["Apply in March? Never.", "Apply in March?"], ["Apply in March? Nahi.", "Apply in March?"], ["Fees are 1000 rupees. I don’t think so.", "Fees are 1000 rupees."], ["Apply in March? \"Absolutely not.\"", "Apply in March?"]] as const) {
    assert.equal(await spanOf(text, q), "negated-by-reply", text);
    assert.equal((await emitted(text, q)).kept, false, text);
  }
  for (const [text, q] of [["Apply in March? Yes, apply early.", "Apply in March?"], ["Apply in March? Absolutely, apply early and carefully today now.", "Apply in March?"], ["Apply in March? Sure.", "Apply in March?"], ["Apply in March? We do not recommend April for anyone here today.", "Apply in March?"]] as const)
    assert.equal(await spanOf(text, q), null, text);
  const kept = await emitted("Apply in March? Yes, absolutely.", "Apply in March?"); assert.equal(kept.kept, true);
});
