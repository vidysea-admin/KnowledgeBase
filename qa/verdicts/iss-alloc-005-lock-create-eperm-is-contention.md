# Verdict: iss-alloc-005-lock-create-eperm-is-contention

VERDICT: PASS
Cycle checked: 0
Commit checked: e49ae020 (lane/alloc005)
Scope: scripts/qa/ledger-alloc.mjs acquireLock; one machine, Windows, local fs, multi-process.

## EXPLANATION

- Pre-flight: tree clean, no node process with "alloc005" in its command line (maker harness not running).
- Tests: ledger-alloc.test.mjs + ledger-alloc-fix1.test.mjs 31/31. tsc not applicable (only .mjs touched, no TS in scope).
- Q1 genuine permission error: seam EACCES with no lock file reports "cannot create ledger lock" after 6 opens in 60-80 ms (3 runs), not the 8 s deadline. The ALLOC-004 icacls test stays green.
- Q2 spin: 5 retries, each with a 2 ms Atomics.wait sleep; bounded at ~6 opens per episode and resets only on a successful stat. Not a hot spin; trivial under 13 processes.
- Q3 seam: `io = {}` defaults to openSync/statSync; the only production-path changes are the fix branch itself. The extra stat-failure branch (non-ENOENT) sleeps 10-35 ms and is bounded by the waitMs deadline.
- Q4 correctness: multi-process test run 15 times: 15/15 pass (it asserts distinct ids, no gaps, union clean). My own harness (13 procs x 20 appends, temp ledger, 5 runs): returned ids all unique, file rows == acknowledged + seed, each id exactly once, 0 EPERM/EACCES/EBUSY messages. Two ids can not collide: the lock is still taken by wx and a failure never proceeds to allocate.
- Q5 deadline timeouts: 0,1,0,1,0 per 260 appends in my runs; loud LedgerError, no row written. Filed ISS-ALLOC005-001 (low) in qa/issues.alloc005.jsonl.
- Q6 mutations (harness zz-mut-alloc005.mjs, untracked, deleted; per-mutation byte backup restored in finally; timeout 120 s; hash == HEAD blob after each):
  - M1 retry cap removed: killed (1 fail). M2 timedOut throw removed: killed (suite hung, killed by timeout). M3 EACCES dropped: killed. M6 cap 5 -> 50: killed.
  - M4 (no `absent` reset on non-ENOENT stat error) and M5 (no reset on successful stat): SURVIVED. The reset semantics of the consecutive counter are untested. Impact is benign (it would only make an interleaved ENOENT/other-error sequence give up sooner, still bounded); noted, not filed.

## ISSUES-WRITTEN: ISS-ALLOC005-001 (low)
