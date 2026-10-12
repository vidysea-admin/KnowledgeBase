# iss-alloc-005-lock-create-eperm-is-contention

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 4 (open ledger issue ISS-ALLOC-005, medium; ledger write path, full ceremony). Lane: lane/alloc005. No new issues filed (no lane ledger needed).

## Scope
Only `scripts/qa/ledger-alloc.mjs` (acquireLock) and `scripts/qa/ledger-alloc.test.mjs`, plus this manifest. scripts/qa holds 12 entries, no file added (dirsize ceiling 32).
Same rule as packages/core `queue-lock.ts` (iss-jobqlost-004): EPERM/EACCES/EBUSY on lock create is contention. Lock path stat -> ENOENT = holder's delete finishing: retry at once (2 ms sleep), at most 5 consecutive, then the original "cannot create ledger lock ... not contention" error (real permission errors still reported, ISS-ALLOC-004 icacls test still green). Stat failing with another error (delete-pending) = contention, bounded by the overall waitMs deadline. Other codes (ENOSPC etc.) fail at once. Test seam: `acquireLock(root, { io: { open, stat } })`.

## Evidence
- `node --test scripts/qa/ledger-alloc.test.mjs scripts/qa/ledger-alloc-fix1.test.mjs` -> tests 31, pass 31, fail 0 (6 new ISS-ALLOC-005 tests).
- Multi-process test ("concurrency: 6 real processes") run 15 times: 15/15 pass.
- Row replay (temp copy of real ledger, N processes x 20 appends, lanes main/a/b/alloc; own harness): spurious "cannot create ledger lock ... EPERM" count
  - ISS-ALLOC-005 13 procs x 3 runs: before 9/780, after 0/780; 4 procs x 4 runs: before 1/320, after 0/320.
  - Remaining errors are 8 s deadline timeouts under heavy contention (13-way: 42/780 after, 67 before; 4-way: 4 after, 2 before), a separate noted observation in the row, NOT addressed here.
- Mutations (byte backup per mutation, restored in finally, hash checked): M1 retry removed -> 4 tests fail, killed; M2 5-cap removed -> 2 fail, killed; M4 EBUSY dropped -> 1 fail, killed; M3 pattern missing (not run).

## NOT covered
- Deadline timeouts at high contention (unchanged). Real delete-pending Windows race only exercised by the stress replay and injection.
