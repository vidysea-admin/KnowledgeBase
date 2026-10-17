
# goal-t050 CORE SLICE verdict (cycle 0)

VERDICT: PASS (CORE SLICE ONLY; PARENT goal-t050 REMAINS HOLD)
Cycle checked: 0
Reviewed SHA: 9092a7ecf4fa01800e14f5c15e515c62d004706e
Base: a9fac545

## Diff review (a9fac545..9092a7ec)
Source diff is 3 timing constants only: session-restart.fixture.ts:10 self-expiry 22000->75000 ms; session-restart.real.test.ts:21 checkpoint wait 20000->60000 ms; :28 test timeout 30000->150000 ms. Plus manifest text. Lease (`leaseMs:2000` in queue and def), heartbeatMs 100, the `wait(2100)` post-kill lease-expiry sleep and every assertion (stage status done/running, first-calls 1 vs 2, derived/consumed content, job status done, attempt 2, generation 0) are byte-unchanged.

## Does loosening weaken the proof? No.
- The three constants are only harness safety bounds (orphan fixture self-kill, startup wait, test cap). None feeds the lease. A stuck or never-expiring lease still has to let the resume child complete, claim as attempt 2 and ack; the fixture exits non-zero otherwise.
- Own mutation (hand-rolled, per-mutation backup, timeout 400, trap, HEAD fidelity): fixture `leaseMs:2000 -> 600000`. Result: 0/2 pass, both tests fail fast (~24s) with `fixture exited 1`; i.e. a stuck lease fails even with the loosened 60s/75s/150s bounds. Fixture restored: hash-object ed22c4ea... == HEAD blob.
- Residual, noted only: a reclaim delay between 2s and ~60s would not be caught by these tests; no claim of reclaim latency is made, and heartbeat/stale-holder semantics are covered by session-run-controls.test.ts (lease 500/100ms, fake clock, unchanged by this cycle).

## Real-restart tests, independent runs
`node --test --test-force-exit --import tsx src/pipeline-graph/session-restart.real.test.ts`, timeout 600, CPU load 100%:
- 10 runs: 9 exit 0 (2/2 each), 1 exit 1 (run 1: committed mode, `fixture never reached checkpoint boundary` after 60s at the FIRST wait, fixture had not exited; no assertion on lease/replay reached). Wall 47-119 s per run. Per-test 26-60 s.
- Reading: the one failure is a startup-wait timeout under load at the first checkpoint (environment), not a product or lease failure; however it shows 60s is not unconditionally sufficient on this saturated host. Not re-run-once rule needed: run 2+ passed. Residual flake rate observed 1/10 runs (1/20 tests). Logs: .checker-t050/run{1..10}.out (untracked scratch).

## C-criteria (qa/contracts/goal-t050.md), core slice only
- C3 (durable resume, real temp queue/run-state files, new process, committed stage not re-run (calls==1), unacked replay at-least-once (calls==2), downstream consumes artifact, generation 0): MET at core-process level by the above independent runs (the source logic is unchanged from base; evidence is synthetic fixture only).
- C4 (leases/long stages, no concurrent ownership, stale holder refused, restart reclaim fresh attempt): PARTIAL: synthetic controlled handler + real restart reclaim (attempt==2). Not independently rerun by me: session-run-controls.test.ts (taken from maker's/broker's stage A 33/33 claim, receipt qa/evidence/goal-t051checker-broker-t050-core-A.json, unverified by me). Real long provider/media stage proof is NOT met.
- C1, C2, C5, C6, C7, C8: NOT met/not claimed in this slice (bounded child/retry codes, markers, run-pipeline consumption, Ask official executor, tenant on-disk probes, LKB_PIPELINE_GRAPH, real sample all outside this slice).

## Not verified by me
Stage A 33/33 (maker/broker claim), `tsc --noEmit` clean (maker claim), maker's "31/33 before" claim, frozen validator, any criterion beyond C3 above.

## Ledger
ISSUES-WRITTEN: none. Ledger rows must NOT be flipped to closed for the parent; no ISS row is closed by this slice. PARENT goal-t050 stays HOLD (full-parent gates in manifest unchanged).
