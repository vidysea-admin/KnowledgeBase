# Checkpoint: iss394-api-acl-timeout-retry (coordinator A) · cycle 0 · policy .17
Checker attribution: claude-sonnet-subagent, qa/verdicts/iss394-api-acl-timeout-retry.md. Environment: win32, node v24.13.1, tsx from main node_modules (junction), archive of b714c5e5.
Code hashes: apps/api/src/bot-privacy/private-acl.ts blob 53ac2c2320238228b2f8c0b836d49338de9296ee; private-acl.test.ts blob 9b30808 (per manifest).
| check | command / scope | result |
|---|---|---|
| C1/C2 unit | node --test --import tsx apps/api/src/bot-privacy/private-acl.test.ts (1 test) | pass 1 |
| base red | same test, base b3eabbee private-acl.ts | fail |
| sibling | apps/api/src/bot-privacy/router.test.ts (4 tests) | pass 4 |
| sibling | apps/api/src/source-intake/jobs/privacy.test.ts (14 tests) | pass 12, skip 2 |
| fail-open probe | scratchpad probe.test.ts, 16 cases | pass |
| mutants (copies) | retry_any_error, retry_twice, retry_discards_second, second_result_ignored_success, base | all red |
Not run: full suite (unit check rule), ajv/pdfjs-dependent suites (ISS-396, not needed). No RERUN-BLOCKED among needed tests.
Cleanup: junctions removed, copy deleted, main node_modules intact.
