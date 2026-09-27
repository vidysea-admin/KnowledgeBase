/**
 * qa/probes/golden-set-sibling-semantic.test.mjs — ISS-272 regression: `computeMarginRow` must
 * never fabricate `margin = expected + 2` when no rival session exists in the scored pool. The
 * ledger row for ISS-272 has an empty `fix_direction` and `reproductions: null` (no recorded
 * cases to re-run), so this corpus is authored fresh from the condition named in the issue title.
 *
 * `computeMarginRow` is pure (no Mongo, no embedding call) — this drives the real per-question
 * formula directly, not a re-implementation of it.
 * Run: node --test qa/probes/golden-set-sibling-semantic.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMarginRow } from "./golden-set-sibling-semantic.mjs";

test("ISS-272: no rival session in the pool -> marginMeasured:false, margin:null (never expected+2)", () => {
  const ranked = [["expected-session", 0.71]]; // only the expected session scored — degenerate pool
  const { marginMeasured, margin, rivalBest } = computeMarginRow(0.71, ranked, "expected-session");
  assert.equal(marginMeasured, false);
  assert.equal(margin, null, "must not fabricate expected+2 (the exact ISS-272 defect: 0.71+2=2.71)");
  assert.equal(rivalBest, undefined);
});

test("ISS-272: exactly one rival -> marginMeasured:true, margin = expected - rival (real comparison)", () => {
  const ranked = [["expected-session", 0.80], ["rival-session", 0.62]];
  const { marginMeasured, margin, rivalBest } = computeMarginRow(0.80, ranked, "expected-session");
  assert.equal(marginMeasured, true);
  assert.equal(margin, 0.18);
  assert.equal(rivalBest[0], "rival-session");
});

test("ISS-272: normal multi-rival pool -> margin uses the BEST rival, not just the next-ranked one", () => {
  const ranked = [
    ["expected-session", 0.90],
    ["rival-a", 0.875],
    ["rival-b", 0.20],
  ];
  const { marginMeasured, margin, rivalBest, ambiguousRivals } = computeMarginRow(0.90, ranked, "expected-session");
  assert.equal(marginMeasured, true);
  assert.equal(rivalBest[0], "rival-a");
  assert.equal(margin, 0.025);
  assert.deepEqual(ambiguousRivals, ["rival-a"], "rival-a is within the 0.03 ambiguity band, rival-b is not");
});

test("ISS-272: a degenerate pool must not silently read as unambiguous downstream", () => {
  const ranked = [["expected-session", 0.5]];
  const { marginMeasured, margin } = computeMarginRow(0.5, ranked, "expected-session");
  // The whole point of the fix: `margin < 0.03` (the ambiguity threshold) must be false for THIS
  // reason (not measured) and must never be evaluated as "clearly unambiguous" (margin=2.5).
  assert.equal(marginMeasured, false);
  assert.equal(margin, null);
});
