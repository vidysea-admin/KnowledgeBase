# t050-runner-adapter

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-050, slice 5: runner adapter, step 1 of runner adapter -> graph -> /ask graph). T-050 stays in_progress.
Lane: lane/t050adapter (from 9a7e3fce). Data-write class (it drives the queue and the run-state store): full ceremony.

## Pre-checks
- Blockers: none. T-050 deps `[]`; D-119 HOLD names U4.1/T-051/T-052 (and the T-044 driver wiring), not T-050; no Approver-decision row on T-050.
- No LangGraph dependency is needed or added: no package.json change. The adapter is plain TypeScript the graph will call later.

## Scope
New `packages/core/src/pipeline-runner/`: `runner-types.ts` (interface `PipelineRunner`), `pipeline-runner.ts` (`createPipelineRunner({def, queue, store, now, mintAttemptId?, maxConflictRetries?})`), `pipeline-runner.test.ts`. Not exported from `src/index.ts` (run-state contract criterion 6). Nothing else touched.
Operations: `submit` (enqueue + create initial RunState, idempotent), `claim(worker, tenant)`, `step` (plan; start first ready stage / waiting / complete / failed-terminal), `heartbeat`, `succeed`, `fail`, `skip` (optional stage).

## BEFORE-WIRING items carried (from the merged verdicts)
- queue B3: tenantId on every claim and every LeaseRef (spy test). queue B4: job and run id = `r-` + sha256(tenantId NUL runKey)[0..32], so ids are not guessable from session ids and never shared between tenants.
- store B3 (ABA): fresh attemptId per attempt, default `crypto.randomUUID`; a repeating minter is refused by the reducer (`duplicate-event`).
- store B8: `conflict` is reloaded and retried (default 3), `locked` / `io-error` are returned typed, not swallowed.
- Every operation first heartbeats the queue lease: a worker whose lease was superseded gets `queue:stale-lease` before any state is read or written.

## Design decisions the checker should look at (not policy; reversible)
1. `failed-terminal` and `complete` both call `queue.complete`: the job is finished, the RunState holds the failure. Using `queue.fail` would re-queue a terminally failed run until attempts ran out.
2. `waiting` leaves the queue lease untouched (it lapses; re-claim consumes a queue attempt).
3. A claimed job whose payload runKey does not hash to the job id, or whose RunState is missing, is `queue.fail`ed (`bad-payload`, `run-missing`).
4. `submit` order: enqueue, then create state; a crash between them is repaired by the next submit (tested).
Residual (unchanged): a tenant learns only that an id is taken (queue invariant 8); queue.complete after a lease lapse is honoured until superseded (queue limit).

## Evidence (packages/core, node v24 off-PATH)
- `node --test --import tsx src/pipeline-runner/pipeline-runner.test.ts`: tests 18, pass 18, fail 0; run 15 times: 15/15 green (single-process, fakes: MemQueueFs + FakeRunStateFs; one test uses real tmp dir files).
- `tsc --noEmit -p tsconfig.json`: exit 0, no output.
- dependency-cruiser (packages/core): no violations, 113 modules. lint-dirsize / lint-dupes / lint-loc: no line mentions pipeline-runner (existing failures elsewhere are not from this lane).
- Mutations on pipeline-runner.ts (10 tried, 9 applied): 9/9 applied killed (claim unrestricted, queue fence removed, conflict not retried, constant attempt id, terminal not finishing job, payload id check removed, CAS expected=null, complete not finishing job, tenantId dropped from LeaseRef: first run survived, killed after the spy test was added). One mutation (id not tenant-hashed) did not apply (string mismatch in my harness); its property is asserted by "ids differ per tenant". File hash identical before/after.
- Ledger reproductions: none (this unit fixes no filed issue).

## NOT done
No LangGraph, no graph, no /ask graph, no wiring into run-pipeline.mjs or any API, no real LLM, no MongoDB, no multi-process test of the adapter itself (the queue and store keep their own multi-process tests).
