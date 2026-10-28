# Verdict: jobreap
Cycle checked: 0
Commit checked: 7b833e0c
VERDICT: PASS
ISSUES-WRITTEN: none

## EXPLANATION
- Safety: the recycled-owner path never signals the stranger (no kill/terminate by PID anywhere). TerminateJobObject is still gated by the ledger-validated nonce name Local\LKB-<uuid>, Flags == 0x2000, and IsProcessInJob for a live identity-matched browser. Live matching owner still refused; recycled browser PID still refused. AccessDenied/other errors in identity() propagate (fail-closed); NoSuchProcess mid-check is treated as owner gone, which is correct. A live owner is judged by the same identity() (pid, create_time, realpath exe) that recorded it, so no flaky different-identity misjudgement was found.
- Old code: 4 of 9 new cases fail with the fix reverted (mutant m1), 5 refusals pass; confirmed independently.
- Mutations (per-mutation backup, 120 s timeout, finally-restore, hash==HEAD blob 2d47ecc0 after each): owner-eq always true 4F; pid-only compare 4F; skip flags check 1F; skip member.value 1F; skip membership block 1F; bare job name 6F; missing-Job-with-live-browser allowed 1F; recycled-browser-ok 1F. Survivors: (a) created-only identity compare (test strangers differ in created time only, so pid/exe-only differences are untested), low note; (b) dropping `owner = None` is an equivalent mutant (variable unused afterwards).
- LOC split: all 54 old assert/raises lines exist in the new files (6 differ only by indentation); 6 tests before and after; helpers moved verbatim with run_captured gaining a root argument.
- Runs: pytest packages/meeting-bot/py -k "not native_same_host": 389 passed, 7 deselected (40 s); reap tests 9 passed; lint-loc/structure OK. Ownership file (52) was run pre-split by the maker (61 passed); the real-browser native_same_host cases were not run by me.
- Notes (low, not filed): add a stranger case differing only in exe or pid; reap refusals for strangers use match=None.
