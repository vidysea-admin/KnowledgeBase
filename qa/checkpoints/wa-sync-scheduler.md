# Checkpoint - wa-sync-scheduler (checker A), cycle 0, head b2fe2241

Evidence identity for every check below: code = scripts/whatsapp/sync-links.mjs blob 5e1f721f, sync-links.test.mjs blob a53acd3f, sync-links.mongo.test.mjs blob 4c704c15 (each equal to HEAD); runtime = node with tsx from the main tree's node_modules (junctioned into a `git archive HEAD` copy, then unlinked); config = none; dependencies = main tree pnpm lock; data = throwaway local mongod 7.0.24 replica set w9chkA on 127.0.0.1:27299, db names lkb_test_w9chkA_*, dropped after each test, process stopped; attribution = checker A (this file).

| Check | Command / scope | Result |
|---|---|---|
| Unit tests | `node --test --import tsx scripts/whatsapp/sync-links.test.mjs` (20 tests) | 20 pass |
| Unit + real Mongo | same + `sync-links.mongo.test.mjs` with W9_TEST_MONGO_URL (21 tests) | 21 pass |
| P1 unlink tenant | qa/evidence/wa-sync-scheduler/A-probe-p1-unlink-tenant.mjs.txt | RED (tenants [], pending flag stays) |
| Run-row shapes | A-probe-run-rows.mjs.txt | green: skipped, skipped, failed, partial all pass validators |
| Seed (ISS-WAOWNER-001) | A-probe-seed.mjs.txt | green |
| Falsification x8 + extras x3 | A-mutation-harness.mjs.txt, output A-mutation-run.txt, plus the survivor re-runs of M1c, MO1, L73 over the full 21 tests | 8 killed; 3 survive (M1c equivalent, MO1 redundant, L73 untested) |
| Prod refusal | requireScriptDatabase with lkb/lkb_prod/global_university_db | refused without the production flag |

Remaining: none. Verdict FAIL on W9-7 (P1); a repair re-check needs only W9-7 and the criteria whose input files the repair touches.

## Cycle 1 (repair re-check), head 7bbccd60, code cd9f3b03
Evidence identity: sync-links.mjs blob ed8d21f0, sync-links.test.mjs blob a72b1ae2, sync-links.mongo.test.mjs blob 4c704c15, docs/whatsapp/sync.md blob 1b5e9ac8 (each equal to HEAD, checked in the copy and the bound tree); runtime = node + tsx from the main tree node_modules junctioned into a `git archive HEAD` copy (unlinked after); data = throwaway mongod 7.0 replica set w9chkA2 on 127.0.0.1:27399, stopped by me; attribution = checker A.

| Check | Scope | Result |
|---|---|---|
| Unit + real Mongo | sync-links.test.mjs + sync-links.mongo.test.mjs with W9_TEST_MONGO_URL | 26 pass, 0 fail |
| Cycle-0 probes verbatim | A-probe-p1-unlink-tenant, A-probe-run-rows, A-probe-seed | 3/3 pass (P1 fixed) |
| Lock codes | A-c1-lock-codes.mjs.txt | held=locked, missing dir=lock-failed |
| Falsification | A-c1-mutation-harness.mjs.txt / A-c1-mutation-run.txt, 10 mutants | 10/10 killed |
Remaining: none. Verdict PASS.
