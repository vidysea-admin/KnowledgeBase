# iss-jobqlost-003-stalled-holder-takeover

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (open ledger issue ISS-JOBQLOST-003, medium, class data write: full ceremony). One of the conditions keeping ISS-JOBQUEUE-002 at `open-before-wiring`; does NOT wire the queue and does not change that row.
Lane: lane/jobqstall (from dc42571). Ledger for this lane: qa/issues.jobqstall.jsonl, ids ISS-JOBQSTALL-NNN (1 filed, open). No existing ledger row touched.

## Scope
Touches only `packages/core/src/job-queue/` (+ this manifest and the lane ledger). `run-state-store/` and `core/index.ts` untouched.
- `queue-lock.ts` (rewritten takeover): lock body is now `{token,pid,host,thread,at}`. Takeover rule mirrors `run-state-store/run-state-lock.ts` (read, not imported or edited; its small judge, claim-then-rename and constants are DUPLICATED here on purpose): `QUEUE_LOCK_STALE_MS` 30 s, `QUEUE_LOCK_LIVE_CEILING_MS` 1 h, ESRCH/EPERM probe. Owner on this host with a dead pid -> taken over at once; live pid (other process OR other thread of this process) -> never displaced until 1 h; own-thread leftover (token not held right now) or unverifiable owner (other host, legacy body without pid, probe unknown, unparsable body aged by mtime) -> after `staleMs`. Takeover is claim-then-rename (`<lock>.claim.<key>` by `wx`, re-read, atomic rename over the lock, token check afterwards), replacing the old rename-aside-and-put-back `breakStale`. Deviations from run-state: `at` is wall ms (not ISO); `>=` staleMs kept (existing tests); a same-thread holder still inside its call is recognised by a per-thread token set (`heldHere`), needed because the checker's repro runs B nested in A's thread; `thread` (worker_threads id) is in the body so a stalled worker thread is not mistaken for a leftover.
- `file-job-queue.ts`: new optional `lockLiveCeilingMs`, `lockOwner {host,pid,thread}`, `lockIsAlive` (test seams, defaults are the real ones). EPERM/EBUSY/EACCES contention handling (ISS-JOBQLOST-004), tenant scoping, pruning and `queue-store.ts` are unchanged. The commit step still re-checks lock token and then queue-file content right before the rename (unchanged).
- Tests: NEW `file-job-queue.stalled-holder.test.ts` (10). The 6 existing job-queue test files pass UNCHANGED.

## Guarantee now given, exactly
A queue operation whose lock holder is alive on this host (another process or another thread) is never displaced before 1 h, so a holder stalled for 30 s or more cannot have an acknowledged write lost by the old age-only takeover; a writer that does lose ownership returns the typed `conflict` and writes nothing.

## Residual window, exactly
Between a writer's last check (lock token read, then queue-file content read, a few instructions) and its rename, a holder that was legitimately displaced (owner unverifiable and stalled >30 s, or any owner stalled >1 h, or a reused pid) can still rename over the displacer's acknowledged write; this is pinned by a test and filed as ISS-JOBQSTALL-001 (low). Also: the takeover's own last re-read to its rename can overwrite a lock that was released and re-created in between (same gap as the run-state lock); pid reuse keeps a dead owner "alive" up to 1 h; local filesystem, one machine only.

## Evidence (packages/core, node v24.19.0 off PATH, `timeout` around each, one file at a time)
- `node --test --import tsx src/job-queue/<file>`: main `tests 15 pass 15 fail 0`; ids-crash `4/4`; tenancy `6/6` (ISS-JOBQUEUE-001 recorded repro 2/2); property `1/1`; lock-eperm `17/17` (ISS-JOBQLOST-004 unaffected); lost-update `6/6` (ISS-JOBQUEUE-002 recorded repro 10/10); stalled-holder `10/10`.
- Real multi-process lost-update test (3 child processes x 10 enqueue+claim+complete), run 15 times in a row: `lost-update passes 15/15`.
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0. `lint-dupes` OK. `lint-dirsize` FAIL on `apps/api/src` (32 files, budget 31) and `apps/api/src/routes`, `lint-loc` FAIL on `packages/meeting-bot/py/sb_join.py:1142`: pre-existing, outside this lane; job-queue is 14 files, largest 175 lines.

### D-015 count against the ledger's own recorded reproduction
`ISS-JOBQLOST-003: 10/10` hook points safe. The test parses the row from `qa/issues.jobqlost.jsonl`, asserts its `evidence` still contains the recorded reproduction text (second `FileJobQueue.enqueue`, wallNow +31 s, lockWaitMs 0, exactly at A's tmp->queue rename, A ok / B ok / stored [fromA]), and replays it on the real fs at EACH fs call of A's enqueue (10 calls). Output: `ISS-JOBQLOST-003 reproduction: 10/10 hook points lose nothing (B conflict at 8, B stored at 2); at the rename: A ok, B conflict, stored fromA` (before: A ok, B ok, one stored). A is never refused; never two successes with one stored job; the directory holds only the queue file afterwards (no lock, claim or tmp).
Left open, named: the same scenario with the holder displaced legitimately (stall >1 h, or an owner whose pid cannot be verified and stalls >30 s) AFTER its last check is NOT fixed. The `RESIDUAL, PINNED` test shows A ok / B ok / stored [fromA] with B at +1 h+1 s -> ISS-JOBQSTALL-001 (low). Reason: a rename cannot compare-and-swap; part (2) of the brief is therefore only the existing token + content re-check, exercised by the new test "writer displaced mid-operation": B takes over past the ceiling between A's load and A's save, A gets `conflict`, B's write survives, no debris.
Beyond the ledger (additional, not a substitute): takeover rule tests (live other pid at 30 s, 30 s+1, 5 min, 1 h-1, 1 h: refused with lock bytes unchanged; 1 h+1: taken over; other thread live; own-thread leftover at staleMs-1 / staleMs; dead pid at age 0; probe unknown; other host; legacy body; far-future `at`; live vs dead claim file; lock replaced between judgement and claim; lock replaced after our rename); real pid probe with a really exited child (taken over at once) and a really live child (not displaced at +31 s), children killed in `finally`.

## Mutations (10; harness `.jqstall-mut-harness-jobqstall.mjs`, untracked and deleted; byte backup per mutation restored in `finally`; 150 s kill timeout per run; run against stalled-holder + lost-update tests; afterwards `git hash-object queue-lock.ts` = b423abff00a3e5a1e00d69c90c40fb3574ffc338 = the committed blob)
9 KILLED, 1 SURVIVED. Killed: live holder displaced at staleMs; dead probe ignored; held-token set ignored; other thread treated as own leftover; ceiling ignored; takeover re-read skipped; `stillHeld` always true; dead taker's claim never reaped (timeout kill); host ignored. SURVIVED: "claim not verified by token after rename" (always return taken). Behaviourally equivalent today because `saveQueue`'s `stillHeld()` then sees a foreign lock and returns `conflict`; the second token check is defence in depth, and the added test pins the outcome, not that line.

## NOT covered
- The residual window above (ISS-JOBQSTALL-001); network or shared filesystems; several hosts sharing a dir (falls under "unverifiable", 30 s).
- Pid reuse up to 1 h; clock jumps (wall time is each process's own).
- Same-thread nesting still cannot wait (conflict after `lockWaitMs`).
- Pruning/growth (ISS-JOBQLOST-001, open); wiring. The stalled holder is the only ISS-JOBQUEUE-002 condition this unit addresses.
