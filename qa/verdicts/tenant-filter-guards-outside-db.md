# Verdict - tenant-filter-guards-outside-db
VERDICT: PASS
Cycle checked: 0
Commit checked: cf40c9c (code 5fdd597, 54ecb2b; base 1414d79; worktree lane/tenantflt)
Security class (tenancy, defence in depth), uncapped.

## Result
PASS at the unit's stated scope. ISS-AUTHTENANT-002 is NOT verified closed: 12/13 recorded sites closed; the open one is `packages/index/src/tree/build.ts:49 treeIndexRootFilter`.

## 1. The edited isolation tests (diff assertion by assertion)
`git diff 1414d79 cf40c9c -- apps/api/src/ask/`. ask-tenant-hostile.test.ts: for the invalid-tenant cases the old assertions (exactly one query; returned 0; keys `[node_id,level,tenantId]`; node_id is a string; filter deepEqual root-filter-of-value; no A/B id inside the filter) are replaced by `load(value) === null` AND `db.queries` deepEqual `[]`. The valid-but-empty tenant `tNone` keeps ALL the old assertions. ask-tenant-isolation.test.ts: `queries[0].returned === 0` becomes `queries` deepEqual `[]` (the null assertion is kept). Nothing else changed: positive controls, sentinel absence on both routes, bypassed-tree route tests (hydrator and arms scoping), key-derived-tenant tests are untouched. Ruling: strictly stronger for invalid values (null AND zero database contact). The one thing no longer asserted directly is "if the guard were absent, the plain-string filter would still match nothing"; that layer is unreachable while the guard exists, and mutation A14 (guard removed plus String().trim()) proves the tests still die without it. The production store (`createMongoTreeStore().load`), the production Ask router, hydrator and arms are still exercised over the filter-evaluating fake.

Previous checker's surviving-mutation set, killer set = hostile + isolation ONLY; per-mutation byte backup, restore in finally, `git hash-object` equals HEAD blob after each (all true). pass/fail counts:

| id | mutation | result |
|---|---|---|
| A1 | store.load hard-codes "tA" | KILLED 80/6 |
| A2 | operator spread, node_id `$exists` | KILLED 82/4 |
| A3 | `String(t).trim()` coercion with guard in place | SURVIVED 86/0, EQUIVALENT: after the guard `t` is a string equal to its trim, coercion is the identity |
| A14 | guard removed AND String().trim() (old M16 shape) | KILLED 70/16 |
| A4 | drop node_id | KILLED 82/4 |
| A5 | ignore tenant | KILLED 76/10 |
| A6 | tenantId conjunct removed | KILLED 76/10 |
| A13 | guard swallows the error and falls through to the query | KILLED 73/13 |
| A7 / A8 | route tenant from x-tenant-id header / body | KILLED 85/1, 84/2 |
| A9 | route loads tB for everyone | KILLED 69/17 |
| A10 / A11 / A12 | hydrator / arms-chunks / arms-turns query unscoped | KILLED 51/35 (A10), 51/35, 51/35 |

No non-equivalent survivor; nothing FAIL-level. (packages/index `treeIndexRootFilter` itself was not mutated: it resolves to the main tree; N5 shape was applied in store.ts as the previous checker did.)

