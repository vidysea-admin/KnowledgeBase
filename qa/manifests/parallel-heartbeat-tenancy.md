# Manifest — parallel-heartbeat-tenancy

**Status:** checked-PASS
**Fix cycle:** 0
**Backlog tier:** 2 — high security-class coverage issue ISS-U4BHB-001; uncapped.
**Authorization:** Umesh approved normal mode with separate builders and independent checkers, and parallel execution. Parent assigned these three paths exclusively.
**Issue:** ISS-U4BHB-001 in qa/issues.u4bhb.jsonl. This closes a coverage hole; the shipped accessor already scopes correctly.

Owned files:

- packages/db/src/collections/watch-heartbeat.ts
- packages/db/src/collections/watch-heartbeat.test.ts
- qa/manifests/parallel-heartbeat-tenancy.md

Changes: optional Db arguments default to the existing getDb() on the accessor, list, find, and mark operations. Existing call sites and tenant-required signatures continue to work. Tests inject a stateful two-tenant fake at the database boundary and execute the real production accessor and scopedCollection; the fake applies received filters without independently enforcing tenancy. Tests cover tenant-isolated list/find, forged tenant/id reads, foreign document write fields, scoped upsert, repeat refresh, and rejection of empty tenant identifiers. No production DB, external provider, governance, ledger, contract, or downstream route changes.

Proposed checker criteria: the actual collection accessor filters every read/write by its tenant; forged document ids/tenant values never change a foreign row; upsert adds exactly one correctly scoped row; repeated marks refresh; runtime test catches the issue's raw-handle replacement. qa/contracts/health-route.md and qa/contracts/loop-safety.md were read. No existing dedicated heartbeat contract was found; contract authorship remains checker-owned.

Evidence (2026-10-09, bundled Node executable):

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["--test","--test-concurrency=1","--import","tsx","packages/db/src/collections/watch-heartbeat.test.ts","scripts/watch/lib/heartbeat.test.mjs","apps/api/src/routes/health.test.ts"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);process.exit(r.status??1);'
```

```text
heartbeat accessor: 6/6 passed
pure heartbeat writer/detector functions: 16/16 passed
downstream health consumer: 19/19 passed (includes concurrently built ISS-368 cases)
tests 41
suites 0
pass 41
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 7813.3534
exit 0
```

The first sandbox attempt failed before TypeScript tests executed with spawn EPERM; an isolation-none retry still hit esbuild spawn EPERM (pure .mjs 16/16 passed). The exact bounded command above was allowed with require_escalated and then passed. Those environment failures are not credited as product evidence.

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["node_modules/typescript/bin/tsc","--noEmit","-p","packages/db/tsconfig.json"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);console.log("db typecheck exit",r.status??1);process.exit(r.status??1);'
```

```text
db typecheck exit 0
```

Scoped budget check read structure.config.json and counted actual nonblank lines/direct files:

```text
packages/db/src/collections/watch-heartbeat.ts: 63 nonblank lines; budget 300
packages/db/src/collections/watch-heartbeat.test.ts: 90 nonblank lines; budget 400
packages/db/src/collections: 20 files; budget 30
git diff --check -- packages/db/src/collections/watch-heartbeat.ts packages/db/src/collections/watch-heartbeat.test.ts: exit 0
```

Issue corpus measurement, per D-015: ISS-U4BHB-001 has exactly one recorded raw-accessor mutation in its evidence field (no separate reproductions array). **0/1 mutation reproductions executed by builder; 1/1 deferred to independent checker**, with reason: mutation ownership reserved for checker and no builder mutation was applied. The original recorded replacement is `void tenantId; void scopedCollection; return getDb().collection("watch_heartbeat") as unknown as ReturnType<ReturnType<typeof scopedCollection<WatchHeartbeat>>>;`. The original target expression now uses injected db. Checker should replay the exact recorded replacement and additionally substitute db.collection("watch_heartbeat") to prove a semantic leak is detected rather than relying on disconnected getDb() failure. Record both separately; adapted mutation never substitutes for the recorded corpus floor.

No source mutation occurred. Checker mutation must use isolated byte-copy or byte backup, a timeout, unconditional restore on error/interrupt/timeout, and byte comparison. Do not restore shared dirty source to HEAD.

Closeout: independent qa/verdicts/parallel-heartbeat-tenancy.md is PASS, Cycle checked 0, matching this manifest's Fix cycle 0. Dedicated checker contract is qa/contracts/parallel-heartbeat-tenancy.md. Checker replayed ISS-U4BHB-001 recorded mutation 1/1 detected and three additional semantic mutations 3/3 detected; independent baseline 41/41 and DB typecheck exit 0. Builder verified the live source SHA256 aa5dd715e2e49997c65ef7faac96a32889df428bbbf8d341bcf76f16ef3baf50 matches checker evidence before this status flip. Full suites and all-repo structure gates remain parent-owned; ledger reconciliation is parent-owned. No commit/push.
