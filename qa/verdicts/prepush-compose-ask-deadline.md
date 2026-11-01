# Verdict - prepush-compose-ask-deadline (6c pre-push integration check, Mode A)

**VERDICT: GO**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2)
**Checked head:** 22f5159efe5308b93b4d2f40ead461530dd8c13d (branch docs/devops-golive-2026-10-26; tree 84a52905cb9cd7259b9558003ebc66987da058d4)
**Previous 6c-checked head:** dc09d6d0 (prepush-golive-1101.md, GO, stamp adef68b8; that run was the FULL suite)
**Range under check (unpushed):** fd62a5fd (docker-compose.yml +1 line `LKB_ASK_FAST_DEADLINE_MS:` value-less pass-through; compose-t028-env.test.mjs 9 names; one doc line; blind checker PASS compose-ask-deadline-env.md; D-213) and 22f5159e (qa/docs only). Diff dc09d6d0..HEAD outside qa/ and docs/ is exactly 2 files, 9 insertions, 6 deletions. No product code.
**Stamp:** STAMPED. `qa/.6c-green` = `84a52905cb9cd7259b9558003ebc66987da058d4`.

## Mode decision (.13-1 / .13-2)

Mode: SCOPED. The closed .13-2 list (maker SKILL.md, policy block, "Full suite still before a push") is: (a) tier-L security/auth/tenancy unit or production data write/migration; (b) dependency bump or lockfile change; (c) conftest.py, shared fixture, test configuration or runner configuration change; (d) set tool reports uncertainty. "Nothing else is added to this list." This batch: (a) no, a pass-through env name; (b) no, package.json and pnpm-lock.yaml untouched; (c) no, docker-compose.yml is deployment config, not test/runner config, and the test file edit is a test, not a fixture or runner config; (d) no, the importers of docker-compose.yml were computed by `git grep` (below). So .13-1 applies: behaviour-scoped set plus ONE full collection check. The full suite was not run; it stays the backstop (.13-3). The previous GO (full suite at dc09d6d0) covers all code, which is byte-identical in this range.

Behaviour-scoped set = every test that reads docker-compose.yml or LKB_ASK_FAST_DEADLINE_MS (`git grep` over non-doc, non-qa files): scripts/operations/compose-t028-env.test.mjs, apps/api/src/composition/vectorless-routing.test.ts (reads docker-compose.yml), docker/meeting-bot/image.test.mjs, scripts/lib/dbguard2.test.mjs, scripts/qa/source-overlay-candidate.test.mjs.

## Step table

Step 1 to 4 ran in the shared checkout as noted; steps 3b and 5 to 7 in a clean detached worktree of HEAD (`D:/kb-scratch/6c6/wt`, node_modules reached by junctions to the shared install, no install run). ALL temp/cache on `D:/kb-scratch/6c6/` (TMP, TEMP, TMPDIR, npm_config_cache, XDG_CACHE_HOME), NODE_OPTIONS=--max-old-space-size=4096.

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Compose env test | `node --test scripts/operations/compose-t028-env.test.mjs` (shared checkout) | 0 | 6 tests, 6 pass, 0 skip (docker behaviour tests ran) |
| 2 | Typecheck | `pnpm typecheck` (= `pnpm -r typecheck`, shared checkout) | 0 | all packages Done, no error lines |
| 3a | Structure lint, shared checkout | `pnpm lint:structure` | 1 | ENVIRONMENTAL: stage `root` "17 loose files (budget 16)"; the 17th is untracked `reports.md` in the shared checkout (absent from HEAD: `git ls-tree` shows 39 root entries at both dc09d6d0 and HEAD). The other 9 stages exit 0 incl. dependencies (1924 modules, no violation). |
| 3b | Structure lint, clean HEAD worktree | `pnpm lint:structure` | 0 | 10 stages, 0 failed; root stage exit 0; dependency-cruiser 2154 modules, 9584 dependencies, no violations |
| 4 | Compose config, empty env | `docker compose --env-file <empty file> config -q` | 1 | `required variable MONGODB_URL is missing a value`. Pre-existing and unrelated: the `${MONGODB_URL:?}`, `${MONGODB_DB:?}`, `${OLLAMA_API_KEY:?}` guards are untouched by fd62a5fd (the diff is one added value-less line); an empty env can never exit 0 on this repo (same finding as prepush-golive-1101 step 5). |
| 4b | Compose config, placeholder env | same, `--env-file` with inert dummy MONGODB_URL, MONGODB_DB, OLLAMA_API_KEY | 0 | parses |
| 5 | Behaviour-scoped set | `node --test --import tsx` on the 5 files above (clean worktree) | 0 | 49 tests: 45 pass, 0 fail, 4 skipped (docker/meeting-bot built-image tests, `# SKIP`, no image built; unchanged by this range), 0 cancelled; wall 56 s |
| 6 | Collection check (.13-1b) | node packages: `node --test --import tsx --test-name-pattern='^__no_such_test__$' "src/**/*.test.ts"` per package (every test file is loaded, none selected); web: `vitest list --filesOnly` | 0 all | ai 25, ask 20, core 49, db 10, index 58, ingest 40, meeting-bot (exit 0), api 301 files (`--test-concurrency=6`, 111 s): 0 fail, 0 cancelled each. Web: 154 files listed (the same 154 as the dc09d6d0 full run), no error. No collection error anywhere. |
| 7 | Stamp | `tick.mjs --stamp-6c-green` in the clean detached worktree of HEAD | 0 | `6c-green: 84a52905cb9cd7259b9558003ebc66987da058d4`; copied to shared `qa/.6c-green` |
| 8 | Push gate | `tick.mjs --push-gate` in D:/KnowledgeBase | 0 | `push-gate: green 84a52905cb9cd7259b9558003ebc66987da058d4` |

