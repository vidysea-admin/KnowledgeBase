# w23-t059replay: ISS-T059REPLAY-001 historical replay must not replace the flywheel head

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w23-t059replay (branch lane/w23-t059replay)
Base SHA: 3c99337f
Candidate SHA: see the lane's HEAD commit

## Changed paths
- apps/api/src/evaluation-flywheel/workflow.ts (promotion guard)
- apps/api/src/evaluation-flywheel/workflow.test.ts (2 new tests)

## Finding on arrival
The sequential recorded reproduction (replay of a completed first request after second) was already refused on base by the
early return on `lastRetestId && !interruptedRequest`, and the existing test "ISS-T059REPLAY-001 recorded historical-request
replay..." passes on base. The remaining hole: an interrupted older request (failure.requestId matches) bypasses that early
return and its terminal promotion wrote `lastRetestId = childId` over a newer head, guarded only by the revision CAS.

## Fix
At terminal promotion, after `checkLock()` (revision/lease CAS fence), read the current head child; if it is strictly newer
(createdAt) than the child being promoted, release lease/failure but leave `lastRetestId` and `stage` unchanged. The write is
still the revision-predicated `replaceGap`.

## D-015
ISS-T059REPLAY-001: 1/1 recorded reproduction (historical-request-replay-regresses-current-head) holds: head stays on second,
first child returned, zero head writes, no intake/index/ask calls. The reproduction_script's later sections (route auth,
factory guards, drift) are outside this issue's recorded reproduction list and were not rerun.

## Checks a checker must run (from apps/api)
- node --test --import tsx src/evaluation-flywheel/workflow.test.ts : 24 tests, 24 pass (22 existing + 2 new)
- node --test --import tsx src/evaluation-flywheel/router.test.ts composition.test.ts test-fixture.test.ts receipts.test.ts : 9 pass
- tsc --noEmit -p apps/api/tsconfig.json : exit 0
- node scripts/lint-loc.mjs --all : exit 0, 10 stages OK, 0 failed

## Mutations (D-020, per-mutation backup)
- M1 force `historical=false`: new interrupted-older test fails (pass 23, fail 1). Restored, cmp identical.
- M2 drop `&& !interruptedRequest` early-return condition: 2 tests fail. Restored, cmp identical.

## Not done
The concurrent test (15 iterations) passes in-process; the in-memory fixture is single-threaded so it exercises
interleaving at await points, not true multi-process races.
