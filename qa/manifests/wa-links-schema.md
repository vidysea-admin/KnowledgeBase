# Manifest — wa-links-schema
**Contract:** none specific; criteria C1, C2, C3, C4, C5 below (D-205/D-206; docs/features/whatsapp-multiuser/plan.md row W1 and its per-unit acceptance, spec.md R-2, R-29, R-33, R-36; no qa/contracts file, the maker never edits qa/contracts/)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: tenancy packages/db/src/collections/whatsapp-links.ts:44
**Persona walk:** skip (no screen, flow or user type; data model and accessors only)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one data-model unit (3 schemas, 1 accessor module, 1 migration, fixtures, tests); no external executor was worthy.

Authority: D-205 and D-206 (docs/DECISIONS.md); the plan is DRAFT v2 and `qa/gates/plan-approved-whatsapp-multiuser.md` was not checked by the builder, the coordinator owns that gate.

## Acceptance criteria
- **C1** The three schemas validate samples for every lifecycle state and reject: missing `tenantId`, unknown fields, a non-24-hex `archiverOwnerId`, `active` without `approvedBy`/`activatedAt`, `studentData` outside `yes|no|unknown`, and an event carrying any forbidden payload field (R-39: text, name, phone, group subject, jid, QR data, archiver owner id).
- **C2** Real-Mongo: a second non-terminal link for the same `(tenantId, userId)` is rejected; a terminal link does not block a new one; `archiverOwnerId` is unique across tenants (and across terminal rows); a legacy link (`userId: null`) is allowed and unique per owner.
- **C3** `scopedCollection` accessors reject a missing/invalid tenant; a cross-tenant `findOne` by id returns null.
- **C4** `whatsapp_events` exposes insert and read only; a test asserts no update/delete helper exists.
- **C5** The migration applies and re-applies idempotently on a work DB, refuses a non-work database, and passes `lint-migrations`.

## What changed
- NEW schema/whatsapp_links.schema.json, schema/whatsapp_sync_runs.schema.json, schema/whatsapp_events.schema.json (draft 2020-12, closed `additionalProperties:false`; lifecycle rules as `allOf/anyOf` so the same schema works as a Mongo `$jsonSchema`; `live` is derived from `state` to key the unique partial index; `studentData` default is `no` per D-206 and the field is kept so it can be tightened; event payload keys are a closed id/code/count allowlist). Fixtures: schema/fixtures/whatsapp_{links,sync_runs,events}/ (valid 8/3/3, invalid 14/5/11).
- schema/index.json: indexes for the three collections, including unique partial `whatsapp_links_live_user` (tenantId,userId where live=true and userId is a string) and `whatsapp_links_archiver_owner` (archiverOwnerId across all tenants where it is a string).
- NEW migrations/20261029120000-whatsapp-links.cjs (+ migrations/whatsapp-links.migration.test.mjs): creates/collMods the collections with a strict validator and creates the indexes; `up` is guarded by `requireWorkDatabase` (production stays read-only); `down` refuses. Fixes a bug found by the real-Mongo test: the shared `mongoSchema` helper emits bsonType `boolean`, which Mongo rejects (alias is `bool`), so this migration maps it.
- NEW packages/db/src/collections/whatsapp-links.ts (+ whatsapp-links.test.ts): `whatsAppLinkStores(db)` and default accessors; every call takes `tenantId`; `insertLink` derives `live`, defaults `studentData`, pins the tenant; `events(tenantId)` returns a frozen object with `insert/get/list` only and a payload guard. One export line added to packages/db/src/index.ts (single line, after operations-schedules).
- Generated: packages/core/src/generated/whatsapp_{links,sync_runs,events}.ts and 3 lines in packages/core/src/index.ts (pnpm gen:types); docs/SNAPSHOT.md regenerated (3 rows).
- structure.config.json: dirsize overrides `schema` 48->51 and `packages/db/src/collections` 30->32 (the plan names these files; both directories were at their cap). Expect a trivial textual conflict with user-accounts A1 on this line and on schema/index.json, packages/core/src/index.ts, docs/SNAPSHOT.md.
- Not touched: the users schema (A1), the archiver, any API route, docker/compose, DECISIONS.

