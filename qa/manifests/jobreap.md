# Manifest: jobreap
Status: checked-PASS
Fix cycle: 0
Lane: lane/jobreap (from main 775264f2, then merged main 4f449b27)
Issue: ISS-REGFLAKE-002 (medium, qa/issues.REGFLAKE.jsonl)

## Change
- packages/meeting-bot/py/sb_join_ownership.py: cleanup no longer raises "Reused owner PID refused" when the ledger owner PID is held by a different live process. The stranger is treated as "owner gone" (never signalled; no kill-by-PID anywhere) and cleanup continues to the Job section, which still requires: Job opened by ledger name `Local\LKB-<nonce>`, limit flags == 0x2000 (kill-on-close), recorded browser (if alive, identity-matched) IsProcessInJob, else refuse. Live matching owner still raises "Owned browser parent is still alive". Recycled browser PID still refused.
- packages/meeting-bot/py/test_sb_join_ownership_reap.py (new, 9 fake-kernel cases): recycled owner + verified Job terminates (browser alive / contained phase / browser gone); job gone + browser gone cleans; foreign Job flags, browser outside Job, Job missing with browser alive, recycled browser PID, live owner all refuse with TerminateJobObject never called and ledger unchanged; no Process.kill/terminate ever invoked.
- LOC fix requested by coordinator: retry/deadline cleanup helpers moved verbatim to packages/meeting-bot/py/_sb_join_test_harness.py (run_captured, replay_owned_cleanup); test_sb_join_ownership.py 420 -> 372 lines, assertions unchanged. No contract clause or decision covers the owner-PID check order (searched qa/contracts, DECISIONS; D-ownership plan text requires only job accounting + membership, preserved).

## Evidence
- Mutation (fix reverted via git stash, per-mutation, restored, hash verified): 4 of 9 new cases fail on old code (the 4 recycled-owner-proceeds cases), 5 refusals pass. Restored hash 2d47ecc0... == backup.
- `pytest packages/meeting-bot/py -k "not native_same_host" -q` (pre-split): 389 passed, 7 deselected.
- After split: `pytest test_sb_join_ownership.py test_sb_join_ownership_reap.py -q`: 61 passed in 184.30s (52 ownership + 9 new).
- `node scripts/lint-loc.mjs --all`: lint-loc OK (971 files within budget), dirsize OK, snapshot OK, all structure stages exit=0.
- TS not touched.

## Chrome-outlives-owner >190 s (investigation, unreproduced)
- Kill-on-close IS set (flags 0x2000 via SetInformationJobObject) and the owner is assigned to the Job before launch; the handle is created with NULL security attributes (not inheritable) and Python retains it until exit. So Chrome should die when the owner exits (13-18 s idle). A >190 s lag means another process still held a handle to the Job (kill-on-close fires only when the LAST handle closes) or the owner process teardown stalled under CPU load; the 12x "Cannot inspect owned Job" (OpenJobObjectW failed with error != 2 while browser alive) suggests transient OpenJobObject failure under load. Not provable without a reproduction; no production change made for it. Recommend: cleanup retry on OpenJobObjectW failure (already done by the test replay loop) and, if recurring, log GetLastError.
- Residual: a recycled owner PID whose exe() raises AccessDenied still propagates (unchanged, fail-closed).