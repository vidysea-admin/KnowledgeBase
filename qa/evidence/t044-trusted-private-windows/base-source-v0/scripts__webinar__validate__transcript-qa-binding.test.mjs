import { test } from "node:test";
import assert from "node:assert/strict";
import { clampAndValidateTurns } from "../../../packages/ai/src/stt/transcript-qa.ts";
import { buildTranscriptQaGeneration } from "../../lib/transcription/transcript-qa-generation.mjs";
import { evaluateTranscriptQaGeneration } from "./transcript-qa-binding.mjs";

const turn = (tStart, tEnd, text = `speech at ${tStart}`) => ({ speakerRef: "s", tStart, tEnd, text });
function fixture(turns = [turn(0, 9)], inputTurns = turns) {
  const durationSec = 10, turnsBytes = Buffer.from(JSON.stringify(turns));
  const merged = clampAndValidateTurns(turns, durationSec).report;
  const proof = buildTranscriptQaGeneration({ turnsBytes, durationSec, merged,
    spans: [{ id: "selected-1", accepted: true, offsetSeconds: 0, report: clampAndValidateTurns(inputTurns, durationSec).report }] });
  return { proof, turns, turnsBytes, durationSec, clamp: clampAndValidateTurns };
}
const check = input => evaluateTranscriptQaGeneration(input);

test("clean selected generation accepts; same-count replacement and different audio duration refuse", () => {
  const f = fixture();
  assert.deepEqual(check(f).reasons, []);
  assert.equal(check(f).qa.acceptedSpans, 1);
  assert.match(check({ ...f, turnsBytes: Buffer.from(JSON.stringify([turn(0, 9, "replacement")])) }).reasons.join("; "), /generation hash mismatch/);
  assert.match(check({ ...f, durationSec: 11 }).reasons.join("; "), /probed audio duration mismatch/);
});

test("accepted pre-clamp past-end evidence survives a clean merged report", () => {
  const f = fixture([turn(0, 9)], [turn(0, 9), turn(10, 12, "hallucinated tail")]);
  assert.equal(f.proof.merged.hallucination.pastEndIndices.length, 0);
  assert.match(check(f).reasons.join("; "), /accepted span selected-1.*past the audio end/);
});

test("exact committed audio bounds refuse tiny overshoot even when clamp tolerance counts no repair", () => {
  const f = fixture([turn(0, 10 + 1e-7)]);
  assert.equal(f.proof.merged.clampedCount, 0, "the clamp intentionally does not count its tolerance snap");
  assert.match(check(f).reasons.join("; "), /committed timing outside exact audio bounds/);
  assert.deepEqual(check(fixture([turn(0, 10)])).reasons, []);
});

test("rejected retry or discarded single-path anomalies are audit-only", () => {
  const f = fixture();
  f.proof.spans.unshift({ id: "discarded-single-1", accepted: false, offsetSeconds: 0,
    report: clampAndValidateTurns([turn(0, 9), turn(10, 12)], 10).report });
  assert.deepEqual(check(f).reasons, []);
  assert.equal(check(f).qa.rejectedAttempts, 1);
});

test("finite clamping alone is repaired evidence, accepted dropped-invalid/repeats/nonmonotonic refuse", () => {
  const repaired = fixture([turn(0, 10)], [turn(0, 12)]);
  assert.deepEqual(check(repaired).reasons, []);
  const variants = [
    [[turn(0, 9), turn(NaN, 3)], /invalid dropped timing/],
    [[turn(0, 1, "Repeat"), turn(2, 3, "repeat!"), turn(4, 5, "REPEAT")], /repeated-turn run/],
    [[turn(5, 8), turn(0, 4)], /non-monotonic/],
  ];
  for (const [original, reason] of variants) {
    const output = clampAndValidateTurns(original, 10).turns;
    assert.match(check(fixture(output, original)).reasons.join("; "), reason);
  }
});

test("current turns are recomputed: a forged clean merged report cannot hide repeats or unordered turns", () => {
  for (const turns of [[turn(0, 1, "repeat"), turn(2, 3, "repeat"), turn(4, 9, "repeat")], [turn(5, 9), turn(0, 4)]]) {
    const f = fixture(turns);
    f.proof.merged.nonMonotonicIndices = [];
    f.proof.merged.hallucination.repeatedRuns = [];
    f.proof.spans[0].report = structuredClone(f.proof.merged);
    assert.match(check(f).reasons.join("; "), /QA current transcript: (repeated-turn|non-monotonic)/);
  }
});

test("legacy/unbound/malformed proof and contradictory clamp/drop/overshoot claims refuse", () => {
  const f = fixture();
  assert.match(check({ ...f, proof: { spans: [], merged: f.proof.merged } }).reasons.join("; "), /unbound/);
  f.proof.merged.clampedCount = 20;
  f.proof.merged.dropped = Array.from({ length: 5 }, (_, index) => ({ index, reason: "invalid-timing", suspectedHallucination: false }));
  f.proof.merged.overshootSec = 400;
  assert.ok(check(f).reasons.length);
});
