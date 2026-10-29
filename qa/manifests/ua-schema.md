# Manifest — ua-schema
**Contract:** none specific (D-206 authorizes; docs/features/user-accounts/plan.md row A1 and section "A1 ua-schema"; spec.md UA-2, UA-13, UA-25, UA-27)
**Goal task:** none
**Date:** 2026-10-29
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required (new tenant-scoped auth data model: tenancy, sessions, credential-token storage, append-only audit log)
**Dual-trigger:** dual-trigger: tenancy packages/db/src/collections/users.ts:28
**Persona walk:** skip (no screen, flow or user type; data model only)
**Issues addressed:** none (feature unit A1 of user-accounts)
**Executor:** claude-sonnet-subagent (maker-builder)
**Executor rationale:** schema + store + migration unit with exact acceptance; every file is new or an existing generated/index file edited in place.

## Criteria (verbatim from plan.md, A1 ua-schema)
- C1 Each schema validates a sample for every `status` and rejects: missing `tenantId`, unknown fields, role outside `admin|member|viewer`, `active` without a role, a session without `familyId`.
- C2 Real-Mongo test: the unique index rejects a second user with the same normalised email even with different case, Unicode composition and surrounding spaces, and in a different tenant (UA-2); `tokenHash` is unique.
- C3 `scopedCollection` accessors reject a missing/invalid tenant; a cross-tenant `findOne` by id returns null for every new collection.
- C4 `auth_events` exposes insert and read only; a test asserts no update/delete helper exists.
- C5 TTL: a revoked session with `purgeAt` in the past is removed by Mongo; an active one (no `purgeAt`) is never removed (real-Mongo, using short TTL in the test config).
- C6 Migration applies and re-applies idempotently on the work DB and passes `lint-migrations`.

## What changed (code commit e71d5625)
- NEW schema/{users,user_sessions,user_tokens,auth_throttles,auth_events}.schema.json + fixtures under schema/fixtures/<collection>/ (valid.json and valid-*.json for every status, invalid*.json per rejected shape); `schema/index.json` gets the declared indexes (the only place index changes are made).
- Generated: `pnpm gen:types` -> packages/core/src/generated/{users,user_sessions,user_tokens,auth_throttles,auth_events}.ts and the export lines in packages/core/src/index.ts.
- NEW packages/db/src/collections/{users,user-sessions,user-tokens,auth-throttles,auth-events}.ts (plan paths) + `user-accounts.test.ts` (fake Db) + `user-accounts.mongo.test.ts` (opt-in real Mongo); export lines appended to packages/db/src/index.ts.
- NEW migrations/20261029100000-user-accounts.cjs + migrations/user-accounts.migration.test.mjs (dry-run).
- EDIT structure.config.json (dirsize overrides only): `schema` 48 -> 53 and `packages/db/src/collections` -> 37 (both directories were exactly at budget; five schemas and seven files do not fit). Not on the enforcement-path list; named here so the checker sees it. docs/SNAPSHOT.md regenerated.
- Design decisions the checker should look at:
  - Email uniqueness is GLOBAL (`{emailNormalized:1}` unique), per plan C2 ("and in a different tenant") and spec UA-2 ("one email = one user = one tenant"). The brief's wording "unique normalised email per tenant" is the weaker form; the plan acceptance wins and a global index also implies per-tenant uniqueness.
  - Every store function takes `tenantId` (scopedCollection). There is no unscoped lookup by `tokenHash`. UA-27 says the session lookup by `tokenHash` precedes knowing the tenant; A3 must decide how the cookie request learns its tenant (single configured signup tenant in v1, or a tenant hint in the cookie) or add one explicitly named, hash-only lookup then. Left open on purpose, flagged for the plan owner.
  - TTL fields are BSON Dates (`purgeAt`): schema marks them `tsType: Date` + `x-bsonType: date`; fixtures show ISO strings. Sessions: revokedAt + revokedReason + purgeAt are required together (`dependentRequired`), so an active row can never carry a purgeAt. Added `idle_expired` to `revokedReason` (spec says expired rows are purged 30 days after expiry but its reason list had no value for it). Events carry `purgeAt` = at + 2 years (H-3 retention). Throttle `purgeAt` is never earlier than `lockedUntil`.
  - Mongo `$jsonSchema` validators are applied by the migration. The shared `mongoSchema` helper in 20261014200000 rewrites a property NAMED `type` as the keyword, which made every `auth_events` insert fail `additionalProperties`; the migration therefore carries its own small `toMongo` (found by the real-Mongo test, covered by a dry-run assertion).
  - The migration uses the same isolated-work-database guard as 20261017120000 (refuses lkb, lkb_prod, global_university_db, lkb_staging, unset/mismatched MONGO_WORK_DB) and refuses `down`. It was applied only to throwaway databases `lkb_ua_schema_test_<hex>` on a local loopback mongod (127.0.0.1:27018), each dropped by the test; nothing else was touched.
  - Not stored anywhere: plaintext passwords (PHC-pattern only), raw tokens (sha256 hex only), raw email of unknown accounts (salted `subjectHash`), full IP or raw User-Agent.
  - The hash/email normalisers are A2's. The store only checks that inputs are already in normalised/PHC/hex form; the real-Mongo test uses a test-local mirror of UA-2 to build collision variants.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 5 schemas, 5 stores, 1 migration, 6 criteria, est 70 min, single builder, no checker dispatch by the builder
