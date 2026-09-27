/**
 * scripts/lib/eval-recall.test.mjs — ISS-271 regression: `computeFilterBias` must never fall back
 * to a bare `null`/ambiguous shape when `data/eval/golden-set-rejected.json` is absent. The ledger
 * row for ISS-271 has an empty `fix_direction` and `reproductions: null` (no recorded cases to
 * re-run), so this corpus is authored fresh from the condition named in the issue title: does the
 * report distinguish "bias measured, none found" from "bias never measured"?
 *
 * `computeFilterBias` has no I/O of its own (thunks are injected), so this drives the real
 * decision function directly — not a re-implementation of it.
 *
 * Lives in scripts/lib/ rather than beside scripts/eval-recall.mjs (the usual sibling-test
 * convention — see scripts/lint.test.mjs, scripts/snapshot.test.mjs): scripts/ is already at its
 * lint-dirsize override ceiling (32/32, structure.config.json), so a 33rd file there would trip
 * C2 with no authorization in this unit to raise the override (D-017 requires a named DECISIONS
 * entry for that). scripts/lib/ has headroom (20/30 default budget) and is an existing sibling
 * directory already scanned by pnpm test:lint. See the manifest's "Declared regression avoided"
 * note for the reasoning in full.
 * Run: node --test scripts/lib/eval-recall.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFilterBias } from "../eval-recall.mjs";

const kept = { total: 92, recallAtK: 0.9 };
const boom = () => { throw new Error("must not be called"); };

test("ISS-271: rejected file absent -> measured:false, never a bare null and never measured:true", () => {
  const fb = computeFilterBias({
    rejectedPathExists: false,
    rejectedQs: [],
    keptResult: kept,
    computeRejected: boom,
    computeCombined: boom,
  });
  assert.notEqual(fb, null, "must not be a bare null (the exact ISS-271 defect)");
  assert.equal(fb.measured, false);
  assert.match(fb.note, /NOT MEASURED/);
  assert.equal(fb.kept, undefined, "an unmeasured result must not carry kept/rejected/combined stats");
});

test("ISS-271: rejected file present but empty -> measured:true, kept === combined, rejected.n===0", () => {
  const fb = computeFilterBias({
    rejectedPathExists: true,
    rejectedQs: [],
    keptResult: kept,
    computeRejected: boom,
    computeCombined: boom,
  });
  assert.equal(fb.measured, true);
  assert.deepEqual(fb.kept, fb.combined);
  assert.equal(fb.rejected.n, 0);
  assert.equal(fb.rejected.recallAtK, null);
});

test("ISS-271: rejected file present with rows -> measured:true, uses the injected rejected/combined results", () => {
  const rejectedResult = { total: 3, recallAtK: 0.5 };
  const combinedResult = { total: 95, recallAtK: 0.88 };
  const fb = computeFilterBias({
    rejectedPathExists: true,
    rejectedQs: [{ id: "rejected-001", question: "q", expectedSessionId: "s1" }],
    keptResult: kept,
    computeRejected: () => rejectedResult,
    computeCombined: () => combinedResult,
  });
  assert.equal(fb.measured, true);
  assert.equal(fb.rejected.n, 3);
  assert.equal(fb.rejected.recallAtK, 0.5);
  assert.equal(fb.combined.n, 95);
  assert.equal(fb.combined.recallAtK, 0.88);
  assert.equal(fb.kept.n, kept.total);
});

test("ISS-271: three shapes are mutually distinguishable by `measured` + presence of stats", () => {
  const notMeasured = computeFilterBias({ rejectedPathExists: false, rejectedQs: [], keptResult: kept, computeRejected: boom, computeCombined: boom });
  const measuredNone = computeFilterBias({ rejectedPathExists: true, rejectedQs: [], keptResult: kept, computeRejected: boom, computeCombined: boom });
  assert.notDeepEqual(notMeasured, measuredNone, "not-measured and measured-with-zero-bias must not collapse to the same shape");
});
