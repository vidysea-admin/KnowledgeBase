/**
 * T-040 / D-144: the note judge. FAKE judges and a FAKE model only: no provider, no network, no database.
 * The offline corpus replays every recorded ISS-T040GEN-* attack against a deterministic ORACLE judge: it proves the
 * wiring (rules relaxed, judge consulted, sidecar written, nothing shipped), not any model's accuracy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Turns } from "@lkb/core";
import { parseRoutingYaml, type CompleteResult, type Job } from "@lkb/ai";
import { summarizeSession } from "../summarize.js";
import { extractClaims } from "../claims.js";
import { auditGroundedNotes } from "./evidence.js";
import { createLlmNoteJudge, judgeCandidates, makeJudgeContext, writeJudgeSidecar, NOTE_JUDGE_JOB_KIND, type NoteJudge, type NoteJudgeInput } from "./judge.js";
import { ATTACKS, CONTROLS } from "./judge-corpus.js";

type Obj = Record<string, any>;
/** Parse the delimited item blocks the adapter puts in the user message. */
const itemsOf = (content: string): Obj[] => [...content.matchAll(/^<<<NOTE_ITEM (\d+)>>>\n(.*)\n<<<END_NOTE_ITEM \1>>>$/gm)].map((m) => JSON.parse(m[2]!));
const SID = "s1";
const turn = (id: string, speakerRef: string, text: string, tStart: number): Turns => ({ _id: id, tenantId: "t1", sessionId: SID, speakerRef, tStart, tEnd: tStart + 1, text });
const reply = (o: unknown): CompleteResult => ({ text: JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const ev = (turnId: string, quote: string) => ({ turnId, sessionId: SID, quote });
const item = (kind: string, turnId: string, quote: string) => ({ kind, text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(turnId, quote)] });
const claim = (turnId: string, quote: string) => ({ text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(turnId, quote)] });

/** A scripted fake generator model: the extraction is given, every structural verdict passes. */
function model(extract: (spans: Obj[]) => Obj) {
  return async (job: Job): Promise<CompleteResult> => {
    const p = JSON.parse(job.messages[1]!.content) as Obj;
    if (p.phase === "extract-summary" || p.phase === "extract-claims") return reply({ processed: p.inventory, items: [], qa: [], claims: [], ...extract(p.spans) });
    if (p.phase === "reconcile-questions") return reply({ processed: p.inventory, answers: p.questions.map((q: Obj) => ({ id: q.id, answer: null, answerEvidence: [] })) });
    return reply({ processed: p.inventory, complete: true, noContent: p.items.length === 0, noClaims: p.items.length === 0, verdicts: p.items.map((i: Obj) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) });
  };
}

/** A recording fake judge whose answer comes from a function of the note text. */
function fakeJudge(decide: (i: NoteJudgeInput) => "same" | "different" | "unsure", costPerCall = 0.01) {
  const seen: NoteJudgeInput[] = [];
  const judge: NoteJudge = async (batch) => { seen.push(...batch); return { verdicts: batch.map((i) => ({ id: i.id, verdict: decide(i), reason: `fake:${decide(i)}:${i.note.slice(0, 20)}` })), costUsd: costPerCall, inputTokens: 10, outputTokens: 5, model: "fake/judge-1" }; };
  return { judge, seen };
}

const FEE = "The programme fee is 1,000 rupees today.", DEC = "We decided to open the intake in March.", ACT = "Priya will send the brochure by Friday.";
const base = () => [turn("t1", "spk:0", FEE, 0), turn("t2", "spk:1", DEC, 10), turn("t3", "spk:1", ACT, 20)];
const run = (turns: Turns[], m: ReturnType<typeof model>, noteJudge?: NoteJudge, extra: Obj = {}) => summarizeSession(turns, m, { strictWebinar: true, dropUnverified: true, ...(noteJudge ? { noteJudge } : {}), ...extra });

