# T-061 frozen fixture candidate

Cycle: 0
Status: in_progress (not checker READY)
Pin inventory: qa/packets/goal-t061-pins.json
Expected backend cases: 20
No external target calls or real database writes.

Command: node --import tsx --test --test-concurrency=1 --test-timeout=20000 packages/core/src/domain/automation-monitor.test.ts apps/api/src/automation/runtime.test.ts apps/api/src/automation/router.test.ts apps/api/src/automation/form-runtime.test.ts apps/api/src/automation/form-router.test.ts apps/api/src/automation/factory.test.ts

Production route freeze and full-task live acceptance remain separate.

Latest pre-verdict source snapshot: qa/packets/goal-t061-repair2-pins.json (235pins, backend21), and qa/packets/goal-t061-ui4-pins.json (10pins, UI4). Older commands above are historical specifications; fresh broker receipts required for changed bytes.
