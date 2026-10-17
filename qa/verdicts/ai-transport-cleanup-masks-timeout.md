# Verdict: ai-transport-cleanup-masks-timeout
VERDICT: PASS
Cycle checked: 0
Commit checked: 64f7b00 (lane/aitransport, base 9dae5d3)

## EXPLANATION
- Primary outcome wins: 27 checker-authored tests through the cleanup seam, all green. Timeout, success, non-zero exit and spawn failure, each crossed with cleanup throwing an Error with code, a string, null, undefined and an odd object: the timeout error is the exact "CLI process timed out" message, success and exit results are returned, a spawn failure keeps its own error, with 4 attempts each. Cleanup succeeding on attempt 2, 3 and 4 is silent and removes the dir. No unhandled rejection; no double settle (finish() is guarded and cleanup runs only after the promise settles).
- The wait is async (`await new Promise(setTimeout)`), no busy-wait or Atomics.wait. A test confirmed the event loop keeps ticking during retries (>=20 ticks in about 450 ms). Acceptable on the request path; no blocking issue.
- Success path: one removal call, no delay (delayMs 5000 still returned in under 3 s). Removal is never skipped: it is in `finally`, and runs only after the promise settles, which is on child "close". The remove-before-kill order cannot occur in this code. Descendants that outlive the kill and hold the dir are the case the retry covers.
- Hygiene: onFailure gets only `code` (checked with a message-bearing thrower). The messages returned are the fixed strings. Production uses `realTransport` with no `onFailure`, so a leak is silent. Ruled low, since the dir is created empty and is only the child's cwd. Filed as ISS-AITRANSPORT-002 (low, ledger only).
- Existing behaviour: test diff has 0 deletions and the 10 original tests pass; kill logic and timeouts are untouched.
- Mutations (own, 90 s timeout, per-mutation byte backup, restore, `git hash-object` = HEAD blob after each, all HASH-OK): M1 swallow primary: KILLED (lane tests, 17 failing). M2 retry forever: KILLED (timeout, "bounded at 4"). M3 delay on success path: KILLED only by my timing test; the lane suite survives it (delayMs 1 hides it). M4 rmSync(cwd) inside terminate: SURVIVED both suites; the mutation is contrived (the real removal runs only after close) and the lane tests use an injected remove; low observation. M5 onFailure gets message: KILLED ("deepEqual codes ['EPERM']"). Score 3 of 5 killed by the lane suite alone, 4 of 5 with my test.
- D-015: ISS-AITRANSPORT-001: 1/1 recorded repro (deadline + EPERM -> timeout error) passes; with the guard removed (M1) it fails.
- Evidence: test file x3 `tests 17 pass 17 fail 0`; `tsc --noEmit` in apps/api rc=0; `lint-dirsize: OK (112 dir(s) within budget)`; ai-transport.ts 111 and test 105 non-blank lines; no file added in apps/api/src; my scratch test removed.

ISSUES-WRITTEN: ISS-AITRANSPORT-002 (low). ISS-AITRANSPORT-001 marked verified.
