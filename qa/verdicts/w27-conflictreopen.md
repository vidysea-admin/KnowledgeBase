# Verdict: w27-conflictreopen (ISS-T056CONFLICTS-006)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 137d850f755568482cf5e7760815419873d176b0
Base SHA: 4264418c7488d95e76bc0d86e3920efb0e0ccd72

## Checks (independent)
1. Atomicity: mongo-store.ts reopenSuperseded filters `{_id, tenantId, status: "superseded"}` in one updateOne, so a concurrent acknowledge (status != superseded) matches 0 and is not overwritten. In-memory store checks status on the same tick. OK.
2. ISS-004: service reopens only when `item.status === "superseded"`; test "human decisions stay final" (acknowledged not reopened after version bump) passes in both stores. dismissed is not superseded, so the same guard covers it.
3. Tenancy: in-memory is per-tenant map; mongo ANDs tenantId into the filter, plus an early guard on reopened.tenantId/id/status. OK by reading.
4. Fake `$unset`: deletes listed keys after `$set`, no-op for absent keys, matches Mongo for these disjoint paths. OK.
5. D-015: the row records one reproduction (p1+p2 flip to match p1, then flip back). It is replayed verbatim in "superseded conflict item reopens..." in both stores: 1/1 each.
6. Commands (exit codes in scratchpad w27c/): `node --test` mongo-store.test.ts + service.test.ts, timeout 600: exit 0, pass 28 fail 0. `tsc --noEmit -p apps/api`, timeout 600: exit 0.
7. Own mutation M-T: dropped `tenantId` from the mongo reopenSuperseded filter. Backup, trap (EXIT/INT/TERM/ERR) and timeout 600 used. Result: mongo-store.test.ts pass 16 fail 0, so the mutant SURVIVED. Restored; `git -c core.autocrlf=true hash-object` = 922e6ab6ee529e08a06e9dbae3b80883386f1bf3 = HEAD blob. Tree clean.

## Finding (note, not blocking)
mongo-store.test.ts:~214-215: both cross-tenant assertions are stopped by the early guard (`reopened.tenantId !== tenantId`), so the filter's tenantId predicate has no test. Production code is correct; this is a test-strength gap in a tenancy-class seam. Fix: add `assert.equal(await store.reopenSuperseded("tenant-a", b.id, { ...b, tenantId: "tenant-a", status: "open" }), false)` (tenant-b's superseded id, a self-consistent tenant-a payload) and assert tenant-b's item is unchanged. This kills the mutant. Fold into the next unit touching this file.

ISSUES-WRITTEN: none
Ledger: ISS-T056CONFLICTS-006 may flip to verified/closed.
Not verified: real Mongo semantics (no Mongo allowed), lint-loc, tracker audit, maker's M1/M2 mutations (not re-run).
