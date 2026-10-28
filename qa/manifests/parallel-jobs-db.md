# Manifest — parallel-jobs-db

**Status:** checked-PASS
**Fix cycle:** 0
**Backlog tier:** 3 — T-057 provider-audit read slice, new seam with zero prior PASSes.
**Authorization:** Umesh approved NORMAL mode with independent checkers and parallel builds; parent assigned these three files.
**Contract:** qa/contracts/parallel-jobs-read.md; canonical machine specification qa/evidence/parallel-jobs-read/contract.json.

Owned files: packages/db/src/collections/jobs.ts, packages/db/src/collections/jobs.test.ts, this manifest. Builders did not edit the contract.

`jobs(tenantId, db?)` wraps the unchanged `scopedCollection<Jobs>` for the standard application database; injected Db defaults to the existing connected database. `listJobs(tenantId, limit=50, db?)` validates integer bounds 1..100 before accessing the collection, finds within the tenant filter, projects exactly `_id/kind/status/provider/createdAt/updatedAt`, sorts createdAt descending then _id descending, and fetches limit+1. It validates every fetched summary, including the extra row, defensively constructs whitelisted objects, and returns `{jobs,limit,truncated}`. No raw handle, new writer, raw payload, cost, credential, lease, tenant metadata, upload-queue connection, or background dispatch is introduced by the reader.

Coordinated API builder /root/registration_security: existing scopedCollection.find accepts only a filter, so the cursor uses `.find({}).project({...}).sort(...).limit(...).toArray()`, rather than adding unsupported find options or changing the shared helper. API adapter can inject this exact tenant accessor and independently validate/project at its boundary. Barrel export and production composition belong to the single integrator.

Offline test evidence, 2026-10-09 (executed with require_escalated because local tsx/esbuild process spawning previously hit sandbox EPERM):

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["--test","--test-concurrency=1","--import","tsx","packages/db/src/collections/jobs.test.ts"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);process.exit(r.status??1);'
```

```text
jobs uses real scoped accessor; each owner sees only own rows including newer foreign row: PASS
query projection, sort, limit+1 and deterministic same-time id tie ordering are exact: PASS
empty, below, exact and extra rows report truncation precisely at limits 1 and 100: PASS
all schema statuses and valid offset/leap dates are accepted; createdAt sorts before id: PASS
default page is 50 and fetches 51; invalid bounds fail before collection access: PASS
metadata excludes poisoned payloads even when driver returns unprojected rows: PASS
malformed required/optional summary fields and malformed extra row reject the page: PASS
empty tenant is refused before find and never falls back to unscoped rows: PASS
tests 8; suites 0; pass 8; fail 0; cancelled 0; skipped 0; todo 0
duration_ms 706.1331
exit 0
```

Fake DB receives the real production accessor filter and applies only that filter; it holds owner and victim rows together, with the newer foreign row deliberately preceding owner rows. The fake never adds a tenant restriction of its own. It captures exact projection/sort/fetch-limit and has no write methods. A separate poisoned-driver response ignores projection deliberately to test defensive whitelisting.

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {spawnSync} from "node:child_process";const r=spawnSync(process.execPath,["node_modules/typescript/bin/tsc","--noEmit","-p","packages/db/tsconfig.json"],{stdio:"inherit",timeout:60000});if(r.error)console.error(r.error.message);console.log("db typecheck exit",r.status??1);process.exit(r.status??1);'
```

```text
db typecheck exit 0
```

Final tested bytes and scoped budgets (read structure.config.json, counted nonblank lines and direct files):

```text
packages/db/src/collections/jobs.ts: 58/300 lines; sha256=bd5c7e1bc5528022074a6c30b7111f21ffea1e086ebdb2de9718da6d97f880a2
packages/db/src/collections/jobs.test.ts: 114/400 lines; sha256=12704e7e8187922d1676f7a01eb8bb7861e7ebdd4be71e5a28726d7e3b5a88f7
packages/db/src/collections: 22/30 files (20 before these two new files)
git status --short -- packages/db/src/collections/jobs.ts packages/db/src/collections/jobs.test.ts:
?? packages/db/src/collections/jobs.test.ts
?? packages/db/src/collections/jobs.ts
```

No mutations or recorded-issue fix corpus: this is a new roadmap seam. No ledger, goals, source schema, auth/shared helper, worker, barrel, production, DB/provider/browser, full suite, commit, or push changes/actions. Source ownership is frozen for independent checking.

Closeout: qa/verdicts/parallel-jobs-db.md independently reports PASS, Cycle checked 0, matching this manifest's Fix cycle 0. Builder verified both live source hashes match the independently checked hashes above before flipping status. Checker ran affected DB/actual API adapter tests 12/12, independent failure boundaries 4/4, DB typecheck exit 0, and contracts/verify_contracts.py exit 0 (explicitly vacuous; not product-quality proof). No source change accompanied this closeout.

Outstanding: accessor -> API adapter -> real HTTP -> client/UI composition; barrel export; broader structure/integration checks. This is a scoped DB PASS; it does not close T-057 or claim feature/release PASS. Integration remains the single integrator's responsibility.
