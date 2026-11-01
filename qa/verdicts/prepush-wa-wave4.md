# Verdict — prepush-wa-wave4 (6c pre-push integration check, Mode A)

**VERDICT: GO**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2(a): wa-events-without-archiver is an auth tier-L unit, so the FULL suite, not the scoped set)
**Checked head:** 4e4d0767b608b14633e0c22f37c054519aa0ce0f (branch docs/devops-golive-2026-10-26; tree 96de17c76e3da1c571cc6f9ff76f4afe172e6ab2)
**Previous 6c-checked head:** cf244ceb (prepush-wa-wave3.md, GO, stamp tree bd55f9cc per the task brief; pushed as PR #34)
**Committed since, unpushed:** 4e4d0767 wa-events-without-archiver (ISS-WACW-001; `apps/api/src/composition/integrations/knowledge.ts` always composes `whatsappEvents`; `whatsapp-wiring.test.ts`; dual PASS cycle 0), plus qa-only commits
**Stamp:** STAMPED. `qa/.6c-green` = `96de17c76e3da1c571cc6f9ff76f4afe172e6ab2` (see Stamp).

## Step table

Steps 1 to 4 ran in a clean detached worktree of HEAD under `D:/kb-scratch/6c4/wt` (`git worktree add --detach`, `pnpm install --frozen-lockfile`, exit 0, 11 s). TMP and TEMP were set to `D:/kb-scratch/6c4/tmp` for every command. The shared checkout was not used for any step. No Mongo env var was set and no mongod was started, so Mongo-gated suites skipped. API and web suites ran concurrently with the lowered runner concurrency used in wave3 (`--test-concurrency=6`; vitest `--minWorkers=1 --maxWorkers=4`), no bail, under `timeout 3000`. Zero out-of-memory lines in either log.

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Typecheck | `pnpm -r typecheck` | 0 | 9 packages "Done" (core, db, ai, ingest, index, ask, meeting-bot, apps/api, apps/web), no error lines |
| 2 | Structure lint | `pnpm lint:structure` | 0 | 10 stages, 0 failed; dependency-cruiser 1923 modules, 8986 dependencies, no violations; tracker-audit G4 advisories only (non-gating, same class as wave3) |
| 3a | API tests, full | `node --test --test-concurrency=6 --import tsx "src/**/*.test.ts"` (apps/api) | 1 | 2718 tests: 2671 pass, 1 fail (baseline R1), 46 skipped, 0 cancelled |
| 3b | Web tests, full | `vitest run --minWorkers=1 --maxWorkers=4` (apps/web) | 1 | 154 files (153 pass, 1 fail), 1468 tests: 1465 pass, 1 fail (baseline R2), 2 skipped |
| 4a | API production build | `pnpm --filter @lkb/api build` (Dockerfile build stage) | 0 | `apps/api/dist/server.js` 1,859,834 bytes |
| 4b | Web production build | `pnpm --filter @lkb/web build` (`tsc -b && vite build`, Dockerfile web-build stage) | 0 | built in 2.81 s (chunk-size warning only) |
| 5 | Stamp | `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in a second clean detached worktree of HEAD | 0 | `6c-green: 96de17c76e3da1c571cc6f9ff76f4afe172e6ab2`; `--push-gate` there and in the shared checkout: green |

Exit 1 on 3a and 3b is the runner reporting the two baseline reds; with those two excluded every other test passed.

## Reds

| # | File | First error line | Status |
|---|---|---|---|
| R1 | apps/api/src/activity-health/router.test.ts:150, test "actual producer -> Python first/reclaim/fences -> real production Mongo binding -> authenticated current server -> consumer output" | `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` then `null !== 0` (`.venv/Scripts/python.exe` absent in a worktree); failed in 32 ms, no hang | **baseline** (qa/checkpoints/baseline-reds.md hash 3e3bc1aa4251 row; identical id, message and line 150 as in prepush-wa-wave3.md R1) |
| R2 | apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx:83, test "immediate speaker UI replays actual scripted U24 producer output and withholds pending/stale attribution" | `AssertionError: expected 'c85a31258651...' to be '98948cae1b8f...'` | **baseline** (hash d63667bfa471 row; same c85a31 vs 98948c sha pin; same as prepush-wa-wave3.md R2) |

No new red. Both were matched to the recorded baseline rows by test id and normalized failure message, as in wave3; no rerun at cf244ceb was needed because the message, line and pin values are identical to the wave3 reds. The wave3-listed apps/web `runtime.wiring.test.tsx` timeout and the `qrcode-generator` gap did not occur: runtime.wiring passed in this run (153 of 154 web files green) and the frozen-lockfile install in the clean worktree resolves `qrcode-generator`.

## Coverage of the unit under check

The full API run includes `apps/api/src/composition/integrations/whatsapp-wiring.test.ts` with both "C2 unconfigured (no archiver env, invalid config): links and selection are 503 after their scope check, never open" and "C4 ISS-WACW-001: the events feed is served without the archiver (no env, invalid config), same scope and tenant checks" passing, plus the whatsapp events suites and `production.test.ts`. Test count moved 2717 to 2718 (C4 added, five old 503 events rows removed as the manifest states, net +1 as seen by the runner). This is a pre-push integration run; it did not re-derive the unit's own dual-PASS verdicts.

## Skipped (not run)

- apps/api: 46 skipped, all Mongo-gated (count unchanged from wave3). Not exercised against a real Mongo: no Mongo was started or touched.
- apps/web: 2 skipped (unchanged file-level skips).

## Environment notes

- The API test run again wrote an untracked `apps/api/qa/` into the test worktree (same test side effect as noted in wave3), so the stamp was produced in a second, never-tested clean worktree.
- Scratch cleanup: the test worktree had 1068 reparse points, 0 pointing outside `D:/kb-scratch/6c4`; each was unlinked with `cmd /c rmdir` (link only) before `git worktree remove --force`. Main-tree package sources verified intact afterwards. The stamp worktree was removed with `git worktree remove --force` (it held only the untracked stamp file; no node_modules). No `rm -rf` was used; no `.worktrees/*` touched. `git worktree list` shows no 6c4 entry.
- Nothing pushed or merged; no product code edited; no `.env` read; no consent code touched (D-210); no Mongo started. Only this verdict is committed. Logs remain under `D:/kb-scratch/6c4/logs/`.

## Stamp

Tree of HEAD 4e4d0767: `96de17c76e3da1c571cc6f9ff76f4afe172e6ab2`. Produced by `tick.mjs --stamp-6c-green` inside a clean detached worktree of HEAD (output `6c-green: 96de17c76e3da1c571cc6f9ff76f4afe172e6ab2`). The same content is in the shared checkout's untracked `qa/.6c-green` (previous content `6c3ca20db510578fb2dddaebc8ea3593f80f4aa6`), where `tick.mjs --push-gate` prints `push-gate: green 96de17c76e3da1c571cc6f9ff76f4afe172e6ab2`. This verdict commit is qa-only, so the stamp stays valid across it.

## Metrics

prepush_wall_min=10 tests=4186 mode=full shards=2
(tests = 2718 api + 1468 web; shards = api and web ran as 2 concurrent runners; wall = install, typecheck, lint, both suites, both builds, stamp and cleanup, measured from the first command)
