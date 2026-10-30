# Checkpoint (coordinator B) - wa-sync-scheduler, cycle 0, head b2fe2241
Attribution: claude-sonnet checker coordinator B. Results are in qa/verdicts/wa-sync-scheduler.b.md; raw evidence in qa/evidence/wa-sync-scheduler-b/.

| check | command / scope | code hash | env | result |
|---|---|---|---|---|
| unit tests | `node --test --import tsx scripts/whatsapp/sync-links.test.mjs` (20 tests), git archive HEAD copy with node_modules junctions | sync-links.mjs 5e1f721fce00c7d61d15a64845322bd0cd39b337; test a53acd3fb85134c2e3516186456f0720e927e6b4 | node 24, no network, no prod | 20/20 pass |
| real Mongo | same + `sync-links.mongo.test.mjs`, W9_TEST_MONGO_URL = private mongod 7.0.24 replica set 127.0.0.1:27199 (stopped) | mongo test 4c704c155bc7e56c661a84d5a2ab6ce17fed07d2 | throwaway db lkb_test_w9_* | 21/21 pass |
| falsification | qa/evidence/wa-sync-scheduler-b/mutation-runner.mjs, per-mutation backup, HEAD-fidelity after each | 5e1f721f restored every time | copy only | 8 floor red, W9-1b and W9-3b red, M1c survives (equivalent), MO1 survives (P2) |
| probe 1 | probe-single-link-tenant.mjs | head | private replica set | tenants [] and no unlink: FAIL W9-7 |
| probe 2 | probe-env-tenant.mjs | head | private replica set | env tenant unlink confirmed |
Remaining: none. Processes: only the private mongod (Windows PID 12084), stopped by this run.
