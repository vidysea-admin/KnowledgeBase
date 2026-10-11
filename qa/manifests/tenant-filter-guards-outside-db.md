# Manifest - tenant-filter-guards-outside-db
**Lane:** lane/tenantflt (base 1414d79) - **Ledger shard:** qa/issues.tenantflt.jsonl (ISS-TENANTFLT-001..003, all low, filed not fixed)
**Issue addressed:** ISS-AUTHTENANT-002 (medium; security class: tenancy, defence in depth; full ceremony, uncapped) - **Fix cycle:** 0

## Scope
The tenant-validity guard (`assertValidTenantId`, packages/db) protects only the scoped accessor. Mongo calls that build their tenant filter or stamp their tenant BY HAND outside it carried no validator of their own. This unit enumerates all of them, traces where each tenant value comes from, applies the EXISTING `assertValidTenantId` (exported by `@lkb/db`; no second validator) at the point the filter is built, and documents the sites that must not or need not be guarded. No change to auth.ts, scopes, the accessor, qa/contracts, qa/verdicts, enforcement paths or other ledger rows. No file under packages/ changed (so the junction caveat below is empty of db changes).

## Headline ruling: is any site reachable by a caller-controlled non-string without requireAuth?
**None found.** How checked: (1) `server.ts` mounts exactly three routers before `requireAuth` (compete-page, pages, health); none reads a tenant (static HTML; `/health` returns aggregate counts and takes no tenant). Everything else is mounted after `requireAuth(deps.keyStore)` (server.ts:77) and reads its tenant only from `req.auth!.tenantId`. (2) `grep` of apps/api/src for `req.body|query|params|headers` next to `tenant`: the only hits take a body field that is NOT a tenant (join-rules `body.kind/value/eventId`, route params `:id`, `:claimId`, `groupJid`). No route reads a tenant from the client. (3) Express 5 default query parser is "simple" (string values); `express.json()` can produce objects but nothing reads a tenant from a body. (4) Non-HTTP sources are `process.env` strings (UPLOAD_TENANT_ID, LKB_TENANT_ID, WATCH_HEARTBEAT_TENANTS, always strings), CLI argv strings (`--tenant`), string literals ("toc", "system" = ROUTER_TENANT_ID), or the `api_keys.tenantId` of a stored document - which `requireAuth` validates (previous unit) before it becomes `req.auth`. A string can never act as a Mongo operator. So these guards are defence in depth, as the row says.