## Open points for the coordinator
1. Approval H-3 (schema approval, retention numbers, 14-day expiry) is not evidenced in the repo; `approvalExpiresAt` is a field only, no TTL index was created for runs (180 d) or events: retention belongs to the retention module.
2. `admin.raw_read` was added to the R-38 event list because R-29 and W7 require an audit event for an admin reading another person's raw content.
3. `userId` is a free string 1..200 (the users id format is A1's); `approvedBy` for a seeded legacy link is the code `system:env-seed`.
4. R-8's "cannot request a new link until an admin clears the block" is stored as `blocksNewRequests` on the revoked row; enforcing it is W5's.
5. The events collection is append-only by accessor and test only; Mongo cannot forbid updates through the validator. A DB role without update/delete is a deployment item.
6. No `whatsapp_sync_runs` writer exists here (W9); only the scoped accessor.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: tier H, 5 criteria, single builder, est 95 min, no checker dispatch by the builder
Tier: H (tenancy, consent/ownership data model)
Base / checked state: base 69806029; code commit 7d171cff (the manifest commit follows and touches only qa/).
Affected tests: packages/db/src/collections/whatsapp-links.test.ts, migrations/whatsapp-links.migration.test.mjs, schema/validate.py, gen-types --check, snapshot --check, lint:structure.
Independent review: NOT run by the builder; the checker owns review (senior-software-engineer agent and the adversarial tenancy checker).
Real Mongo: docker container `wa-links-schema-mongo` (mongo:7, standalone, port 27555 on 127.0.0.1, throwaway databases `lkb_test_wa_links_<ts>` dropped by the tests). Opt-in env `WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555`; without it the two real-Mongo tests skip. No replica set is needed for these proofs (no transactions).
Not run / limits: no production or shared Mongo; no replica-set transaction behaviour (W4/W8 concern); the lifecycle transitions (request/approve/unlink) are not implemented here, so the schema's state rules are proven on documents, not on a state machine; the tenant pin itself is `scopedCollection`'s and is exercised here through an equality-only in-memory fake plus real Mongo for events.
Tests[C1]: migrations/whatsapp-links.migration.test.mjs::"every valid fixture passes and every invalid fixture fails, per collection" + "links: every lifecycle state validates and each acceptance rejection fires for its stated reason" + "sync runs: closed error codes only; events: R-39 forbidden payload fields are rejected"; schema/validate.py (49 schemas) — the fixture walk plus targeted mutations of one valid document per rule prove each rejection fires for its stated reason
Tests[C2]: migrations/whatsapp-links.migration.test.mjs::"real Mongo: migration applies, re-applies idempotently, enforces the validator and the unique partial indexes" + "index declarations: the two unique partial indexes of R-2 are present with the right filters" — only a real Mongo can show unique partial index behaviour, and the declaration test pins the filters
Tests[C3]: packages/db/src/collections/whatsapp-links.test.ts::"accessors reject a missing or invalid tenant before any query" + "a cross-tenant findOne by id returns null; the owning tenant gets the row" + "insertLink pins the tenant, derives live from state and applies the D-206 student-data default" — the accessor tests assert the throw on every invalid tenant form and the null on a cross-tenant read
Tests[C4]: packages/db/src/collections/whatsapp-links.test.ts::"whatsapp_events exposes insert and read only: no update, delete, replace or bulk helper exists" + "event payload: ids, counts and codes only; every forbidden field is refused (R-39)" + "the data-key allowlist in code equals the schema's data.properties (drift guard)" + the real-Mongo paging test — the surface test and the payload tests prove the append-only shape and the forbidden-field rule
Tests[C5]: migrations/whatsapp-links.migration.test.mjs::"up refuses without an explicit isolated work database; down refuses rollback" + the real-Mongo test (re-apply leaves the index set unchanged, validationAction error on all three) + "Mongo validator keeps only $jsonSchema-supported keywords and every required field" — the guard test, the real-Mongo re-apply and the keyword walk cover the migration contract
Pre-check[C1]: 7d171cff WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555 node --test migrations/whatsapp-links.migration.test.mjs -> exit 0, 7 passed, 0 failed, 0 skipped; python schema/validate.py -> `PASS: 49 collection schema(s) validated correctly.` t=1
Pre-check[C2]: 7d171cff WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555 node --test migrations/whatsapp-links.migration.test.mjs (real-Mongo test) -> exit 0 (duplicate-key 11000 on second live link, on reused archiver owner across tenants and terminal rows, on duplicate legacy owner; terminal link and legacy userId:null do not block) t=1
Pre-check[C3]: 7d171cff cd packages/db; WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555 node --test --import tsx src/collections/whatsapp-links.test.ts -> exit 0, 7 passed, 0 failed, 0 skipped; node_modules/.bin/tsc --noEmit -p tsconfig.json -> exit 0 t=1
Pre-check[C4]: 7d171cff cd packages/db; WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555 node --test --import tsx src/collections/whatsapp-links.test.ts -> exit 0 (events accessor keys exactly get/insert/list, frozen) t=1
Pre-check[C5]: 7d171cff WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555 node --test migrations/whatsapp-links.migration.test.mjs; pnpm lint:structure -> exit 0, 7 passed, 0 failed, lint:structure OK (10 stages, 0 failed, stage migrations exit=0) t=1
Pre-check[T1]: 7d171cff node scripts/snapshot.mjs --check -> `OK: docs/SNAPSHOT.md matches a fresh regeneration (177 lines, budget 200)`; node scripts/gen-types.mjs --check -> `OK: 49 generated type file(s) + index.ts match schema/` t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C5); C1 and C5 carry three mutants, C2 four, C3 two, C4 two, because each criterion has several independent conjuncts
Metrics: builder_min=95 mutants=14 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
The real-Mongo test was written before the migration worked and failed first with `MongoServerError: Unknown type name alias: boolean` (createCollection with the shared `mongoSchema` output), which led to the `bool` alias fix; the keyword/alias walk test now pins it. The accessor and schema tests were written against the finished schemas (schemas and fixtures first, then module, then tests); the falsifications below are the red side for each criterion.

