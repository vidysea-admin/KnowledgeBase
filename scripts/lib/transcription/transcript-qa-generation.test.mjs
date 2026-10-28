import { test } from "node:test";
import assert from "node:assert/strict";
import { clampAndValidateTurns } from "../../../packages/ai/src/stt/transcript-qa.ts";
import { assertQaGenerationShape, assertQaReport, buildTranscriptQaGeneration, transcriptBytesSha256 } from "./transcript-qa-generation.mjs";

const turns = [{ speakerRef: "s", tStart: 0, tEnd: 9, text: "visa guidance" }];
const report = () => clampAndValidateTurns(turns, 10).report;
const args = () => ({ turnsBytes: Buffer.from(JSON.stringify(turns)), durationSec: 10,
  spans: [{ id: "chunk-0-attempt-1", accepted: true, offsetSeconds: 0, report: report() }], merged: report() });

test("producer proof hashes exact committed bytes and detaches mutable audit input", () => {
  const input = args(), proof = buildTranscriptQaGeneration(input);
  assert.equal(proof.version, 1);
  assert.equal(proof.turnsSha256, transcriptBytesSha256(input.turnsBytes));
  assert.notEqual(proof.turnsSha256, transcriptBytesSha256(Buffer.concat([input.turnsBytes, Buffer.from("\n")])));
  input.spans[0].accepted = false;
  input.merged.outputCount = 999;
  assert.equal(proof.spans[0].accepted, true);
  assert.equal(proof.merged.outputCount, 1);
});

test("invalid duration, legacy report and malformed counts refuse", () => {
  for (const durationSec of [0, -1, NaN, Infinity, "10"]) assert.throws(() => buildTranscriptQaGeneration({ ...args(), durationSec }), /QA report/);
  assert.throws(() => assertQaGenerationShape({ merged: report(), spans: [] }), /unbound/);
  for (const patch of [{ inputCount: -1 }, { outputCount: 2 }, { clampedCount: 1 }, { dropped: null }, { totalTurnSec: Infinity }, { overshootSec: 4 }]) {
    assert.throws(() => assertQaReport({ ...report(), ...patch }), /QA report/);
  }
});

test("attempt identities are unique including rejected retries, and retained evidence is required", () => {
  const input = args();
  assert.throws(() => buildTranscriptQaGeneration({ ...input, spans: [] }), /accepted span evidence missing/);
  assert.throws(() => buildTranscriptQaGeneration({ ...input, spans: [{ ...input.spans[0], accepted: false }] }), /accepted span evidence missing/);
  for (const patch of [{ id: "" }, { accepted: "true" }, { offsetSeconds: -1 }, { offsetSeconds: 11 }]) {
    assert.throws(() => buildTranscriptQaGeneration({ ...args(), spans: [{ ...input.spans[0], ...patch }] }), /QA report/);
  }
  assert.throws(() => buildTranscriptQaGeneration({ ...input, spans: [input.spans[0], { ...input.spans[0], accepted: false }] }), /identity/);
  assert.throws(() => buildTranscriptQaGeneration({ ...input, merged: { ...input.merged, inputCount: 2, outputCount: 2 } }), /accepted span count/);
});

test("index/count reconciliation rejects hidden dropped and fabricated clamp evidence", () => {
  const r = report();
  for (const patch of [{ clampedCount: 2, clampedIndices: [0, 0] }, { clampedCount: 1, clampedIndices: [1] },
    { hallucination: { ...r.hallucination, pastEndIndices: [0] } }, { dropped: [{ index: 0, reason: "invalid-timing", suspectedHallucination: true }] },
    { hallucination: { ...r.hallucination, repeatedRuns: [{ text: "visa", startIndex: 0, length: 3 }] } }]) {
    assert.throws(() => assertQaReport({ ...r, ...patch }), /QA report/);
  }
});

test("real repaired/past-end audit reports are retained without builder discarding their signals", () => {
  const inputTurns = [...turns, { speakerRef: "s", tStart: 10, tEnd: 12, text: "invented tail" }];
  const r = clampAndValidateTurns(inputTurns, 10).report;
  const input = args(); input.spans[0].report = r;
  assert.equal(buildTranscriptQaGeneration(input).spans[0].report.hallucination.pastEndIndices.length, 1);
});

test("privacy ledger conserves raw/public counts while keeping provider anomalies visible", () => {
  const input = args();
  input.privacy = { receiptSha256: "a".repeat(64), sanitizedAudioSha256: "b".repeat(64), publicIntervals: [{ tStart: 0, tEnd: 9 }] };
  input.spans[0].providerReport = clampAndValidateTurns([...turns, { speakerRef: "s", tStart: 9, tEnd: 10, text: "protected" }], 10).report;
  input.spans[0].privacy = { receiptSha256: input.privacy.receiptSha256, inputCount: 2, outputCount: 1, excludedIndices: [1], offsetSeconds: 0 };
  assert.equal(buildTranscriptQaGeneration(input).spans[0].providerReport.inputCount, 2);
  for (const patch of [{ inputCount: 3 }, { outputCount: 2 }, { excludedIndices: [0, 0] }, { offsetSeconds: 1 }, { receiptSha256: "c".repeat(64) }]) {
    assert.throws(() => buildTranscriptQaGeneration({ ...input, spans: [{ ...input.spans[0], privacy: { ...input.spans[0].privacy, ...patch } }] }), /privacy exclusion/);
  }
  const bad = structuredClone(input);
  bad.spans[0].providerReport = clampAndValidateTurns([...turns, { speakerRef: "s", tStart: 10, tEnd: 12, text: "past-end" }], 10).report;
  assert.throws(() => buildTranscriptQaGeneration(bad), /privacy exclusion/, "privacy cannot remove a raw dropped/past-end index");
});

test("privacy generation intervals must be finite, ordered and inside audio", () => {
  for (const publicIntervals of [[], [{ tStart: -1, tEnd: 9 }], [{ tStart: 0, tEnd: 11 }], [{ tStart: 0, tEnd: 5 }, { tStart: 4, tEnd: 9 }], [{ tStart: 0, tEnd: NaN }]]) {
    assert.throws(() => buildTranscriptQaGeneration({ ...args(), privacy: { receiptSha256: "a".repeat(64), sanitizedAudioSha256: "b".repeat(64), publicIntervals } }), /privacy/);
  }
});