slow-plan: the TTL criterion needs Mongo's ttl monitor (about 30 s per pass, 150 s ceiling); the mutant for C5 therefore runs to the ceiling
Tier: H (auth/tenancy/data-model)
Base / checked state: base 1c864477; code commit e71d5625; the manifest commit that follows touches only qa/manifests/ua-schema.md.
Affected tests: packages/db/src/collections/user-accounts.test.ts, packages/db/src/collections/user-accounts.mongo.test.ts, migrations/user-accounts.migration.test.mjs, schema/validate.py
Independent review: NOT run by the builder; the checker owns review (dual check: two independent checkers, one adversarial about cross-tenant reads and TTL/purge of live sessions).
Not run / limits: no production database touched; no API route or A2/A3 code exists yet, so token/session flows are proven at the store level only. The real-Mongo run is a standalone 7.0 mongod, not a replica set (no transactions are used or needed by this unit). The mongo test is opt-in (`LKB_UA_SCHEMA_MONGO_URI`, loopback only) and skips in CI.
Tests[C1]: schema/validate.py — (fixtures: valid.json + valid-*.json for unverified/pending/active admin/member/viewer/rejected/disabled, invalid*.json for missing tenant, unknown field, role outside enum, active without role, active null role, session without familyId, plaintext password) + packages/db/src/collections/user-accounts.mongo.test.ts::"the users validator accepts every status and rejects the invalid shapes" and "the sessions validator rejects a session without familyId, partial revocation and a non-Date purgeAt" (same rejections by the live Mongo validator, error 121)
Tests[C2]: packages/db/src/collections/user-accounts.mongo.test.ts::"unique email: case, Unicode composition, surrounding spaces and a different tenant all collide (UA-2)" — real unique index on a real mongod; plus "tokenHash is unique on sessions and tokens" and migrations/user-accounts.migration.test.mjs::"the required indexes exist" (declared index set)
Tests[C3]: packages/db/src/collections/user-accounts.test.ts::"every accessor refuses a missing or operator-shaped tenant" — covers the tenant guard on every accessor; plus "a cross-tenant findOne by id returns null for every new collection"; same cross-tenant assertion on real Mongo in user-accounts.mongo.test.ts::"a cross-tenant findOne by id returns null for every new collection"
Tests[C4]: packages/db/src/collections/user-accounts.test.ts::"auth_events exposes insert and read only; nothing in the package can update or delete one" — (handle keys are exactly find/insert; no mutating auth-event export on @lkb/db; no updateOne/deleteMany/replaceOne/bulkWrite on the handle) + "a full scenario's audit rows never contain a password, token or cookie substring"
Tests[C5]: packages/db/src/collections/user-accounts.mongo.test.ts::"TTL: revoked sessions and expired tokens/throttles/events are removed by Mongo; active ones never are" — (past-purgeAt revoked session, token, throttle and event are gone within the ceiling; an active session with createdAt 400 days old and a revoked session with a future purgeAt remain)
Tests[C6]: migrations/user-accounts.migration.test.mjs — (five tests: guard refusals, exact collections and indexes, validators, idempotent collMod path) + packages/db/src/collections/user-accounts.mongo.test.ts::"migration applies and re-applies idempotently, then refuses rollback" (real Mongo, applied twice)
Pre-check[C1]: e71d5625 python schema/validate.py -> exit 0, ok: "PASS: 51 collection schema(s) validated correctly." (users 8 valid / 9 invalid, user_sessions 4/10, user_tokens 4/5, auth_throttles 2/4, auth_events 3/5 fixtures)
Pre-check[C2]: e71d5625 cd packages/db; LKB_UA_SCHEMA_MONGO_URI=mongodb://127.0.0.1:27018/?directConnection=true node --test --import tsx src/collections/user-accounts.mongo.test.ts -> exit 0, ok: 9 passed 0 failed (includes the 4 collision variants and the cross-tenant collision)
Pre-check[C3]: e71d5625 cd packages/db; node --test --import tsx src/collections/user-accounts.test.ts -> exit 0, ok: 12 passed 0 failed
Pre-check[C4]: e71d5625 same run as C3 -> exit 0, ok: auth_events handle keys == [find, insert]
Pre-check[C5]: e71d5625 same run as C2 -> exit 0, ok: TTL test passed (about 30-40 s)
Pre-check[C6]: e71d5625 node scripts/lint-migrations.mjs -> exit 0, ok: "lint-migrations: OK (11601 file(s) scanned)"; node --test migrations/user-accounts.migration.test.mjs -> exit 0, 5 passed 0 failed; real-Mongo re-apply covered by the C2 run
Pre-check[T1]: e71d5625 node scripts/gen-types.mjs --check; cd packages/db; npx tsc --noEmit -p tsconfig.json; cd ../core; npx tsc --noEmit -p tsconfig.json; cd ../../apps/api; npx tsc --noEmit -p tsconfig.json -> exit 0, ok: generated types match schema; tsc clean in db, core, api
Pre-check[T2]: e71d5625 node scripts/snapshot.mjs --check; node scripts/lint-dirsize.mjs -> exit 0, ok: "SNAPSHOT matches a fresh regeneration (179 lines, budget 200)", "lint-dirsize: OK (293 dir(s) within budget)"
Pre-check[T3]: e71d5625 npx depcruise --config .dependency-cruiser.cjs packages apps workers -> exit 0, ok: no dependency violations found (1797 modules, 8248 dependencies cruised). Note: in `pnpm lint:structure` the other nine stages exit 0; the dependencies stage was SIGTERMed by the runner's stage timeout twice while eight other agents were building on the same machine, so it was run directly (49 s).
mutant-cap-raise: one falsification per criterion is mandatory (C1-C6); exactly one mutant each, 6 total
Metrics: builder_min=70 mutants=6 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
The fixtures, stores and tests were written against the schema first; the first real-Mongo run was red (3 failed) and drove two fixes before the commit: (1) `auth_events` inserts failed validation because the shared `mongoSchema` walker treats the property named `type` as a keyword (now guarded by a dry-run assertion that `properties.type` stays a property schema); (2) the test's untyped `_id` handles failed `tsc` (typed `RawDoc`). The static `tsc` pass on the first run of the store tests was green on first execution, so the falsifications below carry the proof that those tests bite.