test("the pipeline drops notes the judge marks different or unsure, keeps same, and records both in the sidecar with cost", async () => {
  const turns = base();
  const m = model(() => ({ items: [item("insight", "t1", FEE), item("decision", "t2", DEC), item("action", "t3", ACT)] }));
  const { judge, seen } = fakeJudge((i) => (i.note === DEC ? "different" : i.note === ACT ? "unsure" : "same"));
  const r = await run(turns, m, judge);
  assert.equal(r.degraded, null);
  assert.deepEqual(r.page.citedItems!.map((i) => i.text), [FEE]);
  assert.equal(seen.length, 3);
  const sc = r.judgeSidecar!;
  assert.deepEqual([sc.judged, sc.kept, sc.dropped, sc.unsure, sc.calls], [3, 1, 1, 1, 1]);
  assert.deepEqual(sc.entries.map((e) => [e.verdict, e.note]).sort(), [["different", DEC], ["unsure", ACT]]);
  assert.ok(sc.entries.every((e) => /^fake:/.test(e.reason) && e.turnIds.length === 1));
  assert.equal(sc.costUsd, 0.01); assert.equal(sc.inputTokens, 10); assert.equal(sc.outputTokens, 5); assert.deepEqual(sc.models, ["fake/judge-1"]);
  assert.equal(r.dropped!.filter((d) => /^note judge /.test(d.reason)).length, 2);
  assert.deepEqual(auditGroundedNotes(r.page, turns, { judged: true }), []);
  const dir = mkdtempSync(join(tmpdir(), "judge-sidecar-")); // sidecar is plain JSON on disk
  try { writeJudgeSidecar(join(dir, "s.judge.json"), sc); assert.deepEqual(JSON.parse(readFileSync(join(dir, "s.judge.json"), "utf8")), sc); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a note the judge marks same ships; with no judge injected the sidecar is absent and behaviour is unchanged", async () => {
  const turns = base();
  const m = model(() => ({ items: [item("insight", "t1", FEE), item("decision", "t2", DEC)] }));
  const withJudge = await run(turns, m, fakeJudge(() => "same").judge);
  assert.deepEqual(withJudge.page.citedItems!.map((i) => i.text), [FEE, DEC]);
  assert.equal(withJudge.judgeSidecar!.dropped + withJudge.judgeSidecar!.unsure, 0);
  const without = await run(turns, m);
  assert.equal(without.judgeSidecar, undefined);
  assert.deepEqual(without.page.citedItems!.map((i) => i.text), [FEE, DEC]);
});

test("a missing or invalid citation is still rejected deterministically, and the judge never sees that note", async () => {
  const turns = base();
  const bad = [
    { ...item("insight", "t1", FEE), evidence: [] },
    item("insight", "nope", FEE),
    item("insight", "t1", "The programme fee is 9,000 rupees today."),
    item("insight", "t2", FEE),
  ];
  const m = model(() => ({ items: [item("insight", "t1", FEE), item("decision", "t2", DEC), ...bad] }));
  const { judge, seen } = fakeJudge(() => "same");
  const r = await run(turns, m, judge);
  assert.equal(r.degraded, null);
  assert.deepEqual(r.page.citedItems!.map((i) => i.text), [FEE, DEC]);
  assert.deepEqual(seen.map((i) => i.note), [FEE, DEC]);
  assert.equal(r.dropped!.length, 4);
  assert.ok(r.dropped!.every((d) => !/^note judge/.test(d.reason)));
  // even a judge that says "same" to everything cannot rescue an uncited note
  const c = await extractClaims(turns, model(() => ({ claims: [claim("nope", FEE), { ...claim("t1", FEE), evidence: [] }, claim("t1", FEE)] })), { strictWebinar: true, dropUnverified: true, noteJudge: fakeJudge(() => "same").judge });
  assert.deepEqual(c.claims.map((x) => x.text), [FEE]);
  assert.equal(c.dropped!.length, 2);
  // a candidate whose citation cannot be resolved at judge time is "different" without a judge call
  const probe = fakeJudge(() => "same"), jc = makeJudgeContext(probe.judge);
  const keep = await judgeCandidates(jc, turns, [{ id: "x", kind: "insight", note: FEE, evidence: [ev("nope", FEE)] }]);
  assert.equal(keep.size, 0); assert.equal(probe.seen.length, 0); assert.equal(jc.sidecar.dropped, 1);
});

test("a judge that throws, or returns garbage or nothing, fails closed to unsure and ships nothing; the sidecar survives a degraded page", async () => {
  const turns = base();
  const m = model(() => ({ items: [item("insight", "t1", FEE), item("decision", "t2", DEC)] }));
  const boom: NoteJudge = async () => { throw new Error("judge offline"); };
  const r1 = await run(turns, m, boom);
  assert.equal(r1.page.citedItems, undefined); assert.ok(r1.degraded); // no insight survived: the page degrades, nothing ships
  assert.deepEqual(r1.judgeSidecar!.entries.map((e) => e.verdict), ["unsure", "unsure"]); assert.match(r1.judgeSidecar!.entries[0]!.reason, /judge offline/);
  const mute: NoteJudge = async () => ({ verdicts: [{ id: "unknown", verdict: "same", reason: "" }] });
  assert.equal((await run(turns, m, mute)).judgeSidecar!.unsure, 2);
  const junk: NoteJudge = async (b) => ({ verdicts: b.map((i) => ({ id: i.id, verdict: "yes" as never, reason: "" })) });
  assert.equal((await run(turns, m, junk)).judgeSidecar!.unsure, 2);
  const dup: NoteJudge = async (b) => ({ verdicts: b.flatMap((i) => [{ id: i.id, verdict: "same" as const, reason: "" }, { id: i.id, verdict: "different" as const, reason: "" }]) });
  assert.equal((await run(turns, m, dup)).judgeSidecar!.unsure, 2);
  const c = await extractClaims(turns, model(() => ({ claims: [claim("t1", FEE)] })), { strictWebinar: true, dropUnverified: true, noteJudge: boom });
  assert.deepEqual(c.claims, []); assert.equal(c.judgeSidecar!.unsure, 1);
});

test("the per-session cost cap stops further judge calls; remaining notes are unsure (not judged)", async () => {
  const turns = Array.from({ length: 5 }, (_, k) => turn(`m${k}`, "spk:1", `Item number ${k} is stated here today.`, k * 10));
  const probe = fakeJudge(() => "same", 0.5), jc = makeJudgeContext(probe.judge, { maxCostUsd: 0.5, batchSize: 2 });
  const keep = await judgeCandidates(jc, turns, turns.map((t) => ({ id: t._id, kind: "insight", note: t.text, evidence: [ev(t._id, t.text)] })));
  assert.equal(jc.sidecar.calls, 1); assert.equal(jc.sidecar.costUsd, 0.5);
  assert.equal(keep.size, 2); assert.equal(jc.sidecar.unsure, 3); assert.ok(jc.sidecar.entries.every((e) => /cost cap/.test(e.reason)));
});

test("a judged answer that is not same leaves its question unanswered", async () => {
  const Q = "What is the application deadline for the scholarship?", A = "The scholarship deadline is the fifteenth of March.";
  const turns = [turn("t1", "spk:0", Q, 0), turn("t2", "spk:1", A, 10), turn("t3", "spk:1", FEE, 20)];
  const m = model(() => ({ items: [item("insight", "t3", FEE)], qa: [{ question: Q, questionEvidence: [ev("t1", Q)], answer: A, answerEvidence: [ev("t2", A)], status: "answered" }] }));
  const kept = await run(turns, m, fakeJudge(() => "same").judge);
  assert.equal(kept.page.qa![0]!.status, "answered");
  const dropped = await run(turns, m, fakeJudge((i) => (i.kind === "qa-answer" ? "different" : "same")).judge);
  assert.equal(dropped.page.qa![0]!.status, "unanswered"); assert.equal(dropped.page.qa![0]!.answer, null);
  assert.equal(dropped.judgeSidecar!.entries[0]!.kind, "qa-answer");
});

test("the LLM adapter routes by job kind note-judge, parses verdicts, records usage and cost, and fails closed on malformed output", async () => {
  const jobs: Job[] = [];
  const good = createLlmNoteJudge(async (job) => { jobs.push(job); const p = { items: itemsOf(job.messages[1]!.content) }; return { text: JSON.stringify({ verdicts: p.items.map((i: Obj, k: number) => ({ id: i.id, verdict: k ? "different" : "same", reason: "r" })) }), usage: { inputTokens: 100, outputTokens: 20 }, provider: "fake", model: "m1", costUsd: 0.002 }; });
  const turns = base();
  const m = model(() => ({ items: [item("insight", "t1", FEE), item("decision", "t2", DEC)] }));
  const r = await run(turns, m, good);
  assert.equal(jobs.length, 1); assert.equal(jobs[0]!.kind, NOTE_JUDGE_JOB_KIND); assert.equal(NOTE_JUDGE_JOB_KIND, "note-judge");
  assert.match(jobs[0]!.messages[0]!.content, /polarity and negation/);
  assert.equal(r.page.citedItems!.length, 1);
  assert.equal(r.judgeSidecar!.costUsd, 0.002); assert.equal(r.judgeSidecar!.inputTokens, 100); assert.deepEqual(r.judgeSidecar!.models, ["fake/m1"]);
  const bad = createLlmNoteJudge(async () => ({ text: "not json at all", usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "m1", costUsd: 0.001 }));
  const r2 = await run(turns, m, bad);
  assert.equal(r2.page.citedItems?.length ?? 0, 0); // everything unsure, so nothing ships (the page may degrade for lack of any insight)
});

// ---- D-015: the offline corpus ----
type Out = { shipped: boolean; layer: "judge" | "rule" | "shipped" };
const key = (text: string, quote: string) => `${quote}\u0000${text}`;
const ORACLE = new Map<string, "same" | "different">([...ATTACKS.map((a) => [key(a.text, a.quote), "different"] as const), ...CONTROLS.map((k) => [key(k.text, k.quote), "same"] as const)]);
function oracleJudge() {
  const unlabelled: string[] = [];
  const seen: NoteJudgeInput[] = [];
  const judge: NoteJudge = async (batch) => ({ verdicts: batch.map((i) => { seen.push(i); const label = ORACLE.get(key(i.sources[0]!.text, i.note)); if (!label) unlabelled.push(i.note); return { id: i.id, verdict: label ?? "unsure", reason: label === "different" ? "oracle: meaning differs from the source" : "oracle" }; }), costUsd: 0.001 * batch.length });
  return { judge, unlabelled, seen };
}
async function replaySummary(text: string, quote: string, noteJudge?: NoteJudge): Promise<Out> {
  const turns = [turn("c0", "spk:0", FEE, 0), turn("a1", "spk:1", text, 10)];
  const m = model(() => ({ items: [item("insight", "c0", FEE), item("insight", "a1", quote)] }));
  const r = await run(turns, m, noteJudge);
  assert.equal(r.degraded, null, `degraded for ${text}`);
  assert.ok(r.page.citedItems!.some((i) => i.text === FEE), "the faithful control must still ship");
  const shipped = r.page.citedItems!.some((i) => i.evidence.some((e) => e.turnId === "a1"));
  const judged = (r.dropped ?? []).some((d) => /^note judge /.test(d.reason));
  return { shipped, layer: shipped ? "shipped" : judged ? "judge" : "rule" };
}
async function replayClaim(text: string, quote: string, noteJudge?: NoteJudge): Promise<Out> {
  const turns = [turn("c0", "spk:0", FEE, 0), turn("a1", "spk:1", text, 10)];
  const r = await extractClaims(turns, model(() => ({ claims: [claim("c0", FEE), claim("a1", quote)] })), { strictWebinar: true, dropUnverified: true, ...(noteJudge ? { noteJudge } : {}) });
  assert.equal(r.degraded, null);
  assert.ok(r.claims.some((c) => c.text === FEE));
  const shipped = r.claims.some((c) => c.evidenceTurnIds.includes("a1"));
  return { shipped, layer: shipped ? "shipped" : (r.dropped ?? []).some((d) => /^note judge /.test(d.reason)) ? "judge" : "rule" };
}

test("D-015 offline corpus: every recorded ISS-T040GEN-* attack is refused with the oracle judge (summary notes and claims); per-id counts", async () => {
  const ids = [...new Set(ATTACKS.map((a) => a.id))];
  assert.deepEqual(ids, ["ISS-T040GEN-002", "ISS-T040GEN-006", "ISS-T040GEN-007", "ISS-T040GEN-008", "ISS-T040GEN-009", "ISS-T040GEN-010", "ISS-T040GEN-011", "ISS-T040GEN-012"]);
  assert.equal(ATTACKS.length, 31);
  const { judge, unlabelled } = oracleJudge();
  const lines: string[] = [], failures: string[] = [];
  for (const id of ids) {
    const cases = ATTACKS.filter((a) => a.id === id);
    let refused = 0, byJudge = 0, byRule = 0, claimRefused = 0;
    for (const a of cases) {
      const s = await replaySummary(a.text, a.quote, judge), k = await replayClaim(a.text, a.quote, judge);
      if (!s.shipped) { refused++; if (s.layer === "judge") byJudge++; else byRule++; } else failures.push(`summary shipped: ${a.text} => ${a.quote}`);
      if (!k.shipped) claimRefused++; else failures.push(`claim shipped: ${a.text} => ${a.quote}`);
    }
    lines.push(`${id}: ${refused}/${cases.length} refused as notes (judge ${byJudge}, deterministic rule ${byRule}); ${claimRefused}/${cases.length} refused as claims`);
  }
  console.log(lines.join("\n"));
  assert.deepEqual(failures, []);
  assert.deepEqual(unlabelled, [], "every judged note must have an oracle label");
  // faithful controls: the oracle says same, they ship
  for (const k of CONTROLS) {
    const turns = [turn("c0", "spk:0", FEE, 0), turn("a1", "spk:1", k.text, 10)];
    const r = await run(turns, model(() => ({ items: [item("insight", "c0", FEE), item("insight", "a1", k.quote)] })), oracleJudge().judge);
    assert.ok(r.page.citedItems!.some((i) => i.evidence[0]!.turnId === "a1"), k.text);
  }
});

test("negative control: with a lax judge (everything same) some recorded attacks DO ship, so the safety rests on the judge", async () => {
  const lax = fakeJudge(() => "same").judge;
  let shipped = 0;
  for (const a of ATTACKS) if ((await replaySummary(a.text, a.quote, lax)).shipped) shipped++;
  assert.ok(shipped > 0, "if nothing ships even with a lax judge, the oracle result above proves nothing about the judge");
  console.log(`lax judge: ${shipped}/${ATTACKS.length} attacks ship (the judge is the gate for these)`);
});

test("config/ai-routing.yaml has a note-judge route (verifier model first, not the generating model) and the other routes match the D-173 table", () => {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "config", "ai-routing.yaml"), "utf8");
  const chains = parseRoutingYaml(text);
  assert.deepEqual(chains["note-judge"], ["ollama-cloud-verifier", "ollama-cloud"]);
  assert.notEqual(chains["note-judge"]![0], chains.summarize![0], "the judge must not be the generating model first");
  const cloud = ["ollama-cloud", "ollama-cloud-verifier"];
  assert.deepEqual(Object.fromEntries(Object.entries(chains).filter(([k]) => k !== "note-judge")), {
    transcribe: ["gemini"], namemap: cloud, summarize: cloud, claims: cloud, decisions: cloud, speakers: ["ollama"], "tree-summary": cloud, topics: cloud,
    evaluator: ["ollama-cloud-verifier", "ollama-cloud"], "output-verifier": ["ollama-cloud-verifier"], "output-generation": ["ollama-cloud"], answer: cloud, ask: cloud,
    vision: ["ollama", "gemini"], route: ["gemini-flash-lite"],
  });
});
