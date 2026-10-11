# t050-file-backed-job-queue

Status: checked-PASS (Checked: qa/verdicts/t050-file-backed-job-queue.md, cycle 1, eb29289; unwired; single process; ISS-JOBQUEUE-002 open as before-wiring condition)
Fix cycle: 1
Tier: 3 (roadmap task T-050, slice 4a of "Proposed next slices" item 4 in qa/manifests/t050-resumable-pipeline-planner.md: "Job queue seam (interface + file-backed impl)"). T-050 stays open.
Lane: lane/jobqueue. Class: data write (a queue file is written): full ceremony. Ledger for this lane: qa/issues.jobqueue.jsonl, ids ISS-JOBQUEUE-NNN (none filed).

## Scope
UNWIRED. Single machine, local filesystem, one process at a time. No LangGraph (needs dependency approval), no new npm dependency, no runner/API/index wiring. Not exported from packages/core/src/index.ts; import by path. No existing consumer changes. No equivalent existed: a search for `JobQueue` finds only a Python string inside apps/api/src/activity-health/router.test.ts; apps/api/src/jobs and packages/db/src/collections/jobs.ts are a provider-audit metadata reader (no queue, claim or lease).

Directory `packages/core/src/job-queue/` (7 files, budget 30):
- `queue-types.ts`: `QueueJob`, `LeaseRef`, `QueueResult`, `JobQueue` interface, `validateQueueId`.
- `queue-store.ts`: injected `QueueFs`, real fs (`realQueueFs`), strict `decodeQueue`, `loadQueue`, atomic `saveQueue`.
- `file-job-queue.ts`: `FileJobQueue` (load -> pure transition on a private copy -> atomic save; no-op saves nothing).
- Tests: `file-job-queue.test.ts` (15), `file-job-queue.ids-crash.test.ts` (4), `file-job-queue.property.test.ts` (1, 1,200 sequences); test kit `mem-queue-fs.testkit.ts`.

Interface: `enqueue({id,tenantId,payload,maxAttempts?})` -> "enqueued"|"exists"; `claim(workerId,{tenantId?})` -> job|null; `heartbeat(ref)`; `complete(ref)`; `fail(ref,errorCode)`; `ref = {id,workerId,attempt}` returned by claim. All return `{ok,value}|{ok:false,error:{code,message}}` (codes: invalid-input, corrupt, io-error, conflict, not-found, not-leased, stale-lease, terminal); fs failures are results, not throws.

## Alignment with the planner (lines followed)
- `StageDef.maxAttempts` (pipeline-workflow.ts:25-27) -> `maxAttempts`; `attempt` counts STARTED attempts.
- `leaseAlive` (pipeline-workflow.ts:104-106): lease alive while `now < leaseExpiresAt`, expired at exactly `leaseExpiresAt` (planner: `now - heartbeatAt < leaseMs`). `DEFAULT_LEASE_MS` 120,000 is the planner's placeholder.
- Planner lines 143-149 and manifest guarantees 6-7: a dead worker consumes an attempt; terminal when attempts are exhausted -> here the job becomes `dead` (`errorCode lease-expired`) at the next claim.
- Manifest guarantee 8 (superseded attempt events rejected: `stale-attempt`) -> `stale-lease` via the `attempt` in `LeaseRef`.
- Error code per failure (`StageState.errorCode`) -> `errorCode`. Retry classification (retryable codes) is NOT modelled: the queue retries any failure until `maxAttempts` (the planner owns retryability).

## Guarantees and how they are proved
1. Never claimed by two workers while a lease is live: property model + unit tests (exact boundary instants 99/100).
2. No job lost or duplicated: property checks after every operation that stored ids == enqueued ids, unique; crash test checks the file is the old or the new version.
3. Atomic writes: temp file in the same directory + fsync + rename; crash injected at EVERY fs call of every write step of a 10-step script, with and without a torn temp file; a crash before the rename leaves the old file byte-identical; debris is only `.tmp`; the retried step converges to the reference bytes.
4. Corrupt file is typed `corrupt`, never overwritten/deleted: 8 corrupt bodies x 5 operations; only `read` calls issued; bytes unchanged. Real-fs test too.
5. Id validation: 43-entry corpus (traversal, separators, drive letters, UNC, reserved device names, empty, over-long, control chars, non-strings) for job, tenant, worker ids and error code; zero fs calls for a refused id; all touched paths are `/q` or `/q/<file>`.
6. FIFO by `seq` (kept across retries); checked per claim against the pre-state in the property.
7. Tenant: id stored verbatim (property: never changes); `claim({tenantId})` never returns another tenant's job (property, 1,200 sequences, 2 tenants).

## Evidence (packages/core, node v24.19.0 off PATH, one file at a time)
- `node --test --import tsx src/job-queue/file-job-queue.test.ts` -> `tests 15, pass 15, fail 0`.
- `... file-job-queue.ids-crash.test.ts` -> `tests 4, pass 4, fail 0` (>= 20 crashes injected in the sweep, asserted).
- `... file-job-queue.property.test.ts` -> `tests 1, pass 1, fail 0` (1,200 seeded sequences x 30 ops; asserts > 3,000 claims and > 500 injected crashes occurred).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
- `node scripts/lint-dirsize.mjs` -> `OK`; `node scripts/lint-dupes.mjs` -> `OK` (a first run caught `Loaded`, renamed `QueueLoaded`); `node scripts/lint-loc.mjs` -> only violation is `packages/meeting-bot/py/sb_join.py:1142`, pre-existing and not touched. New files all under 140 lines.

