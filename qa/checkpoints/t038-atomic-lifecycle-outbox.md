# Checkpoint - t038-atomic-lifecycle-outbox (checker, cycle 1, 2026-10-26)

Environment: node v24.13.1 (Windows), tsx via root node_modules, tree = branch docs/devops-golive-2026-10-26 descended from master b3eabbee. Dependency lock: pnpm-lock.yaml unchanged by this check.
Code hashes (sha256 prefix): run-pipeline.mjs c725cce0, lifecycle-alerts.mjs 749c8ada, lifecycle-alerts.test.mjs d0caf840, pipeline.test.mjs a89009b6, alert-kinds.test.mjs 9bc9d788, verify_contracts.py 1240059f.
Data snapshot: none (synthetic fixtures under os tmpdir). Attribution: this checker, evidence dir qa/evidence/t038-atomic-lifecycle-outbox-c1-20261026/.

| Check | Command / scope | Result |
|---|---|---|
| helper + sink/tenant/API | node --test --test-concurrency=1 --test-timeout=60000 --import tsx lifecycle-alerts.test.mjs alert-kinds.test.mjs (11 tests) | 11/11 exit 0 |
| runner consumers | node --test ... pipeline.test.mjs dispatch.test.mjs index-proof-chain.test.mjs (15 tests) | 15/15 exit 0 |
| ledger argv replay | same three files, --test-timeout=30000 (ISS-SCHEDULERRESUME-001 verbatim) | 15/15 exit 0, 5077 ms |
| validator | python contracts/verify_contracts.py | exit 0, vacuous PASS |
| F1 (C1) copy c1 | name pattern "first durable transition save": green-before, then save() before prepare() | red (TypeError reading .map of undefined outbox) |
| F1b (C1 runner) copy c4 | probe-catch test (copy only): green-before, then update() moved into the path catch | red (reason != persistence error) |
| F2 (C2) copy c2 | name pattern "saturated started event survives": green-before, then replay loop emptied | red (actual [] vs capture-started, capture-done) |
| F3 (C3) copy c3 | name pattern "failed channel stays durable": green-before, then every -> some | red (0 vs 1) |
| probe bound-of-eight | copy c4 probe-bound test | green |

Copies lived under the session scratchpad, outside the bound root; the bound tree was never edited (git hash-object == HEAD blob for all four scoped files before and after).
Reuse limits: nothing reused from maker or broker receipts; the 11/11 and 15/15 above were rerun. Not run: full suite (unit check), mutation beyond the floor, provider, browser, database.
