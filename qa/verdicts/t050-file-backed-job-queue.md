# Verdict: t050-file-backed-job-queue

VERDICT: FAIL
Cycle checked: 0
Commit checked: 1de8ec1 (lane/jobqueue, from 3f4e213)
Scope: unwired; single process; local filesystem; durability across power loss unverified.

## EXPLANATION

One defect blocks PASS (ISS-JOBQUEUE-001, high). Everything else passed under my own tests.

- Property (own generator, independent reference model, 1,000 seeded sequences x 60 ops, 4 workers, 3 tenants, clock +0/+small/backwards/+1e6/exact lease boundary, real and forged refs): zero violations. 11,052 claims, 2,705 re-claims after expiry, 2,896 stale refs refused with the file byte-identical. Checked: FIFO by seq, no double claim (prior lease expired at claim time), exactly one state, no loss or duplication, terminal never changes, attempts <= max, tenant/payload/seq of stored jobs never change, error codes match the model.
- FAIL cause: enqueue of an existing id with another tenant (4,741 cases) or payload (2,376) returns ok `exists` and queues nothing. Tenant B is told its job exists when it holds none, and can probe tenant A's ids. The stored job is not overwritten or moved (good); the report is wrong.
- Stale refs: `attempt` increases by exactly 1 on every claim (also same-worker re-claim), so a ref from an older claim cannot match. The surviving "worker check" mutant is equivalent ONLY for refs obtained from claim; for a forged ref carrying another worker's attempt number it is not, and my property kills it. Ruling: defence in depth, not a defect; keep the check.
- Clock: lease expiry is an absolute stored instant; a backwards clock only lengthens a lease (no resurrection or double claim; model-checked). Boundary: expired at `now >= leaseExpiresAt`, tested. Heartbeat/complete/fail from the un-replaced holder after expiry are ACCEPTED until another claim bumps the attempt (506/509/486 cases). That deviates from "heartbeat after expiry is refused" but cannot revive a lease another worker holds (a claim would have bumped the attempt first). Low, note only.
- Tenancy: restricted claim never crosses tenants (property). Unrestricted claim is allowed and returns any tenant's job. `LeaseRef` carries no tenant; fencing is worker+attempt only. Tenant ids are validated and never reach a path.
- Real files (Windows temp dir): 300 mixed ops with a tight reader thread (39,319 reads): 0 partial, 0 empty, 0 read errors; only `job-queue.json` left; forced rename failure and create failure give `io-error` and leave no `.tmp`.
- Corrupt files: truncated, empty, `[]`, `null`, duplicate ids, unknown state, BOM, negative attempt, seq >= nextSeq, version 2: `corrupt` from enqueue/claim/heartbeat/complete/fail, bytes identical after all five. Directory and junction at the file path: `io-error`, untouched, junction target stayed empty. A lease at 2^53-1 is valid and strands that job (hand-edit only; note).
- Ids: 30-entry corpus (traversal, separators, drive, UNC, CON/nul./aux /com1.log, `a:b`, NUL, zero-width and fullwidth/Cyrillic look-alikes, 65 chars, empty, spaces, newline) refused for job, worker and tenant ids; no stray files. `Job` and `job` are distinct ids (no path use, harmless).
- Two instances: hooks at each fs call. Before the final re-read the second writer's job survives or A reports `conflict` (nothing lost). A hook at exactly `rename` loses B's job. Unreachable in one synchronous thread; needs a second process or thread (ISS-JOBQUEUE-002, before-wiring).
- Growth: whole file read, parsed, cloned, stringified twice, rewritten per op. 100 jobs 28/30 ms (enqueue/claim); 1,000 jobs 57/49 ms; 5,000 jobs (1.3 MB) 68/59 ms under current CPU load. No pruning.
- Overlap: `apps/api/src/jobs` and the `packages/db` jobs collection are a provider-audit metadata reader (no claim, lease or retry); this queue is a work-dispatch primitive, so they do not duplicate each other. Two things called "jobs" is a naming hazard for whoever wires T-050.
- Mutations (own, 16, per-mutation byte backup, finally-restore, hash equals HEAD blob each time): 15 killed (lease check, attempt increment, tenant filter, enqueue overwrite, fail to dead, stale ref accepted, FIFO reversed, expiry flipped, corrupt-as-empty, rename replaced by unlink+create, worker check dropped, attempt check dropped, exhausted off-by-one, terminal guard, complete leaves lease); 1 survived and is equivalent by construction (tenantId reassigned to its already-equal value).
- Gates: 3 test files 15/15, 4/4, 1/1; tsc --noEmit core 0, web 0; lint-dirsize OK; lint-dupes OK; 300-line budget met (max 139); index.ts unchanged, nothing in src/domain imports the queue; no dependency-lint script exists in scripts/, not run. `git merge-tree` against codex/machine-migration-2026-10-09 (40ed323): clean (tree b38e466).

ISSUES-WRITTEN: ISS-JOBQUEUE-001 (high), ISS-JOBQUEUE-002 (medium, before-wiring), in qa/issues.jobqueue.jsonl

