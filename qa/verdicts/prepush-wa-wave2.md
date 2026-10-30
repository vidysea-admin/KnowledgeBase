# Verdict — prepush-wa-wave2 (6c pre-push integration check, Mode A)

**VERDICT: GO**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2(a): tier-L security units W8 and W11B, so the FULL suite, not the scoped set)
**Checked head:** d0416a8ed875d6b9a023eaf0b026b17d3809a1ca (branch docs/devops-golive-2026-10-26; tree f3ecd2336c5fe88166bafa142949b5aca2c68bcc)
**Last pushed head:** 642dd094 (origin/master, PR #33)
**Merged since, unpushed:** W6 wave/wa-selection-api, W10 wave/wa-web, W11B wave/wa-student-data-gate, W8 wave/wa-unlink-consent, wave/wa-revoked-link-gate, the import fix (W6 x W8 `createMongoLinksStore`), wave/wa-route-link-staleness, W12 wave/wa-events-feed
**Stamp:** STAMPED. `qa/.6c-green` = `f3ecd2336c5fe88166bafa142949b5aca2c68bcc` (see Stamp).

The previous check (prepush-wa-wave.md, NO-GO) found R1, the W6 x W8 import break. It is gone at this head: typecheck, API build and the full API suite all load and pass.

## Step table

All steps ran in a clean detached worktree of HEAD in the scratchpad (`git worktree add --detach`, `pnpm install --frozen-lockfile`, 45 s). The shared checkout was not used for any step. No Mongo env var was set and no mongod was started (none on PATH), so Mongo-gated suites skipped.

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Typecheck | `pnpm -r typecheck` | 0 | 19 "Done" lines: core, db, ai, ingest, index, ask, meeting-bot, apps/api, apps/web. `qrcode-generator` resolved (lockfile install), so apps/web typechecks |
| 2 | Structure lint | `pnpm lint:structure` (`node scripts/lint-loc.mjs --all`) | 0 | 10 stages, 0 failed; lint-tests 20/20; tracker OK (G4 advisories non-gating, as before); dependencies 1922 modules, 8973 dependencies, no violations |
| 3a | API tests, full | `pnpm test` in apps/api (`node --test --import tsx "src/**/*.test.ts"`), no bail | 1 | 2713 tests: 2666 pass, 1 fail (baseline R1 below), 46 skipped, 0 cancelled |
| 3b | Web tests, full | `pnpm test` in apps/web (`vitest run`), no bail | 1 | 154 files (153 pass, 1 fail), 1454 tests: 1451 pass, 1 fail (baseline R2 below), 2 skipped |
| 4a | API production build | `pnpm --filter @lkb/api build` (Dockerfile build stage) | 0 | `apps\api\dist\server.js` 1,828,402 bytes |
| 4b | Web production build | `pnpm --filter @lkb/web build` (`tsc -b && vite build`, Dockerfile web-build stage) | 0 | built in 10.2 s (chunk-size warning only) |
| 5 | Stamp | `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in a clean detached worktree of HEAD | 0 | `6c-green: f3ecd2336c5fe88166bafa142949b5aca2c68bcc`; `--push-gate` in that worktree: green |

Exit 1 on 3a and 3b is the runner reporting the two baseline reds; with those two excluded every other test passed.

## Reds

| # | File | First error line | Status |
|---|---|---|---|
| R1 | apps/api/src/activity-health/router.test.ts:150, test "actual producer -> Python first/reclaim/fences -> real production Mongo binding -> authenticated current server -> consumer output" | `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: null !== 0` (`.venv/Scripts/python.exe` absent in a worktree) | **baseline** (qa/checkpoints/baseline-reds.md, hash 3e3bc1aa4251 row, recorded at b3eabbee, same test id, same message, same line 150; also baseline in the prior check prepush-wa-wave.md) |
| R2 | apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx, test "immediate speaker UI replays actual scripted U24 producer output and withholds pending/stale attribution" | `AssertionError: expected 'c85a312586515f4bef8edfb8c798bf470c0c0…' to be '98948cae1b8f3d812346ac2528b822a616ed8…'` | **baseline** (hash d63667bfa471 row, same c85a31 vs 98948c pin) |

No new red. Both reds were matched to the recorded baseline rows by test id and failure message; they were not re-run at 642dd094 because the rows were each produced at a baseline sha in a separate worktree and the messages are identical, so a base re-run would add nothing.

### The two known-open items

- **apps/web `qrcode-generator` (W10 dependency):** classified as an install gap in the shared checkout, not a code defect. It is declared in apps/web/package.json and pinned in pnpm-lock.yaml; a `pnpm install --frozen-lockfile` in a clean worktree resolves it and apps/web typecheck, tests and build all pass. The shared checkout at `D:/KnowledgeBase` still needs `pnpm install --frozen-lockfile` before web work there (not done here: this check does not modify the shared checkout's dependencies).
- **apps/web `runtime.wiring.test.tsx` timeout (R4 in the previous verdict):** did NOT reproduce. In this full web run the file passed, 5 of 5 tests, 2838 ms (`src/config/runtime.wiring.test.tsx (5 tests)`). Zero "Test timed out" lines in the log. It stays an intermittent cold-load flake with no baseline row; this run gives no regression evidence either way. It was not fixed and not re-run alone.

## Skipped (not run)

- apps/api: 46 skipped, all Mongo-gated (`WA_REVIEW_TEST_MONGO_URL` and similar unset). This includes the W8 real-Mongo suites (`whatsapp/links/unlink.mongo.test.ts`, `account-coupling.mongo.test.ts`, `links.mongo.test.ts`). They were exercised by the W8 dual checkers on a throwaway replica set and were NOT re-run by this pre-push check. No Mongo was started or touched.
- apps/web: 2 skipped (unchanged file-level skips).

## Coverage of the merged waves

The full API run (2713 tests, up from 2028 at the previous NO-GO head, where 73 files failed to load) includes the W6, W11B, W8, revoked-link, route-staleness and W12 suites. Every one of them loaded and passed except the single baseline red. This check is a pre-push integration run; it did not re-derive each unit's own contract verdicts.

## Environment notes

- Disk: `C:` hit 100% during the run (the shared scratchpad holds many files from other sessions plus this check's installed worktree). The stamp worktree first failed with "No space left on device" and was retried after removing this check's own scratch worktree and two leftover non-registered directories from the earlier check (`6c-head`, `6c-base`, removed with `cmd /c rmdir /s /q`; their junctions were verified to point inside their own tree before removal). The failed attempt wrote nothing: `--stamp-6c-green` refused a first run on the shared checkout (dirty, 8508 paths, exit 1) before writing, and the stamp was then produced in a clean worktree. The scratchpad still holds many unrelated files from other sessions that were not touched.
- 1068 reparse points in the test worktree, 0 pointing outside it (checked before removal). The scratch worktree was removed. The stamp worktree was removed with `git worktree remove`.
- Nothing pushed, merged or edited in product code; `.worktrees/*` untouched; no `.env` read; no consent code touched (D-210).

## Stamp

Tree of HEAD d0416a8e: `f3ecd2336c5fe88166bafa142949b5aca2c68bcc`. Stamped by running `tick.mjs --stamp-6c-green` inside a clean detached worktree of HEAD (output: `6c-green: f3ecd2336c5fe88166bafa142949b5aca2c68bcc`; push-gate in that worktree: `green`). That worktree was then removed. The same line was written to the shared checkout's untracked `qa/.6c-green` (previous content `1b9c7a52451922319f3e33de624ddcfccc8415d9`), and `tick.mjs --push-gate` there prints `push-gate: green f3ecd2336c5fe88166bafa142949b5aca2c68bcc`. This verdict commit is qa-only, so the stamp stays valid across it (the gate allows qa-only changes after the stamped tree).

## Metrics

prepush_wall_min=18 tests=4167 mode=full shards=2
(tests = 2713 api + 1454 web; shards = api and web run concurrently as 2 runners; wall includes the install, typecheck, lint, both builds, the disk-space recovery and the stamp)
