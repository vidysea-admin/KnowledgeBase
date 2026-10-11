# Contract — t050-job-queue (T-050 slice 4a)

> Ground truth for `packages/core/src/job-queue/` (`JobQueue`, `FileJobQueue`, `queue-store.ts`, `validateQueueId`). Unwired; single process; local filesystem. Written by /checker from the manifest plus an independent read and model test. The maker never edits this file.

## Invariants (each is a criterion; "state" = the stored queue file)
1. No job is claimable while another worker's lease on it is live (`now < leaseExpiresAt`); expiry is at exactly `now >= leaseExpiresAt`.
2. A job is in exactly one state of ready | leased | done | dead; ids are unique; nothing enqueued is lost or duplicated.
3. `attempt` strictly increases by 1 on EVERY claim (including re-claim by the same worker id) and never exceeds `maxAttempts`.
4. done and dead are terminal and never change.
5. Claim order is ascending `seq` (enqueue order, kept across retries) among ready or expired-with-attempts-left jobs.
6. A `LeaseRef` {id,workerId,attempt} that does not match the current holder (worker AND attempt) is refused (`stale-lease`) and the stored file is byte-identical afterwards.
7. `claim(w,{tenantId})` never returns a job of another tenant. A job's tenantId and payload never change after enqueue.
8. enqueue of an existing id never overwrites or moves the stored job and never reports success for a job that was not queued: other tenant -> typed `id-conflict` with a fixed message, byte-identical for ready/leased/done/dead, no write and the same fs call sequence; same tenant + different canonical payload -> `payload-mismatch`; same tenant + equal canonical payload (object key order ignored, array order significant, JSON-normalised scalars) -> `exists`. `maxAttempts` is not part of equality (the stored value is kept). Ids are globally unique; the fact that an id is taken is the only thing another tenant may learn.
9. Every write is temp-file + fsync + rename in the queue directory; a reader never sees an empty or partial queue file; no `.tmp` remains after success or an error.
10. A queue file that fails strict decode (bad JSON, wrong shape, duplicate ids, unknown state, BOM, directory or junction in place) yields a typed error from every operation, and neither reads nor later writes replace, delete or empty it.
11. Job, worker, tenant ids (and error codes) are `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, no `..`, no trailing dot, no reserved device names; ids are never used to build a path (one fixed file name).
12. Not exported from `packages/core/src/index.ts`; nothing under `src/domain` imports it.

13. A `LeaseRef` may carry `tenantId`; when present and different from the job's tenant, heartbeat/complete/fail return `not-found`, deep-equal to the answer for a missing id, in every job state, writing nothing. Without it behaviour is as in invariants 3 and 6 (and reveals state; production callers must pass it).

## Known limits (not criteria)
Cross-process writers (ISS-JOBQUEUE-002); O(n) cost per operation; heartbeat/complete/fail by the unreplaced holder are honoured after expiry until another claim supersedes the lease; no backoff, pruning, power-loss proof.
