/**
 * scripts/eval/filter-bias.mjs -- the pure ISS-271 filter-bias decision, split out of
 * scripts/eval-recall.mjs when that file crossed its 300-LOC lint budget. eval-recall.mjs
 * re-exports `computeFilterBias`, so `import { computeFilterBias } from "../eval-recall.mjs"` is unchanged.
 */

/**
 * ISS-271: pure filterBias decision — testable without Mongo/network. `measured: false` fires
 * ONLY when `rejectedPathExists` is false (the old bug: absence fell through to a bare `null`,
 * indistinguishable from "measured, no bias found"). `computeRejected`/`computeCombined` are
 * thunks, called only when `rejectedQs` is non-empty, so this function has no I/O of its own.
 */
export function computeFilterBias({ rejectedPathExists, rejectedQs, keptResult, computeRejected, computeCombined }) {
  if (!rejectedPathExists) {
    return {
      measured: false,
      note:
        "NOT MEASURED — data/eval/golden-set-rejected.json is absent, so the ISS-092 filter-bias " +
        "check did not run on this report. This is not a claim of zero bias; re-run " +
        "scripts/gen-golden-set.mjs to produce the rejected-candidates file, then re-run this " +
        "script to measure it.",
    };
  }
  if (rejectedQs.length === 0) {
    return {
      measured: true,
      note:
        "0 candidates rejected, so the kept set IS the candidate set and the filter introduces " +
        "no selection bias on this run — kept === combined by construction",
      kept: { n: keptResult.total, recallAtK: keptResult.recallAtK },
      rejected: { n: 0, recallAtK: null },
      combined: { n: keptResult.total, recallAtK: keptResult.recallAtK },
    };
  }
  const rejectedResult = computeRejected();
  const combined = computeCombined();
  return {
    measured: true,
    note:
      "the post-filter removes questions the retriever tends to answer, so `kept` is a " +
      "downward-biased floor; `combined` is the pre-filter figure",
    kept: { n: keptResult.total, recallAtK: keptResult.recallAtK },
    rejected: { n: rejectedResult.total, recallAtK: rejectedResult.recallAtK },
    combined: { n: combined.total, recallAtK: combined.recallAtK },
  };
}
