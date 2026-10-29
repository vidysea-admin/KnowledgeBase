# Verdict: bot-sbjoin

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: ab0b0d37 (code commit 11176287)
Base SHA: 77ba22d8
Policy-Version: proportional-verification/2026-10-19.17
Unit: D-205 U2, env-gated `--no-sandbox` in `packages/meeting-bot/py/sb_join.py` main().
ISSUES-WRITTEN: none.
Ledger flip: no ledger rows for this unit.

## Evidence (checker-run, independent of the maker)
Interpreter: hermes venv Python 3.11.15, seleniumbase 4.54.11. The repo guard (sb_join_cli.py:73) wants 4.51.9, so a version shim plugin outside the repo was used (`-p sbver_shim`, scratchpad). No 4.51.9 venv exists and the network is off. Same environmental limit the maker recorded.
- Diff 77ba22d8..HEAD touches only sb_join.py (+2), test_sb_join.py (+18) and the manifest. grep shows `chromium_arg` / `LKB_CHROME_NO_SANDBOX` only in those two files: no second launch path.
- C1 PASS: `pytest -k no_sandbox` -> 1 passed. The test asserts flagged args contain `--no-sandbox` exactly once and equal baseline plus that one token. Code line is sb_join.py:101-102.
- C2 PASS: the same test asserts baseline (unset) has no `--no-sandbox`, leading args unchanged, and "", "0", "true", "yes", "1 " each give an identical string to baseline. The gate is an exact `== "1"` compare; no truthiness path.
- C3 PASS: `test_sb_join.py` -> 27 passed. `test_sb_join_admission.py` -> 37 passed (caller-adjacent). The worktree stayed clean (`git status --short` empty).
- Not run: test_sb_join_registration_redirect.py (maker reports 30 failed identically at base; untouched file, environmental, out of scope).

## Falsification (in a copy of py/ in scratchpad, per-mutation byte backup, restored, `git hash-object` == HEAD blob 5beece04 after each; worktree never mutated)
- F1 (C1): `--no-sandbox` -> `--disable-gpu` -> new test RED (1 failed).
- F2 (C2): gate `== "1"` -> `!= "1"` -> RED.
- F3 (C2): gate condition -> `True` -> RED.
- F4 (C1 exactly-once): append `--no-sandbox` twice -> RED.
All 4 killed; hash fidelity OK after each.

## Adversarial / security
The change adds a Chrome flag that lowers isolation, opt-in by process env only. The env var is read in the bot process and cannot be set by a meeting URL, API caller or tenant input; there is no tenancy, auth or data-write path. The comparison is exact, so truthy-looking values do not enable it. No bypass found. Residual: whoever controls the container env (U1 compose/Dockerfile) decides; that is U1's gate and not this unit's.

## Notes (not backlog)
Per-run check on a 4.51.9 venv was not possible here; shim substitution matches what the maker did, and the guard is unrelated to the changed lines.

Metrics: check_min=8 wall_min=8 mutations=4 suite_runs=3 cycle=0 policy=proportional-verification/2026-10-19.17
