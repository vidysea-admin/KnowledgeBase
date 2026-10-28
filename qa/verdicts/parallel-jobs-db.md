# Independent verdict — parallel-jobs-db

Cycle checked: 0
Date: 2026-10-09
Checker: /root/contract_gate_reconcile (independent of DB maker)
VERDICT: PASS
Scope: DB reader unit only; full jobs feature, T-057, production composition and release acceptance remain pending.

## Plan and assessed evidence

Parent authorized this new read-only DB seam, default50/max100 application provider ledger,
NORMAL mode and independent offline checks. Ground truth: parallel-jobs-read.md, its canonical
machine contract and parallel-jobs-db.md. Maker cycle0 ready-for-check read independently.
Only affected bounded checks ran; no full suite, DB/provider/browser or shared-tree mutation.

- DB1 PASS: Read actual jobs/scopedCollection/withTenant implementation. Real accessor fixture
  records owner/victim/missing exact tenant filters, preserves positive owner rows, excludes
  newer foreign rows, overrides conflicting caller tenant filter and refuses empty tenant
  before find. API store's real-accessor fixture independently proves A/B filter binding.
- DB2 PASS: Actual cursor projection/order/limit+1 call assertions, ties, createdAt precedence,
  default50/fetch51, runtime invalid values before collection, and empty/below/exact/extra
  cases at limits1/100. No global count or upload queue read is introduced.
- DB3 PASS: Explicit six-field inclusion projection and independently constructed summaries;
  projection-ignoring poisoned driver cannot leak raw fields. Malformed fields and malformed
  extra row reject the page. Test source read independently; no weakenings or skips identified.
- DB4 PASS: Source performs reads only. Additional independent database-shaped seam exercises
  find and toArray failures through BOTH actual listJobs and actual API adapter: identical
  error propagates, owner filter exact, no empty-success. Actual router catch was read and
  returns fixed503; real HTTP sanitization acceptance belongs to central integration checker.
- DB5 scoped boundary PASS / central integration DEFERRED: Real jobs accessor -> actual
  createMongoJobsReadDeps -> database-shaped cursor exercised by store.test.ts and independent
  failure harness. Current adapter imports the source accessor directly. Barrel/production/
  actual mounted HTTP/client/UI composition are integrator obligations; none are PASSed here.
  This scoped result uses the parent READY direction permitting adapter checks while central
  integration is unfinished. It does not waive parent criterion8.

## Independently executed commands and literal output

Node executable for commands below:
`C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Each run uses node --input-type=module -e with this bounded child wrapper:

```javascript
import {spawnSync} from "node:child_process";
const r=spawnSync(process.execPath, ARGS, {stdio:"inherit",timeout:TIMEOUT});
if(r.error)console.error(r.error.message);
console.log(LABEL,r.status??1);process.exit(r.status??1);
```

Affected test ARGS:
`["--test","--test-concurrency=1","--import","tsx","packages/db/src/collections/jobs.test.ts","apps/api/src/jobs/store.test.ts"]`; TIMEOUT60000; LABEL `bounded affected exit`.
Initial sandbox attempt exited1 at file spawning with `Error: spawn EPERM`; no product
assertions executed, so that attempt is infrastructure failure. Exact bounded retry was
auto-approved with require_escalated and returned:

```text
✔ jobs store requests only bounded sorted metadata and projects poisoned fields (2.8749ms)
✔ jobs store empty/below/exact/extra pages and cap100 have truthful truncation (0.9763ms)
✔ jobs store refuses invalid limits/tenants before accessor and rejects malformed fetched rows (1.5921ms)
✔ real jobs accessor binds tenant filter before sorting and projection at DB boundary (13.4523ms)
✔ jobs uses real scoped accessor; each owner sees only own rows including newer foreign row (4.3833ms)
✔ query projection, sort, limit+1 and deterministic same-time id tie ordering are exact (0.5926ms)
✔ empty, below, exact and extra rows report truncation precisely at limits 1 and 100 (2.4879ms)
✔ all schema statuses and valid offset/leap dates are accepted; createdAt sorts before id (0.5381ms)
✔ default page is 50 and fetches 51; invalid bounds fail before collection access (2.3329ms)
✔ metadata excludes poisoned payloads even when driver returns unprojected rows (0.4262ms)
✔ malformed required/optional summary fields and malformed extra row reject the page (1.1994ms)
✔ empty tenant is refused before find and never falls back to unscoped rows (0.385ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1519.274
bounded affected exit 0
```

Scoped typecheck ARGS:
`["node_modules/typescript/bin/tsc","--noEmit","-p","packages/db/tsconfig.json"]`; TIMEOUT60000; LABEL `bounded DB typecheck exit`.

```text
bounded DB typecheck exit 0
```

Independent harness ARGS:
`["--import","tsx","qa/evidence/parallel-jobs-read/db-independent-boundary.mjs"]`; TIMEOUT30000; LABEL `boundary evidence exit`.

```text
independent find: DB reader and real API adapter propagate original failure; exact owner filters; PASS
independent toArray: DB reader and real API adapter propagate original failure; exact owner filters; PASS
independent failure boundaries 4/4 pass; no empty-success, writes or external calls
boundary evidence exit 0
```

`python contracts/verify_contracts.py` (exit0):

```text
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

Vacuity is not product-quality proof. `git diff --check -- packages/db/src/collections/jobs.ts packages/db/src/collections/jobs.test.ts` exited0 with no output; these new files are untracked, so that command is not a tracked-diff audit of their content.

## Checked identity

DB source/test hashes match root READY and were unchanged after checks. Other inspected
boundary files were also hashed before/after checks without drift:

```text
packages/db/src/collections/jobs.ts bd5c7e1bc5528022074a6c30b7111f21ffea1e086ebdb2de9718da6d97f880a2
packages/db/src/collections/jobs.test.ts 12704e7e8187922d1676f7a01eb8bb7861e7ebdd4be71e5a28726d7e3b5a88f7
apps/api/src/jobs/store.ts d28f40b17eddf581af62e7c973d91417571dc5b28ceb429dfc1e5658021fe03a
apps/api/src/jobs/store.test.ts a1a4856c176ac672b21df925506c7806875cc7a34bc682e06ac8edf801f57b14
apps/api/src/jobs/router.ts bd892a34c3b11061de78e2e4bf2405ebc7b56bcf5aa850387ee7ac661b84f075
packages/db/src/lib/tenantScope.ts 4ab0c4f2cade1d46e343b3e2def9035511cd112cf5f16cb7cc015369954c483d
```

ISSUES-WRITTEN: none
LIVE-HANDLES: none; bounded child processes completed.
REMAINING: Central integration acceptance, actual HTTP/client/UI evidence, broader applicable
checks and live operational proof remain with root. No T-057 status change, ledger update,
source edit, contract weakening, production publication or full-feature PASS performed.
