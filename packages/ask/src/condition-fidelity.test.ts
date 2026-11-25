/** F1 ask-condition-fidelity (qa/contracts/ask-condition-fidelity.md): unit tests of the whole-turn evidence unit (C1) and the
 * deterministic condition detector (C2) in answer.ts. The recorded-corpus floor (C5) runs end to end in
 * apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts; this file pins the pieces and the false-hold controls. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TURN_EVIDENCE_LIMITS, conditionHold, evidenceTurns, wholeTurnSources } from "./answer.js";
import type { SourceQuote } from "./source-context.js";
import type { ContextSource } from "./bounded-refine.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const TURN = "Students from your school who were taught in English do not need to send TOEFL scores. Everyone else must submit them.";
function quote(id: string, turn: string, start: number, end: number, turnId = "t1"): SourceQuote {
  const text = turn.slice(start, end);
  return { id, nodeId: "n1", sessionRef: "s1", turnId, speakerRef: "spk", tStart: 1, tEnd: 2, charStart: start, charEnd: end,
    byteStart: Buffer.byteLength(turn.slice(0, start)), byteEnd: Buffer.byteLength(turn.slice(0, end)), turnTextSHA256: sha(turn), sliceSHA256: sha(text), quote: text, origin: "speech" } as SourceQuote;
}

test("[F1-C1] evidenceTurns: a whole turn is proven by its own hash, from live turn text or from quotes that cover it", () => {
  const cut = 40;
  const [viaLive] = evidenceTurns([quote("a", TURN, 0, cut)], [{ sessionId: "s1", turnId: "t1", text: TURN }]);
  assert.equal(viaLive!.whole, true); assert.equal(viaLive!.text, TURN);
  const [viaQuotes] = evidenceTurns([quote("b", TURN, cut, TURN.length), quote("a", TURN, 0, cut + 5)]);
  assert.equal(viaQuotes!.whole, true); assert.equal(viaQuotes!.text, TURN); assert.deepEqual(viaQuotes!.quoteIds, ["b", "a"]);
  const [excerpt] = evidenceTurns([quote("a", TURN, 0, cut)]);
  assert.equal(excerpt!.whole, false); assert.match(excerpt!.incomplete!, /excerpt of the speaker turn/);
  const [gap] = evidenceTurns([quote("a", TURN, 0, 10), quote("b", TURN, 20, TURN.length)]);
  assert.equal(gap!.whole, false, "quotes with a gap never claim the whole turn");
  const [forged] = evidenceTurns([quote("a", TURN, 0, cut)], [{ sessionId: "s1", turnId: "t1", text: TURN + " (edited)" }]);
  assert.equal(forged!.whole, false, "live text whose hash differs from the quote's turn hash is not the turn");
});

test("[F1-C1] caps apply at turn boundaries only: an over-cap turn is incomplete (held by the caller), never truncated", () => {
  const big = "Every applicant must submit a transcript. ".repeat(500);
  assert.ok(Buffer.byteLength(big) > TURN_EVIDENCE_LIMITS.turnBytes);
  const [t] = evidenceTurns([quote("a", big, 0, 1024)], [{ sessionId: "s1", turnId: "t1", text: big }]);
  assert.equal(t!.whole, false); assert.match(t!.incomplete!, /over the 16384-byte turn cap/); assert.equal(t!.text, big.slice(0, 1024));
  const mid = "x".repeat(9000) + ".";
  const turns = evidenceTurns([quote("a", mid, 0, mid.length, "t1"), quote("b", mid, 0, mid.length, "t2"), quote("c", mid, 0, mid.length, "t3")]);
  assert.deepEqual(turns.map((x) => x.whole), [true, true, false]);
  assert.match(turns[2]!.incomplete!, /24576-byte evidence cap/);
});

test("[F1-C1] wholeTurnSources: one source per whole turn, same id and speaker/time identity; incomplete turns keep their excerpts", () => {
  const ident = { speakerRef: "spk", turnId: "t1", sessionRef: "s1", tStart: 1, tEnd: 2 };
  const src = (id: string, text: string, turnId = "t1"): ContextSource => ({ id, text, origin: "speech", source: { ...ident, turnId } } as ContextSource);
  const turns = evidenceTurns([quote("a", TURN, 0, 40), quote("b", TURN, 40, TURN.length), quote("c", "Other turn text.", 0, 5, "t2")]);
  const out = wholeTurnSources([src("a", "x"), src("c", "Other", "t2"), src("b", "y")], turns);
  assert.deepEqual(out.map((s) => [s.id, s.text]), [["a", TURN], ["c", "Other"]]);
  assert.deepEqual(out[0]!.source, { ...ident });
});

test("[F1-C2] detector holds the recorded failing classes", () => {
  const school = "Students from your school who were taught in English do not need to send TOEFL, IELTS or Duolingo scores.";
  assert.match(conditionHold("All UC applicants can apply without submitting TOEFL or IELTS scores.", [school]) ?? "", /school/);
  assert.match(conditionHold("We use SAT or ACT scores for admission and scholarships.",
    ["We use SAT or ACT scores for admission and scholarships. This applies only to recruited athletes."]) ?? "", /recruited athlete/);
  assert.match(conditionHold("UC does not review SAT or ACT scores for admission or scholarships.",
    ["Does UC consider SAT or ACT scores for admission or scholarships? It depends on which program you apply to."]) ?? "", /program|only asks/);
  assert.match(conditionHold("All UC applicants can apply without proof of proficiency in English.",
    ["UC lets only pupils from Maple School apply without scores demonstrating their English ability. All other UC applicants must submit those test results."]) ?? "", /maple school/);
});

test("[F1-C2] false-hold controls: kept condition (verbatim or paraphrased), unconditional turn, passing institution mention", () => {
  const scoped = "UC lets only pupils from Maple School apply without scores demonstrating their English ability.";
  assert.equal(conditionHold(scoped, [scoped]), null, "verbatim condition kept");
  assert.equal(conditionHold("Only pupils from Maple School can apply without proof of English proficiency.", [scoped]), null, "paraphrased condition kept");
  assert.equal(conditionHold("For transfer applicants, UC does not review SAT or ACT scores for admission or scholarships.",
    ["UC does not consider SAT or ACT scores for admission or scholarships. This rule applies only to transfer applicants."]), null);
  assert.equal(conditionHold("Submitting TOEFL scores lowers the visa fee.", ["Applicants who submit TOEFL scores pay a reduced visa fee."]), null, "V-C5");
  assert.equal(conditionHold("UC does not review SAT scores for admission.", ["I studied at Stanford University. UC does not review SAT scores for admission."]), null);
  assert.equal(conditionHold("The office opens on Monday.", ["Only Maple School pupils may omit test results demonstrating their English ability."]), null, "unrelated answer");
  assert.equal(conditionHold("", ["Only Maple School pupils may omit test results."]), null);
});

// ---- F1B (ask-condition-fidelity, follow-up unit f1-whole-turn-hydration): the deep answer node and the single judgment --------------
import { askV2, askFastV2 } from "./ask-v2.js";
import type { TreeIndexNode } from "@lkb/core";
import type { AskV2Deps } from "./ask-shared.js";

const DROPS = "Applicants do not need to send TOEFL scores.";
const KEEPS = "Students from your school who were taught in English do not need to send TOEFL scores.";
const reply = (json: unknown) => ({ json, text: JSON.stringify(json), provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
/** A deep or fast Ask over ONE speaker turn. `cut` is how much of the turn the hydrated quote covers; `live` adds the hydrator's whole turn text. */
async function rig(opts: { turn?: string; cut?: number; live?: boolean; answer: string; mode: "deep" | "fast"; web?: boolean; score?: number }) {
  const turn = opts.turn ?? TURN, cut = opts.cut ?? 40;
  const q = quote("q1", turn, 0, cut);
  const node: TreeIndexNode = { node_id: "n1", title: "Session", level: "session", summary: "", evidence: { sessionRef: "s1" }, children: [] };
  const tree: TreeIndexNode = { node_id: "root", title: "Tenant", level: "tenant", summary: "", children: [node] };
  const calls: string[] = []; let presented: { sourceId: string; text: string }[] = [];
  const snap = sha("snapshot");
  const deps: AskV2Deps = { tenantId: "t", scoreFn: () => [opts.score ?? 0.99, "offline"], lower: 0.5, upper: 0.8, write: async () => {},
    treeSearchFn: (r, ids) => r.children.filter((n) => ids.includes(n.node_id)), extraCandidateArmsFn: async () => ({ arms: [[node]], degraded: null }),
    ...(opts.web ? { tavilySearchFn: async () => [{ url: "https://example.test/x", content: "Fixture web page." }] } : {}),
    sourceContext: { hydrate: async (_q, nodes) => ({ nodes: nodes.map((n) => ({ ...n, summary: JSON.stringify([q]), evidence: { ...n.evidence, sourceQuotes: [q], sourceSnapshotSHA256: snap } })),
      snapshotSHA256: snap, sourceBytes: cut, ...(opts.live ? { liveTurns: [{ sessionId: "s1", turnId: "t1", text: turn }] } : {}) }) },
    complete: async (job) => {
      calls.push(job.kind);
      if (job.kind === "ask.select_nodes") return reply({ node_ids: ["n1"] });
      const data = JSON.parse(job.messages.find((m) => m.role === "user")!.content);
      if (job.kind === "ask.refine_batch") return reply({ decisions: data.strips.map((s: { id: string }) => ({ id: s.id, keep: true })) });
      if (job.kind === "ask.answer") {
        presented = data.context.strips.map((s: { sourceIndex: number; text: string }) => ({ sourceId: data.context.sources[s.sourceIndex].sourceId, text: s.text }));
        return reply({ sentences: [{ text: opts.answer, sourceIds: ["q1"] }] });
      }
      if (job.kind === "ask.answer_grounding") return reply({ decisions: data.sentences.map((s: { id: string }) => ({ id: s.id, supported: true, answersQuery: true })) });
      throw new Error(job.kind);
    } } as AskV2Deps;
  const result = await (opts.mode === "deep" ? askV2("Who must send TOEFL scores?", tree, deps) : askFastV2("Who must send TOEFL scores?", tree, deps));
  return { result, calls, text: presented.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim() };
}
const held = (r: { result: { verdict: string; reason: string; insufficient_coverage: boolean } }, why: RegExp) => {
  assert.equal(r.result.verdict, "ambiguous"); assert.equal(r.result.insufficient_coverage, true); assert.match(r.result.reason, /^held for review: /); assert.match(r.result.reason, why);
};

