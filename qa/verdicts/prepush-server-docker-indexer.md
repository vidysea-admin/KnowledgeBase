# Verdict - prepush-server-docker-indexer (6c pre-push integration check, Mode A)

**VERDICT: GO**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2)
**Checked head:** 6588f3171df0ac03c0adb271bfe3226c3db6184d (branch fix/server-docker-indexer; tree 1028cafbcae24137e3ce5e3562f3335f1b7d164b)
**Previous 6c-checked head:** 22f5159e (prepush-compose-ask-deadline.md, GO, stamp 84a52905; SCOPED)
**Range under check (unpushed):** d521fec0 (Dockerfile +6 lines: build stage COPY scripts, api image COPY docs/whatsapp/notice.md; docker-compose.yml +25 lines: new opt-in `indexer` service, profile `tools`; runbook section 6), fc099756 and 6588f317 (qa/docs only; 6588f317 also touches .goal/goal.json). Diff 22f5159e..HEAD outside qa/ and docs/ is `.goal/goal.json`, `Dockerfile`, `docker-compose.yml` (35 insertions, 4 deletions). No product source code. Dependencies: review-d521fec0 Approve, check-server-docker-indexer PASS.
**Stamp:** STAMPED. `qa/.6c-green` = `1028cafbcae24137e3ce5e3562f3335f1b7d164b`.

## Mode decision (.13-1 / .13-2)

Mode: SCOPED. Closed .13-2 list: (a) tier-L security/auth/tenancy unit or production data write/migration: no, deployment config only, the new service is opt-in behind a compose profile; (b) dependency bump or lockfile change: no, `git diff --name-only 22f5159e..HEAD` matches no package.json or pnpm-lock.yaml; (c) conftest.py, shared fixture, test or runner configuration: no, Dockerfile and docker-compose.yml are deployment config, no test file or runner config changed; (d) set tool reports uncertainty: no, the readers of Dockerfile, docker-compose.yml, .dockerignore and docs/whatsapp/notice.md were computed by `git grep` (below). So .13-1 applies: behaviour-scoped set plus ONE collection check. The full suite was not run; it stays the backstop (.13-3).

Behaviour-scoped set (non-doc, non-qa tests that read docker-compose.yml, Dockerfile, .dockerignore or docs/whatsapp/notice.md, directly or through `apps/api/src/whatsapp/links/notice.ts`, which reads notice.md):
- apps/api/src/composition/vectorless-routing.test.ts (docker-compose.yml)
- apps/api/src/routes/health/health.test.ts (Dockerfile HEALTHCHECK)
- apps/api/src/whatsapp/links/router.test.ts (notice.ts consumer)
- apps/api/src/composition/integrations/whatsapp-wiring.test.ts (notice.ts consumer)
- docker/meeting-bot/image.test.mjs (docker/meeting-bot/Dockerfile)
- scripts/lib/dbguard2.test.mjs (docker-compose.yml)
- scripts/operations/compose-t028-env.test.mjs (docker-compose.yml)
- scripts/qa/container-workflows/bot-smoke.test.mjs (bot image)
- scripts/qa/dockerfile-media-tool.test.mjs (Dockerfile)
- scripts/qa/source-overlay-candidate.test.mjs (Dockerfile COPY dependency)
(apps/web WhatsAppLinksPages.test.tsx matched `links/notice` only by name, does not read the file; covered by the web collection check.)

## Step table