## 2. Enumeration
Own grep of `.collection(` and update/delete/replace/bulkWrite/findOneAnd*/insert*/aggregate/count across packages, apps, scripts, workers, migrations (not tests, not node_modules). Every hit is in the manifest table or goes through `scopedCollection` (packages/db collections, promote-entities, vector-gap, sync-real-turns, seed-toc, webinar/*, sync-speakers whose speaker-docs target is `speakers(tenantId)`). Not in the manifest: `workers/transcribe/src/job_queue.py` (Python; `find_one_and_update` / `update_one` on `jobs` with `{tenantId: self.tenant, kind}`; tenant from env `UPLOAD_TENANT_ID`, constructor rejects non-string, blank, len>200; same trust class as the upload scope). No WRITE with a hand-built or missing tenant filter was missed beyond the manifest's own listed literal/maintenance ones (seed-demo-server, cross-tenant migration).

## 3. Reachability (re-derived)
server.ts mounts compete-page, pages, health before `requireAuth`; none reads a tenant (/health only counts). Everything else is after `requireAuth` and the rate limiter and uses `req.auth.tenantId` (validated by `isValidTenantId`). grep of req.body/query/params/headers near "tenant" across apps/api/src: no route selects a tenant from the client (params are `:id`, `:claimId`, jid). `store.verify` hashes the presented key (filter `{keyHash}`). No webhook, calendar-push or upload-callback route exists. Second-order: tenant fields an authenticated tenant can cause to be written (`jobs`, `api_keys`, sources/sessions/turns) are stamped from `req.auth`, never from a body; readers use env tenant (queue reader, Python worker) or the route's `req.auth`; stored `api_keys.tenantId` is re-validated by `requireAuth`. Main's changes since 1414d79 (join-rules router/deps, brain, meeting-bot, core, web) add no Mongo calls and no pre-auth mount (diff grepped). RESULT: no unauthenticated and no second-order path found.

## 4. Unguarded sites and treeIndexRootFilter
Confirmed literal/validated-env: watch-reingest TENANT is the literal "toc" (watch-config.mjs:17); seed-demo-server "toc"; upload `scope()` is trimmed env `UPLOAD_TENANT_ID`, length<=200 (security.mjs:12). session.ts is accessor-first (`turnsColl(tenantId).find` at :126 throws first; at :164 and :252 `sessionsColl(tenantId)` precedes `loadTreeRoot` in the array; `loadTreeRoot` has no other caller); backfill likewise. A string cannot be a Mongo operator.
`treeIndexRootFilter`: acceptable to leave in this unit (both HTTP callers are guarded before it, and the Ask 404/no-query is pinned) but "low" is the wrong rating: it is the one named reason the medium parent cannot close and a future caller gets no protection. Treat ISS-TENANTFLT-002 as MEDIUM; ISS-AUTHTENANT-002 stays OPEN until build.ts rejects an invalid tenant itself (validator moved to @lkb/core, or an inline check). Recorded as contract clause 12.

## 5. Terminal error handler (server.ts)
Statusless error: `console.error(err)` (full error to the server log) then 500 with the fixed body `{"error":"internal_error","message":"internal error"}`. `res.headersSent` or a numeric 4xx/5xx `status`/`statusCode`: `next(err)` to the default handler, unchanged. It is the last `app.use`, after every router including the late ones and `unavailableJoinRulesRouter`; Express error middleware also catches errors from the pre-auth routers. Body and headers carry no message, stack, path or tenant id (O3 echo and O7 stack mutations killed). Behaviour change: statusless errors that used to render Express's default HTML 500 (stack outside production) now return the JSON 500; no 4xx becomes 5xx; no existing expectation changed (the only edited tests are the three in the diff). Ran server, keys, health, join-rules/*, ingest, whatsapp, graph, compete, production, store-mongo-snapshot, tree-index-root-filter-single-source: 112 pass, 0 fail, 0 skipped. Low notes: all four handler mutations (echo, 200, stack, forward) are killed by one single test ("a tenant guard throwing inside the REAL keys store ..."); a statusless error thrown in requireAuth itself (store.verify rejecting) now also becomes this 500, which is desirable.

## 6/7. Guards and mutations
Killer set = store-guards, caller-visible, hostile, isolation (207 tests, 0 fail baseline); per-mutation byte backup, restore in finally, hash equals HEAD verified every time. Positive controls pass at every guarded site (two tenants, sentinel rows, filter-evaluating fake; writes only in the caller's tenant; A cannot revoke B's key).

| id | mutation | result pass/fail |
|---|---|---|
| G1 | tree load guard removed | KILLED 181/26 |
| G2 | job writer guard removed | KILLED 194/13 |
| G3 | graph load guard removed | KILLED 194/13 |
| G4 / G5 / G6 | listKeys / createKey / revokeKey guard removed | KILLED 193/14 each |
| G7 | ingestUrl guard removed | KILLED 194/13 |
| G8 | whatsapp ingestGroup guard removed | KILLED 194/13 |
| G9 | queue-reader guard removed | KILLED 196/11 |
| G10 | mint-key guard removed | KILLED 203/4 |
| O1 | createKey guard placed AFTER insertOne | KILLED 193/14 |
| O2 | revokeKey guards `id`, not tenant | KILLED 193/14 |
| O3 | handler echoes err.message | KILLED 206/1 |
| O4 | handler returns 200 | KILLED 206/1 |
| O5 | mint-key continues after the error (no exit) | KILLED 203/4 |
| O6 | ingestUrl guard after the first insert | KILLED 194/13 |
| O7 | handler puts stack in body | KILLED 206/1 |
| O8 | handler forwards statusless errors | KILLED 206/1 |

The 10 distinct guard statements cover the 15 sites (ingest and whatsapp each carry one guard over three raw writes). 26 of 26 killed plus the one equivalent survivor in section 1. All restored files hash-equal their HEAD blobs; worktree clean after the runs.

## 8. Merge readiness
Intersection of this lane's 14 files with main's 36 changed since 1414d79: NONE (server.ts and store.ts untouched on main). `git merge-tree --write-tree HEAD codex/machine-migration-2026-10-09` exits 0, tree 9cb9a81, no conflicts; no merge state created.

## 9. D-015 by my own run over ISS-AUTHTENANT-002's recorded sites
The row records no attack strings; corpus is the 13-value hostile table per site. 12/13: store.ts:61,141,210,222,234 5/5 (13 values, zero operations); session.ts:32,265 2/2 (accessor-first; indexSession 13/13); whatsapp/store.ts:147,162,181 3/3 (13/13); queue-reader.ts:33 1/1 (14 tests); mint-key.mjs:42 1/1 (4 CLI values exit 1). OPEN: packages/index/src/tree/build.ts:49 `treeIndexRootFilter`.

## Budgets and checks (node 24.19.0)
apps/api `tsc --noEmit` exit 0; packages/db `tsc --noEmit` exit 0; packages/db tests 29/29; `lint-dirsize: OK (113 dir(s))`; `lint-loc` 2 pre-existing violations in untouched files (speakers-llm.ts 313, sb_join.py 1142); store.ts 297 non-blank. No file under packages/ changed, so no cross-junction claim is needed: apps tests load the main tree's @lkb/db, identical to the lane's and unchanged on main since 1414d79.

EXPLANATION: Every hand-built tenant filter reachable from HTTP is guarded before its first side effect, each guard dies under behavioural tests, including misplaced guards and the new error handler (26/26), and the two edited Ask tests became stricter without dropping a protection the previous 20-mutation set exercised. No unauthenticated or second-order path to a tenant filter exists. ISS-AUTHTENANT-002 remains open solely for treeIndexRootFilter, whose companion ISS-TENANTFLT-002 should be re-rated medium.

ISSUES-WRITTEN: none

## Post-merge runs required on the main tree
1. `cd apps/api && node --test --import tsx src/tenant-guards/store-guards.test.ts src/tenant-guards/caller-visible.test.ts src/ask/ask-tenant-hostile.test.ts src/ask/ask-tenant-isolation.test.ts src/whatsapp/store-mongo-snapshot.test.ts src/server.test.ts src/routes/keys.test.ts`: expect fail 0, skipped 0 (tenant-guards 121, ask pair 86).
2. `cd apps/api && node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: exit 0.
3. The whole apps/api suite once: only the known environmental activity-health Python test may fail (ISS-AUTHTENANT-003).
4. `node scripts/lint-dirsize.mjs`; store.ts under 300 non-blank lines after merge.
5. Leave ISS-AUTHTENANT-002 open; re-rate ISS-TENANTFLT-002 to medium.