for (const mode of ["deep", "fast"] as const) {
  test(`[F1B-C3] ${mode}: generation reads the whole turn, and an answer that drops the turn's school condition is held`, async () => {
    const r = await rig({ mode, live: true, answer: DROPS });
    assert.equal(r.text, TURN, "the strips given to generation are the complete turn, not the 40-character excerpt");
    held(r, /limits this rule to "school"/);
    assert.equal(r.result.auditLog.some((e) => e.jobKind === "ask.condition_held"), true);
  });
  test(`[F1B-C3] ${mode}: a cited turn that is only an excerpt (absent from liveTurns) holds the answer; it is never judged on slices`, async () => {
    const r = await rig({ mode, live: false, answer: DROPS });
    held(r, /cited turn t1: the hydrated evidence is an excerpt of the speaker turn/);
  });
  test(`[F1B-C3] ${mode}: an answer that keeps the condition is released and is marked as judged on whole turns (once)`, async () => {
    const r = await rig({ mode, live: true, answer: KEEPS });
    assert.equal(r.result.answer, KEEPS); assert.doesNotMatch(r.result.reason, /held/);
    assert.deepEqual(r.result.auditLog.filter((e) => e.jobKind === "ask.condition_checked").map((e) => e.step), ["condition_checked: whole turns"]);
    assert.equal(r.result.auditLog.some((e) => e.jobKind === "ask.condition_held"), false);
  });
  test(`[F1B-C3] ${mode}: without liveTurns and with the turn covered by its quote, the answer is judged on the whole turn and carries no marker`, async () => {
    const r = await rig({ mode, live: false, cut: TURN.length, answer: KEEPS });
    assert.equal(r.result.answer, KEEPS);
    assert.equal(r.result.auditLog.some((e) => e.jobKind === "ask.condition_checked"), false, "the marker is only for whole turns the hydrator supplied");
  });
}

test("[F1B-C3] deep adds no model call for the gate: the deep call sequence is the same with a held, a released and an unconditional answer", async () => {
  const sequence = ["ask.select_nodes", "ask.answer", "ask.answer_grounding"];
  for (const answer of [DROPS, KEEPS]) assert.deepEqual((await rig({ mode: "deep", live: true, answer })).calls, sequence);
  assert.deepEqual((await rig({ mode: "fast", live: true, answer: DROPS })).calls, ["ask.answer", "ask.answer_grounding"], "the default fast path keeps its two calls");
});

test("[F1B-C4] deep with web_used sources is still judged, on its internal sources only: the old early return no longer skips it", async () => {
  const r = await rig({ mode: "deep", live: true, answer: DROPS, web: true, score: 0.6 });
  assert.equal(r.result.web_used, true, "ambiguous internal score plus a web fallback");
  held(r, /limits this rule to "school"/);
  const ok = await rig({ mode: "deep", live: true, answer: KEEPS, web: true, score: 0.6 });
  assert.equal(ok.result.web_used, true); assert.equal(ok.result.answer, KEEPS); assert.doesNotMatch(ok.result.reason, /held/);
});
