# Verdict: iss-runlock-003-refuse-takeover-on-failed-reap

VERDICT: PASS
Cycle checked: 0
Commit checked: c772804 (lane/runrevclose)
Scope: packages/core run-state store only (unwired); one machine, local filesystem.

## EXPLANATION

ISS-RUNLOCK-003 and ISS-RUNREV-001 are set to verified (their recorded reproductions are all safe on the real filesystem). The residual that an undeletable orphan temp blocks one run id is ISS-RUNREVCLOSE-001 (low, by design).

- Replays (my own script, real files, A = a separate node process stalled inside its own fs wrapper, 1 h ceiling via a shared clock offset; the only injected fault is B's `unlink` of `*.tmp` throwing EPERM, as in the row):
  | ISS-RUNLOCK-003 case | result |
  |---|---|
  | 1 stall ON A's data rename, B's unlink fails | B=`conflict` (EPERM after 1.5 s), A=ok, data = A's, lock released, orphan temp then removed by A; nothing acknowledged was lost (before: B=ok, A=ok, B lost) |
  | 2 same, unlink works | B=ok, A=io-error, data = B's |
  | 3 2 h stall before A creates its temp / token re-check | B=ok, A=locked, data = B's |
  | 4 59 min stall | B=locked, A=ok, data = A's |
  Extra: 2 h stall at the revision re-check with unlink failing: B=conflict, A=ok; with unlink working: B=ok, A=conflict. ISS-RUNREV-001 is case 1.
- Always-reap (constructed): live writer A (separate process, 59 min, holding lock and temp): a contender on the same id gets `locked` and A's temp survives; saves of r2, r10, r1-x and `r1.run-state.json.u` (ids that embed r1's temp pattern) all succeed and leave A's temp alone, A then saves ok. Reaping needs the lock, so it can only remove a temp of a holder that was replaced. The one way to remove a live writer's temp is to delete its lock file by hand: the next saver reaps, A then refuses `locked`, the newer write stands (no loss). The run-id grammar is lowercase only and the temp name pattern excludes dotted middles, so no cross-run-id match. No defect.
- Rewritten tests: lock.test.ts reap test: the "free lock, temp untouched" half now asserts the temp IS reaped (the other strays are still asserted kept). Legitimate consequence, not weakening: a temp under a freshly acquired lock can only be a previous holder's, and the live-writer protection it implied is now shown by the real live-writer test above. crash.test.ts: the hard-coded op index is replaced by an index found from a probe run (first `write` after the temp create), with an assertion that it was found; same crash point and same assertions. revision-recheck: the `todo` became a real passing assertion.
- Undeletable orphan (ISS-RUNREVCLOSE-001): reproduced for real with a non-empty directory named like a temp: every save of that id returns a typed failure (`conflict` for EPERM, after 1.5 s; `io-error` for non-transient codes) whose message names the file; no lock left; other ids unaffected; load still works; the next save succeeds once it is removed. Loud per call, but nothing logs it, so the caller must surface it. Low, accepted.
- Counts: 15 consecutive runs, all pass, for every run-state-store test file (lock.real 7, revision-recheck 9, reap-refusal 8, reap-refusal.real 5, lock 20, crash 4, store 10, interleave 5, gaps 3, id 3, lock.property 1, store.property 1). `tsc --noEmit` exit 0.
- Mutations (harness runrevclose-chk, per-mutation byte backup restored in `finally`; each applied by hash change): reap only after takeover KILLED (2 sim + lock test); ignore reap failure KILLED (9 fails); EACCES treated as busy KILLED; EACCES not retried KILLED; refusal returns without releasing the lock KILLED. 5 of 5 killed. A fifth ad hoc edit that only removed the corrupt-file branch survived; it is unrelated to this unit (not a reap mutation).
- After: both source blobs equal `git rev-parse HEAD:<file>`; harness and probe deleted; both trees clean; no stray lock or temp files.
- T-050 before-wiring: B7 (refuse takeover on a failed reap, re-check before rename) is now met; B2, B3, B5 and B8 remain open, so the store is still not ready to wire.

ISSUES-WRITTEN: none
