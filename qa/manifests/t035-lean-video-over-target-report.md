# Manifest — t035-lean-video-over-target-report
Status: checked-PASS (Checked: qa/verdicts/t035-lean-video-over-target-report.md, cycle 0, 1e8ff30)
Fix cycle: 0
Lane: LEANOVER (branch lane/leanover, base f016d4c). Issue addressed: ISS-T035LEAN-001 (medium, qa/issues.t035lean.jsonl).

## Seam PASS count / cap ruling
Prior PASSed verdicts naming the lean-video seam: 1 (qa/verdicts/t035-lean-video-settings-builder.md). Cap is 2 for non-security: not reached. Tier 4 (medium ledger issue); no auth, tenancy or data-write surface (pure, unwired module; grep shows only lean-video.ts and its test reference it).

## Scope
- packages/core/src/domain/lean-video.ts (113 non-blank lines, budget 300), lean-video.test.ts (105, budget 400). No file added. No other package touched.
- Builder: when the estimate of the FINAL settings is not under the target, pushes one note to `adjustments` ("estimate X MB/h is not under the 400 MB/h target, settings kept as given"). Values are NOT clamped: the file's clamping convention is for out-of-RANGE input; these overrides are in range and the task says report, don't rewrite.
- New exports: `isWithinLeanTarget(mb)`, `assessLeanVideoSettings(input)` -> `{ settings, estimateMbPerHour, withinTarget, targetMbPerHour }`, using the existing `estimateSizeMbPerHour` and `LEAN_TARGET_MB_PER_HOUR` (no new knob, no option).
- Why a separate assess function: the existing defaults test deep-equals the whole builder result, so extra enumerable fields on `LeanVideoSettings` would break the existing 12 tests. They pass unchanged; new fields are additive on a new result type.

## Boundary decision
Task wording is "under 400 MB/h": strictly less. Exactly 400 is NOT within. Integer-kbps estimates are multiples of 0.459, so 400 exactly is unreachable via the builder (871 kbps total = 399.789 within; 872 = 400.248 not); exactly-400, NaN and Infinity are asserted on `isWithinLeanTarget`, which requires a finite number.

## Evidence (from packages/core, node from codex runtime)
- `timeout 120 node --test --import tsx src/domain/lean-video.test.ts` -> `tests 17 / pass 17 / fail 0` (12 existing unchanged + 5 new)
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `grep -rn "lean-video" apps packages --include=*.ts*` -> only lean-video.ts and lean-video.test.ts

## D-015 measurement
ISS-T035LEAN-001: 1/1 recorded reproductions measured. Row repro `videoBitrateKbps:4000, audioBitrateKbps:192` (recorded 1923.1; actual 4192*0.459 = 1924.128, the row's figure was slightly off) -> withinTarget false, note present, values kept. The row records one case only; additional cases (871/872 boundary, 1e9 clamp, NaN) are mine and supplementary.

## Mutations (60 s timeout, byte backup per mutation, restore in trap, `cmp` clean after each)
| Mutation | Killed by |
|---|---|
| comparison inverted (`<` -> `>=`) | 7 tests incl. the recorded repro, defaults/hint, boundary, hostile |
| boundary `<` -> `<=` | boundary test (exactly 400) |
| boundary off by one (`< target + 1`) | boundary test |
| note omitted | recorded repro; boundary; hostile |
| estimate from defaults instead of final settings | recorded repro; defaults/hint; boundary; "estimate comes from the final clamped settings"; hostile |
All 5 killed. Post-run: working file equals the intended post-fix content (cmp vs backup; HEAD blob differs by design since this unit edits the file).
