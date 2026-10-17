# Manifest: w23-coreq

Status: ready-for-check
Fix cycle: 1
Base: 3c99337f
Lane: lane/w23-coreq (C:\Users\product\Desktop\KnowledgeBase-lanes\w23-coreq)

## Changed paths
- scripts/gen-types.mjs (new exported `orphanGenerated`; `--check` fails on a banner-bearing generated file with no schema; write mode removes it)
- scripts/gen-types.test.mjs (new, 2 tests)

## ISS-SCHEMAEDIT-001
Recorded repro (index.ts out of sync with generator): `node scripts/gen-types.mjs --check` at base prints `OK: 46 generated type file(s) + index.ts match schema/` (1/1; already fixed by the t040 lane regenerating index.ts). The remaining check gap closed here: orphan generated files were never detected by `--check`.

## ISS-JOBQUEUE-002 (no code change)
The lost-update half is already fixed on base: lock in packages/core/src/job-queue/queue-lock.ts, PASS verdict qa/verdicts/iss-jobqueue-002-lost-update.md (lost-update 6/6, own 4-process stress 0 lost). Pruning half: ISS-JOBQLOST-001 verified; takeover/EPERM follow-ups ISS-JOBQLOST-003/004 verified. Row still says open-before-wiring; ledger rows not flipped (rule). The 15x concurrency repeat was not run because no code was changed.

## Checks
- `node --test scripts/gen-types.test.mjs`: pass 2, fail 0
- Mutation M1 (drop banner filter in orphanGenerated): pass 1, fail 1 (killed); per-mutation backup, restored, cmp equal, `git -c core.autocrlf=true hash-object` c356642d... of restored working file
- `node scripts/lint-loc.mjs --all`: 9 of 10 stages exit 0; stage `dependencies` exit unavailable (SIGTERM, execution-failed, under shared load); not re-verified
- Not covered by a test: main() wiring of the orphan loop (mutation of it not run)

## Fix cycle 1
Cycle 0 FAIL: orphan call was never wired into main(). Now wired (check lists + exit 1; write unlinks banner-bearing regular files only, lstat, inside generated/). `GEN_TYPES_ROOT` env override added for tests. Tests: `node --test scripts/gen-types.test.mjs` pass 4, fail 0, skipped 1 (file symlink, not permitted on this host; covered by junction test instead).
Mutations (per-mutation backup, restored, cmp equal, hash-object 4a21ef25 = working file): (a) skip orphan call in main: pass 3 fail 1; (b) drop banner check: pass 2 fail 2. Both killed.
Real tree: `node scripts/gen-types.mjs --check` OK, rc=0.
