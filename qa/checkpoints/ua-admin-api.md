# Checkpoint - ua-admin-api (coordinator A) - cycle 0
Head cc08950f, base 7a4ed51a. Policy proportional-verification/2026-10-19.17. Environment: node v24.13.1, mongod 7.0 local throwaway 127.0.0.1:27961, scratch copy of git archive cc08950f.
Code blobs at HEAD: admin-service.ts 7d1baca7, admin-router.ts fd35ece0, create-admin.mjs 6071f02e; tests per manifest: admin-router.test.ts 886e41b5, admin.mongo.test.ts 3b483573, create-admin.test.mjs 01962af7.
Completed checks (command -> result): admin-router.test.ts -> 20/20; admin.mongo.test.ts (LKB_UA_ADMIN_MONGO_URI) -> 8/8; create-admin.test.mjs -> 10/10; tsc --noEmit apps/api -> exit 0; pnpm lint:structure (bound tree) -> 9 stages ok, dependencies stage fails: no node_modules in the worktree; real script refusals (no DB, prod name without flag, --password=, empty stdin) -> exit 1 as designed; own probe chk-probe.test.ts (scratch only) -> 3/3 (P1 evidenced).
Falsifications (copy, per-mutation backup): M1 M1b M2 M3 M4 M5 M7 M9 (router/service, memory) M6 M6b (script) M8 (real mongod) -> all KILLED by assertions; end-state blobs equal HEAD blobs.
Attribution: coordinator A only; no sub-checkers; the dual partner's evidence was not read.
