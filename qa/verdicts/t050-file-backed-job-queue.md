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