## Falsifications (one or more per criterion)
Harness: a node script mutates the unit's files IN PLACE in this private worktree after the code commit (not a scratch copy, because the tests resolve ajv/mongodb relative to the repo tree), with a per-mutation byte backup (`copyFileSync` to `.mutbak`), one string replacement checked to apply, `timeout 150000` per test run, restore in `finally` from that mutation's own backup, then `git hash-object <file>` compared to `git rev-parse HEAD:<file>` (all 14 printed `restored hash==HEAD`; `git status` clean afterwards). Run against the Mongo container above.

| Criterion | falsifying edit | observed |
|---|---|---|
| C1 | drop `activatedAt` from the `active` required list in whatsapp_links.schema.json | KILLED: fixture test and lifecycle test fail |
| C1 | add `maybe` to the `studentData` enum | KILLED: fixture test and lifecycle test fail |
| C1 | events `data.additionalProperties` false -> true | KILLED: fixture test and R-39 test fail |
| C2 | remove `unique` from `whatsapp_links_live_user` | KILLED: index declaration test and real-Mongo test fail |
| C2 | remove `unique` from `whatsapp_links_archiver_owner` | KILLED: same two tests |
| C2 | drop `live: true` from the live_user partial filter (terminal rows would block) | KILLED: same two tests |
| C2 | archiver owner filter `$type string` -> `$exists true` | KILLED: index declaration test |
| C3 | `getLink` queries a fixed tenant instead of the caller's | KILLED: cross-tenant test (and invalid-tenant test) |
| C3 | `insertLink` sets `live: true` regardless of state | KILLED: insertLink derivation test |
| C4 | add a `deleteOne` helper to the events accessor | KILLED: insert-and-read-only test |
| C4 | disable the forbidden/unknown payload key check | KILLED: R-39 payload test |
| C5 | `collMod: name` -> `collMod: name_x` (re-apply breaks) | KILLED: real-Mongo idempotency test |
| C5 | remove the `assertIsolatedWorkTarget` call from `up` | KILLED: work-DB guard test |
| C5 | drop the `boolean`->`bool` alias fix | KILLED: alias/keyword walk test and real-Mongo test |
Also tried and found EQUIVALENT (not counted): replacing the collMod branch by an unconditional `createCollection` survives, because Mongo 7 treats `createCollection` with identical options on an existing collection as a no-op.

## How to verify
- Real Mongo: `docker run -d --rm --name wa-links-schema-mongo -p 127.0.0.1:27555:27017 mongo:7`, then `WA_REVIEW_TEST_MONGO_URL=mongodb://127.0.0.1:27555 node --test migrations/whatsapp-links.migration.test.mjs` and, in packages/db, `... node --test --import tsx src/collections/whatsapp-links.test.ts`.
- `python schema/validate.py`; `node scripts/gen-types.mjs --check`; `node scripts/snapshot.mjs --check`; `pnpm lint:structure` (the dependencies stage takes several minutes on this machine).
- Cleanup: `docker rm -f wa-links-schema-mongo` (the unit creates no images).
