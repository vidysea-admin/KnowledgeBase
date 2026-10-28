/**
 * packages/ai/src/stt/transcript-qa.test.ts — T-044 transcript QA. `clampAndValidateTurns` against
 * synthetic turns — no I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { clampAndValidateTurns } from "./transcript-qa.js";
import type { Turn } from "./transcribe.js";

function turn(tStart: number, tEnd: number, text = `turn at ${tStart}`, speakerRef = "spk:0"): Turn {
  return { speakerRef, tStart, tEnd, text };
}

function assertPostcondition(turns: Turn[], durationSec: number): void {
  let prevStart = -Infinity;
  for (const t of turns) {
    assert.ok(Number.isFinite(t.tStart) && Number.isFinite(t.tEnd), "finite timings");
    assert.ok(t.tStart >= 0, `tStart >= 0 (${t.tStart})`);
    assert.ok(t.tEnd >= t.tStart, `tEnd >= tStart (${t.tStart}..${t.tEnd})`);
    assert.ok(t.tEnd <= durationSec, `tEnd <= duration (${t.tEnd} > ${durationSec})`);
    prevStart = Math.max(prevStart, t.tStart);
  }
}

test("recorded case: 223 s of turns on 186 s of audio is clamped and the overshoot is reported", () => {
  // Ten turns of 22.3 s -> 223 s total; the drift pushes the tail past 186 s.
  const input: Turn[] = Array.from({ length: 10 }, (_, i) => turn(i * 22.3, (i + 1) * 22.3));
  const { turns, report } = clampAndValidateTurns(input, 186);
  assertPostcondition(turns, 186);
  assert.ok(Math.abs(report.totalTurnSec - 223) < 1e-9);
  assert.ok(Math.abs(report.overshootSec - 37) < 1e-9);
  assert.ok(Math.abs(report.maxInputEndSec - 223) < 1e-9);
  assert.equal(report.inputCount, 10);
  // starts: 22.3*8 = 178.4 < 186 -> kept and clamped; 22.3*9 = 200.7 >= 186 -> dropped.
  assert.equal(report.outputCount, 9);
  assert.equal(report.clampedCount, 1);
  assert.deepEqual(report.clampedIndices, [8]);
  assert.deepEqual(report.dropped, [{ index: 9, reason: "start-at-or-beyond-duration", suspectedHallucination: true }]);
  assert.deepEqual(report.hallucination.pastEndIndices, [9]);
});

test("boundary: tEnd exactly at the duration is untouched", () => {
  const { turns, report } = clampAndValidateTurns([turn(100, 186)], 186);
  assert.deepEqual(turns, [turn(100, 186)]);
  assert.equal(report.clampedCount, 0);
  assert.equal(report.dropped.length, 0);
});

test("boundary: tStart exactly at the duration is dropped and flagged, not silent", () => {
  const { turns, report } = clampAndValidateTurns([turn(10, 20), turn(186, 190)], 186);
  assert.equal(turns.length, 1);
  assert.deepEqual(report.dropped, [{ index: 1, reason: "start-at-or-beyond-duration", suspectedHallucination: true }]);
  assert.deepEqual(report.hallucination.pastEndIndices, [1]);
});

test("boundary: tStart past the duration is dropped with its original index", () => {
  const { turns, report } = clampAndValidateTurns([turn(0, 5), turn(300, 310), turn(400, 410)], 186);
  assert.equal(turns.length, 1);
  assert.deepEqual(report.dropped.map((d) => d.index), [1, 2]);
  assert.deepEqual(report.hallucination.pastEndIndices, [1, 2]);
});

test("a tEnd past the duration is clamped; a tEnd within float tolerance is snapped but not counted", () => {
  const a = clampAndValidateTurns([turn(180, 190)], 186);
  assert.equal(a.turns[0]?.tEnd, 186);
  assert.equal(a.report.clampedCount, 1);
  const b = clampAndValidateTurns([turn(180, 186 + 1e-9)], 186);
  assert.equal(b.turns[0]?.tEnd, 186);
  assert.equal(b.report.clampedCount, 0);
});

test("negative tStart is clamped to 0 and tEnd < tStart is raised to tStart", () => {
  const { turns, report } = clampAndValidateTurns([turn(-3, 4), turn(50, 40)], 186);
  assert.deepEqual(turns.map((t) => [t.tStart, t.tEnd]), [[0, 4], [50, 50]]);
  assert.deepEqual(report.clampedIndices, [0, 1]);
  assertPostcondition(turns, 186);
});

test("zero-length turns in the input are kept", () => {
  const { turns, report } = clampAndValidateTurns([turn(10, 10)], 186);
  assert.equal(turns.length, 1);
  assert.equal(report.clampedCount, 0);
});

test("empty input yields empty output and zero counts", () => {
  const { turns, report } = clampAndValidateTurns([], 186);
  assert.deepEqual(turns, []);
  assert.equal(report.inputCount, 0);
  assert.equal(report.outputCount, 0);
  assert.equal(report.totalTurnSec, 0);
  assert.equal(report.overshootSec, 0);
});

test("invalid duration: every turn is dropped with reason invalid-duration and durationValid is false", () => {
  for (const bad of [NaN, Infinity, -Infinity, 0, -5]) {
    const { turns, report } = clampAndValidateTurns([turn(0, 5), turn(5, 9)], bad);
    assert.deepEqual(turns, [], `duration ${bad}`);
    assert.equal(report.durationValid, false);
    assert.deepEqual(report.dropped.map((d) => d.reason), ["invalid-duration", "invalid-duration"]);
  }
});

test("invalid timings (NaN / Infinity) are dropped as invalid-timing; the rest survive", () => {
  const input = [turn(NaN, 5), turn(0, Infinity), turn(-Infinity, 3), turn(1, 2)];
  const { turns, report } = clampAndValidateTurns(input, 186);
  assert.deepEqual(turns, [turn(1, 2)]);
  assert.deepEqual(report.dropped.map((d) => [d.index, d.reason]), [[0, "invalid-timing"], [1, "invalid-timing"], [2, "invalid-timing"]]);
  assert.ok(Number.isFinite(report.totalTurnSec));
});

test("non-monotonic input is reported, never reordered", () => {
  const input = [turn(10, 20, "a"), turn(5, 8, "b"), turn(30, 40, "c"), turn(25, 26, "d")];
  const { turns, report } = clampAndValidateTurns(input, 186);
  assert.deepEqual(turns.map((t) => t.text), ["a", "b", "c", "d"]);
  assert.deepEqual(report.nonMonotonicIndices, [1, 3]);
});

test("repeated text: a run at the threshold is flagged, one below is not", () => {
  const at = [turn(0, 1, "Thank you."), turn(1, 2, "thank you"), turn(2, 3, "THANK YOU!"), turn(3, 4, "different")];
  const r1 = clampAndValidateTurns(at, 186).report.hallucination;
  assert.equal(r1.repeatThreshold, 3);
  assert.deepEqual(r1.repeatedRuns, [{ text: "thank you", startIndex: 0, length: 3 }]);

  const below = at.slice(0, 2).concat(at[3] as Turn);
  assert.deepEqual(clampAndValidateTurns(below, 186).report.hallucination.repeatedRuns, []);

  const custom = clampAndValidateTurns(at.slice(0, 2), 186, { repeatThreshold: 2 }).report.hallucination;
  assert.equal(custom.repeatedRuns.length, 1);
});

test("repeated-text detection ignores empty text and non-consecutive repeats", () => {
  const empties = [turn(0, 1, ""), turn(1, 2, "  "), turn(2, 3, "...")];
  assert.deepEqual(clampAndValidateTurns(empties, 186).report.hallucination.repeatedRuns, []);
  const gaps = [turn(0, 1, "ok"), turn(1, 2, "x"), turn(2, 3, "ok"), turn(3, 4, "y"), turn(4, 5, "ok")];
  assert.deepEqual(clampAndValidateTurns(gaps, 186).report.hallucination.repeatedRuns, []);
});

test("input is not mutated and output turns are fresh objects", () => {
  const input = [turn(-1, 400), turn(500, 600)];
  const snapshot = JSON.parse(JSON.stringify(input));
  Object.freeze(input);
  input.forEach((t) => Object.freeze(t));
  const { turns } = clampAndValidateTurns(input, 186);
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
  assert.notEqual(turns[0], input[0]);
});

test("other Turn fields pass through unchanged", () => {
  const t: Turn = { speakerRef: "spk:2", tStart: 1, tEnd: 999, text: "hi", confidence: 0.9, speakerLabel: "Ann", occurredAt: "2026-01-01T00:00:00Z" };
  const { turns } = clampAndValidateTurns([t], 10);
  assert.deepEqual(turns[0], { ...t, tEnd: 10 });
});

test("property: for generated turn lists the postcondition always holds and counts reconcile", () => {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (): number => {
    const r = rand();
    if (r < 0.03) return NaN;
    if (r < 0.05) return Infinity;
    if (r < 0.08) return -Infinity;
    return (rand() - 0.2) * 500;
  };
  for (let run = 0; run < 300; run++) {
    const duration = 1 + rand() * 400;
    const n = Math.floor(rand() * 30);
    const input = Array.from({ length: n }, () => turn(pick(), pick(), rand() < 0.5 ? "same" : `t${rand()}`));
    const { turns, report } = clampAndValidateTurns(input, duration);
    assertPostcondition(turns, duration);
    assert.equal(report.inputCount, n);
    assert.equal(report.outputCount + report.dropped.length, n);
    assert.equal(report.outputCount, turns.length);
  }
});
