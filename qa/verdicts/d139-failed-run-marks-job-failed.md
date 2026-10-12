# Verdict: d139-failed-run-marks-job-failed

VERDICT: PASS
Cycle checked: 0
Checked commit: a2ee6b31 (lane/failedjob, base 6be0570c)

EXPLANATION:
1. terminal flag: `fail(ref, code, opts?)` only adds `opts?.terminal === true ||` to the status expression; omitted opts leaves behaviour identical (requeue while attempts remain). Validation is unchanged: refError still requires tenantId, and owned() still returns not-found for another tenant's job, so a non-owner cannot make a job dead (mutation M3 killed by 5 tests).
2. Retention: dead already shared the done/dead terminal branch in prune() (same 30-day default, per-tenant, terminalAt stamp). Nothing kept forever, nothing deleted early. Note (not new): the stamp is set on the next queue operation, as for done. After pruning the job, the run state remains and submit still walks generations by state, so a pruned dead job does not re-open its generation.
3. Generations: ids are deterministic hash(tenant, runKey, generation). Two concurrent resubmits both land on the same next generation; enqueue is idempotent under the queue lock and the state save is CAS (conflict -> "exists"), so no duplicate run. In-flight, retryable and succeeded runs resolve to the current generation. Payload generation is re-derived in claim (tamper -> bad-payload). Multi-process suites (lost-update, pid-reuse, stalled-holder) with runner and run-state suites: 15/15 runs, 198/198 each. One earlier run showed 1 failure (not identified; the machine was loaded by the Chrome worker; it did not recur in 15 reruns).
4. STATUS GAP confirmed read-only: queue-reader.ts and notifications.ts read only the Mongo upload queue; no code outside core tests imports the file queue or runner. Filed ISS-FAILEDJOB-001 (medium) in qa/issues.failedjob.jsonl. Not fixed.
5. Mutations (harness in worktree, per-mutation byte backup restored in finally, timeout, git hash-object == HEAD blob verified for every file, harness deleted): M1 terminal ignored KILLED (6); M2 resubmit reuses generation KILLED (2); M3 no tenant check KILLED (5); M4 in-flight not idempotent KILLED (5); M5 failed-terminal -> complete KILLED (6); M6 save-conflict returned as error instead of "exists" SURVIVED. M6 is the concurrent-submit race path: no test drives it. Not a duplicate-run risk (ids are deterministic); low note only, not a unit.
6. tsc --noEmit -p packages/core: clean (the old line 249 did not trip it). job-queue, pipeline-runner and run-state-store suites green. No pipeline-graph test exists in this lane's base (it lives on main), so it was not run here.
Residual notes (low, no ledger): a run state already failed-terminal whose job has not yet been stepped lets a resubmit start the next generation while the old job is still live (it will only finish dead, no stage runs); a job dead by lease expiry mid-stage is not detected by submit (maker declared this).

ISSUES-WRITTEN: ISS-FAILEDJOB-001 (medium, status gap, not a defect in this unit)
