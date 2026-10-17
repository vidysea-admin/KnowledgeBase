# Manifest — regflake

**Contract:** none (test-harness hardening only; no production code changed).
**Fix cycle:** 2
**Status:** ready-for-check
**Date:** 2026-10-13
**Files:** `packages/meeting-bot/py/test_sb_join_ownership.py` (`test_registration_native_same_host_other_port_confinement`, 7 real-headed-Chrome cases)

## Causes found (measured)
1. **Fixed 15 s cleanup replay.** After the parent exits, the owned Job kills Chrome asynchronously; measured 13-18 s on a quiet box (3/3 runs), longer under load. Each cleanup probe also costs a full Python start, so a short deadline burned out (`Cannot inspect owned Job` with browser still alive).
2. **Bring-up stalls.** SeleniumBase uc connect does an HTTP call to chromedriver with no read timeout; under CPU load (other lanes + autoTesting runs) it stalled 100-175 s before `driver-ready`, before any registration code ran (faulthandler trace captured). The old 55 s `communicate()` timeout also hung on pipes inherited by Chrome.

## Fix (test only)
- Output of the parent/cleanup captured to files, not pipes; timeouts 100-120 s.
- Launch that never reached `driver-ready` is reaped (`--cleanup-only`), profile reset, retried (max 4). A run that reached `driver-ready` is never retried, so its assertions are unchanged.
- Cheap psutil poll (<=150 s) for the recorded browser's death BEFORE the strict `--cleanup-only` replay (deadline 90 s); identity checks, `phase == cleaned` and post-cleanup death proof unchanged.
- No ledger record -> skip cleanup so the original failure surfaces.

## Evidence
Command: `.venv\Scripts\python.exe -m pytest <file> -k "native_same_host and wrong-action" -q` (fresh pytest basetemp/tmp profile each run; never the kb-automation profile or port 9333).
- Before (HEAD), machine loaded: 2 passed / 2 failed (4 runs); full 7-case file: 0/7 (run concurrently with another loop), 1/7 and 0/7 on fixed-timeout variants.
- After, loaded then quiet: **15/15 pass** (11-130 s each); full 7-case file: **7 passed** (87 s).
- Before, quiet machine: 15/15 pass — the flake is load-dependent, so the "before" count depends on contention.

## Fix cycle 1 (ISS-REGFLAKE-001)
- Root cause (per verdict): retry reset the profile with `shutil.rmtree(ignore_errors=True)`; a partial Windows delete left `Default/` without the ledger, so every retry hit "Legacy occupied or unproved profile refused".
- Fix (test only): each attempt gets a brand-new profile/stop path (`profile-N`, `stop-N`) created by sb_join's own normal setup; no rmtree/ignore_errors anywhere; cleanup/ledger reads follow the current attempt's profile. Assertion failures now carry every attempt's (returncode, stdout, stderr), so the real error is no longer masked. No ledger seeding; no assertions weakened.
- Evidence (after 15:26 UTC, quiet box, repo .venv python, fresh --basetemp each): wrong-action x5 = 5/5 pass (11-12 s each); `-k native_same_host` (all 7 cases) = 7 passed in 78.27 s; 0 chrome processes left.
- ISS-REGFLAKE-001 repro (wrong-action x5): 5/5 pass. Caveat: box was quiet, so the load-dependent failure path was not re-exercised; retry-recovery is by construction (fresh profile), not observed.

## Fix cycle 2 (hard deadline; test only)
- Trigger: after the cycle-1 merge, on a CPU-saturated box (~7 agents), wrong-action failed (all 4 attempts stalled before driver-ready) and `[native307]` ran past a 580 s kill. Worst case before: 4x100 s attempts + 30x120 s reap + 150 s death poll + 90 s cleanup, no overall bound.
- Fix (`test_sb_join_ownership.py` only; no assertion weakened): per-case hard deadline `LKB_TEST_HARD_DEADLINE_S` (default 480) covering attempts, reap and cleanup. Attempts and reap stop `LKB_TEST_CLEANUP_RESERVE_S` (default 120) before it and FAIL with the full attempt_log (rc/stdout/stderr per attempt); each attempt/reap timeout is `min(configured, remaining)`. Env knobs `LKB_TEST_BRINGUP_TIMEOUT_S` (100) and `LKB_TEST_BRINGUP_ATTEMPTS` (4). Cleanup (death poll, strict replay) still always runs, bounded by the remaining budget with a 10-20 s floor so it is attempted. No load scaling added.
- Mutation (temp test-side stub replacing the launch with `sleep 9999`; per-mutation byte backup in try/finally, applied-check, restored True, final blob hash == staged blob): (a) every attempt stalls, LKB_TEST_BRINGUP_TIMEOUT_S=15, HARD_DEADLINE=90, RESERVE=30: test FAILED in 63 s (< 90 s) with `AssertionError ('wrong-action', 'hard deadline exceeded during bring-up attempt 2', ..., [(0,'timeout','',''),(1,'timeout','',''),(2,'timeout','','')])`, no hang. (b) attempt 0 only stalls (timeout 60): 1 passed in 170.8 s, recovered on a fresh profile.
- Verification (real headless Chrome, fresh --basetemp each, each run under `timeout`): wrong-action x8 = 7 pass (24-110 s), 1 FAIL in 213 s (bounded, not a hang). The failure was post-body: assertions passed, then in the finally the recorded Chrome outlived the owner for >190 s on the loaded box (death poll 150 s, then `Cannot inspect owned Job` x12, then `Reused owner PID refused` because the owner PID was recycled). That is production-ledger behaviour under load (kill-on-close Job did not reap Chrome within ~3 min), unchanged by this cycle and OPEN; not masked or weakened. Full file: `pytest test_sb_join_ownership.py -q` = 52 passed in 470 s.
