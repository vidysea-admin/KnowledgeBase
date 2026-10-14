# Verdict: regflake

**VERDICT:** FAIL
**Cycle checked:** 0

## EXPLANATION
Static review (items 1-4) is clean; the behavioural claim is not met.
1. Diff is test-only; the assertions in the try-body (returncode, events, foreign, values, posts, cookies, outcome) are byte-identical. Only the time bounds widened (replay 15 s to 90 s, death poll up to 150 s) and the finally block now skips cleanup when no ledger has a "browser" record (cannot hide a passing body, since a passing body implies a browser ran).
2. Retry fires only when returncode != 0 (or timeout) AND '"driver-ready"' is absent from stdout. sb_join.py emits driver-ready (line 109) before register_form (line 122), so a post-registration failure is never retried and still fails.
3. The 150 s poll is followed by the unchanged strict replay (returncode 0, phase == cleaned) and the post-cleanup process.wait(10); a browser that never dies still fails.
4. Cleanup runs in finally. No leaked Chrome or temp dirs observed (0 chrome after my runs; I killed my own pytest).
Behaviour: wrong-action run 5 times with the repo venv python, fresh --basetemp each: 0/5 pass (87 s, 64 s, 40 s, 72 s, plus one debug copy at 494 s). The pre-change test (HEAD~1) also failed once here (KeyError: 'browser'), so the box is loaded, but the new retry did not recover. Root cause found in the debug run: the retry resets the profile with shutil.rmtree(..., ignore_errors=True); a partial delete leaves Default/ without the ledger, and every later attempt exits at once with "Legacy occupied or unproved profile refused". Other runs ended with driver-ready then fatal "Registration browser failed" (real message masked by sb_join). The maker's 15/15 and 7/7 claim did not reproduce.
Not done: full 7-case run and the 2 mutations (a FAIL already blocks; the base is unreliable here).

## ISSUES-WRITTEN
ISS-REGFLAKE-001 (qa/issues.REGFLAKE.jsonl)

## Cycle 1

**VERDICT:** PASS
**Cycle checked:** 1

## EXPLANATION
Commit 0d9d6ccd touches only test_sb_join_ownership.py and the manifest; production code unchanged, no ledger seeded or faked, no assertion weakened (the only assert changes add attempt_log to failure messages).
- Retry forced: temp copy of the test with attempt-0 timeout cut to 2 s (stall before driver-ready, real Chrome). Result: 1 passed; tmp_path held profile-0 and profile-1, final main.out showed driver-ready then registration-result. Attempt 2 recovered on a fresh profile, no rmtree anywhere.
- Real failure after driver-ready still fails: submitSelector mutated to a missing element, test FAILED on the first attempt, only profile-0 created (not retried).
- Side note: an unreachable-host mutation fails before driver-ready, so it is retried 4 times and then fails with all 4 attempts' rc/stdout/stderr in the message (error surfacing confirmed).
- Cleanup: stalled attempts are reaped by --cleanup-only; per-attempt profile dirs are deliberately kept under pytest tmp_path (bounded: pytest retains 3 basetemps; at most 4 profiles per case). No Chrome left (0 after every run).
- Runs (second independent re-run): wrong-action 5/5 pass (12-19 s each); full file 52 passed / 0 failed in 626.8 s (box was loaded; earlier run 81.8 s). Retry mutation re-confirmed: 1 passed, profile-0 and profile-1 both present, driver-ready then registration-result; post-driver-ready mutation FAILED with profile-0 only.
- Mutation copies were uniquely named, deleted; test file hash 3899bd95 == HEAD blob; worktree clean of harness files.

## ISSUES-WRITTEN
none (ISS-REGFLAKE-001 closed)
