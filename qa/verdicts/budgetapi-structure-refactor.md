# Verdict: budgetapi-structure-refactor

VERDICT: FAIL
Cycle checked: 0
Commit checked: e95e32fe (parent 364cb094)

EXPLANATION:
Verified OK:
- `git diff -M`: renames plus import-specifier edits only. The source-context.ts to passage-lexical.ts move is verbatim (diffed removed vs added lines); the only change is `export` on Span/slices/passageLexicalScorer. `assertInScope` then `rowProblem` at lines 115-116 are untouched (no diff lines touch them).
- build.mjs builds (422127 bytes). tsc --noEmit -p apps/api is clean.
- Full apps/api suite with D2_FIXTURE_PYTHON on the main .venv: 784 tests, 783 pass, 1 fail. The failure is the known activity-health timeout. Same counts as the manifest's "before".
- lint-loc: no apps/api violations; 11 remain, all outside apps/api. lint-dirsize 3. Still 6 failed stages, as before. No new violation.
- The 4 /ask exclusion and tenant test files plus source-context.test pass (120/120).

Why FAIL:
- A stale runtime reference to the old path remains outside apps/api and scripts. packages/meeting-bot/src/calendar/state/schedule-state.test.ts:179 dynamically imports apps/api/src/gws-calendar.ts. Running that file gives ERR_MODULE_NOT_FOUND in the withNativeRunner tests. The refactor breaks a test in another package (CI runs pnpm -r test), and the manifest's "Touched importers" evidence omitted it. See ISS-BUDGETAPI-001.

Mutation (swap scope-check and exclusion order): applied, and 120/120 tests still PASS, so no test fails. This is a pre-existing coverage gap (ISS-BUDGETAPI-002), not a refactor defect. The mutant was restored and the blob hash equals HEAD.

ISSUES-WRITTEN: ISS-BUDGETAPI-001 (high), ISS-BUDGETAPI-002 (medium) in qa/issues.budgetapi.jsonl
