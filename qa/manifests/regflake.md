# Manifest — regflake

**Contract:** none (test-harness hardening only; no production code changed).
**Fix cycle:** 1
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
