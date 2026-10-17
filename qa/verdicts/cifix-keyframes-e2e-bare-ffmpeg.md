# Verdict — cifix-keyframes-e2e-bare-ffmpeg

**Cycle checked:** 0
**Commit under check:** 514be40d (lane/cifix)

## VERDICT: PASS (for the keyframes fix itself). CI as a whole is NOT green yet: see ISSUES-WRITTEN.

## EXPLANATION
1. Diff is test-only (keyframes.test.ts +4/-2, plus the manifest). No assertion changed; only the `isAbsolute` import and the env construction. `resolveFfmpeg` (ffmpeg-args.ts:28-40): a set LKB_FFMPEG_PATH must be absolute (else `bad-config`); when unset/empty it uses `.cache/tools/ffmpeg-9.0.2/bin/ffmpeg(.exe)` if present, else bare `ffmpeg` (PATH). So with the variable deleted on CI the e2e resolves PATH ffmpeg, the same binary `REAL` probed with `-version`. When REAL is absolute the env var is still set, so real ffmpeg is exercised in both cases. The relative-path-refused test is untouched.
2. Caveat: the e2e skips on this machine (no ffmpeg), so the fixed branch was not run here; the verdict rests on reading resolveFfmpeg plus the CI log (the old failure was exactly `LKB_FFMPEG_PATH must be an absolute path`). Core passed 380/381 with 1 skip here.
3. The CI log of run 38351914534 shows `pnpm -r test` bailed at core (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL), so later packages and every step after Unit tests were never run on CI. Simulation below covers them.
4. Setup: node on PATH, CI=true, D2_FIXTURE_PYTHON=main .venv python, per-package node_modules junctioned (untracked) into the main tree, so @lkb/* resolve to main-tree source (identical but for this one test file).

## CI simulation (ubuntu steps, run on Windows)
| Step / package | Result | Class |
|---|---|---|
| typecheck x9 (api, web, ai, ask, core, db, index, ingest, meeting-bot) | all pass | none |
| test @lkb/core | 380 pass, 0 fail, 1 skip (e2e: no ffmpeg) | Windows-only skip; CI runs it |
| test @lkb/ai, ask, db, index, ingest, api | all pass | none |
| test @lkb/web (vitest) | 67 files, 710 tests pass | none (passed on 2026-10-13 CI as well) |
| test @lkb/meeting-bot | 844 pass, 5 fail, 1 skip | see below |
|   remux WebM test (null !== 0, no ffmpeg) | fail | Windows-only (CI has ffmpeg) |
|   2 symlink EPERM tests (owned status, interrupted recovery) | fail | Windows-only |
|   login/tab/OBS spawn (doubled `packages/meeting-bot` path) | fail | ALSO FAILS ON CI (cwd), ISS-CIFIX-003 |
|   registration child timeout (data/ missing, .venv path) | fail | ALSO FAILS ON CI, ISS-CIFIX-003 |
| gen:types --check | pass | none |
| schema/validate.py | pass | none |
| lint:structure | FAIL: loc 12, dirsize 5, root 18>15, dupes 7, no-circular ask-graph/ask-v2 | ALSO FAILS ON CI, ISS-CIFIX-001/002 |
|   (esbuild unresolved in apps/api/scripts/build.mjs) | fail | Windows/worktree-only (in lockfile) |
| lint:score | pass | none |
| test:lint | pass | none |

## ISSUES-WRITTEN: ISS-CIFIX-001, ISS-CIFIX-002, ISS-CIFIX-003 (all high; in qa/issues.cifix.jsonl)
