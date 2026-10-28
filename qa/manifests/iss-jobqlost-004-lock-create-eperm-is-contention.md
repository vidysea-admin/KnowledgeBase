# iss-jobqlost-004-lock-create-eperm-is-contention

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (open ledger issue ISS-JOBQLOST-004, medium; pulled because it makes the standing test `file-job-queue.lost-update.test.ts` "real processes" red-sometimes on main; touches a data-write path, so full ceremony). Does NOT wire the queue, not in `core/index.ts`.
Lane: lane/jobqeperm. Ledger for this lane: qa/issues.jobqeperm.jsonl, ids ISS-JOBQEPERM-NNN (1 filed, low, open). Existing ledger rows untouched (the checker changes ISS-JOBQLOST-004's status).

## Scope
Touches only `packages/core/src/job-queue/` (+ this manifest and the lane ledger).
- `queue-lock.ts` `withQueueLock`: while ACQUIRING the lock, EPERM/EBUSY/EACCES (Windows: create racing a delete, delete-pending lock) is contention, retried with the existing 5-20 ms backoff inside the existing `waitMs` budget; budget exhausted -> typed `conflict` "queue is locked by another writer", nothing written. Distinguishing a real permission problem: after a transient CREATE error the lock path is read; lock present (or itself transiently unreadable) = contention; lock ABSENT = delete finishing or directory unwritable, tolerated at most 5 consecutive times (~100 ms) then the original errno is returned as `io-error`. Any other errno (ENOSPC, EIO, ...) on create or on the lock read is `io-error` at once. Queue file / directory ops (`mkdirp`, tmp create, rename, queue read) untouched. 30 s takeover, ownership re-check, `breakStale`, ISS-JOBQLOST-001/-003 untouched.
- NEW `file-job-queue.lock-eperm.test.ts` (17 tests).
Deviation to flag: the brief said "create step only", but measurement showed the flake persisted with create-only handling: the failing call was `EPERM ... open job-queue.lock` from the READ of an existing delete-pending lock (create gives EEXIST, read then gives EPERM). That read, of the lock path during acquisition only, is also treated as contention (filed as ISS-JOBQEPERM-001, low, the cost: a permanently unreadable lock reports conflict, not io-error).

## Evidence (packages/core, node off PATH, `timeout` around each)
- `node --test --import tsx src/job-queue/file-job-queue.lock-eperm.test.ts` -> `tests 17, pass 17, fail 0`. Per code in EPERM/EBUSY/EACCES: absent-lock x3 then success; present lock x12 then vanishes -> success; never-clearing present lock -> `conflict`, no queue file written, bounded by budget; no lock ever present (unwritable dir) -> `io-error` carrying the errno after <=8 attempts and <1 s though `lockWaitMs` is 20 s, nothing written; lock READ failing with the code 4x then clearing -> success, forever -> `conflict`; ENOSPC/EIO on create -> `io-error` after 1 attempt; EIO on lock read -> `io-error`.
- Same new test file against the UNFIXED `queue-lock.ts` (HEAD blob swapped in, restored, hash verified): `tests 17, pass 5, fail 12` (the 12 new-behaviour tests fail, so they bite).
- Real multi-process flake, `file-job-queue.lost-update.test.ts` looped (script `$TEMP/loop-jobqeperm.sh`, 150 s timeout each):
  - BEFORE (HEAD, stopped after 2 failures): `runs=4 pass=2 fail=2`; failure `bad` = `['io-error','claim:io-error']` (message `EPERM: operation not permitted, open ...job-queue.lock`).
  - Create-only intermediate fix: still failed (1 of 15, 1 of 4 later), which found the read path.
  - AFTER (final code): `runs=20 pass=20 fail=0`.
  - `ISS-JOBQLOST-004: 0 io-error in 20 runs (before: 2 failing runs of 4; row recorded 1-2 of 100 ops under 4-process contention)`. The row's own 4-process x 25 stress was not re-run verbatim (its harness was not in the ledger); the standing 3x10 test was the measure.
- Other job-queue tests once: main `tests 15 pass 15`; ids-crash `4/4`; tenancy `6/6`; property `1/1`. Typecheck `tsc --noEmit -p tsconfig.json` exit 0. Directory has 13 files, queue-lock.ts 85+ lines.
- No stray `job-queue.lock`, tmp queue dirs (`jq-*` in temp: 0), or child processes left. No mutation harness was used (the unfixed-file swap above is the only mutation; post-fix blob of queue-lock.ts restored and hash-compared).

## NOT covered
- Real Windows read-only directory (no portable way to make one in the test); the unwritable case is simulated by injection. On a real read-only dir, `mkdirp` succeeds and create gives EPERM/EACCES with no lock -> 5 tries -> io-error (by design, not exercised on real fs).
- If a delete-pending lock lingers with the lock path reading as absent more than 5 consecutive times (~100 ms) the call returns `io-error` (not observed).
- Frozen holder / takeover (ISS-JOBQLOST-003), pruning (-001): unchanged. Network drives, multi-machine: unchanged.
