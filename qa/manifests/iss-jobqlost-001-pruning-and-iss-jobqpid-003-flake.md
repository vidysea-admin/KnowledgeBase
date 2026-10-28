# iss-jobqlost-001-pruning-and-iss-jobqpid-003-flake

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3-equivalent (open ledger issues ISS-JOBQLOST-001 and ISS-JOBQPID-003, both medium; data-write class: full ceremony). ISS-JOBQLOST-001 is one of the conditions keeping ISS-JOBQUEUE-002 at `open-before-wiring`; this unit does NOT wire the queue and changes no existing ledger row.
Lane: lane/jobqprune (from d14128e). Ledger for this lane: qa/issues.jobqprune.jsonl, ids ISS-JOBQPRUNE-NNN (3 filed: 1 medium before-wiring, 2 low).

## Scope
Touches only `packages/core/src/job-queue/` (+ this manifest and the lane ledger). `core/index.ts` and `run-state-store/` untouched.
1. PRUNING (ISS-JOBQLOST-001). New option `FileJobQueueOptions.pruneTerminalAfterMs` (positive safe integer, queue clock ms; invalid = RangeError). **Default: unset = OFF** (no stamp, no removal; file format and every existing test unchanged). Reason: pruning forgets the id (re-enqueue of a pruned id gives `enqueued`, not `exists`; a late complete of a pruned job gives `not-found`), so the retention value is the producers' idempotency window and a product decision (ISS-JOBQPRUNE-001, open-before-wiring).
   - When on, inside the existing `run()` (lock -> load -> change -> ONE atomic save): after a successful change, every terminal (`done`/`dead`) job without a stamp gets `terminalAt = now` (new optional field on `QueueJob`, strict-decoded: only on done/dead, non-negative safe int), then terminal jobs of THE OPERATION'S TENANT with `now - terminalAt >= retention` are removed from the same state that is saved. Same single create + rename as without pruning (test), so a crash at any fs call leaves the old or the new complete file (test, 60 crash points).
   - Never pruned: ready, leased (also lease-expired, not yet reclaimed). Age counts from first seen terminal, not from enqueue; older-build terminal jobs without a stamp are stamped on the first pruning op and age from then. A clock that went backwards prunes nothing. `nextSeq` never rewinds (FIFO by seq intact).
   - Tenant scope: enqueue(input.tenantId), claim(opts.tenantId), heartbeat/complete/fail(ref.tenantId); an operation naming no tenant prunes nothing (ISS-JOBQPRUNE-002, low). A failed/refused change writes and prunes nothing.
2. FLAKE (ISS-JOBQPID-003). Test-only: in `file-job-queue.lock-eperm.test.ts` "lock exists but reading it fails with EBUSY/EACCES/EPERM" the budget is `forever ? 300 : 5000` (was 80 for both). The clearing case needs 4 backoffs of 5-20 ms that Windows rounds to ~15.6 ms ticks; the never-clears case still asserts typed `conflict` and nothing written. No production change for the flake: the product behaved correctly.
- NEW `file-job-queue.prune.test.ts` (14).

## Evidence (packages/core, node v24.19.0 off PATH, `timeout` around each, one file at a time)
- lock-eperm 30 runs: **30/30**. (Unchanged original file on this machine under light load: 19/20; ledger recorded 12/20 and 15/20 passing under load.)
- main 15/15; lost-update 6/6 and the multi-process lost-update file 15 runs: **15/15**; stalled-holder 10/10; pid-reuse 8/8; ids-crash 4/4; tenancy 6/6; property 1/1; prune 14/14.
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/core) -> exit 0.

### Growth replay (ISS-JOBQLOST-001 / ISS-JOBQUEUE-002 recorded measurement: 99% finished jobs, 100/1000/5000; real fs; seeded file, tenant ta, ~150 B payloads; median of 7 enqueue and claim; retention 1 h, every finished job older)
| jobs | prune off: file / enqueue / claim | prune on: file after first op / enqueue / claim |
|---|---|---|
| 100 | 35.1 KB / 19.4 ms / 20.4 ms | 1.7 KB / 21.0 ms / 18.5 ms |
| 1,000 | 342 KB / 37.4 ms / 36.2 ms | 4.7 KB / 20.6 ms / 21.5 ms |
| 5,000 | 1.72 MB / 76.4 ms / 80.5 ms | 18.5 KB / 27.4 ms / 26.4 ms |
(The row recorded 5,000 jobs = 1.3 MB, 68/59 ms; payloads here are larger. Steady-state bound pinned in a test: 500 jobs through the queue, peak 14 jobs.)

## Mutations (harness `.jobqprune-mut-harness.mjs`, untracked and deleted; byte backup per mutation restored in `finally`; 240 s timeout; pattern count = 1 required; run against the prune test; final `git hash-object` of file-job-queue.ts and queue-store.ts equals the pre-run blob)
Killed 9: tenant scope removed; boundary `>` for `>=`; stamp from enqueuedAt; no stamping; backwards clock prunes; prune on failed change; option ignored (always on); decode accepts stamp on non-terminal job; option validation removed. "Untenanted ops prune everything" was skipped by the harness (CRLF pattern) and re-run by hand with sed: killed (13/14 pass); file restored from a byte copy, hash equal to the intended blob. SURVIVED 1, equivalent: dropping the explicit `status` check in the filter, because only terminal jobs can carry a stamp (stamping is terminal-only and decode forbids a stamp elsewhere); kept as defence in depth.

## NOT covered
- Retention value / wiring (ISS-JOBQPRUNE-001); tenant-less sweep; lock hold time still grows with live (non-terminal) jobs (ISS-JOBQPRUNE-002); no new multi-process pruning test (the single-save path is the one the existing lock tests cover).
- Remaining ISS-JOBQUEUE-002 before-wiring conditions after this unit: ISS-JOBQLOST-001 only once a retention is chosen (ISS-JOBQPRUNE-001); ISS-JOBQSTALL-001 and ISS-JOBQPID-001 (low windows); callers must pass `tenantId` on every ref/claim and use unguessable or namespaced ids (T-050 verdict). Existing ledger rows not edited.