Steps 1, 2, 3a ran in the shared checkout; 3b to 7 in a clean detached worktree of HEAD (`D:/kb-scratch/6c7/wt`, node_modules reached by junctions to the shared install, no install run). ALL temp/cache on `D:/kb-scratch/6c7/` (TMP, TEMP, TMPDIR, npm_config_cache, XDG_CACHE_HOME), NODE_OPTIONS=--max-old-space-size=4096. Package collections run one at a time.

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Compose env test | `node --test scripts/operations/compose-t028-env.test.mjs` (shared checkout) | 0 | 6 tests, 6 pass, 0 skip |
| 2 | Typecheck | `pnpm typecheck` (shared checkout) | 0 | all packages Done, 0 `error TS` lines |
| 3a | Structure lint, shared checkout | `pnpm lint:structure` | 1 | ENVIRONMENTAL (E1): stage `root` "17 loose files (budget 16)"; the 17th is untracked `reports.md` in the shared checkout. All other stages exit 0. |
| 3b | Structure lint, clean HEAD worktree | `pnpm lint:structure` | 0 | 10 stages, 0 failed; root stage exit 0; dependency-cruiser 2154 modules, 9584 dependencies, no violations |
| 4 | Compose config, empty env | `docker compose --env-file <empty file> config -q` | 1 | `required variable OLLAMA_API_KEY is missing a value` (E2, pre-existing `:?` guard) |
| 4b | Compose config, inert placeholder env | same, `--env-file` with dummy MONGODB_URL, MONGODB_DB, OLLAMA_API_KEY | 0 | parses |
| 4c | Compose services, profile tools | `docker compose --env-file <placeholder> --profile tools config --services` | 0 | api, web, indexer (the new service resolves) |
| 5 | Behaviour-scoped set | `node --test --import tsx` on the 10 files above (clean worktree) | 0 | 83 tests: 78 pass, 0 fail, 5 skipped, 0 cancelled; 11.7 s |
| 6 | Collection check (.13-1b) | node packages: `node --test --import tsx --test-name-pattern='^__no_such_test__$' "src/**/*.test.ts"` per package, one at a time; web: `vitest list --filesOnly` | 0 all | ai 25, ask 20, core 49, db 10, index 58, ingest 40, meeting-bot 142, api 301 (`--test-concurrency=6`, 62 s): 0 fail, 0 cancelled each. Web: 154 files listed, no error. |
| 7 | Stamp | `tick.mjs --stamp-6c-green` in the clean detached worktree of HEAD | 0 | `6c-green: 1028cafbcae24137e3ce5e3562f3335f1b7d164b`; copied to shared `qa/.6c-green` |
| 8 | Push gate | `tick.mjs --push-gate` in D:/KnowledgeBase | 0 | `push-gate: green 1028cafbcae24137e3ce5e3562f3335f1b7d164b` |

The 5 skips in step 5 are all engine/image-dependent: 4 `built image:` tests in docker/meeting-bot/image.test.mjs (no bot image built) and 1 `real container smoke` in bot-smoke.test.mjs (needs `LKB_DOCKER_TESTS=1` and `BOT_IMAGE`). The local Docker engine is not running, so the docker CLI was used for `compose config` only (it needs no engine). The Dockerfile `COPY scripts` and `COPY docs/whatsapp/notice.md` lines were not exercised by an actual `docker build`; the static tests (dockerfile-media-tool, source-overlay-candidate, health Dockerfile parse) and the notice readers (router, wiring) are green.

## Reds

No product red. Every non-zero exit is environmental or pre-existing:

| # | Where | First error line | Class |
|---|---|---|---|
| E1 | `pnpm lint:structure` in the SHARED checkout, stage root | `root has 17 loose files (budget 16): ... reports.md ...` | environmental (untracked `reports.md`); the clean HEAD worktree passes (step 3b) |
| E2 | `docker compose config -q` with an empty env file | `required variable OLLAMA_API_KEY is missing a value` | pre-existing by design (`${VAR:?}` guards, untouched by this range); placeholder env passes (4b) |
| E3 | 5 skipped tests (step 5) | `# SKIP` / `# set LKB_DOCKER_TESTS=1 and BOT_IMAGE=...` | environmental (Docker engine not running, no image built); unchanged by this range |

Baseline reds (ISS-453, R1/R2 in qa/checkpoints/baseline-reds.md) live in the apps/web and apps/api full-suite runs; none of those tests is in the scoped set and the full suites were not run (.13-2 not triggered), so none was observed. Nothing to fix or file.

## Coverage of the range under check

- d521fec0: Dockerfile and docker-compose.yml are read by the 10-file scoped set (green), `compose config` parses with the new `indexer` service under profile `tools`, and typecheck plus structure lint (clean tree) are green. The first-time `docker build` of the new COPY lines and an actual `docker compose --profile tools run indexer` were NOT run (no Docker engine); that gap is covered by the blind checker PASS (check-server-docker-indexer) and remains for the first real deploy.
- Not run: full api suite, full web suite, production builds (no source change).

## Environment and cleanup

- D: 131 GB free, C: 29 GB free; all scratch on D:. No ENOSPC, no memory failure this run.
- Scratch worktree removed with `git worktree remove --force` after unlinking all 10 node_modules junctions with `cmd /c rmdir`. Main-tree node_modules verified present afterwards (.pnpm 514 entries, apps/api 14, apps/web 12, packages/index 4). `git worktree list` shows no 6c7 entry. No `rm -rf`.
- Nothing pushed or merged; no product code edited; `.env` not read; no consent code touched (D-210); qa/.paused untouched; no server or mongod started or stopped. Only this verdict is committed. Logs remain under `D:/kb-scratch/6c7/`.

## Metrics

prepush_wall_min=14 tests=83 mode=scoped shards=1
(tests = the 83 behaviour-scoped tests; the collection check covered 8 node packages plus 154 web files in addition.)
