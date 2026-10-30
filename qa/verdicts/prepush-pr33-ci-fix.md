# Verdict: prepush-pr33-ci-fix (maker step 6c, pre-push integration check, Mode A scoped)

VERDICT: PASS on all checks. 6c-green STAMP NOT WRITTEN: `tick.mjs --stamp-6c-green` refuses (exit 1, "dirty working tree (8465 path(s), first: .goal/goal.json)"). The tool counts untracked paths (`--untracked-files=all`) and the shared checkout carries ~8.4k untracked data/ scratch paths plus modified .goal/goal.json and qa/.last-tick that are not this unit's. Not stashed, committed or hand-written. qa/.6c-green untouched; the maker needs a clean tree (or a clean-tree stamp run) to stamp.
Head: b4b8b94f (verified with git rev-parse HEAD). Last green pre-push proof: d12c36f7. Policy proportional-verification/2026-10-19.17, rule .13-1. Never pushed.

## Scope check (git diff --stat d12c36f7..HEAD)
7 files: scripts/qa/container-workflows/run.sh (1 line: web smoke `docker run` gains `-e API_UPSTREAM=http://127.0.0.1:3300`), docs/SNAPSHOT.md, docs/whatsapp/student-data-call-sites.md, qa/evidence/review-wa-unlink-consent.md, qa/evidence/review-wa-web.md, qa/gates/wa-student-data-default.md, qa/manifests/wa-isolation-read-side.md. No product source (apps/, packages/, workers/) changed since d12c36f7, so the d12c36f7 test proof (412 scoped tests, full api suite) carries over unchanged.

## Results
1. `bash -n scripts/qa/container-workflows/run.sh`: GREEN (exit 0).
2. `pnpm lint:structure`: GREEN on re-run (exit 0, 10 stages, 0 failed, 89 s). The FIRST run failed stages lint-tests and dependencies with SIGTERM at the 120 s per-stage timeout (host heavily loaded, ~97 node processes, my own collection run overlapping); not a lint finding. Run alone, `node --test scripts/lint.test.mjs` = 20/20 in 14 s, dependency-cruiser = no violations (1896 modules) in 48 s, then the full `pnpm lint:structure` = exit 0. Tracker stage only prints advisory G4 notes (non-gating, pre-existing).
3. Collection: apps/api `node --test --import tsx "src/**/*.test.ts"` imported every test file: 288 tests, pass 288, fail 0 (the name-pattern filter did not suppress execution, so this was effectively a run; the baseline red activity-health/router.test.ts:60 did not appear in this run). apps/web `vitest list --filesOnly`: exit 0, 152 files listed/collected (151 under src plus docker/runtime-config.test.ts).
4. `pnpm -r typecheck` (10 projects): GREEN (exit 0, 128 s).

## Named gap
The docker web smoke itself (the run.sh change) is not exercised locally: Docker daemon is not running. It is verified by GitHub CI after push.

## Metrics
Metrics: prepush_wall_min=25 tests=288 mode=scoped shards=0 (+ web 152 files collected, tsc 10 projects, lint:structure 10 stages) suite_runs=0 repeat_runs=1 (lint:structure re-run after load-induced stage timeouts) mutations=0 policy=proportional-verification

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
