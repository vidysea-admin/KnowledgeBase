# Independent checker verdict — iss-367-lint-structure-no-shortcircuit

Date: 2026-10-05
Bound root: D:\KnowledgeBase
Cycle checked: 1

VERDICT: FAIL
SCOREBOARD: 7/10 criteria evidenced, 3/3 invariants hold
FAILURES:
- [C6] sev: high · current-tree dependency check exits 8 with eight violations; planted dependency-negative proof not rerun in this cycle · repair existing boundary/cycle violations under their authorized units.
- [C7] sev: high · current-tree-zero release acceptance fails, although all-stage execution is proven · settle the seven independently observed failing stages without budget increases; issue: ISS-367 (remaining gate state).
- [C9] sev: high · full local CI-equivalent green sequence is not evidenced; actual structural aggregate is red · run the complete release sequence after residual repairs.
LIVE-BROWSER: not-applicable (scripts/lint-loc.mjs, scripts/lint.test.mjs, package.json, structure.config.json)
ISSUES-WRITTEN: none (existing failures; no new changed-code defect found)
EXPLANATION: The bounded runner repair and .test.mjs classification are independently demonstrated. The full structure-lint contract and release goal remain failed; this verdict must not be represented as a green release or a failure of the corrected aggregation mechanism.

## Independently rerun evidence

- `node --test --test-name-pattern='aggregate gate|mjs tests use' scripts/lint.test.mjs`: exit 0; 3 tests, 3 passed, 0 failed. Checks first/middle/final failures, launch exceptions/errors/signals, clean path, retained stage arguments and actual 400/401 test versus 300/301 source fixture boundaries.
- `node scripts/lint-loc.mjs --all`: exit 1; terminal `lint:structure: FAIL (10 stages, 7 failed)`. LOC exit1 (four violations), dirsize exit1 (32 > authorized override31), root exit1 (17 >15), dupes exit0, migrations exit0, codex-hooks exit0, snapshot exit1 (96 differences), lint-tests unavailable/SIGTERM/execution-failed after runner deadline, tracker exit1 (six ambiguous references), dependencies exit8 (eight violations). All ten stages were observed after initial failures. Full lint-tests is NOT green: it reached its existing import-resolution opener/hang and timed out.
- `git diff --check`: exit 0, no whitespace errors.
- Read actual diff and ledger reproductions: ISS-367 package.json no longer chains with && and actual downstream exits are now observed. ISS-371 anchored .test.mjs pattern exists; budgets remain max300/testMax400, and dispatch-state.test.mjs is absent from the four LOC violations. Historical attribution/git comparisons in both ledger entries are preserved provenance, not claimed corrected. No mutation run was needed: the independent focused fixture/execution checks and real aggregate directly establish the submitted behavior; maker mutation claims are not independently credited.

## Contract disposition

Checker appended a routine amendment reconciling C7 first-failure wording with Scope's run-every-check requirement and ISS-367: all stages run, every failure propagates to aggregate failure, timeout is red. Added .test.mjs classification under existing testMax per ISS-371. Original current-tree-green release acceptance and all budgets remain intact. C1-C5, C8, C10 functional enforcement evidenced by actual checks/fixture negatives; C6/C7 green acceptance and C9 full local sequence remain unmet. CI still invokes the structure gate; failing enforcement remains blocking (I3).

No code or maker-owned manifest edited; no whole-goal completion or issue closure asserted. Existing residuals remain the maker's next work, rather than inventing new duplicate issues.

## Cycle 2 independent recheck — 2026-10-05

Cycle checked: 2

VERDICT: FAIL
SCOREBOARD: 7/10 criteria evidenced, 3/3 invariants hold
FAILURES:
- [C6] sev: high · dependency stage still exits8 with the same eight errors; current-tree green requirement remains unmet.
- [C7] sev: high · six aggregate stages still fail despite independently proven all-stage execution; retain existing budgets and repair residuals.
- [C9] sev: high · full green local CI-equivalent release sequence remains unevidenced.
LIVE-BROWSER: not-applicable (additional changed paths scripts/demo-live.mjs and scripts/lint.test.mjs; CLI opener helper/test determinism, no product UI surface)
ISSUES-WRITTEN: none
EXPLANATION: The cycle-1 lint-test hang is resolved for this suite: independently rerun full suite passes17/17 and actual aggregate's lint-tests exits0. Full contract/release still FAIL; bounded runner, classification and opener-test repair are demonstrated without increasing budgets.

### Commands and actual outcomes

- `node --test scripts/lint.test.mjs`: exit0, 17 tests/17 passed/0 failed, duration2531ms. Includes five-linter clean/violating fixtures, import checks, deterministic opener success/first-error/second-error/timeout/synchronous-throw continuation and exact-URL assertions, and checklist failure-gate wiring.
- `node scripts/lint-loc.mjs --all`: exit1, terminal `lint:structure: FAIL (10 stages, 6 failed)` in approximately7.7sec. loc1/four violations; dirsize1/32>31; root1/17>15; dupes0; migrations0; hooks0; snapshot1/96 differences; lint-tests0/17passed; tracker1/six references; dependencies8/eight errors. No timeout and no browser launch from the replaced test.
- `git diff --check`: exit0, no whitespace errors.
- Read actual code diff: openPages retains execFile platform command and existing failure collection, forwards timeout default10000, and offers injected execFileFn for deterministic tests. The test uses configured timeout1234 and exercises callback errors plus synchronous throw while preserving both attempted URLs. These tests prove error handling/config propagation, not a real OS opener timeout measurement; no such claim is credited.

Cycle1 content preserved above. No code/manifest/ledger/goal edits, and no contract weakening. Narrow QA commit not retried: the existing `.git/index.lock` filesystem denial remains the known limitation for this checker.
