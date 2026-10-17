# Phase A combined gate — runtime tests stopped

Both declared typecheck scripts were executed with existing installed TypeScript and bundled Node: `tsc --noEmit -p tsconfig.json` in packages/meeting-bot and apps/api. Full raw logs retained. Meeting-bot exited2 with six diagnostics; API exited2 with one.

| File (meeting-bot-relative unless API) | Line | Diagnostic |
| --- | --- | --- |
| src/calendar/registration-link-resolver.ts | 64 | TS2353 autoSelectFamily absent from RequestOptions |
| src/capture/controller-state.test.ts | 284 | TS2322 Promise<string> incompatible with Promise<void> |
| src/capture/record-commands.test.ts | 158 | TS2322 callback Promise<string> incompatible with Promise<void> |
| src/capture/record-consent/controller-bridge.test.ts | 60 | TS2345 string-or-undefined passed as string |
| src/capture/record-finalize.ts | 229 | TS2783 duplicate captureMode overwritten |
| src/manual-jobs/worker.ts | 50 | TS2345 nullable ManualRequest passed as ManualRequest |
| API src/evaluation-flywheel/test-fixture.test.ts | 37 | TS18048 mem.tables.chunks possibly undefined |

Scoped changed-native LOC checks use actual repository countLoc and structure.config.json: exit0, all selected files within300/400 nonblank budgets. Actual exported lint-dirsize.check over the affected py/capture directories: exit1,13 directories scanned, capture has43 loose files versus budget30. No budget/config override made. This is a real structure failure, not a passed manual count.

contracts/verify_contracts.py exited0 with explicit `PASS by vacuity` because contracts/contracts.json has zero frozen stages. It establishes no nonempty contract coverage.

1281 raw compiler/source/config/package/lock/runtime-input hashes before/after were identical. Root's phase-A authority freezes central ten exact pins and supersedes stale active native lease entries. Two active eval actor .mjs files were excluded after no vectorless-production-eval import/name references in inventoried API/package compiler sources; no QA temp/evidence paths are falsely claimed frozen. Existing runtime/import containment and owned writable temp preflight passed. Verified JobObject supervision records exact vectors, PIDs, own exits, output hashes, durations and completed tree closure. Gate script45.703 seconds; separate actual scoped directory check0.109 seconds. Runtime total tokens remain unknown.

As directed, failed type gate stopped all dependent focused runtime/nativeWAV/deferredHTTP/legacy/Python tests. No integration skips or green fixture claims manufactured. No source edits, live browser/provider/DB actions, full suite, independent verdict or parent completion. Required next work is seven type errors plus capture directory structure, then a newly frozen candidate and bounded shared runtime grant.

Artifacts: phase-a-gate-summary.json; phase-a-inventory-before.json / after.json; phase-a-authority.json; phase-a-meeting-bot-typecheck.log; phase-a-api-typecheck.log; phase-a-scoped-structure.log; phase-a-scoped-dirsize.log / receipt.json; phase-a-contracts.log.
