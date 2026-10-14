# Verdict: t050-runner-adapter

VERDICT: PASS
Cycle checked: 0
Commit checked: 2c1bc72b (lane/t050adapter)
Scope: packages/core/src/pipeline-runner only (unwired, not exported from the core index); single process, fakes plus one real-filesystem round trip.

## EXPLANATION

1. Before-wiring requirements (quoted, status)
- Queue "Production callers MUST pass tenantId on every LeaseRef and on every claim": MET in code (claim passes the tenant, refOf carries it, every complete/fail/heartbeat uses refOf or an explicit tenantId). The test asserts it for claim and heartbeat only; complete and fail refs are unasserted (four surviving mutations, ISS-T050ADAPTER-001, medium).
- Queue "ids unguessable or tenant-namespaced (tenant-scoped hash)": MET. `r-` + sha256(tenantId NUL runKey)[0..32]; NUL cannot occur in a validated id, so the join is unambiguous; dropping the tenant from the hash is killed.
- Queue prune (D-128, 30 d default): a resubmit after the job is pruned just enqueues again and the existing run state settles it. Not a problem.
- Queue "decide post-expiry holder semantics": NOT decided by the adapter. Probe: a holder whose lease expired but was not superseded can still step/succeed, and the heartbeat revives the lease (queue contract known limit). Once another worker claims, the old worker gets `queue:stale-lease` before any state read or write (tested; state and queue file byte-identical). Residual, not a FAIL.
- Run-state B3 "mint a unique attemptId per attempt (ABA)": MET (randomUUID per start; a repeated minter is refused as duplicate-event; the reuse mutation is killed).
- B5 "bind a real WorkflowDef at load": MET in effect: the def is passed to planNext/applyEvent; a stored state with an extra stage gives `unknown-stage` and queue.fail plan-invalid (probed).
- B8 "callers retry locked and conflict, surface warning": conflict is retried (bound 3, tested); `locked` and `io-error` are returned typed for the caller to retry. The `warning` is DROPPED: ISS-T050ADAPTER-002 (medium, before-wiring).
- B2 "store off the root index": outside this unit; the store is still exported via the root index, the runner correctly is not. Stays open for the wiring unit.
- B7 / runlock / runrevclose: the adapter passes the store's typed conflict/locked/io-error through unchanged (ISS-RUNREVCLOSE-001, low: an undeletable temp makes saves of that run fail loudly; nothing logs it).
- jobqpid / jobqstall PID reuse: lives in the queue and store locks; the adapter adds no PID logic and does not weaken it. All 21 queue and store test files still pass.

2. Tenancy probes. A handle for tenant B (own runKey) presented with A's attemptId: `workflow:invalid-transition`, A's run unchanged (capture still running). Forged tenant on A's handle: B's own ready job gives `queue:not-leased`, an unknown tenant gives `queue:not-found`; neither touches A or B state. claim for a tenant with no jobs: null. A lease is a plain handle (tenant, runKey, workerId, attempt), not a secret: the API layer must derive tenant and worker from the session, never from a request body.

3. Lease and lost-lock: superseded worker fenced first (above); the old attemptId under a live new lease is `stale-attempt`; a stage-level expired lease resumes with cause lease-expired and a new attempt id. Stale run-lock reap and PID reuse stay inside the store (typed `locked`); no interaction found.

4. Design call (failed-terminal finishes the queue job; failure stays in run-state): nothing in the contracts, TASKS.md, goal.json or DECISIONS decides it. Measured: queue.complete avoids re-queuing a terminal failure (queue.fail would burn attempts). But a resubmit of the same runKey returns exists/exists and nothing becomes claimable (probed), so a terminally failed run has no retry path until a new runKey or an operator acts; and the queue shows the job `done`, so anything reading the queue alone sees success. No /system-status or notification consumer exists yet, so nothing is hidden today. OWNER QUESTION for Umesh (not a FAIL): should a terminal failure be queue `dead` (visible) or `done` with the failure in run-state, and how is a failed run retried? Wiring must read run-state, not the queue, for status.

5. Runner test file, 15 consecutive runs: 15/15 pass (18 tests each).

6. Mutations (lane-unique harness, 90 s timeout, byte backup per mutation, restore in finally, `git hash-object` equal to the HEAD blob after each, harness and probe deleted): drop queue lease heartbeat KILLED; claim without tenant KILLED; constant attempt id KILLED; conflict swallowed as success KILLED; id not tenant-hashed KILLED; tenant dropped from queue.fail plan-invalid SURVIVED; from queue.complete SURVIVED; from queue.fail run-missing SURVIVED; from queue.fail bad-payload SURVIVED. 5 of 9 killed; the 4 survivors are one test gap (ISS-T050ADAPTER-001).

7. Gates: tsc --noEmit exit 0; all 21 job-queue and run-state-store test files pass with unchanged counts; working tree clean after cleanup.

Merge conditions: none blocking. Manifest status is not flipped by this checker.

ISSUES-WRITTEN: ISS-T050ADAPTER-001 (medium), ISS-T050ADAPTER-002 (medium, before-wiring), in qa/issues.t050adapter.jsonl
