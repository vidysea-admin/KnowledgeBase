# Verdict: iss-jobqtenant-001-tenant-required

VERDICT: PASS
Cycle checked: 0
Commit checked: 3ef0ba9a (lane/jobqtenant). Class: tenancy (security, uncapped).

EXPLANATION:
- Caller audit (whole repo, TS/JS/Py/scripts/CI): the only non-test user of the TS queue API is pipeline-runner.ts, 6 call sites (35, 39, 68, 74, 80, 81), all pass tenantId (refOf sets it; claim validates it first). Not exported from core index; no apps/api, scripts or worker imports it. No `as any` or JS call outside tests (the `as any` hits are tests asserting invalid-input).
- Operations: enqueue requires tenant; claim/heartbeat/complete/fail all validate then compare tenant unconditionally. prune is own-tenant only and a tenant-less operation prunes nothing (by design, ISS-JOBQLOST-001). There is no list or reap API on this queue. The lock reaper is tenant-free by nature (a file lock, not a job). No path filters without tenant.
- Malformed: validateQueueId (ASCII [A-Za-z0-9._-], 1..64, no "..", no reserved names) is stricter than db assertValidTenantId (non-empty, trimmed, no control chars). Every queue-valid tenant is db-valid; the converse is not true (queue rejects e.g. "a b", unicode). Consistent in the safe direction. Note for wiring: a db tenant outside the queue charset cannot use the queue (fail-closed, invalid-input).
- Orphaning: enqueue always required and stored a tenant, so no on-disk job can lack one. Nothing is orphaned; stored jobs are claimable by their own tenant, and terminal ones prune by their tenant. Callers that previously omitted the tenant now get invalid-input rather than cross-tenant access (intended).
- Python workers/transcribe/src/job_queue.py: a separate Mongo-backed class; tenant is mandatory at construction, every query goes through scoped() with tenantId. No wildcard. Minor, not filed: constructor accepts whitespace-padded tenants (strip only used for emptiness).
- Contract criterion 13 is stale. Current text: "13. A `LeaseRef` may carry `tenantId`; when present and different from the job's tenant, heartbeat/complete/fail return `not-found`, deep-equal to the answer for a missing id, in every job state, writing nothing. Without it behaviour is as in invariants 3 and 6 (and reveals state; production callers must pass it)."
  Amendment needed (owner, not edited here): "13. `LeaseRef.tenantId` and `claim` `opts.tenantId` are REQUIRED. A missing, empty or malformed tenant returns `invalid-input` and writes nothing. A well-formed tenant that differs from the job's tenant makes heartbeat/complete/fail return `not-found`, deep-equal to the answer for a missing id, in every job state, writing nothing. A claim returns only the named tenant's jobs. (ISS-JOBQTENANT-001)"
- Tests: tsc clean. Every job-queue, pipeline-runner and run-state suite green (23 files, 0 fail). lost-update, stalled-holder, pid-reuse: 15/15 each.
- Mutations (7, per-mutation byte backup, restore in finally, hash equals HEAD blob after each, harness deleted): KILLED 4: refError tenant skipped; claim tenant unvalidated; empty tenant accepted in refs; empty tenant accepted in claim. SURVIVED 3, all equivalent: restoring the wildcard in owned (two variants) and in the claim filter. The validation gate (refError/claim) runs first, so tenant is never undefined or empty when those comparisons execute; they are defence in depth and unreachable through the public API. Not a test gap in behaviour.

ISSUES-WRITTEN: none