## Falsifications (one per criterion)
Script: per-mutation byte backup (`cp -p f bak`), exactly one text mutation (asserted to match once), `timeout` on the test command, restore from THAT mutation's own backup (no EXIT trap; committed tree), then `git hash-object <file>` compared to `git rev-parse HEAD:<file>`. All six restores printed equal hashes. Run in place on the committed tree rather than in a scratch copy (a second checkout needs a second node_modules and the volume has about 3 GB free); the HEAD-fidelity check is the safeguard.

| Criterion | falsifying edit | observed |
|---|---|---|
| C1 | schema/users.schema.json: inside the `not` rule `"active"` -> `"activeX"` (active-without-role no longer rejected) | validate.py exit 1: `users/invalid-active-null-role.json` and `invalid-active-without-role.json` unexpectedly PASSED |
| C2 | schema/index.json: users `{emailNormalized:1}` `"unique": true` removed | mongo test: 3 failed incl. "unique email: case, Unicode composition ..." and the migration-index test |
| C3 | users.ts `users()` accessor: `(tenantId)` -> `("shared")` (tenant argument ignored) | user-accounts.test.ts: 2 failed ("every accessor refuses ...": users accepted ""; "a cross-tenant findOne ...") |
| C4 | auth-events.ts: added `update: coll.updateOne` to the handle | user-accounts.test.ts: 1 failed, handle keys no longer [find, insert] |
| C5 | schema/index.json: user_sessions TTL `expireAfterSeconds` 0 -> 99999999 | mongo test: 3 failed incl. the TTL test (ran to the 150 s ceiling: expired rows not removed) and "user_sessions TTL index" |
| C6 | migration: `if (existing.has(name)) await db.command` -> `if (false) await db.command` (re-apply no longer uses collMod) | migration test: 1 failed ("up is idempotent on existing collections") |

## How to verify
- `python schema/validate.py`; `node scripts/gen-types.mjs --check`; `node --test migrations/user-accounts.migration.test.mjs`.
- `cd packages/db && node --test --import tsx src/collections/user-accounts.test.ts`.
- Real Mongo (loopback only, throwaway DB, dropped afterwards): `cd packages/db && LKB_UA_SCHEMA_MONGO_URI="mongodb://127.0.0.1:27018/?directConnection=true" node --test --import tsx src/collections/user-accounts.mongo.test.ts` (about 40 s; the TTL monitor runs every 60 s on the server).
- Adversarial focus for the checker: a cross-tenant read through any new accessor; whether any code path can write a plaintext password, raw token, raw email of an unknown account or full IP; whether an active session can ever receive a `purgeAt`; whether `auth_events` can be mutated through the package surface; the open `tokenHash` lookup question above.
