# Verdict — prepush-wa-wave (6c pre-push integration check, Mode A)

**VERDICT: NO-GO**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2(a): tier-L security units W8 and W11B, so the FULL suite)
**Checked head:** d7bb2670883e0d78d9d545d51fed44363b3c2e31 (branch docs/devops-golive-2026-10-26; code tree = merge ac60c0dc, d7bb2670 is qa-only)
**Last pushed head:** 642dd094 (origin/master, PR #33)
**Merged since, unpushed:** W6 wave/wa-selection-api, W10 wave/wa-web, W11B wave/wa-student-data-gate, W8 wave/wa-unlink-consent
**Stamp:** NOT stamped (not green). `qa/.6c-green` unchanged.

## Why NO-GO (one new red, cross-wave integration defect)

`apps/api/src/whatsapp/selection/router.ts:23` (W6, commit dda00c3b) imports `createMongoLinksStore` from `../links/service.js`. W8 (commit be4a35e6) moved that adapter out of `links/service.ts` into `links/router.ts:137` to stay inside the 300-line budget, and W8's own tests import it from `./router.js`. Each wave was green alone; the merge of W6 and W8 is not. Consequences at HEAD:

- `tsc` fails: `apps/api` `src/whatsapp/selection/router.ts(23,10): error TS2305: Module '"../links/service.js"' has no exported member 'createMongoLinksStore'.`
- API production build fails: `esbuild: No matching export in "src/whatsapp/links/service.ts" for import "createMongoLinksStore"` (the Dockerfile `pnpm --filter @lkb/api build` step; the image cannot be built).
- 73 apps/api test files fail to load at all (`SyntaxError: The requested module '../links/service.js' does not provide an export named 'createMongoLinksStore'`), everything that transitively imports `server`/`routes`/`production`. The full API suite is therefore not verifiable at HEAD as committed.

Diagnostic only (scratch worktree, change discarded with `git checkout`, NOT committed, NOT product code in the repo): moving that one import to `../links/router.js` (which `selection/router.ts` already imports `principalOf` from) makes typecheck exit 0, API build exit 0, and the full API suite 2650 tests / 2603 pass / 1 fail (the baselined activity-health red) / 46 skipped. So the fix is a one-line import edit by the maker; this checker did not make it.

## Step table

All steps run in a clean detached worktree of HEAD in the scratchpad (`pnpm install --frozen-lockfile`; see Environment). No Mongo env var was set, so Mongo-gated suites skipped.

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Typecheck | `pnpm -r typecheck` | **2** | core, db, ai, ingest, index, ask, meeting-bot, apps/web Done; **apps/api FAILED** (1 error TS2305, above). NEW red |
| 2 | Structure lint | `node scripts/lint-loc.mjs --all` (= `pnpm lint:structure`) | 0 | 10 stages, 0 failed (tracker advisories non-gating, dependencies 1919 modules no violations) |
| 3a | API tests, full | `pnpm test` in apps/api (`node --test --import tsx "src/**/*.test.ts"`) | **1** | 2028 tests: 1913 pass, 73 fail (all 73 = the import SyntaxError), 42 skipped |
| 3b | Web tests, full | `pnpm test` in apps/web (`vitest run`) | **1** | 154 files, 1454 tests: 1450 pass, 2 fail, 2 skipped |
| 4a | API build | `pnpm --filter @lkb/api build` | **1** | esbuild error, same missing export. NEW red |
| 4b | Web build | `pnpm --filter @lkb/web build` (`tsc -b && vite build`) | 0 | built in 6.8 s (chunk-size warning only) |
| D1 | Diagnostic: API typecheck with one-line import patch (scratch, discarded) | `pnpm --filter @lkb/api typecheck` | 0 | green |
| D2 | Diagnostic: API build with the patch | `pnpm --filter @lkb/api build` | 0 | `dist/server.js` 1,824,306 bytes |
| D3 | Diagnostic: API full tests with the patch | `pnpm test` in apps/api | 1 | 2650 tests, 2603 pass, 1 fail (baselined), 46 skipped |

## Reds

| # | File | First error line | Status |
|---|---|---|---|
| R1 | apps/api/src/whatsapp/selection/router.ts:23 (typecheck, build, and 73 test files that import the server graph, e.g. src/server.test.ts, src/production.test.ts, src/whatsapp/selection/router.test.ts, src/whatsapp/links/router.test.ts, src/whatsapp/links/account-coupling.test.ts, src/composition/integrations/mounted-routes.test.ts) | `error TS2305: Module '"../links/service.js"' has no exported member 'createMongoLinksStore'` / `SyntaxError: The requested module '../links/service.js' does not provide an export named 'createMongoLinksStore'` | **NEW** (introduced by the W6 x W8 merge; absent at 642dd094, where `selection/router.ts` was the W5 empty stub (imports only express) and `links/service.ts` still exported `createMongoLinksStore`) |
| R2 | apps/api/src/activity-health/router.test.ts:150 "actual producer -> Python first/reclaim/fences ..." | `AssertionError ... null !== 0` (`.venv/Scripts/python.exe` absent) | baseline (qa/checkpoints/baseline-reds.md, hash 3e3bc1aa4251 row). Only visible in diagnostic D3; at HEAD as committed it fails earlier on R1's import error |
| R3 | apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx "immediate speaker UI replays actual scripted U24 producer output ..." | `expected 'c85a312586515f4b...' to be '98948cae1b8f3d81...'` | baseline (hash d63667bfa471 row, same c85a31 vs 98948c pin) |
| R4 | apps/web/src/config/runtime.wiring.test.tsx "the real App routes /knowledgebase/ask to the Ask page when mounted under /knowledgebase" | `Error: Test timed out in 5000ms.` | **pre-existing, not baselined**: reproduced 2 of 2 alone at 642dd094 in a fresh detached worktree, and 3 of 3 (1 in the full suite, 2 alone) at HEAD, identical message. Not caused by this wave. Needs a row in baseline-reds.md (suspect: 5 s default timeout vs first dynamic import of the Ask page in a cold worktree) |

No other red. `ConnectorsPage.test.tsx` passed in the full web run.

## Skipped (not run)

- apps/api: 42 skipped at HEAD (46 in D3), all Mongo-gated (`WA_REVIEW_TEST_MONGO_URL` etc. unset). This includes the W8 real-Mongo suites `whatsapp/links/unlink.mongo.test.ts`, `whatsapp/links/account-coupling.mongo.test.ts`, `whatsapp/links/links.mongo.test.ts`. They were exercised by the W8 dual checkers on a throwaway replica set (manifest wa-unlink-consent, PASS cycle 1); this pre-push check did NOT re-run them. A Mongo service (mongod pid 5760) was present on the host; it was not touched and no Mongo URL was supplied.
- apps/web: 2 skipped (unchanged file-level skips).

## Environment notes

- The shared checkout lacks `qrcode-generator` (new W10 dependency), so `pnpm -r typecheck` there fails on `apps/web/src/pages/whatsapp-links/QrCode.tsx` (TS2307). That is an install gap in that checkout, not a code defect. `pnpm install --offline` failed (argon2 tarball not in the store), so the scratch worktree ran `pnpm install --frozen-lockfile` online: 7 packages downloaded, lockfile-pinned, scratch worktree only. Please run `pnpm install --frozen-lockfile` in the shared checkout before using it for web work.
- Scratch worktrees only (`6c-head` at HEAD, `6c-base` at 642dd094), both under the session scratchpad; no node_modules junction pointed outside them (checked, 0 of 1068 / 1066); removed with `git worktree remove`. Shared checkout and `.worktrees/*` untouched; nothing pushed, merged or edited in the repo; no `.env` read; consent code untouched (D-210).

## Metrics

prepush_wall_min=25 tests=3482 mode=full shards=2
(tests = 2028 api + 1454 web at HEAD as committed; shards = api and web run concurrently as 2 runners; wall includes the worktree install, the base-comparison runs and the diagnostic D1-D3 rerun of about 4.5 min; D3 alone ran 2650 api tests)

## Required before re-check

1. Maker fixes R1 in place (`apps/api/src/whatsapp/selection/router.ts:22-23`: import `createMongoLinksStore` from `../links/router.js`), with a regression that the selection router module loads together with the links router (the existing router tests cover this once it imports).
2. Re-run 6c (full mode still applies). R4 should be baselined or fixed so it stops showing as an unexplained red.
