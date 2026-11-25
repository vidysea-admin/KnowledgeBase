import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scoreGoldSet, GOLD_METRICS, type ExtractionCase } from "./extraction.js";

// Synthetic fixture shaped like the review tooling's export (apps/api extraction-review ExtractionExport).
const path = fileURLToPath(new URL("../../../../scripts/eval/gold/fixtures/synthetic-gold-export.json", import.meta.url));
const cases = (): ExtractionCase[] => JSON.parse(readFileSync(path, "utf8")).cases;
const pair = (m: {numerator: number; denominator: number}) => [m.numerator, m.denominator];

test("D2H-C1 scores every gold metric with numerator and denominator", () => {
  const s = scoreGoldSet(cases());
  assert.deepEqual(Object.keys(s.metrics).sort(), Object.keys(GOLD_METRICS).sort());
  assert.deepEqual(pair(s.metrics.fabricatedCitations), [0, 4]); assert.deepEqual(pair(s.metrics.claimSupport), [4, 4]);
  assert.deepEqual(pair(s.metrics.machineChecked), [4, 4]); assert.deepEqual(pair(s.metrics.factCoverage), [2, 2]);
  assert.deepEqual(pair(s.metrics.topicsPrecision), [2, 2]); assert.deepEqual(pair(s.metrics.topicsRecall), [2, 2]);
  assert.deepEqual(pair(s.metrics.decisionsPrecision), [1, 1]); assert.deepEqual(pair(s.metrics.decisionsRecall), [1, 1]);
  assert.deepEqual(pair(s.metrics.falseDecisions), [0, 1]);
});
test("D2H-C1 falsification: citations, support, recall and false decisions move the numbers", () => {
  const c = cases(); c[0]!.persisted = [...(c[0]!.persisted as unknown[])];
  (c[0]!.persisted as {evidence: {sessionId: string; turnId: string}[]}[])[0]!.evidence = [{sessionId: "syn-s1", turnId: "ghost"}];
  c[0]!.labels = (c[0]!.labels as {status: string}[]).map((l, i) => i === 0 ? {...l, status: "contradicted"} : l);
  c[0]!.goldTopics = ["top1", "top2", "top-missed"]; c[1]!.predictedDecisions = [{id: "spurious"}];
  const m = scoreGoldSet(c).metrics;
  assert.deepEqual(pair(m.fabricatedCitations), [1, 4]); assert.deepEqual(pair(m.claimSupport), [3, 4]);
  assert.deepEqual(pair(m.topicsRecall), [2, 3]); assert.deepEqual(pair(m.falseDecisions), [1, 1]);
});
test("D2H-C3 absent inputs are not-measured, never 0 or 1", () => {
  const c = cases().map(x => ({...x})); for (const x of c) {delete x.goldTopics; delete x.expectedFacts; delete x.factLabels; delete x.noDecisionSession;}
  const m = scoreGoldSet(c).metrics;
  for (const k of ["topicsRecall", "factCoverage", "falseDecisions"] as const) {
    assert.equal(m[k].measured, false, k); assert.equal(m[k].value, null, k); assert.equal(typeof m[k].reason, "string", k);
  }
  assert.equal(m.claimSupport.measured, true);
});
test("D2H-C3 unlabelled expected facts are not-measured instead of silently covered", () => {
  const c = cases(); c[0]!.factLabels = (c[0]!.factLabels as unknown[]).slice(0, 1);
  const f = scoreGoldSet(c).metrics.factCoverage;
  assert.equal(f.measured, false); assert.equal(f.value, null); assert.match(f.reason!, /unlabelled/);
});
test("D2H-C4 reviewer agreement reports rate, double-labelled count and measure", () => {
  const a = scoreGoldSet(cases()).reviewerAgreement;
  assert.deepEqual([a.numerator, a.denominator, a.doubleLabelled, a.value], [1, 2, 2, 0.5]); assert.match(a.measure, /agreement/);
});
test("D2H-C4 falsification: no second labels is not-measured; a second label with no first label throws", () => {
  const c = cases().map(x => ({...x})); for (const x of c) delete x.secondLabels;
  const a = scoreGoldSet(c).reviewerAgreement; assert.equal(a.measured, false); assert.equal(a.value, null); assert.equal(a.doubleLabelled, 0);
  const bad = cases(); (bad[0]!.secondLabels as {claimId: string}[])[0]!.claimId = "nope";
  assert.throws(() => scoreGoldSet(bad), /Invalid second label/);
  const same = cases(); (same[0]!.secondLabels as {reviewerId: string}[])[0]!.reviewerId = "rev-a";
  assert.throws(() => scoreGoldSet(same), /Invalid second label/);
});
test("invalid gold shapes throw instead of scoring", () => {
  assert.throws(() => scoreGoldSet([]), /Invalid gold set/);
  const dup = cases(); dup[0]!.goldTopics = ["top1", "top1"]; assert.throws(() => scoreGoldSet(dup), /Invalid gold topics/);
  const orphan = cases(); delete orphan[0]!.predictedDecisions; assert.throws(() => scoreGoldSet(orphan), /Invalid gold decisions/);
  const both = cases(); both[1]!.goldDecisions = ["x"]; assert.throws(() => scoreGoldSet(both), /Invalid gold decisions/);
});
