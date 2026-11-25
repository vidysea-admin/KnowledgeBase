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
