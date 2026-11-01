# Verdict — prepush-wa-wave3 (6c pre-push integration check, Mode A)

**VERDICT: GO**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2(a): auth and security tier-L units in the batch, so the FULL suite, not the scoped set)
**Checked head:** ca2d36fc954c8b7f5107518401c16ad325841caf (branch docs/devops-golive-2026-10-26; tree 6c3ca20db510578fb2dddaebc8ea3593f80f4aa6)
**Previous 6c-checked head:** a92d3b04 (prepush-wa-wave2.md, GO, stamp tree f3ecd233)
**Merged since, unpushed:** wave/wa-events-cursor (7178555a), wave/ua-web-401-signout (c58061b9), wave/wa-composition-wiring (8e2474ba), plus qa-only commits up to ca2d36fc
**Stamp:** STAMPED. `qa/.6c-green` = `6c3ca20db510578fb2dddaebc8ea3593f80f4aa6` (see Stamp).

## Step table

All steps ran in a clean detached worktree of HEAD under `D:/kb-scratch/6c3/` (`git worktree add --detach`, `pnpm install --frozen-lockfile`, 17 s, exit 0). TMP and TEMP were set to `D:/kb-scratch/6c3/tmp` for every command. The shared checkout was not used for any step (it has the untracked files and the missing `qrcode-generator`; the lockfile install in the clean worktree resolves it, so apps/web typechecks, tests and builds). No Mongo env var was set and no mongod was started (none on PATH), so Mongo-gated suites skipped.

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Typecheck | `pnpm -r typecheck` | 0 | 9 packages "Done" (core, db, ai, ingest, index, ask, meeting-bot, apps/api, apps/web), no error lines |
| 2 | Structure lint | `pnpm lint:structure` | 0 | 10 stages, 0 failed; lint-tests ok; tracker-audit OK (G4 advisories only, non-gating, unchanged class); dependencies 1923 modules, 8986 dependencies, no violations |
| 3a | API tests, full | `pnpm test` in apps/api (`node --test --import tsx "src/**/*.test.ts"`) with `--test-concurrency=6`, no bail | 1 | 2717 tests: 2670 pass, 1 fail (baseline R1), 46 skipped, 0 cancelled |
| 3b | Web tests, full | `pnpm test` in apps/web (`vitest run`) with `--minWorkers=1 --maxWorkers=4`, no bail | 1 | 154 files (153 pass, 1 fail), 1468 tests: 1465 pass, 1 fail (baseline R2), 2 skipped |
| 4a | API production build | `pnpm --filter @lkb/api build` (Dockerfile build stage) | 0 | `apps\api\dist\server.js` 1,859,838 bytes |
| 4b | Web production build | `pnpm --filter @lkb/web build` (`tsc -b && vite build`, Dockerfile web-build stage) | 0 | built in 4.9 s (chunk-size warning only) |
| 5 | Stamp | `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in a second clean detached worktree of HEAD | 0 | `6c-green: 6c3ca20db510578fb2dddaebc8ea3593f80f4aa6`; `--push-gate` there and in the shared checkout: green |

Exit 1 on 3a and 3b is the runner reporting the two baseline reds; with those two excluded every other test passed.

### Invalid first attempt (host memory exhaustion, not a code result)

The first full run used the runners' default parallelism (node --test with ~20 file workers, vitest default forks) concurrently on a host with C: at 100% (pagefile cannot grow) and many other sessions running. It produced `FATAL ERROR: Zone Allocation failed - process out of memory` / `pageAlloc: out of memory` in 12+ workers: the API run showed 20 file-level failures (join-rules, operations-integrations, production.test.ts, routes/*) with 2589 of 2717 tests executed, and vitest died with `Error: Worker exited unexpectedly` after 1 of the web files had crashed at 355 ms. That attempt is discarded as a resource failure (free virtual memory was 3.6 GB at the time). Both suites were rerun in full from the start with the runners' own concurrency flags lowered (step 3a and 3b above); the reruns show zero out-of-memory lines. No test or config file was changed.

## Reds

| # | File | First error line | Status |
|---|---|---|---|
| R1 | apps/api/src/activity-health/router.test.ts:150, test "actual producer -> Python first/reclaim/fences -> real production Mongo binding -> authenticated current server -> consumer output" | `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: null !== 0` (`.venv/Scripts/python.exe` absent in a worktree); failed in 74 to 125 ms, no hang | **baseline** (qa/checkpoints/baseline-reds.md hash 3e3bc1aa4251 row; same test id, message and line 150 as at b3eabbee and in prepush-wa-wave2.md) |
| R2 | apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx, test "immediate speaker UI replays actual scripted U24 producer output and withholds pending/stale attribution" | `AssertionError: expected 'c85a312586515f4bef8edfb8c798bf470c0c0…' to be '98948cae1b8f3d812346ac2528b822a616ed8…'` | **baseline** (hash d63667bfa471 row; same c85a31 vs 98948c pin; also red in the previous verdict) |

No new red. Both were matched to the recorded baseline rows by test id and failure message and were not re-run at a92d3b04 (the rows were produced at a baseline sha in a separate worktree and the messages are identical).

Observed only in the discarded first attempt, not reproduced in the valid rerun: apps/web `calendar-model.test.ts` "office skip is visible in detail and agenda..." (5000 ms timeout under load) and `CalibrationReviewPage.test.tsx` "saves one fractional judgment, shows persisted progress and resumes after reload". Both passed in the rerun (153 of 154 files green). Classified as load flakes from the memory-starved run; no baseline row, no regression evidence.

### The known-open items

- **apps/web `qrcode-generator`:** an install gap in the shared checkout only; resolved by the frozen-lockfile install in the clean worktree. The shared checkout still needs `pnpm install --frozen-lockfile` before web work there (not done: this check does not modify the shared checkout's dependencies).
- **apps/web KnowledgeSpeakerProfilePage:** R2, baseline.
- **activity-health router.test.ts:150:** R1, baseline; fails fast, does not hang.

## Skipped (not run)

- apps/api: 46 skipped, all Mongo-gated (unchanged count from the previous check despite 4 more tests loading). This includes the real-Mongo suites for W8 and for the new `_id` cursor paging in `packages/db` / `apps/api` whatsapp events if they carry a Mongo gate; they were NOT exercised against a real Mongo by this check. No Mongo was started or touched.
- apps/web: 2 skipped (unchanged file-level skips).

## Coverage of the merged waves

The full API run (2717 tests, up from 2713 at the previous GO head) includes `apps/api/src/composition/integrations/whatsapp-wiring.test.ts` ("C1/C3 configured" and "C2 unconfigured" both pass), the updated W5 pin in `whatsapp/links/router.test.ts`, the events cursor suites, and `production.test.ts`. The full web run (1468 tests, up from 1454) includes `src/api/client.session.test.ts` (21 tests, pass) for the 401 session probe. This is a pre-push integration run; it did not re-derive each unit's own contract verdicts (all three units carry their own PASS verdicts, the two tier-L security/auth units dual).

## Environment notes

- Disk: C: is 100% full (1.7 GB free); everything ran on D:. The host hit commit-limit exhaustion under default parallelism (see above). Nothing was written to C: by this check beyond the tool's own harness files.
- The test run writes an untracked `apps/api/qa/evidence/goal-t059-maker/rows.json` into the worktree (a test side effect; the same untracked `apps/api/qa/` appears in the shared checkout's git status). It made `--stamp-6c-green` refuse in the test worktree ("dirty working tree, 1 path"), which is why the stamp was produced in a second, never-tested clean worktree. Worth a follow-up unit so the suite does not write into the tracked tree; not filed here.
- Scratch worktrees: 1068 reparse points in the test worktree, 0 pointing outside it (checked before removal). The stamp worktree was removed with `git worktree remove`; the test worktree was removed with `git worktree remove --force` plus `cmd /c rmdir /s /q` for the leftover node_modules tree; the pnpm store on D: is intact. No `rm -rf` was used.
- Nothing pushed, merged or edited in product code; `.worktrees/*` untouched; no `.env` read; no consent code touched (D-210). Only this verdict is committed. Log files remain under `D:/kb-scratch/6c3/` (logs only).

## Stamp

Tree of HEAD ca2d36fc: `6c3ca20db510578fb2dddaebc8ea3593f80f4aa6`. Produced by `tick.mjs --stamp-6c-green` inside a clean detached worktree of HEAD (output `6c-green: 6c3ca20db510578fb2dddaebc8ea3593f80f4aa6`; `--push-gate`: `green`). The same line was written to the shared checkout's untracked `qa/.6c-green` (previous content `f3ecd2336c5fe88166bafa142949b5aca2c68bcc`), where `tick.mjs --push-gate` prints `push-gate: green 6c3ca20db510578fb2dddaebc8ea3593f80f4aa6`. This verdict commit is qa-only, so the stamp stays valid across it.

## Metrics

prepush_wall_min=21 tests=4185 mode=full shards=2
(tests = 2717 api + 1468 web, from the valid reruns; shards = api and web run as 2 concurrent runners; wall includes install, typecheck, lint, the discarded memory-starved first attempt, both reruns, both builds and the stamp)
