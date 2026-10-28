# Verdict: w26-dashfix

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: 526a86483e6001db4c55168f3eae56c02946b2dc
Base: fd471686

## Evidence (independently run, lane apps/web, `timeout 600`)
- Identity: HEAD == 526a8648, tree clean; diff fd471686..526a8648 = DashboardPage.tsx, DashboardPage.test.tsx, manifest only.
- vitest `DashboardPage.test.tsx` + `App.routes.test.tsx`: exit 0, 2 files / 8 tests passed.
- tsc `--noEmit -p tsconfig.json` (apps/web): exit 0, no output.
- D-020 mutation (per-mutation byte backup, trap INT/TERM/ERR, timeout): replaced the 503 branch in `failureNote` with `if (false)`. First run hit a vitest-worker load timeout (no tests collected, not counted). Rerun: 1 failed / 4 passed; the new "a 503 on /keys ..." test failed by name (KILLED). Restored; `cmp` clean; `git hash-object` == `git rev-parse 526a8648:apps/web/src/pages/DashboardPage.tsx` == 5a1dadff4ec784468a9f56c6bb2513b84f1a21a0.

## Findings
1. Correctness: each panel has its own loading/ok/error state via `track()`; cancelled flag guards unmount/apiKey change; 503 yields "API keys unavailable (hosting not configured)", other panels and recent sessions still render (test asserts this). Failed /gaps affects only Knowledge health. OK.
2. Leak: 503 text is fixed, ignoring the server body. Other errors show `ApiError.message` (server-supplied `message`, or `HTTP <n>`, or connect error text), same source the old page already rendered. apiKey is only in the Authorization header, never in any message. Non-ApiError gives a fixed "failed to load". No new leak.
3. Regressions: stat cards, newest-first ordering, 5-item slice, open-gaps tone, empty-gaps text and the 403 path (wording now "Sessions unavailable (...)", test updated) are unchanged. Minor note only: with a failed panel the stat-grid renders fewer cards (intended).

## Not verified
Manifest lint-loc / `dependency` stage (maker reports an environment gap) not re-run; not required by this scope. Sessions "index: pending" item is no-code and was not checked against staging data.

ISSUES-WRITTEN: none
Ledger rows may be flipped: yes (maker may close out to checked-PASS).
