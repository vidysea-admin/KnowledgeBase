# Verdict - t035-lean-video-over-target-report
VERDICT: PASS
Cycle checked: 0
Commit checked: aea74c0 (base f016d4c, lane/leanover)

EXPLANATION:
1. D-015 repro (video 4000 + audio 192): by hand (4000+192) kbps * 1000 * 1.02 * 3600 / 8 / 1e6 = 4192 * 0.459 = 1924.128 MB/h (decimal MB, 2% container overhead). The ledger's 1923.1 was slightly off; the maker's figure is right. Measured: withinTarget false, one over-target note, values kept. 1/1 recorded reproduction measured.
2. Old vs new: old builder from f016d4c vs new, 200 seeded hostile/in-range inputs: settings (all fields except adjustments) deep-equal in 200/200; adjustments identical in the 147 within-target cases; in the 53 over-target cases new = old + exactly one trailing note. Defaults, slides and talking-head hints: within, adjustments []. `git diff f016d4c aea74c0` on the test file: 35 additions, 0 removals. The note is not forbidden: the existing tests assert [] only for within-target inputs, the T-035 verdict's contract is "under 400 MB/h", and the builder's convention is to report each change in adjustments. assess is a new function, so no existing return shape changed.
3. Boundary: isWithinLeanTarget 399.999 true; 400, 400.001, NaN, Infinity, -Infinity false. Note (low, not filed): negatives return true (literally "under 400"); unreachable via the builder, whose bitrate floors are positive. assess on null/number/string/array/NaN-field input never throws; withinTarget is never true for a non-finite estimate. The estimate is taken from the FINAL settings (assess calls estimateSizeMbPerHour(settings); the builder uses the clamped locals).
4. Mutations (own, timeout 120 s, byte backup per mutation, restored per mutation, final `git hash-object` equals `git rev-parse aea74c0:` blob f9ff2dc4): 4 of 5 killed. `<` to `<=`: killed (1 fail). `<` to `>`: killed (7). Note pushed always: killed (4). Target 400 to 500: killed (3). SURVIVED: the builder's note estimated from RAW input instead of final settings (talking-head default 700 + audio 192 is over target, yet raw-defaulted 500+192 is under; no test pins that pair). Low: assess's withinTarget/estimate use final settings and are pinned; only the in-builder note path is unpinned. Noted, not filed, not a unit.
5. 17/17 tests pass; `tsc --noEmit -p packages/core` exit 0; only lean-video.ts and its test reference the module; source 113 non-blank lines (budget 300), test 105 (budget 400); commit aea74c0 touches only the two files and the manifest; git status clean before this verdict.

ISSUES-WRITTEN: none