## Reds

No product red. Every non-zero exit is environmental or pre-existing and classified here:

| # | Where | First error line | Class |
|---|---|---|---|
| E1 | `pnpm lint:structure` in the SHARED checkout, stage root | `root has 17 loose files (budget 16): ... reports.md ...` | environmental (untracked `reports.md`); the clean HEAD worktree passes (step 3b) |
| E2 | `docker compose config -q` with an empty env file | `required variable MONGODB_URL is missing a value` | pre-existing by design (`:?` guards); placeholder env passes (4b) |
| E3 | first collection attempt (all packages in parallel) | `fatal: out of memory allocating heap arena map`, `Error [TransformError]: EINVAL` (esbuild worker), exit 134 | environmental (host out of memory/commit, C: 192 MB free). Retried one package at a time: all exit 0. Not a product red. A second apps/api attempt at default concurrency stalled 10 min on one file with no output, was killed (my PIDs only) and passed with `--test-concurrency=6` in 111 s. |

Baseline reds: ISS-453 (6 CalendarPage.test.tsx, 2 SessionDetailPage.test.tsx) and the R1/R2 rows of qa/checkpoints/baseline-reds.md live in the apps/web and apps/api full-suite runs. None of those tests is in the scoped set and the web/api full suites were not run here (.13-2 not triggered), so none was observed and no baseline comparison was needed. The collection check confirms those web files still load. Nothing to fix or file.

## Coverage of the range under check

- fd62a5fd: the compose test (6/6, static plus docker-config behaviour: 9 names forwarded when set, UNDEFINED when absent, no env_file), plus `vectorless-routing.test.ts`, `dbguard2.test.mjs`, `source-overlay-candidate.test.mjs` (the files that read docker-compose.yml) green. The consumers of the env name (`apps/api/src/answer-policy/application.ts`, `packages/ask/src/ask-v2.ts`) are unchanged in this range.
- Not run: full api suite, full web suite, production builds (no source change; builds were green at dc09d6d0 and the diff touches no built input).

## Environment and cleanup

- C: had 192 MB free (100% full); all scratch on D:. Parallel node/esbuild startup hit a host memory limit once (E3); no ENOSPC.
- The scratch worktree was removed with `git worktree remove --force` after unlinking all 10 node_modules junctions with `cmd /c rmdir` (the only untracked content was the stamp file). Main-tree node_modules (.pnpm 514 entries, apps/api, apps/web) verified present afterwards. `git worktree list` shows no 6c6 entry. No `rm -rf`.
- Nothing pushed or merged; no product code edited; `.env` not read; no consent code touched (D-210); the E2E stack (mongod 27019/27020, API 3300, vite 5173, indexing chain, fake-runner) was not touched; no mongod started. Only this verdict is committed. Logs remain under `D:/kb-scratch/6c6/`.

## Metrics

prepush_wall_min=36 tests=49 mode=scoped shards=1
(tests = the 49 behaviour-scoped tests; the collection check covered 8 node packages plus 154 web files in addition. Wall includes typecheck, lint, the OOM retry and the stalled api collection attempt, about 12 min of it avoidable.)
