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
