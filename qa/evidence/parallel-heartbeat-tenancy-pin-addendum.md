# Independent pin-completeness addendum — parallel-heartbeat-tenancy

Date: 2026-10-09
Reviewer: /root/contract_gate_reconcile
Purpose: Explicitly bind current source and previously unpinned test bytes to a fresh
authorized focused review. This is an evidence addendum, not a new checker PASS, a
replacement of the historical cycle0 verdict, a ledger change or release acceptance.

Read `qa/manifests/parallel-heartbeat-tenancy.md` and the independent cycle0 PASS
`qa/verdicts/parallel-heartbeat-tenancy.md`. Their original accepted focused count is
41/41: DB accessor6, pure heartbeat16, downstream health19. The verdict explicitly pins
the source to aa5dd715e2e49997c65ef7faac96a32889df428bbbf8d341bcf76f16ef3baf50,
but supplies no explicit historical per-file SHA256 for watch-heartbeat.test.ts.
Therefore this addendum does not invent an earlier test pin or assert historical test
byte equality. It independently rereads and re-executes the CURRENT six accessor tests,
including positive two-tenant cases, forged filter/id/write fields, upsert/refreshed
identity and empty-tenant refusal, with their immediate downstream focused tests.

## Exact bounded command and literal summary

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["--test","--test-concurrency=1","--import","tsx","packages/db/src/collections/watch-heartbeat.test.ts","scripts/watch/lib/heartbeat.test.mjs","apps/api/src/routes/health.test.ts"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);console.log("pin-completeness focused exit",r.status??1);process.exit(r.status??1);'
```

Executed once with require_escalated auto-approval because the prior local sandbox Node
spawn restriction is established. Serial test-file concurrency, local fake fixtures,
no live services/provider/browser/full-suite/mutations.

```text
ℹ tests 41
ℹ suites 0
ℹ pass 41
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2359.5876
pin-completeness focused exit 0
```

Focused breakdown confirmed from current named output: accessor6/6, pure helpers16/16,
health consumer19/19. Historical recorded mutation outcomes are retained in the original
verdict; this pin-completeness run does not claim they were rerun.

## Current reviewed checkpoint pins

```text
packages/db/src/collections/watch-heartbeat.ts aa5dd715e2e49997c65ef7faac96a32889df428bbbf8d341bcf76f16ef3baf50
packages/db/src/collections/watch-heartbeat.test.ts c20829eddea92c65f75b0275df51ab7d0dbf9c2f6494fc49f101a4a9d5b550ef
scripts/watch/lib/heartbeat.test.mjs 1eece4bd7bdfdec906c440d95c6fbf97faa9de528ce01d8193294b87dfeecab9
apps/api/src/routes/health.test.ts 0cabf50ecfa7c23d0ad930ed4470c2779a0a4e3b5b0fdc32ede4a8aa024650da
scripts/watch/lib/heartbeat.mjs 6d2072216f5db25fce0eeb6feb33357046500cac1354883f5f95594a29a1bd91
apps/api/src/routes/health.ts 21c9705cff4df82d8123634b25e7b4e493698f5f176c367ec135c0561bf10d1d
```

Both assigned heartbeat source/test hashes were measured before and after the run and
unchanged. Source matches historical independently accepted cycle0 pin exactly. Current
test pin is now independently reviewed against the actual production accessor. Remaining
files above identify current supporting boundary evidence; no claim that unpinned
historical downstream source bytes equal this checkpoint is made.

No source edits, ledger/contracts changes, staging, commit or publishing occurred.
Overall release/global structure/ISS-368 acceptance limitations remain unchanged.
