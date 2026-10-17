# Verdict: budgetmb-meeting-bot-loc-split

VERDICT: PASS
Cycle checked: 0
Checked commit: 881caef3 (lane/budgetmb, base 364cb094)

## EXPLANATION
1. Moves verbatim. Python: stripped-line multiset of old sb_join.py vs new sb_join*.py: the only old line absent is `deadline = time.monotonic() + 15`; every added line is an import, def, docstring or the disclosed glue. SequenceMatcher block check: recorder/loop moves are contiguous old blocks with a constant indent shift (-8 / -4), no interior edits; ownership, cli, register, detect, scripts, profile are zero-edit. registration_cdp.py + registration_cdp_page.py: ZERO old lines lost, only the re-export import and `import re` added. Loopback guard (LOOPBACK_ADDRESS), DNR rules/policy, CDP interception and redirect handling are unchanged text.
2. Glue equivalence (decisive). Untracked harness extracted the OLD inline try/finally from 364cb094 and the NEW recorder_link + the real sb_join.py main tail, ran both against identical fakes (psutil, websocket, urllib opener, clock logging every monotonic/sleep call, conn logging every settimeout/send/close/shutdown). 15 scenarios: normal (capture/no-capture), body ValueError / SystemExit / KeyboardInterrupt / StopIteration, detach raising, detach raising + body exception, send failing in tail and in setup, registration normal / policy_check (re-arms 10 s) / RuntimeError / SystemExit / KeyboardInterrupt. Outcome (returned value or exception type+message) AND full event trace identical in all 15, including exact monotonic-call order, so the 15 s deadline is armed at the same point relative to the same operations, cleanup order (detach, then settimeout+close/shutdown) is identical, finally runs on every exit path, nothing swallowed. Reasoning agrees: generator re-raises inside try/finally; contextmanager `__exit__` returns False for a re-raised same exception.
   Minor non-semantic note: recorder_link captures `os`/`time` at call time rather than reading sb_join globals on each use; only matters if a test swaps sb_join.time mid-run (none does).
3. test_sb_join_ownership.py: single hunk, only the file-copy line widened to registration_cdp* / sb_join_* modules; no assertion changed. The instrumented-main needle replace still matches once at the same 20-space indent.
4. TS: line multiset old vs new: schedule-tick only import/re-export lines and the `WebinarSourceLoaders` type differ; schedule-state/schedule-dedup-state only imports + re-export block differ. Lock (acquireLock/lockStillOwned/releaseLock), writeAtomic, quarantineScheduleState and the tenant tag checks are byte-identical text, now in schedule-dedup-state.ts; no import cycle (dedup imports only lower modules). tsc --noEmit clean.
5. Py suite (main .venv, real Chrome): 293 passed + the 7-case flaky test run separately. Flaky test 3x lane vs 3x main, interleaved, under the saturated machine: lane 1+1+0 = 2/21 cases passed, main 2+0+0 = 2/21. Failure mode identical in both (subprocess.TimeoutExpired driver bring-up, "Cannot inspect owned Job", KeyError 'browser'); no ImportError/ModuleNotFound on the lane, so the copied sibling modules resolve. Lane does not flake more than main.
6. TS suite (packages/meeting-bot cwd): 851 tests, 839 pass, 10 fail. All explained: 4x obs-windows ISS-324, WebM remux, interrupted recovery, owned status (known, same as before); `actual login/tab/OBS spawn` (cwd-relative, known); `getProcessStartTime` (5 s load flake: passes 2/2 on lane and main in isolation; capture/ untouched); `registration actual child timeout` (fails only because the lane has no .venv and cwd is the package; run from lane root with a temporary .venv junction it PASSES, 7.3 s, real Chrome via split sb_join; junction and temp profile removed). Schedule/state/alert suites green. `node scripts/lint-loc.mjs --all`: meeting-bot has zero loc, dirsize, root, dupes or dependency findings; remaining 8 loc violations are outside this lane.

Mutations (harness + `-k cdp_requires_owned` existing test; per-mutation byte backup, restored in finally, `git hash-object` == HEAD blob verified every time, harness deleted):
- M1 recorder swallows body exceptions: killed (harness, existing test)
- M2 drop worker-detach step: killed (harness, existing test)
- M3 arm(15) moved after getTargets (late): killed by harness only
- M4 skip connection.close: killed (harness, existing test)
- M5 close before detach (order swap): killed by harness only
- M6 arm() a no-op: killed by harness only
Observation (pre-existing gap, not caused by this unit): the repo's own tests do not pin deadline-arm timing or detach/close ordering; M3, M5, M6 survive the existing suite.

## ISSUES-WRITTEN: none