## Mutations (23; harness in-lane `.jqmut-harness-jobqueue.mjs`, byte backup per mutation, restore in finally, 120 s kill, `git hash-object` equals staged blob after each)
22 KILLED, 1 SURVIVED. Killed: lease boundary `>`, no reclaim of expired, live leases claimable, FIFO reversed, tenant filter dropped, attempt not incremented, exhausted not made dead, fence ignores attempt, fail-dead one late, enqueue not idempotent, heartbeat no extend, seq not advanced, bad clock accepted, conflict check removed, corrupt treated as empty (the overwrite hazard), lease/worker consistency in decode dropped, `..` check, reserved names, length cap, trailing dot, ref validation, duplicate-id decode check (first run survived: added a duplicate-id body to the corrupt corpus, then killed). Survived: "fence ignores worker" (equivalent: `attempt` is unique per job per claim, so it already identifies the holder; the worker check is defence in depth).

## NOT covered
- Cross-process concurrency: the pre-rename re-read narrows but does not close the window; two processes can still lose an update. No lock file (a stale-lock takeover protocol like meeting-bot's join-rules store is a separate unit if a second process is ever needed).
- Real power-loss durability beyond fsync of the temp file (directory fsync not done; not available on Windows from Node).
- Real-fs crash behaviour: crash injection runs on an in-memory fs; the real fs has one round-trip test.
- Retry backoff, priorities, delayed jobs, pruning of done/dead jobs (the file grows), payload size cap, retryable-code classification, queue sharding by tenant, large-queue performance (whole file rewritten per operation).
- A lease that expired but was not yet re-claimed is still honoured for its owner (heartbeat/complete/fail succeed until another claim supersedes it).
- Wiring to any runner, API or LangGraph.

## Export decision (coordinator constraint: apps/web imports `@lkb/core`)
Verified: apps/web/src/api/*.ts import `@lkb/core`; packages/core/package.json has `"main": "./src/index.ts"` and NO `exports` map (no subpaths exist), so everything in `index.ts` reaches the web graph. Option taken: NOTHING from `job-queue/` is exported from `packages/core/src/index.ts` (the file is unchanged; `queue-store.ts` imports `node:fs`/`node:crypto`/`node:path`). Adding a subpath `exports` map was rejected: it would change how every consumer resolves `@lkb/core`. A Node-side consumer imports by path, as for the planner: `import { FileJobQueue } from "<rel>/packages/core/src/job-queue/file-job-queue.js"` (types: `.../queue-types.js`, which is fs-free and could be re-exported later). Proof: `apps/web`: `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0; packages/core tsc exit 0.

## Fix cycle 1 (checker FAIL cycle 0: ISS-JOBQUEUE-001 high, tenancy)
Contract invariant 8 fixes the choice: a different tenantId "must yield a typed error, not `exists`". Chosen: job identity stays global (ids unique), the refusal is fixed and state-independent.
- enqueue, same id, OTHER tenant -> `{ok:false,error:{code:"id-conflict",message:"job id is not available"}}`; byte-identical answer whether the other job is ready, leased, done or dead; no payload, tenant or state detail; nothing written. Residual, accepted by the contract: a caller can still learn that the id is taken (the refusal itself); it learns nothing else.
- enqueue, same id, same tenant, DIFFERENT payload -> `{ok:false,error:{code:"payload-mismatch"}}`; the stored job is never overwritten.
- enqueue, same id, same tenant, equal payload -> `{ok:true,value:"exists"}` (idempotent, writes nothing). Equality = `canonicalQueuePayload` (queue-payload.ts): object keys sorted recursively, array order kept, JSON scalars. `maxAttempts` is not part of equality.
- `LeaseRef` gains optional `tenantId`. When present, heartbeat/complete/fail refuse a job owned by another tenant with `not-found` (deep-equal to the answer for a missing job id), writing nothing; it is validated like any id. Callers passing none behave exactly as before. BEFORE WIRING: production callers MUST pass `tenantId` on every ref.

D-015 count: `ISS-JOBQUEUE-001: 2/2` recorded enqueue reproductions, parsed verbatim from the ledger row's `evidence` text in `qa/issues.jobqueue.jsonl` and replayed (first -> enqueued, second -> id-conflict, file unchanged), plus the row's implied claim for tenant tb returns null. The row's aggregate counts (4,741 tenant / 2,376 payload cases) are checker-model totals, not individually recorded cases; the payload variant is covered by the separate payload-mismatch test. Nothing from the row is left open.

New tests (`file-job-queue.tenancy.test.ts`, 6): ledger replay; payload equality incl. key order; canonical unit; id-conflict identical across ready/leased/done/dead; ref-tenant; property of 1,000 seeded cases x 12 tenant-B operations (enqueue, claim, heartbeat, complete, fail against A's ids, real and forged refs): every result is the fixed id-conflict / null / a not-found deep-equal to the missing-id answer, A's file bytes unchanged, results never contain A's secret payload token, tenant, worker or lease fields.

Evidence: 15/15, 4/4, 1/1, 6/6 (node --test per file); `tsc --noEmit` packages/core exit 0, apps/web exit 0; lint-dirsize OK; lint-dupes OK; max file 139 lines.
Mutations on changed code: 14, 14 killed, 0 survived (tenant check removed/inverted/answers exists, message leaks holder, payload check removed, payload coded id-conflict, keys unsorted, arrays sorted, shallow canonical (first survived; array-nested key-order assertion added, then killed), ref tenant check removed/inverted/wrong code/unvalidated, not-found leaks tenant). Byte backup per mutation, finally-restore, hash equals staged blob each time.

Not covered, unchanged: ISS-JOBQUEUE-002 (cross-process lost update between the pre-rename re-read and the rename) stays open as a BEFORE-WIRING condition (needs a lock or version CAS, plus pruning). Also not covered: existence of an id is still observable to other tenants via id-conflict (contract-mandated); an unrestricted `claim()` still sees every tenant (callers must pass tenantId).
