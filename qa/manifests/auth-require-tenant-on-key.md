# Manifest — auth-require-tenant-on-key
**Lane:** lane/authtenant (base 6677e1b) · **Ledger shard:** qa/issues.authtenant.jsonl (ISS-AUTHTENANT-NNN; none filed)
**Issue addressed:** ISS-AUTHSCOPE-001 (high; security class: authentication and tenancy, full ceremony) · **Fix cycle:** 2

## What changed
- `apps/api/src/auth.ts` (67 non-blank lines, limit 300): new exported `isValidTenantId`; `requireAuth` refuses with the unknown-key 401 (same status, same body `{error:"unauthorized",message:"invalid or revoked API key"}`) when the verified record is not an object or its tenantId is invalid. The check sits AFTER the store lookup (no distinguishable early return); nothing is logged; no throw. `requireScope` untouched.
- `packages/db/src/lib/tenantScope.ts` (77): new `assertValidTenantId`, used by `scopedCollection`'s `coll(tenantId)` and by `withTenant`.
- Tests: `apps/api/src/join-rules/require-scope.test.ts` (246 non-blank, budget 400, +5 tests), `packages/db/src/lib/tenantScope.test.ts` (142, +1 test), and one existing test updated: `apps/api/src/ask/ask-tenant-isolation.test.ts` "empty or undefined resolved tenant" expected 404 from the route; requireAuth now refuses first, so it expects 401 (all its no-data/no-query invariants are unchanged). No new file in apps/api/src (39 entries incl. subdirs unchanged; `lint-dirsize: OK (112 dir(s) within budget)` before and after).

## The rule
Valid tenant id = `typeof === "string"`, length >= 1 (schema/api_keys.schema.json: `tenantId` string, minLength 1), `v === v.trim()` (no leading/trailing whitespace), no control characters (`\u0000-\u001f`, `\u007f-\u009f`, U+2028/2029). No stricter pattern: the meeting-bot join-rules pattern `[a-z0-9][a-z0-9_-]{0,63}` would reject real ids such as `tA`, `tB`. Tenant ids found in fixtures, seeds, scripts and tests, all passing the rule (asserted in a test): toc, tenant-1, tenant-a, tenant-b, fixture, t, t1, tA, tB, synthetic-capture, cli-tenant, system. Other `req.auth` field: only `scopes` (already fail-closed by the previous unit); VerifiedKey has no other identity field.

