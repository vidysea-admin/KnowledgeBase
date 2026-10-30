# Verdict - ua-production-enable (coordinator A of a dual check) - cycle 0
Date: 2026-10-30. Bound to D:/KnowledgeBase/.worktrees/ua-prod-enable. Base 0f565734 (= merge-base with docs/devops-golive-2026-10-26), Head 2ae928e5 (code commit e9600960; 2ae928e5 is the manifest bookkeeping commit). Policy proportional-verification/2026-10-19.17. Cycle checked: 0
Contract: manifest criteria P-1..P-4 (no qa/contracts file; plan has no production-enable item). Dual coordinator A; coordinator B's verdict, checkpoint and evidence not read.

## Check plan
Diff: production.ts (adds userAccounts at :265, removes 3 moved helpers), watch-runs.ts (+44, receives them), two test files (+127). api-only, no UI, no walks. Auth wiring (L, dual-trigger production.ts:265 present and valid). Plan: re-run each criterion's command, differential check of the moved block, tsc and lint, security read of line 265, one falsification per criterion plus extras. Consent out of scope (D-210). Tests ran in a git-archive copy outside the bound root (the worktree has no node_modules); the bound tree was never edited.

## Evidence (I ran all of it)
- P-1 production.test.ts: 6/6. Both new tests discriminate: F1 (drop the `userAccounts:` line) -> positive test red (pass 5 fail 1); F1b (default a secret when unset) -> negative test red. Unset and 12-byte secret both give userAccounts undefined, /auth/no-such-route 401, valid API key still authenticates, anonymous 401.
- P-2 mounted-routes.test.ts: 6/6 through real createServer + buildUserAccounts (in-memory Db): anonymous 401, API key holding user-admin 403 admin_session_required, admin session 200. F2 (drop requireAuth on the /admin mount) -> P-2 and P-3 red.
- P-3 same file: 8 failed A4 logins -> one locked throttle row keyed by auth.subjectHash; unlock via the built router -> 200 cleared true, 0 rows, `unlocked` event; issue-link starts with https://kb.example.org/knowledgebase/. F3a (subjectHash constant) -> P-3 red; F3b (publicOrigin constant) -> P-3 red. This closes the ISS-UAADMIN-005 wiring gap.
- P-4 consumer tests watch-runs/watch-silence/health/watched-sources: 49/49, files unchanged. Moved block (watchHeartbeatIntervalMs, createMongoWatchSilenceDeps, createMongoWatchStateReadDeps) diffed against base: identical except `export` on the state-read factory. Only importer is production.ts (git grep). tsc --noEmit -p apps/api exit 0. lint-loc --all: 9 of 10 stages green incl. loc and dirsize (production.ts 264 non-blank lines); the dependencies stage cannot run in a copy (junction path ENOENT), so I ran dependency-cruiser on the bound tree: 817 violations, all unresolvable-import for missing node_modules, none of any other rule.
- Security read of production.ts:265: `buildUserAccounts(process.env, db, logger)`; db is the lazy Db (no connection at build, shown by the P-1 positive test running with no Mongo); an unusable secret returns undefined after one warn that carries no secret. Both entry points (index.ts, join-rules-api-host.ts) take buildProductionDeps, so /auth and /admin are live exactly when a >=32-byte secret is set. /admin stays behind requireAuth with a terminal 404 (mountUserAccounts unchanged).

## Falsification floor
P-1 F1, P-2 F2, P-3 F3a: met (green before, red after; copies discarded, bound tree blobs equal HEAD). P-4: pure move, so the falsifying instrument is the byte differential above; mutants of the moved Mongo factories (fallback 1h to 2h, drop the workerSnapshot/workerReceipt filter) survived every consumer test, so no test pins them, before or after this unit. That is a pre-existing coverage gap, not a regression, filed as P1.

## Findings (non-blocking)
PROPOSED-ISSUE: {"id":"P1","sev":"low","class":"test-gap","file":"apps/api/src/activity-health/watch-runs.ts:107-135","summary":"createMongoWatchSilenceDeps / createMongoWatchStateReadDeps / watchHeartbeatIntervalMs have no direct test: mutating the 1h fallback or dropping the workerSnapshot/workerReceipt privacy filter leaves watch-runs, watch-silence, health, watched-sources, production and capture-policy tests green. Pre-existing (identical on base), surfaced by the move."}
PROPOSED-ISSUE: {"id":"P2","sev":"low","class":"doc","file":"apps/api/src/activity-health/watch-runs.ts:98-99","summary":"The D-048/D-053 doc comment now sits above the U4d comment for watchHeartbeatIntervalMs instead of above createMongoWatchSilenceDeps (same order as the original). Cosmetic."}
PROPOSED-ISSUE: {"id":"P3","sev":"low","class":"doc","file":"qa/manifests/ua-production-enable.md","summary":"Manifest states head e9600960; dispatched head is the bookkeeping commit 2ae928e5 (product diff identical). P-3 uses an in-memory Db double (declared open point 3); real-Mongo coverage stays with the existing *.mongo.test.ts files."}

## Return block
VERDICT: PASS
SCOREBOARD: 4/4 criteria met, 3/3 invariants hold (API-key behaviour unchanged when secret unset, /admin behind requireAuth, throttle key identity)
TIER: L (auth wiring apps/api/src/composition/production.ts:265; dual-trigger line present and valid)
FAILURES: none. Non-blocking: P1 (low, test-gap), P2 (low, doc), P3 (low, doc)
CAPABILITY-COVERAGE: 3/3 mutation rows reproduced (P-1, P-2, P-3); P-4 by byte differential (pure move, see floor)
LIVE-BROWSER: not-applicable (apps/api/src/composition/production.ts, api-only)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: Production now composes userAccounts only when AUTH_CSRF_SECRET is usable; with it unset the key-only behaviour is unchanged and /auth is not mounted. The /admin perimeter, the A4 throttle-row unlock and the issue-link origin are pinned by tests that go red under their mutants; the moved watch helpers are byte-identical, though their Mongo factories were never pinned by any test (P1).
Metrics: start=2026-10-30T05:53:11Z end=2026-10-30T06:10:00Z wall_min=17 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1010 mutants=3 defects_unit=0 defects_6c=0
