# Verdict: iss-jobqprune-001-retention-30-days

VERDICT: PASS
Cycle checked: 0
Commit checked: 3eadcdc (lane/jobqretain, from 15015cf)
Scope: unwired job queue, MemQueueFs and real fs, Windows. Data-write class (default flip makes the queue delete data).

## EXPLANATION

Guarantee I certify: a `FileJobQueue` constructed without `pruneTerminalAfterMs` now prunes terminal (done/dead) jobs of the operating tenant once they have been terminal for 30 days (D-128); a positive safe integer overrides; `null` disables (no stamp, no removal); 0, negatives, non-integers, NaN, Infinity, strings and `false` throw RangeError. Ready and leased jobs are never pruned, other tenants' jobs are never pruned, a tenant-less op prunes nothing, a failed op writes nothing. Before-wiring conditions that remain (rows untouched): ISS-JOBQSTALL-001, ISS-JOBQPID-001, ISS-JOBQPRUNE-002, and callers must pass tenantId and use unguessable or namespaced ids. Note for the wiring unit: a producer's job id is now idempotent for only 30 days after the job turns terminal (documented in the option comment).

1. Constant and null/undefined. `DEFAULT_PRUNE_TERMINAL_AFTER_MS = 30*24*60*60*1000` = 2,592,000,000 ms (test asserts it). The option is read in exactly one place (constructor: `p === undefined ? DEFAULT : p`, cached as `keepTerminalMs`); no other spread or merge of options exists in job-queue/ (grep). Probe: `new FileJobQueue({ ...defaults, now, fs, ...{ pruneTerminalAfterMs: undefined } })` prunes at 30 d, so an explicit `undefined` selects the default ON, not OFF. Intended and consistent: undefined = unset. Bad values 0, -1, 1.5, NaN, Infinity, "5", false all throw RangeError. Only `null` disables.
2. Test-helper change. Old helper `prune ?? undefined` turned `mk(null)` into "option unset", which now means ON; the new helper passes `null` through, so the tests that meant "off" still run off, and the first test is renamed "disabled with null". Legitimate; nothing weakened. The other 7 suites build queues without the option, so they now run with pruning ON by default. That is intended exposure, not hidden: all still pass (tests below), their clocks are small (1..10^4 ms) so nothing is ever 30 d old in them, and the prune suite alone covers aging.
3. Safety with default ON. Prune suite 20/20 (14 old incl. ready/leased never, tenant scope, tenant-less claim prunes nothing, backwards clock, crash atomicity; 6 new). My own sweep (harness, deleted): 300 seeds x 60 random ops (enqueue, claim, complete/fail, two tenants plus tenant-less, clock jumps up to 40 d, random crash injection, default option): 0 violations of "non-terminal job vanished", "tenant-less op removed", "other tenant's job removed", "removed while younger than 30 d or unstamped". Invalid ops leave the file byte-identical. Crash at each of the first 8 fs calls of a pruning op: file is either the old bytes or the fully pruned state, never partial (0 violations).
4. Counts re-run by me: main 15/15, lost-update 6/6 x5, stalled-holder 10/10, pid-reuse 8/8, ids-crash 4/4, tenancy 6/6, property 1/1, prune 20/20, lock-eperm 17/17 x5 (the ISS-JOBQPID-003 fix holds, 5/5 clean), tsc exit 0. All match the maker.
5. My mutations (harness `jobqretain-chk-mut.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; applied verified by hash change; restored hash == HEAD blob 7388845 each time; run against prune + main + tenancy): constant 30 d -> 0 KILLED (4 fail); `undefined` treated as disable KILLED (2 fail); `null` treated as default KILLED (3 fail). 3/3.
- Growth figure (1589 KB disabled vs 15.4 KB default at 5,000 jobs) is the maker's measurement; not re-run. Supported in shape by the 30 d test and the sweep.
- Safety: file-job-queue.ts hash == HEAD; worktree clean before my ledger/verdict edits; main tree clean; temp scripts removed; no lock debris.
- Ledger: ISS-JOBQPRUNE-001 and ISS-JOBQLOST-001 set to `verified` (verified_date, verified_by); no other field changed (checked by field diff).

ISSUES-WRITTEN: none