## Data accessor (point 3)
- Before (`tenantScope.ts:37`, `if (!tenantId) throw`): refused undefined, null, "", 0, false, NaN. It did NOT refuse a truthy non-string or malformed string: an OBJECT tenantId such as `{ $ne: null }` was spread into the filter as `tenantId: {$ne:null}`, which matches EVERY tenant's documents (cross-tenant read, and deleteMany/updateOne write); a number/array/true matched none; whitespace/newline strings matched nothing legitimate. A plain `undefined` could not match other tenants through `scopedCollection` (it threw). Through the non-scoped `routes/keys.ts` path (`store.ts:214` `find({ tenantId })`, `:227` createKey, revoke) an undefined tenant is serialised by the driver as null (not accessor-guarded), so only the requireAuth fix protects those.
- After: `assertValidTenantId` (same rule) in `coll()` and `withTenant`; throws `<where>: tenantId is required (...)` before any driver call. Existing test regex `/tenantId is required/` still matches.
- Callers: `git grep` of scopedCollection/withTenant: apps/api (ask-arms, ask/source-context, composition/production, indexing/*, search-store, routes/health), packages/db/src/collections/*, packages/ai/jobs.ts, packages/index speaker-docs, packages/meeting-bot join-rules-store, scripts (backfill, eval-recall, seed-toc, recover-toc, toc-embedding-backfill). Tenant arguments are auth-derived strings, string constants ("toc", "system") or CLI/env strings; none passes empty/undefined legitimately (an empty one already threw). No global/admin code path relies on a tenantless accessor. Unverified: scripts with a CLI tenant containing surrounding whitespace would now throw (none seen).
- Caveat: lane junctions resolve `@lkb/db` to the MAIN tree, so apps/api tests exercise the OLD db accessor here; the db change is covered by packages/db tests only. The auth fix does not depend on it.

## D-015
ISS-AUTHSCOPE-001: 4/4 recorded reproductions refused (tenantId missing, null, "", 5), each 401 on GET /keys and GET /calendar/join-rules over HTTP, body identical to the unknown-key 401, handlers never invoked (listKeys/createKey/revokeKey and join-rules store call counts 0). Extra shapes (unit level): whitespace-only, object `{ $ne: null }`, array, boolean, undefined, NaN, trailing newline, leading space, NUL, inner tab, non-object record: all 401.

## Proof the new tests fail on the unfixed code
Per-mutation runner (git show HEAD: content written over the source, test run under a 120 s timeout, original bytes restored in `finally`, `git hash-object` verified identical): auth.ts -> `pass 18 fail 3` (the tenant-validity unit test, the ISS-AUTHSCOPE-001 HTTP test, the POST /keys test fail); tenantScope.ts -> `pass 14 fail 1` (the invalid-tenant accessor test). `restored: hash identical` both times. Fixed code: all pass.

## Point 4: POST /keys
`routes/keys.ts:44-` passes `req.auth!.tenantId` to `createKey`; the body is never read for a tenant. New test: a body carrying `tenantId:"tenant-b"` still creates under `tenant-a`; a tenantless caller gets 401 and createKey is not called.

## Evidence (node 24.19.0 via codex runtime PATH; junctions to main node_modules)
- `cd apps/api && timeout 120 node --test --import tsx src/join-rules/require-scope.test.ts` -> `tests 21 / pass 21 / fail 0`
- `cd apps/api && timeout 300 node --test --import tsx "src/**/*.test.ts"` -> `tests 387 / pass 385 / fail 2` before the ask-tenant-isolation update; after it that file is 16/16, leaving 1 failure: `activity-health/router.test.ts` "actual producer -> Python ..." (`upload queue operation timeout`, null vs 0). That failure is PRE-EXISTING and environmental: it fails identically with `auth.ts` reverted to HEAD (run via the per-mutation runner above: pass 2 fail 1). Not caused by this unit.
- `cd packages/db && timeout 120 node --test --import tsx "src/**/*.test.ts"` -> `tests 29 / pass 29 / fail 0` (before adding the new db test, which is in the mutation run: 14 pass + 1 fail unfixed, passes fixed)
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in apps/api and packages/db -> no output (clean)
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`

## Follow-ups
1. Operator query (read-only; NOT run) to find stored key records with a missing or malformed tenant:
   `db.api_keys.find({ $or: [ { tenantId: { $exists: false } }, { tenantId: { $not: { $type: "string" } } }, { tenantId: "" }, { tenantId: { $regex: /^\s|\s$|[\x00-\x1f\x7f]/ } } ] }, { keyHash: 0 })`
2. Still open: a holder of the `keys` scope can mint a key with ANY scope (routes/keys.ts only checks strings), i.e. escalate to every scope of the tenant. Not changed here.
3. `store.ts:47` still returns `doc.tenantId` unvalidated; `requireAuth` is the choke point so left as is.
4. `ask-tenant-isolation.test.ts` no longer exercises the route-level 404 for an empty tenant over HTTP (auth refuses first). (Repaired in fix cycle 1 below.)

## Fix cycle 1 (test-only; answers VERDICT FAIL cycle 0, ISS-AUTHTENANT-001)
**What failed.** Cycle 0 edited one assertion in `ask-tenant-isolation.test.ts` ("empty or undefined resolved tenant") from 404 to 401. True at the auth level, but the route never ran any more, so "no turns/chunks query", "zero rows returned" and "no model call" held vacuously. With auth bypassed, tenants `""`, `undefined`, `{$ne:null}` reach `tree.load` raw; nothing asserted that the tree store then returns nothing. That is how ISS-078 survived: a green suite with the protection silently regressed. The security fix (requireAuth 401 + throwing accessor) is unchanged; no production file is touched this cycle.

**Auth-free route access, no production switch.** New `apps/api/src/ask/ask-tenant-hostile.test.ts` (222 non-blank lines, budget 400; beside `ask-tenant-isolation.test.ts`, no new entry in apps/api/src) builds an `express()` app with `express.json()`, a test-local middleware `req.auth = { tenantId: <hostile>, scopes: ["ask"] }`, then the REAL `createAskRouter` (real `requireScope`, real handler, real `createSourceRequestDepsFor` hydrator/arms) over a tenant-blind fake DB with Mongo operator semantics ($ne, $gt, $in, $regex, $exists, array equality). `requireAuth` is deliberately not mounted. The existing 401 assertion stays.

**Hostile table** (one table, 11 values, run at 5 levels). Fixture: real tenants tA (sentinel `SENT-A-ALPHA-7f3`) and tB (`SENT-B-BRAVO-9c1`), plus valid-but-empty `tNone`. Positive controls: A gets 200 with only A's sentinel, B 200 with only B's; every A query carries `tenantId: tA`.
| value | tree store / route (store honest) | arms, hydrator (old guard, this lane) | accessor in THIS lane (relative import) |
|---|---|---|---|
| `""`, undefined, null | 0 rows; route 404, load got exact value | old guard throws; arms degrade, hydrator refuses; 0 rows | throws |
| `"   "`, 5, `tNone` | 0 rows; route 404 | query runs, 0 rows | throws (tNone passes) |
| `{$ne:null}`, `{$gt:''}`, `{$in:[A,B]}`, `{$regex:'.*'}`, `[A]` | 0 rows (node_id `tenant:<value>` matches no root); route 404 | SKIPPED: old guard would pass an operator object to the driver; 5 values x arms/hydrator/bypassed-tree = 15 skips | throws |

Route checks per value: status 404, neither sentinel nor any `tenant:tB`/`b-turn-`/`b-chunk-` in the body, no stack/path in the body, `tree.load` received exactly the hostile value, no turns/chunks query, every query returned 0 rows, zero model calls. Level 2b ("tree store itself bypassed", returns A's tree for any tenant): no sentinel, no stack; observed under the old guard: `""`/undefined/null give a clean 503, whitespace/5/tNone give 200 with empty `sources.internal`. Under the new guard the operator values must give the same clean refusal (same code path as `""` today).

**Mutations** (per-mutation in-memory byte backup, 150 s `spawnSync` timeout, restore in `finally`, sha1 of the file equal before/after: true for both). The real store's `getDb()` cannot be injected hermetically and packages/index resolves to the main tree, so the mutated deep layer is the test-file replica `treeStore.load` (same call shape as `store.ts`: `findOne(treeIndexRootFilter(tenantId))`).
- (a) load ignores the tenant (always tA's root): `pass 20 fail 23`; killed, including positive control B, all 11 tree-store tests and all 11 route tests.
- (b) load drops `node_id` and passes `{level:"tenant", tenantId}`, so the operator object reaches the fake collection and matches all roots: `pass 35 fail 8`; killed: tree-store and route tests for `{$ne:null}`, `{$gt:''}`, `{$in:[A,B]}`, `{$regex:'.*'}`.

**Integration gap.** apps/api's `@lkb/db` resolves to the MAIN tree (old `!tenantId` guard). The tests hold under both guards; a probe (`guardRefusesObjects`, logged as `# @lkb/db guard refuses operator objects: false` here) skips the 15 cases that need the new guard to refuse an operator object. One test imports THIS lane's `tenantScope.ts` by relative path and asserts all 10 invalid values throw and valid ids pass. AFTER MERGE the 15 skipped cases run for the first time against the new guard and MUST be re-run: `cd apps/api && node --test --import tsx src/ask/ask-tenant-hostile.test.ts` (expect `skipped 0`, `fail 0`); then the whole apps/api suite (ISS-AUTHTENANT-003).

**D-015.** ISS-AUTHTENANT-001 recorded reproduction (stub auth; `""`, undefined, `{$ne:null}`; POST /ask): 3/3 now refused at the route with 404, load receives the raw value, no data. ISS-AUTHSCOPE-001: 4/4 (missing, null, "", 5) still refused 401; `require-scope.test.ts` 21/21.

**Evidence** (node 24.19.0 via codex runtime PATH; each command under `timeout`):
- `cd apps/api && node --test --import tsx src/ask/ask-tenant-hostile.test.ts` -> `tests 58 / pass 43 / fail 0 / skipped 15`
- same plus `src/ask/ask-tenant-isolation.test.ts` -> `tests 74 / pass 59 / fail 0 / skipped 15`
- `src/ask/*.test.ts src/ask-arms.test.ts src/routes/ask/ask.test.ts src/server.test.ts` -> `tests 121 / pass 106 / fail 0 / skipped 15`
- require-scope + join-rules + routes/keys + routes/calendar tests -> `tests 67 / pass 67 / fail 0`; `require-scope.test.ts` alone `tests 21 / pass 21 / fail 0`
- `cd packages/db && node --test --import tsx` over `*.test.ts` -> `tests 29 / pass 29 / fail 0`
- `tsc --noEmit -p tsconfig.json` in apps/api and packages/db -> exit 0 both; `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`

**Follow-ups (not this cycle).** ISS-AUTHTENANT-002 (unguarded tenant filters outside packages/db: api_keys in store.ts, tree_index via treeIndexRootFilter, whatsapp/store.ts, activity-health queue reader, mint-key) stays open, file-don't-fix. ISS-AUTHTENANT-003: run the apps/api suite once after merge. Production defect exposed by the new tests: none.


## Fix cycle 2 (test-only; answers VERDICT FAIL cycle 1, ISS-AUTHTENANT-004 and -005)
**What failed.** (004) The route tests used a hand-written copy of `createMongoTreeStore().load`, so three mutations of the REAL store survived (hard-coded "tA", operator-spread filter, `String().trim()`) and two more (drop node_id, ignore tenant) were killed only by a source-text pin. (005) Three "tNone" cases (a VALID tenant without data) asserted 0 queries; a valid tenant legitimately queries, so the post-merge run failed 3 and "skipped 0, fail 0" was false. No production file is touched; no production defect was exposed.

**How the real store is now driven (no replica, no node flag).** New `apps/api/src/ask/tenant-test-kit.ts` (71 non-blank lines; imported by both tenant tests; not a test file). It uses the real `@lkb/db` `connect()` and the real `createMongoTreeStore` from `store.ts`, and replaces only `MongoClient.prototype.connect/db/close` of the `mongodb` driver (the same module instance `@lkb/db` imports), so no socket opens and the real `getDb()` inside the real `load` returns a tenant-blind `BlindDb` that records every filter. No `--experimental-test-module-mocks`, no package.json or enforcement-path change. `realTreeStore(db, loads)` is that production `load` bound to the per-test fake; it replaced the replica in `ask-tenant-hostile.test.ts` (level 1, level 2, positive control) and in `ask-tenant-isolation.test.ts` (tree-load and HTTP /ask tests). Both replicas and the duplicate `BlindDb` copy are deleted.

Level-1 assertions (behaviour, not text): tenant tA gets only tA's root (SENT-A, never SENT-B), tB likewise, with exactly one `tree_index` findOne whose filter is `{node_id:"tenant:<id>",level:"tenant",tenantId:"<id>"}`. Each of 13 hostile values (the old 11 plus " tA" and "tA ") returns null; the recorded filter has exactly the keys node_id/level/tenantId, node_id is a plain string, `tenantId` deep-equals the value passed in (not hard-coded, coerced or trimmed), node_id is never another tenant's root id, and no other tenant's id appears in a string tenant's filter. Observation, not a defect: an array tenant `[tA]` stringifies into node_id `tenant:tA`; it matches nothing because the `tenantId` conjunct (an array) equals no stored string, and requireAuth refuses it before the store in production.

**Command that runs the file.** `cd apps/api && node --test --import tsx src/ask/ask-tenant-hostile.test.ts`. The package `test` script `node --test --import tsx "src/**/*.test.ts"` already globs both files, so the default script covers them and nothing skips for lack of a flag. The only skips are the 15 operator-object cases that need the NEW accessor guard (probe `guardRefusesObjects`, unchanged); only the post-merge simulation below needs `--experimental-test-module-mocks`.

**Five mutations of the real `store.ts` load** (one at a time on line 61; byte backup PER mutation; restore in `finally`; 170 s `spawnSync` timeout; after each, `git hash-object apps/api/src/store.ts` equals `git rev-parse HEAD:apps/api/src/store.ts` = d0f92105829df03935ed4d3427fbefabacbd08e1, true all five). Test set = hostile + isolation only (the text pin NOT included), so every kill is behavioural.

| mutation | killing tests (examples) | failed |
|---|---|---|
| M14 `treeIndexRootFilter("tA")` | "hostile route harness, positive control: tenant A gets only A's sentinel, tenant B only B's"; "real tree store: tenant tB gets exactly its own root" | 31 |
| M15 `{...treeIndexRootFilter(tenantId), node_id:{$exists:true}}` | "real tree store: tenant tA / tB gets exactly its own root"; every "returns null; the filter is the plain-string root filter" | 20 |
| M16 `treeIndexRootFilter(String(tenantId).trim())` | "real tree store: tenant whitespace-only / undefined / null / number ... returns null; the filter is the plain-string root filter of exactly that value" | 14 |
| M1 load drops node_id | "real tree store: tenant tA / tB gets exactly its own root"; every filter test | 20 |
| M2 load ignores tenant (`{level:"tenant"}`) | positive control; "real tree store: tenant tA / tB ..."; every filter test | 35 |

The source-text pin `tree-index-root-filter-single-source.test.ts` is kept as a second line of defence.

**tNone correction (005).** A valid tenant with no data performs its normal scoped queries and returns no data. Route with the real store: exactly one query, `tree_index` with tenantId "tNone", status 404, no sentinel, no turns/chunks read, no model call. Tree store bypassed: status 200 with empty internal sources, at least one query (non-vacuous), every query carries exactly "tNone". Arms and hydrator: at least one query, every query carries exactly "tNone", arms not degraded, hydrator refuses ("no source rows") or is empty, no sentinel. The "zero queries" assertions now apply only to values the new guard refuses.

**Simulated post-merge state (contract clause 8).** Temp wrapper (deleted): `mock.module("@lkb/db", {namedExports:{...real, scopedCollection, withTenant from this lane's packages/db/src/lib/tenantScope.ts}})` then import of the hostile test, run with `node --test --experimental-test-module-mocks --import tsx`: `# @lkb/db guard refuses operator objects: true`, `tests 70 / pass 70 / fail 0 / skipped 0`. Un-merged lane: `tests 70 / pass 55 / fail 0 / skipped 15`.

**D-015 (counts against each issue's own recorded reproductions).**
- ISS-AUTHTENANT-001: 3/3 refused at the route (404 for "", undefined, {$ne:null}), now through the REAL tree store; load received the raw value, no turns/chunks query, no model call.
- ISS-AUTHTENANT-004: 3/3 recorded mutations (M14, M15, M16) killed by behavioural tests, plus M1 and M2 (5/5); none survives.
- ISS-AUTHTENANT-005: 3/3 recorded failing cases (tNone in bypassed-tree, arms, hydrator) pass in the post-merge simulation (70/70, skipped 0).
- ISS-AUTHSCOPE-001: 4/4 (missing, null, "", 5) refused 401; `require-scope.test.ts` 21/21.

**Evidence** (node 24.19.0 from the codex runtime; each under `timeout`):
- hostile test alone: `tests 70 / pass 55 / fail 0 / skipped 15`; isolation alone: `tests 16 / pass 16 / fail 0 / skipped 0`
- `src/ask/*.test.ts src/ask-arms.test.ts src/routes/ask/ask.test.ts src/server.test.ts src/join-rules/*.test.ts src/routes/keys.test.ts src/routes/calendar.test.ts src/tree-index-root-filter-single-source.test.ts`: `tests 201 / pass 186 / fail 0 / skipped 15`
- `packages/db` all tests: `tests 29 / pass 29 / fail 0`; `tsc --noEmit -p tsconfig.json` in apps/api and packages/db: exit 0 both
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (112 dir(s) within budget)`; non-blank lines: hostile 198, isolation 293, kit 71 (budget 400); the new file is in src/ask/, apps/api/src entry count unchanged

**Merge conditions (main tree).** (1) Before the db change is what `@lkb/db` resolves to, the hostile test shows `skipped 15`; after merge `cd apps/api && node --test --import tsx src/ask/ask-tenant-hostile.test.ts` must show `tests 70 / fail 0 / skipped 0` (the simulation above reproduces exactly that state). (2) The whole apps/api suite (only the environmental activity-health Python failure acceptable). (3) packages/db tests.

Status: ready-for-check
Fix cycle: 2