## Merge conditions
Fix ISS-JOBQUEUE-001 (typed error on tenant mismatch; distinguishable payload mismatch) with tests that re-run the ledger repro; re-check as cycle 1. Manifest status not flipped by the checker.

## BEFORE-WIRING
1. Single process only; any second writer (process or worker thread) needs a lock or CAS first (ISS-JOBQUEUE-002).
2. Add pruning/archival of done/dead jobs; about 60 ms per op at 5,000 jobs, linear growth.
3. A tenant-scoped worker must always pass `tenantId` to claim; unrestricted claim sees every tenant. The API layer must never accept a `LeaseRef` from a tenant caller without checking the job's tenant.
4. Decide whether post-expiry heartbeat/complete by the original holder is wanted.
5. Retry backoff, retryable-code classification and power-loss durability (no directory fsync) remain open.

---

# Cycle 1 (re-check of fix commit 36ecfa7, lane/jobqueue)

VERDICT: PASS
Cycle checked: 1
Commit checked: 36ecfa7 (diff eedbce8..36ecfa7)
Scope: unwired; single process; local filesystem; durability across power loss unverified.

## EXPLANATION

- ISS-JOBQUEUE-001: my recorded reproductions (the two enqueue calls in the ledger row, parsed from its evidence text and replayed verbatim) 2/2 fixed: first `enqueued`, second `id-conflict` "job id is not available", file bytes unchanged, tb claim returns null. My cycle-0 generator re-run (1,000 seeds, same counts): 4,741 other-tenant enqueues now all `id-conflict`, 2,376 same-tenant different-payload all `payload-mismatch`, zero violations on every other invariant, file byte-identical after every refusal.
- State independence: id-conflict is deep-equal and has the same fs call sequence (one read, no create/rename) for ready, leased, done, dead stored jobs; nothing in the code path inspects state.
- Residual (an id is known to be taken): ACCEPTABLE with a before-wiring condition, and it is not a contract change. Contract invariant 8 already required a typed error with global ids; per-tenant id spaces would be a different design. Condition: callers must use unguessable ids or ids namespaced by tenant (or a tenant-scoped hash); never an id that embeds guessable cross-tenant content such as a session id.
- Payload: canonical equality verified: key order ignored (nested too), array order significant, `1.0`/`-0` equal 1/0 (payload is JSON-normalised first), `undefined` equals missing and `null`, Dates and NaN normalise as JSON does, cycles and BigInt give `invalid-input`; mismatch never overwrites. `maxAttempts` is ignored in equality: acceptable (idempotent re-enqueue keeps the stored limit, tested); note only, a caller wanting a changed limit gets no signal.
- Ref tenant: wrong tenant gives `not-found` deep-equal to the missing-id answer for heartbeat, complete, fail, in ready/leased/done/dead/expired states (real and forged refs), nothing written; absent tenant behaves as cycle 0 (re-run property: zero violations); a malformed ref tenant is `invalid-input`.
- Cross-tenant knowledge property (1,000 seeds x 12 tenant-B operations, two worlds differing in A's job states and payloads): every B result identical. Observation (low, note): a tenant-restricted claim by B also runs the global dead-marking sweep, so it can write A's file by moving an expired exhausted A job to `dead`; a correct lazy transition, no content or state is returned to B.
- Mutations on the changed code (11 own: tenant comparison removed, state-dependent conflict, mismatch reported as exists, overwrite on mismatch, ref tenant check removed, ignored in each of heartbeat/complete/fail, shallow canonical, unsorted keys, tenant leaked in not-found): 11/11 killed (all by my c1 test), restored and hash-verified each time.
- Gates: tests 15/15, 4/4, 1/1, 6/6; tsc core 0, web 0; lint-dirsize OK; lint-dupes OK; dependency-cruiser (`.dependency-cruiser.cjs`, packages/core): no violations, 68 modules; max file 139 lines. `git merge-tree` against codex/machine-migration-2026-10-09 (f2a44c4, includes run-state-store): clean (tree d4f46bf); no exported name shared with run-state-store or domain (26 vs 136 names compared). The sibling's test kit is separate (`run-state-fake-fs.ts` vs `mem-queue-fs.testkit.ts`).

ISSUES-WRITTEN: none new. ISS-JOBQUEUE-001 set verified-fixed; ISS-JOBQUEUE-002 stays open-before-wiring.

## BEFORE-WIRING (updated)
1. Single process only; a second writer needs a lock or CAS first (ISS-JOBQUEUE-002).
2. Prune done/dead jobs (about 60 ms per op at 5,000 jobs, linear).
3. Production callers MUST pass `tenantId` on every LeaseRef and on every claim; the API layer derives it from the session, never from the request body.
4. Job ids must be unguessable or tenant-namespaced by the caller (existence of an id is visible to other tenants).
5. Decide post-expiry holder semantics; backoff, retryable codes and power-loss durability remain open.