## Site table (all hand-built or raw-handle Mongo calls with a tenant field, or on a tenant-owned collection)
| file:line | collection | op | tenant source | guarded by |
|---|---|---|---|---|
| store.ts:45 | api_keys | read | NONE: lookup by `{keyHash}` BEFORE a tenant is known; it produces the tenant | n/a (see "deliberately not guarded") |
| store.ts:61 (`createMongoTreeStore.load`) | tree_index | read | req.auth (ask, compete routes) | **NEW** `assertValidTenantId` -> returns null (route's existing 404), no query |
| store.ts:79 (`createMongoJobWriter`) | jobs | write | router config `tenantId` = req.auth, or "system" | **NEW** guard on `entry.tenantId` |
| store.ts:141 (`loadGraph`) | tree_index (+graph_edges, sessions via accessor) | read | req.auth | **NEW** guard first (the accessors only threw AFTER the raw query was issued) |
| store.ts:210 `listKeys` | api_keys | read | req.auth | **NEW** |
| store.ts:222 `createKey` | api_keys | write | req.auth (body never read for a tenant) | **NEW** |
| store.ts:234 `revokeKey` | api_keys | write | req.auth | **NEW** |
| store.ts:261 | every schema collection | read (`countDocuments()`) | NONE, unauthenticated `/health` aggregate counts | n/a (deliberate cross-tenant ops signal; returns numbers only) |
| ingest-store.ts:42,55,66 | sources, sessions, turns | write | req.auth | **NEW** guard first in `ingestUrl` (before the fetch too) |
| whatsapp/store.ts:147,162,179 | sources, sessions, turns | write (replaceOne x2, bulkWrite) | req.auth | **NEW** guard first in `ingestGroup`, before owner resolution |
| whatsapp/store.ts:47-77 | messages, people, groups, tracking (archiver DB) | read | keyed by `ownerUserId` ObjectId resolved server-side from the tenant; not tenant-owned collections | n/a |
| indexing/session.ts:32 (`loadTreeRoot`), :265 (replaceOne) | tree_index | read, write | req.auth / scripts | accessor: `turnsColl(tenantId).find` is the first operation of `indexSession` and throws first; tests pin the ordering (see Mutations M12) |
| activity-health/queue-reader.ts:33 | jobs (upload queue DB) | read | env `UPLOAD_TENANT_ID` (trimmed) AND req.auth, compared by strict equality | **NEW** guard on the configured tenant (control characters); non-strings already could not equal the config string |
| scripts/mint-key.mjs:42,43 | api_keys | write (deleteMany, insertOne) | CLI `--tenant` | **NEW** guard before connect: one-line error, exit 1 |
| scripts/backfill.mjs:91 | tree_index | read | CLI `--tenant` | accessor: `sessionsColl(TENANT)` at :78 runs first in the same run and throws; guard at :91 reverted as untestable without a database |
| scripts/demo/seed-demo-server.mjs:37-44 | tree_index, api_keys | write | literal "toc" | left (ISS-TENANTFLT-003); also ISS-TENANTFLT-001 |
| scripts/watch/watch-reingest.mjs:54-123 | sources, sessions, turns, session_pages, claims, chunks, tree_index | read, delete | literal "toc" (watch-config.mjs:17) | left (ISS-TENANTFLT-003) |
| scripts/upload/queue.mjs:39 `scope()` (7 uses) | jobs (dedicated upload_queue_* DB) | read, write | env `UPLOAD_TENANT_ID` trimmed, <=200 | left (ISS-TENANTFLT-003) |
| packages/index/src/tree/build.ts:49 `treeIndexRootFilter` | tree_index | filter builder | callers above | left: packages/index has no @lkb/db dependency; callers guarded (ISS-TENANTFLT-002) |
| migrations/20260907140000-tree-index-tenant-id.cjs:14,24 | tree_index | read, update | none (finds docs MISSING a tenant) | n/a (deliberate cross-tenant maintenance migration) |

Totals: 28 tenant-bearing hand-built call sites (plus the 2-line cross-tenant migration). 15 guarded by this unit (store.ts 6, ingest 3, whatsapp 3, queue-reader 1, mint-key 2); 3 already accessor-first (session.ts 2, backfill 1); 10 left on literal/env tenants (seed-demo 2, watch-reingest 7, upload scope 1); `treeIndexRootFilter` itself left.
**Unscoped queries on tenant-owned collections** (no tenant field at all): store.ts:45 (api_keys by hash, pre-tenant), store.ts:261 (health counts), seed-demo-server.mjs:37-38 (tree_index delete/insert keyed by node_id), scripts/live-verify.mjs:116,217,221,246 (read-only verification counts incl. `sessions countDocuments({_id:{$in:refs}})`), scripts/lib/toc/toc-embedding-backfill.mjs:86,172,207 and scripts/lib/toc-recovery-import.mjs:49 (`countDocuments({})` used as a deliberate cross-tenant "refuse if anything foreign is present" precondition), the migration above. All are read-only counts or deliberate admin/maintenance/pre-tenant paths; the one write is seed-demo-server (literal tenant, ISS-TENANTFLT-001).

## What was deliberately NOT guarded, and what bounds it
- **api_keys lookup by key hash (store.ts:45):** runs before any tenant exists; its only input is `sha256Hex(key)` of the presented credential, always a 64-hex string in the filter (test: filter keys are exactly `["keyHash"]`, value `/^[0-9a-f]{64}$/` even for an operator-shaped key). The tenant it yields is validated by `requireAuth`.
- **Health counts, migration:** cross-tenant by design, no tenant input at all.
- **Env/CLI/literal tenants in scripts (watch-reingest, seed-demo-server, upload queue):** strings cannot be operators; not HTTP-reachable; scripts/ is at its 32-entry budget and the upload scripts run without tsx so the TS validator is not importable there. Filed ISS-TENANTFLT-003.
- **session.ts, backfill.mjs:** already accessor-first (see table). My first draft added three guards to session.ts; mutation analysis showed every one is shadowed by the accessor (equivalent mutants), so they were removed rather than shipped untestable.

## Caller-visible behaviour when a guard throws
- Tree store load (ask, compete): returns null, so the route answers its existing `404 {error:"not_found"}`; no query is issued (existing hostile route tests still pass unchanged at 404).
- keys list/create/revoke, graph load, job writer: throws `...: tenantId is required (...)`. NEW terminal error middleware in `server.ts` turns any error that carries no HTTP status into `500 {"error":"internal_error","message":"internal error"}`, no stack, no guard text; logged server-side only. Errors that carry a 4xx/5xx `status` (body-parser's malformed JSON 400) go to the default handler unchanged (tested).
- ingest URL / WhatsApp ingest: the guard error surfaces through the routes' existing catch as their fixed-shape `502` with only the guard sentence as message (no stack).
- activity-health: the router's catch yields its fixed `503 activity_unavailable`.
- mint-key: `mint-key: <guard sentence>` on stderr, exit 1, before connecting or reading MONGODB_URL.

## Tests (apps/api/src/tenant-guards/, a new subfolder: no new file in apps/api/src; kit extended additively)
- `store-guards.test.ts` (210 non-blank, budget 400): 13-value hostile table (`""`, whitespace, undefined, null, number, `{$ne:null}`, `{$gt:""}`, `{$in:[...]}`, `{$regex:".*"}`, array, `" tA"`, `"tA "`, control char) against: keys list+create+revoke, tree store, graph loader, job writer, `ingestUrl` (also asserts no outbound fetch), WhatsApp `ingestGroup` (owner resolver deliberately resolves ANY tenant so only the guard can stop it), `indexSession`, upload-queue reader. Each asserts the clean error AND zero queries/writes AND no row changed. Positive controls with sentinel rows for tenants tA/tB at every site (each sees/changes only its own; A cannot revoke B's key; stored rows carry exactly their tenant). Pre-tenant lookup test for api_keys.
- `caller-visible.test.ts` (70): HTTP 500 fixed body through the REAL keys store (simulated requireAuth bypass), status-carrying errors untouched, mint-key CLI (4 hostile values + valid-tenant control run from a temp cwd with empty MONGODB_URL so it can never connect).
- `ask/tenant-test-kit.ts` (98): additive write-capable surface (insertOne/Many, updateOne, replaceOne, bulkWrite, deleteMany, countDocuments, all recorded) and `bindDb`; read behaviour unchanged.
- Two existing tests updated because the contract is now stronger: `ask-tenant-hostile.test.ts` and `ask-tenant-isolation.test.ts` expected ONE query with a plain-string root filter for an invalid tenant; they now expect NO query (valid `tNone` keeps the old assertions). `whatsapp/store-mongo-snapshot.test.ts` stubs `@lkb/db` in a vm sandbox and needed `assertValidTenantId` in the stub.

## Mutations (runner: byte backup PER mutation, 170 s timeout on the test command, restore in `finally`, then `git hash-object <file>` == `git rev-parse HEAD:<file>`; run against the committed tree, 16/16 restored identical)
| mutation | killed by (first behavioural test) |
|---|---|
| M1 tree load guard removed | "real tree store: tenant empty string returns null; NO query is issued" (+ store-guards "tree store load" x13) |
| M2/M3/M4 listKeys / createKey / revokeKey guard removed | "api_keys list/create/revoke: tenant empty string throws the guard error, no query issued, no row changed" |
| M5 job writer guard removed | "job writer: entry tenant empty string throws the guard error, nothing written" |
| M6 graph loader guard removed | "graph load: tenant empty string throws the guard error BEFORE the tree_index query" |
| M7 ingestUrl guard removed | "ingestUrl: tenant empty string throws the guard error before any fetch or write" |
| M8 whatsapp guard removed | "whatsapp ingestGroup: tenant empty string throws the guard error before owner resolution, fetch or any write" |
| M9 queue-reader guard removed | "activity-health reader: configured/requested tenant whitespace never reaches collection.find" (+ the control-character test) |
| M10 terminal handler -> `next(err)` | "a tenant guard throwing inside the REAL keys store reaches the caller as a fixed 500 JSON body" |
| M11 mint-key guard removed | "mint-key --tenant \"   \": one-line error, exit 1, no stack, refused before the MONGODB_URL check" |
| M12 raw tree_index read placed BEFORE the accessor in `indexSession` | "indexSession: tenant empty string throws the guard error before ANY read, delete or upsert" |
| M13 tree load hard-codes "tA" | "hostile route harness, positive control: tenant A gets only A's sentinel, tenant B only B's" |
| M14 listKeys filter drops tenant | "api_keys positive control: each tenant lists, creates and revokes only its own keys" |
| M15 revokeKey filter drops tenant | same positive control (A revoking B's key) |
| M16 whatsapp replaceOne filter drops tenant | "whatsapp ingestGroup positive control: every write filter and stored row carries exactly the calling tenant" |
16/16 killed, 0 survive. Per-mutation pass/fail counts were not captured (the runner's count regex failed; the killing test names above are from the runner's own output). Equivalent mutants noted: removing any single guard in session.ts / backfill.mjs would be equivalent (accessor-first), hence M12 mutates ordering instead. Removing the tree-store guard also makes the old `String(tenantId).trim()` mutation (M16 of the previous unit) unobservable for valid ids; hostile values are caught by M1's tests.

## D-015: ISS-AUTHTENANT-002, over the row's recorded call sites (the row records no attack strings: reproduction "n/a"; corpus = the 13-value hostile table per site)
**12/13 call sites refused or provably unreachable, 1 left open.** store.ts 61, 141, 210, 222, 234: 5/5 refused (13/13 hostile values each, zero queries). session.ts 32, 265: 2/2 (accessor-first; hostile table 13/13 issues zero calls, pinned by M12). whatsapp/store.ts 147, 162, 181: 3/3 (13/13). queue-reader.ts 33: 1/1 (13/13 never reach find). mint-key.mjs 42: 1/1 (4 CLI values exit 1; NUL cannot be passed in argv). **Left open: packages/index/src/tree/build.ts:49 `treeIndexRootFilter`** - the package has no @lkb/db dependency and adding one is an architecture change; all callers are guarded (ISS-TENANTFLT-002). ISS-AUTHTENANT-002 status is left for the checker; ISS-AUTHTENANT-003 (junction) untouched.

## Evidence (node 24.19.0 from the codex runtime; each under `timeout`; cwd apps/api unless stated)
- `node --test --import tsx src/tenant-guards/store-guards.test.ts` -> `tests 114 / pass 114 / fail 0`
- `node --test --import tsx src/tenant-guards/caller-visible.test.ts` -> `tests 7 / pass 7 / fail 0`
- `node --test --import tsx src/ask/ask-tenant-hostile.test.ts src/ask/ask-tenant-isolation.test.ts` -> `tests 86 / pass 86 / fail 0 / skipped 0` (in this lane `@lkb/db` resolves to the main tree at 1414d79, which already has the throwing accessor, so nothing skips)
- Wide run (tenant-guards, ask, ask-arms, routes/ask, server, join-rules, routes/keys, routes/calendar, tree-index-root-filter pin, whatsapp, activity-health, indexing, ingest, routes graph/ingest/whatsapp, production): `tests 411 / pass 410 / fail 1 / skipped 0`. The one failure is `activity-health/router.test.ts` "actual producer -> Python first/reclaim/fences ... " (`null !== 0`), the known environmental Python failure recorded in the previous manifest; before the whatsapp snapshot stub fix there was a second failure (`assertValidTenantId is not a function` in `store-mongo-snapshot.test.ts`), now fixed.
- `packages/db`: `node --test --import tsx "src/**/*.test.ts"` -> `tests 29 / pass 29 / fail 0`
- `tsc --noEmit -p tsconfig.json` in apps/api and packages/db -> exit 0 both; `node --check scripts/mint-key.mjs` -> ok
- `node scripts/lint-dirsize.mjs` (repo root) -> `lint-dirsize: OK (113 dir(s) within budget)`. `lint-loc` reports 2 pre-existing violations in files this unit did not touch (packages/index/src/pipeline/speakers-llm.ts, packages/meeting-bot/py/sb_join.py). Non-blank lines of touched/new source: store.ts 297, server.ts 119, kit 98, tests 210/70.

## Post-merge needs (junction)
This unit changes nothing under packages/, and the main tree's `@lkb/db` at 1414d79 is identical to the lane's, so the apps tests above already ran against the real accessor and `assertValidTenantId`. After merge: (1) re-run `cd apps/api && node --test --import tsx src/tenant-guards/*.test.ts src/ask/ask-tenant-hostile.test.ts src/ask/ask-tenant-isolation.test.ts src/whatsapp/*.test.ts` (expect 0 fail, 0 skipped); (2) the whole apps/api suite once (only the environmental Python failure acceptable; same as ISS-AUTHTENANT-003). If another lane has changed `@lkb/db`'s export of `assertValidTenantId`, the vm stub in `store-mongo-snapshot.test.ts` is the first thing to break.

## Follow-ups filed (qa/issues.tenantflt.jsonl, all low, file-don't-fix)
ISS-TENANTFLT-001 seed-demo-server writes a tenant-less tree root; ISS-TENANTFLT-002 `treeIndexRootFilter` unvalidated at source (move validator to @lkb/core); ISS-TENANTFLT-003 literal/env tenants in watch-reingest, seed-demo-server, upload queue left unguarded.

Status: ready-for-check
Fix cycle: 0
