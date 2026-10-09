# Verdict — parallel-heartbeat-tenancy

**VERDICT:** PASS
**Cycle checked:** 0
**Manifest:** qa/manifests/parallel-heartbeat-tenancy.md (`ready-for-check`, fix cycle 0)
**Contract:** qa/contracts/parallel-heartbeat-tenancy.md
**ISSUES-WRITTEN:** none
**Checked:** 2026-10-09

Scoped PASS for the heartbeat accessor regression-coverage unit. The checker independently read the issue's complete recorded evidence, source, test, prior verdict, tenantScope implementation, and mutation safety helper. The production API adds optional Db injection while preserving ordinary callers and tenant-required behavior. The test fake shares both tenants and applies only received driver filters, so the real accessor must enforce scope. C1–C4 pass; C5–C7 evidence follows.

Independent baseline command (Node is the bundled executable):

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["--test","--test-concurrency=1","--import","tsx","packages/db/src/collections/watch-heartbeat.test.ts","scripts/watch/lib/heartbeat.test.mjs","apps/api/src/routes/health.test.ts"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);process.exit(r.status??1);'
```

```text
tests 41
pass 41
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 1735.7065
exit 0
```

Breakdown: shipped accessor 6/6; pure heartbeat writer/detector helpers 16/16; immediate downstream health consumer 19/19. The health file includes concurrently built ISS-368 cases, which were present during this check. No full suite or live Mongo/provider/browser work ran.

D-015 floor: **ISS-U4BHB-001: 1/1 recorded mutation detected; none omitted.** The ledger has one mutation in `evidence`, no separate reproductions array. Its replacement was applied verbatim:

```typescript
void tenantId; void scopedCollection; return getDb().collection("watch_heartbeat") as unknown as ReturnType<ReturnType<typeof scopedCollection<WatchHeartbeat>>>;
```

The preimage was adapted from historical `scopedCollection(getDb(),...)` to current `scopedCollection(db,...)`; the replacement itself was unchanged. It failed 6/6 accessor tests because `getDb()` was disconnected. That result alone would not prove leak detection. A separately reported semantic mutation used `db.collection("watch_heartbeat")`, accepting/discarding the tenant: it failed 6/6, with the first assertion showing both owner and victim rows where only owner was expected. A crafted direct foreign-tenant query also returned the victim row. This supplies the missing security falsification.

Mutation command:

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' qa/heartbeat-tenancy-checker.mjs
```

```text
CASE isolated-baseline exit=0 timeout=false; 6 passed, 0 failed
CASE ISS-U4BHB-001 exact ledger replacement; changed preimage only exit=1 timeout=false; 0 passed, 6 failed
CASE adapted injected-db raw-handle semantic leak exit=1 timeout=false; 0 passed, 6 failed
CASE forged document id reaches scoped write exit=1 timeout=false; 4 passed, 2 failed
CASE list helper bypasses scoped accessor exit=1 timeout=false; 3 passed, 3 failed
CASE restored-baseline exit=0 timeout=false; 6 passed, 0 failed
ISS-U4BHB-001 corpus 1/1 detected; additional semantic mutations 3/3 detected
LIVE unchanged byte-identical sha256=aa5dd715e2e49997c65ef7faac96a32889df428bbbf8d341bcf76f16ef3baf50
exit 0
```

Mutation safety: only an isolated copy under `packages/db/.checker-heartbeat-tenancy` was mutated, preserving source-relative imports. Every test process had a 30-second timeout. Each mutation was armed with an on-disk byte backup before writing; a `finally` and SIGINT/SIGTERM handlers restore on failure/timeout/interrupt. Every restore compared Buffer bytes and reported the same SHA256 above. The live source was never mutated and was verified unchanged. The known scratch target was checked before cleanup; `Test-Path` returned False afterward. `mutate.mjs` cannot arm this builder's dirty source safely, so its committed-HEAD restore was deliberately avoided.

Independent bounded package typecheck:

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["node_modules/typescript/bin/tsc","--noEmit","-p","packages/db/tsconfig.json"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);console.log("db typecheck exit",r.status??1);process.exit(r.status??1);'
```

```text
db typecheck exit 0
```

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/lib/mutate.mjs assert-clean
git diff --check -- packages/db/src/collections/watch-heartbeat.ts packages/db/src/collections/watch-heartbeat.test.ts qa/contracts/parallel-heartbeat-tenancy.md
```

```text
MUTATIONS CLEAN: none outstanding
diff-check exit 0 (Git emitted only its existing LF-to-CRLF advisory)
```

Limitations: offline driver-boundary coverage is established, not a real Mongo integration run. All-repository integration/structure gates remain the orchestrator's responsibility. No ledger status was changed, no unrelated notifier/scheduler issue was closed, and no source changes were made by this checker. The builder may close the cycle-0 manifest after this matching PASS; the parent owns ledger reconciliation.
