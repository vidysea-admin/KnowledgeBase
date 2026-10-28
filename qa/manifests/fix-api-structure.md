# Manifest — fix-api-structure

**Contract:** none (repair of RED pre-push step 6c r2; qa/verdicts/prepush-6c-2026-10-28-r2.md items 1 and 2)
**Goal task:** none
**Date:** 2026-10-28
**Status:** merged-no-check (test-lane: diff is test files only, no product code, no config, no budget edit)
**Fix cycle:** 0 of max 2
**Dual check:** no (test-only)
**Persona walk:** skip (no new screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Branch / worktree:** wave/fix-api-structure at D:/KnowledgeBase/.worktrees/fix-api-structure (base 047f17ef)

## Criteria
- **A** lint-loc: apps/api/src/routes/health.test.ts was 404 non-blank lines (budget 400). Split by describe theme; no assertion removed or weakened; budget not raised.
- **B** lint-dirsize: apps/api/src/routes was 31 files (budget 30). The split moves the tests into a new subdirectory, adding no file to routes.

## What changed
- `git mv apps/api/src/routes/health.test.ts apps/api/src/routes/health/health.test.ts`, then trimmed to the HTTP / liveness theme: 3 `/health` shape tests, ISS-T057SCREEN-001 (reproduction replay, source pin), 2 Dockerfile HEALTHCHECK tests = 7 tests (123 lines).
- New apps/api/src/routes/health/watch-silence.test.ts: header, helpers (`fakeWatchSilence`, `fresh`, `allFresh`) and the watcher-silence theme: R2/R8 detector tests, drift pin, ISS-368, AC-4 = 18 tests (328 lines).
- Test blocks copied verbatim by line range; only relative paths adjusted for one directory deeper: `../testUtils.js` -> `../../testUtils.js`, `../fixtures.js` -> `../../fixtures.js`, `./health.js` -> `../health.js`, `strip("./health.ts")` -> `../health.ts`, `../health-probe.ts` -> `../../health-probe.ts`, `../store.ts` -> `../../store.ts`, `../../Dockerfile` -> `../../../Dockerfile`, `../../../../scripts/watch/lib/heartbeat.mjs` -> `../../../../../scripts/watch/lib/heartbeat.mjs`. Line endings stay CRLF.
- Test count old vs new: routes/health.test.ts 25 -> health/health.test.ts 7 + health/watch-silence.test.ts 18 = 25. `assert.` lines: 72 -> 17 + 55 = 72. No skip/xfail added.
- Runner glob: apps/api `test` script is `node --test --import tsx "src/**/*.test.ts"`, which already matches the subdirectory (same layout as routes/ask, routes/championship, routes/compete). No package.json change.
- structure.config.json untouched; no lint budget touched.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 2 test files, 1 move, single builder, per-file node --test runs, no checker dispatch (test-lane)
Tier: L-exempt test-only (no auth, tenancy, write or schema change; tests relocated, assertions byte-identical)
Affected tests: the two files below only. No full suite run.

Tests[A]: apps/api/src/routes/health/health.test.ts (7 tests); apps/api/src/routes/health/watch-silence.test.ts (18 tests)
Tests[B]: apps/api/src/routes/health/health.test.ts, apps/api/src/routes/health/watch-silence.test.ts (tests moved, none added or removed)

Pre-check[A]: 3958f285 node --test --import tsx apps/api/src/routes/health/health.test.ts; node --test --import tsx apps/api/src/routes/health/watch-silence.test.ts -> exit 0, 7 passed + 18 passed t=2 blobs=apps/api/src/routes/health/health.test.ts:6e9bfefd,apps/api/src/routes/health/watch-silence.test.ts:049993f6
Pre-check[B]: 3958f285 node scripts/lint-loc.mjs --all; node scripts/lint-dirsize.mjs; tsc --noEmit -p apps/api; node scripts/snapshot.mjs --check -> lint-loc OK, dirsize leaves only packages/index/src/pipeline 33 (owner: speaker-rules-split, a different unit), apps/api/src/routes now 30; tsc exit 0; SNAPSHOT check OK (172 lines, budget 200; tree listing does not include test files so no regeneration) t=4
Metrics: builder_min=15 mutants=0 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Not fixed here (named, with owner)
- lint-dirsize packages/index/src/pipeline 33 files: owned by wave/speaker-rules-split, a separate repair unit.
