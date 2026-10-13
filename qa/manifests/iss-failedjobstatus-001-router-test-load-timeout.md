# Manifest: iss-failedjobstatus-001-router-test-load-timeout

**Handshake status:** ready-for-check
Fix cycle: 0
**Lane:** actflake (branch lane/actflake, base 16d20ec9)
**Issue:** ISS-FAILEDJOBSTATUS-001 (medium, test-stability)

## Scope
Test-only. `apps/api/src/activity-health/router.test.ts` "actual producer -> Python ..." test: the Python producer child was spawned with a fixed 5000 ms `spawnSync` timeout, which under full-suite load killed the child (`child.status === null`, assertion `null !== 0`), leaving the queue transport (10 s) to raise "upload queue operation timeout". No production code or timeout touched.

## Files
- apps/api/src/activity-health/router.test.ts: spawnSync timeout 5000 -> 90000; queue transport timeoutMs 10000 -> 120000 (must outlive child); test timeout 20000 -> 150000.

## Criteria
1. Test passes in the full apps/api suite every time.
2. A genuinely failing producer still fails the test (status assertion retained).

## Evidence
- Full suite x3 (`node --test --import tsx src/**/*.test.ts`, 75 files, D2_FIXTURE_PYTHON=main .venv): 801 tests / 801 pass / 0 fail, in all three runs.
- Mutation (python fixture `second['attempts']==2` -> `==3`, file alone): pass 2 / fail 1, `1 !== 0`; restored, cmp ok and git hash-object equal to original.
- Not reproduced pre-fix in this lane (load-dependent); fix removes the fixed 5 s dependence.
