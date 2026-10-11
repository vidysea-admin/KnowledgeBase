# iss-jobqueue-002-lost-update

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2 (open ledger issue ISS-JOBQUEUE-002, status `open-before-wiring`, class data write: full ceremony). Fixes the condition that blocked wiring the T-050 job queue to any runner; does NOT wire it.
Lane: lane/jobqlost. Ledger for this lane: qa/issues.jobqlost.jsonl, ids ISS-JOBQLOST-NNN (2 filed, both open). Existing ledger rows untouched (the checker changes ISS-JOBQUEUE-002's status).

## Scope
Touches only `packages/core/src/job-queue/` (+ this manifest and the lane ledger). Not exported from `core/index.ts` (still `node:fs`); not wired. `run-state-store/` untouched.
- NEW `queue-lock.ts` (`withQueueLock`): lock file `job-queue.lock`, exclusive create (`wx`) holding `{token, at}`; held across the WHOLE load -> transition -> save of one operation; release = unlink only if the file still holds our token; bounded wait (`lockWaitMs`, default 2,000 ms, then typed `conflict` "queue is locked by another writer"); stale takeover after `lockStaleMs` (default 30,000 ms) by atomic rename to a unique name (put back if what was moved is not what was judged stale); a lock with unparseable content (torn create) is aged by file mtime, left alone as `conflict` if the fs has no mtime.
- `queue-store.ts`: `saveQueue(..., stillHeld)` re-checks lock ownership immediately before the rename (the content re-read is kept too); `QueueFs.mtimeMs?` optional (real fs: `statSync`).
- `file-job-queue.ts`: `run()` wraps load/transition/save in the lock; new options `lockWaitMs`, `lockStaleMs`, `wallNow` (all defaulted).
- Tests: NEW `file-job-queue.lost-update.test.ts` (6) + `file-job-queue.lost-update.child.ts`; adjusted `file-job-queue.test.ts` (corrupt test: lock traffic allowed, the queue file is still only READ), `ids-crash.test.ts` and `property.test.ts` (a crash can now land in lock traffic or lock release; the restarted process sees a dead holder's lock as stale via an injected wall clock; a crash in lock release after the commit leaves the committed version), `mem-queue-fs.testkit.ts` (`wall`, `mtimes`).
Directory file count 12 (budget 30), largest file 140 lines.

## Guarantee now given, exactly
Writers on ONE MACHINE, on a local filesystem with exclusive-create (`wx`) semantics, in any mix of processes and worker threads, are serialised: no two operations overlap between load and rename, so an update cannot be lost between the re-read and the rename. A caller that cannot get the lock within `lockWaitMs` gets `{ok:false, code:"conflict"}` and wrote nothing; it is never told "enqueued" for something not stored.
NOT guaranteed (also in the `queue-lock.ts` header and ISS-JOBQLOST-002):
- Multiple machines, network or shared filesystems.
- A holder frozen longer than `lockStaleMs` (30 s) inside one queue call can have its lock taken over; only the pre-rename `stillHeld()` read plus the content re-read (a few-instruction window) protect that case.
- Same-thread nested use: a queue call made while another call on the same thread is mid-operation cannot wait for it (it gets `conflict` after `lockWaitMs`); never nest.
- Pruning/growth (ISS-JOBQLOST-001, open). Wiring still requires: callers pass `tenantId` on every ref (ISS-JOBQUEUE-001), callers handle `conflict` by retry, and growth is addressed.

## Evidence (packages/core, node v24.19.0 off PATH, `timeout` around each, one file at a time)
- `node --test --import tsx src/job-queue/file-job-queue.lost-update.test.ts` -> `tests 6, pass 6, fail 0`
- `... file-job-queue.test.ts` -> `tests 15, pass 15, fail 0`; `... ids-crash.test.ts` -> `tests 4, pass 4, fail 0`; ISS-JOBQUEUE-001 tenancy: `... tenancy.test.ts` -> `tests 6, pass 6, fail 0`; `... property.test.ts` -> `tests 1, pass 1, fail 0` (1,200 sequences; crash injection now spans fs calls 0..8 so it also lands in lock traffic).
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` (own worktree sources) -> exit 0. `scripts/lint-dirsize.mjs` OK; `lint-dupes.mjs` OK (a first run caught two colliding `DEFAULT_LOCK_*` exports, renamed `QUEUE_LOCK_*`); `lint-loc.mjs` only violation `packages/meeting-bot/py/sb_join.py:1142`, pre-existing, untouched.

### D-015 count against the ledger's own recorded reproduction
`ISS-JOBQUEUE-002: 10/10` hook points safe. The test parses the row from `qa/issues.jobqueue.jsonl`, asserts its `evidence` still contains the recorded reproduction text, then replays it on the real fs: a second `FileJobQueue.enqueue` on the same dir is run at EACH fs call of the first instance's enqueue (10 calls now: `mkdirp,create,read,mkdirp,create,read,read,rename,read,unlink`, including the exact `rename` hook that lost B's job before). At every hook, any writer that reported `enqueued` has its job stored and a refused writer stored nothing. Result: A never refused; B stored at the 2 pre-lock hooks, refused with `conflict` at the other 8. A second test puts B exactly inside A's rename: typed `conflict`, only A's job stored, lock released. (Mutation "lock never acquired" is killed by this test, i.e. the replay does catch the original defect.)
Left open from the same row, named: the growth measurements (100/1,000/5,000 jobs, 28-68 ms per op) belong to the pruning half of its `fix_direction`; NOT addressed -> ISS-JOBQLOST-001 (open). The row's note that the defect is unreachable in one synchronous thread is unchanged.
Beyond the ledger (additional, not a substitute): 3 real child processes x (10 enqueue + claim + complete) on one directory: 30/30 enqueued ids stored, no child saw a conflict within its 20 s wait, no lock/tmp debris. Lock protocol tests: live lock refused and left alone; stale takeover at exactly `staleMs`; lock released after success, no-op and refusal; unparseable lock aged by mtime / refused without mtime; lock stolen mid-operation detected before the rename, queue bytes unchanged, thief's lock not released.

## Mutations (12; harness `.jqlost-mut-harness-jobqlost.mjs`, untracked and deleted; byte backup per mutation, restore in `finally`, 120 s timeout per test run; afterwards `git hash-object` of queue-lock.ts / queue-store.ts / file-job-queue.ts equalled the pre-run blobs c67b31c, 7874c0e, f28c4f8; two later edits were the `QUEUE_LOCK_*` rename only)
12 KILLED, 0 SURVIVED: lock never acquired; stillHeld always true; stale boundary `>`; release without token check; no stale takeover; mtime ignored for unparseable lock; lock never released (timeout kill); wait budget ignored; stillHeld not passed to saveQueue; stillHeld check dropped in saveQueue; non-EEXIST create error treated as busy (timeout kill); vanished lock not retried. Not mutated: the `breakStale` put-back branch (only reachable by a race, no deterministic test), so it may survive.

## NOT covered
- Everything listed under "NOT guaranteed" above.
- Real concurrency was exercised with 3 processes x 10 rounds, short: not a soak, not on a network drive, not with a frozen holder.
- Power-loss durability unchanged (temp file fsync only; no directory fsync).
- Lock `at` uses each process's wall clock; a clock set backwards makes a lock look younger (waits longer, never breaks early); a clock jump forwards can make a live lock look stale.
- Retry policy for `conflict` (belongs to the future runner), pruning (ISS-JOBQLOST-001), wiring.
