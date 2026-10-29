# Manifest — bot-sbjoin (D-205 survey unit U2)

**Contract:** none specific (D-205; survey `qa/evidence/bot-linux-survey-2026-10-29.md` blocker 5, file `py/sb_join.py`)
**Date:** 2026-10-29
**Fix cycle:** 0
**Status:** ready-for-check
**Handshake status:** ready-for-check
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (one product line pair in one file plus one test; no suite widening)
Dual check: no — no auth/tenancy/prod-write: a Chrome launch argument gated by an env flag that is unset on Windows.
Risk: low
Round: 2 files, 3 criteria, est 20 min — one gated line plus one test, env-only behaviour, no downstream signature change
Sessions: unavailable
Branch: wave/bot-sbjoin, base 77ba22d8, code commit 11176287

## Acceptance criteria
- C1: With `LKB_CHROME_NO_SANDBOX=1` the `chromium_arg` passed to `SB(...)` in `sb_join.main()` additionally contains `--no-sandbox` (exactly once).
- C2: Without the flag (unset, or any value other than exactly `1`: "", "0", "true", "yes", "1 ") `chromium_arg` is byte-identical to the previous behaviour (no `--no-sandbox`).
- C3: Existing py tests in `test_sb_join.py` still pass.

## What changed
Files changed:
- packages/meeting-bot/py/sb_join.py — `main()` (sb_join.py:101-102): `if os.environ.get("LKB_CHROME_NO_SANDBOX") == "1": args += ",--no-sandbox"`, inserted after `--enable-unsafe-extension-debugging`, before `--profile-directory`.
- packages/meeting-bot/py/test_sb_join.py — new `test_main_chrome_args_add_no_sandbox_only_when_env_flag_is_exactly_1` (same `managed_main` fixture / real `SB` launch seam as the existing args test).

## Test selection
Tests[C1]: test_sb_join.py::test_main_chrome_args_add_no_sandbox_only_when_env_flag_is_exactly_1 — asserts the flagged arg list equals baseline plus exactly one `--no-sandbox`.
Tests[C2]: test_sb_join.py::test_main_chrome_args_add_no_sandbox_only_when_env_flag_is_exactly_1 — same test asserts baseline unset has no `--no-sandbox`, leading args unchanged, and five non-"1" values give an identical string.
Tests[C3]: test_sb_join.py — whole file (27 tests), the only file exercising `main()` arg construction; test_sb_join_admission.py (37) also run as caller-adjacent.

## Interpreter note (honest environment record)
Python used: `C:\Users\Lenovo\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe` (3.11.15). It has seleniumbase 4.54.11 but the repo guard (sb_join_cli.py:73) requires 4.51.9 and there is no project `.venv` and the rules forbid network, so the run uses an env-only shim plugin outside the repo (`-p sbver_shim`, sets `seleniumbase.__version__ = "4.51.9"` before tests). With the shim the pre-existing 26 tests pass at base and after. Without the shim, `main()`-level tests (including existing `test_main_passes_verified_installed_driver_to_actual_sb_launch_seam`) fail at the version guard before and after; that is environmental. `test_sb_join_registration_redirect.py` is 30 failed / 1 passed identically at base (git stash check) and after: pre-existing, not touched. Checker should run with a venv that has seleniumbase 4.51.9 if available, else the same shim.

## Evidence
Red first: new test failed on base code (1 failed, 26 passed with shim) before the edit.
Pre-check[C1]: 11176287 `python -m pytest -p sbver_shim packages/meeting-bot/py/test_sb_join.py -k no_sandbox` (cwd py/, PYTHONPATH=scratch shim) -> 1 passed (part of 27 passed in 0.66s full file)
Pre-check[C2]: 11176287 `python -m pytest -p sbver_shim test_sb_join.py::test_main_chrome_args_add_no_sandbox_only_when_env_flag_is_exactly_1` -> passed (same run)
Pre-check[C3]: 11176287 `python -m pytest -p sbver_shim test_sb_join.py` -> 27 passed in 0.66s; `test_sb_join_admission.py` -> 37 passed in 8.49s
Structure: `pnpm lint:structure` -> OK (10 stages, 0 failed); `node scripts/snapshot.mjs --check` -> OK, SNAPSHOT matches.

## Falsification (in a copy of py/ under the scratchpad, per-mutation backup, `git hash-object` fidelity vs base blob 5beece04 after each)
Falsification[C1]: replace `args += ",--no-sandbox"` with `args += ",--disable-gpu"` in copy -> new test RED (1 failed); restored, hash-object == 5beece04.
Falsification[C2]: replace gate condition with `if True:` in copy -> new test RED (baseline-without-flag assertion fails); restored, hash-object == 5beece04. (Third edit, truthiness instead of `== "1"`, was a probe of the same criterion; not counted as a floor mutation; also RED, restored, hash ok.)
Worktree file untouched by mutants (mutants ran only in the copy); worktree `git status` clean at 11176287.
Mutation-count reason: mutations=3 = 2 floor mutants + 1 truthiness probe of C2, no mutant-cap raise.
Falsification[C3]: none — no changed criterion beyond C1/C2; C3 is the unchanged regression set.

## Notes for checker
- Not touched: Windows path (flag unset there), `sb_join_cli.py`, TS, docker files (other units). Compose/Dockerfile must set `LKB_CHROME_NO_SANDBOX=1` (U1's job).
- `--no-sandbox` reduces Chrome isolation; it is opt-in per process env, intended for the non-root container (D-205).

Metrics: start=2026-10-29T00:00:00Z end=2026-10-29T00:00:00Z wall_min=20 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=0 defects_unit=0 defects_6c=0 builder_min=20 tests=64 tests_min=1
