# Checkpoint (coordinator B) - ua-admin-api, cycle 0

Evidence identity, per completed check. Base 7a4ed51a, checked head cc08950f (code 71f950c2). Environment: Windows 11, node 24.13.1, tsx 4.23.13, mongod 7.0 loopback 127.0.0.1:27981 (own dbpath, stopped). Execution tree: `git archive cc08950f` copy in the checker scratchpad, source blobs verified equal to `HEAD:<file>` for admin-router.ts, admin-service.ts, admin.testsupport.ts, admin-router.test.ts, admin.mongo.test.ts, create-admin.mjs, create-admin.test.mjs, structure.config.json. Dependency lock: pnpm-lock.yaml at cc08950f (node_modules from the main checkout). Attribution: checker coordinator B (claude-sonnet-subagent), this file.

| check | command / scope | result |
|---|---|---|
| router suite | `node --test --import tsx src/user-accounts/admin-router.test.ts` (apps/api), 20 collected | 20 pass |
| real-mongod suite | `LKB_UA_ADMIN_MONGO_URI=mongodb://127.0.0.1:27981 ... admin.mongo.test.ts`, 8 | 8 pass |
| script suite | same URI, `node --test --import tsx scripts/create-admin.test.mjs`, 10 | 10 pass |
| typecheck | `npx tsc --noEmit -p tsconfig.json` (apps/api) | exit 0 |
| structure lint | `node scripts/lint-loc.mjs --all` in copy | 9/10 stages OK; `dependencies` stage environment ENOENT (copy junction layout), UNVERIFIED |
| manifest lint | `tick.mjs --lint-manifest qa/manifests/ua-admin-api.md` | exit 0 |
| probes (http) | probe-b.test.ts (9 subtests: proto/extra keys, odd ids, tenant swap, issue-link headers/leak/host spoof, self actions, key with user-admin, member self-escalation, 30x in-instance cross) | 9 pass |
| probes (real mongod) | probe-b.mongo.test.ts: 60 mixed-route + 60 three-admin ring rounds, separate service instances | never zero admins |
| probe audit failure | probe-b2.test.ts | 503, state changed, 0 events, retry 409 (P1) |
| falsification | falsify_b.py M1,M2,M2b,M3,M4,M4b,M5,M6,M7 per-mutation backup + HEAD-fidelity | 9/9 KILLED, all restored |

Probe files and the harness live only in the checker scratchpad, not in the bound tree.
