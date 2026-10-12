# iss-jobqtenant-001-tenant-required

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2-adjacent (tenancy class, never capped; raised by the t050fix checker). Class: tenancy: FULL ceremony. Verdict by the checker only.
Lane: lane/jobqtenant. Ledger shard `qa/issues.jobqtenant.jsonl` (ISS-JOBQTENANT-001, severity high, latent because the queue is unwired).

## What was wrong
`owned()` compared tenants only when `ref.tenantId !== undefined`; `claim()` filtered only when `opts.tenantId` was given. An omitted tenant therefore matched any tenant's job.

## Caller audit (job-queue API: claim / heartbeat / complete / fail)
Non-test callers: 1 file, 6 call sites, all pass tenantId. packages/core/src/pipeline-runner/pipeline-runner.ts: claim :68 (tenantId param), heartbeat :35 (refOf), fail :39 (refOf), fail :74 (explicit tenantId), fail :80 (refOf), complete :81 (refOf). Tenant-scoped request reachability: none today; pipeline-runner and job-queue are imported by no apps/api, scripts/ or worker code (not exported from core index, contract criterion 12). workers/transcribe/src/job_queue.py is a different, Mongo-backed Python class, tenant bound at construction; unaffected. No operator/all-tenant caller exists. Contract t050-job-queue and DECISIONS give an omitted tenant no wildcard meaning (criterion 13 only says production callers must pass it).

## Change
- queue-types.ts: `LeaseRef.tenantId: string`, `claim(workerId, opts: { tenantId: string })`.
- file-job-queue.ts: refError and claim validate the tenant with validateQueueId (missing/empty/malformed -> `invalid-input`, nothing written); `owned()` and the claim filter always compare the tenant.
- Tests: all existing call sites updated to pass a tenant; new file-job-queue.tenant-required.test.ts; the tenancy test "no tenant = unchanged behaviour" now asserts invalid-input; the prune test "tenant-less claim prunes nothing" now asserts it is refused.
- Contract criterion 13 wording is stale (says tenantId optional): checker to update; maker did not touch qa/contracts.

## Evidence
See commit message and final report: tsc clean; every job-queue test file and pipeline-runner.test.ts green; lost-update, stalled-holder, pid-reuse 15/15 runs each; 6/6 mutants killed (wildcard restored in owned, refError optional, owned ignores tenant, claim ignores tenant, claim tenant unvalidated, empty tenant as wildcard).
