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

# Cycle 1 (repair re-check), head 7bbccd60, code head cd9f3b03 - coordinator B
Attribution: claude-sonnet checker coordinator B. Results: qa/verdicts/wa-sync-scheduler.b.md (cycle-0 verdict archived as .b.r0-1.md). Raw evidence: qa/evidence/wa-sync-scheduler-b/c1-*.

| check | command / scope | code hash | env | result |
|---|---|---|---|---|
| unit tests | `node --test --import tsx scripts/whatsapp/sync-links.test.mjs` (git archive HEAD copy, junctions, @lkb -> copy packages) | sync-links.mjs ed8d21f092679b6eab5fd9bf5de45c9ef80778b8 | node 24, no prod | 25/25 |
| real Mongo | same + sync-links.mongo.test.mjs, W9_TEST_MONGO_URL = private mongod 7.0.24 replica set 127.0.0.1:28817 (stopped) | same | throwaway dbs lkb_test_w9_* | 26/26 |
| D-015 probes | cycle-0 probe-single-link-tenant.mjs and probe-env-tenant.mjs verbatim (URL only changed) | same | private replica set | listed [solo-tenant], unlink confirmed, flag unset |
| wired probes | c1-probe-wired.mjs S1 flags, S2 mid-run suspension, S3 held vs ENOTDIR lock, S4 unlink retries | same | private replica set | ALL PROBES OK |
| falsification | c1-mutation-runner.mjs, per-mutation in-memory backup, HEAD blob check after each | restored every time | copy only | 9/9 red-after, 0 survivors |
Remaining: none. Processes: only the private mongod (PID 14244, stopped); junctions unlinked with rmdir, copy deleted.
Process incident (disclosed): setup first extracted `git archive HEAD` into the shared scratchpad dir `copy/` that another checker's files (w9chkA-*) were using, replaced that copy's `apps/api/node_modules` junction with a directory of junctions, and deleted a shared `mongo-data/` dir (its mongod had already stopped, log idle since 17:22). Contents of that copy were not read beyond file names; all later work used scratchpad/wa9-chkB-c1/ and port 28817 (a first mongod on 27399 collided with an unrelated listener, was killed by PID and restarted elsewhere).
