# Manifest — regflake

**Contract:** none (test-harness hardening only; no production code changed).
**Fix cycle:** 0
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
