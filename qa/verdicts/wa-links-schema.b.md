# Verdict — wa-links-schema (coordinator B, blind dual check)
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** B (fresh; did not read coordinator A's verdict, checkpoint or evidence)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** 69806029..1a0d1480 (code commit 7d171cff; 1a0d1480 adds only qa/manifests/wa-links-schema.md). Bound tree clean before and after.

## Independent evidence (re-run by checker; own throwaway mongo:7 container on 127.0.0.1:27556, removed afterwards; one file per invocation, timeout 300s)
- C1: `node --test migrations/whatsapp-links.migration.test.mjs` 7/7 pass, 0 skipped (fixture walk per collection, lifecycle rejection reasons, R-39 forbidden fields top-level and in data, Mongo validator rejects code 121 for missing tenantId, unknown field, bad studentData, live/state mismatch, non-hex owner, active without activatedAt). `python schema/validate.py` PASS 49 schemas.
- C2: same file, real-Mongo test: second live link same (tenantId,userId) 11000; terminal row does not block a new live link; same user in another tenant allowed; archiverOwnerId unique across tenants and terminal rows (11000); legacy userId:null several per tenant, unique per owner. My own probe (not in the maker's tests): requested vs suspended duplicate both blocked; resurrecting a terminal row to live while another live exists -> 11000; flipping state without live -> 121; active without approvedBy -> 121.
- C3: `cd packages/db; node --test --import tsx src/collections/whatsapp-links.test.ts` 7/7 pass; `tsc --noEmit -p packages/db/tsconfig.json` exit 0. Every invalid tenant form (undefined, null, "", padded, newline, {$ne:null}, 7) throws on links, syncRuns, events, getLink, findLiveLinkForUser, insertLink; cross-tenant getLink and findLiveLinkForUser return null; insertLink pins the tenant over a forged tenantId and derives live over a forged live.
- C4: events accessor keys exactly get/insert/list, frozen, no update/delete/replace/bulk name exported; payload tests refuse every FORBIDDEN_EVENT_FIELDS key, nested values, top-level text and archiverOwnerId; drift guard ties EVENT_DATA_KEYS to the schema; real-Mongo paging in (at,_id) order and cross-tenant cursor refused.
- C5: `up` run through the real path twice on an isolated work DB (MONGO_WORK_DB set, db name matching): applies, re-applies, no error; `up` on a differently named db refuses; guard test and `down` refusal pass. `node scripts/lint-migrations.mjs` OK; `lint-loc`, `lint-dirsize`, `lint-dupes` OK; `gen-types --check` OK (49 files); `snapshot --check` OK. (pnpm lint:structure not re-run in full; its migrations, loc, dirsize and dupes stages were run individually.)

## Falsification (independent mutants; throwaway copy of git archive HEAD under the scratchpad, node_modules junctions, bound tree never mutated; per-mutation byte backup restored in finally; `git hash-object` == `git rev-parse HEAD:<file>` after every mutation, all 11 True; junctions unlinked, targets intact)
- C1: drop tenantId from links required -> KILLED. Loosen archiverOwnerId pattern to {1,24} -> KILLED. Open events top-level to a `text` property -> KILLED.
- C2: drop `userId $type string` from live_user partial filter -> KILLED. Remove tenantId from the live_user key -> KILLED.
- C3: `findLiveLinkForUser` coerces tenant with String(tenantId) (would let {$ne:null} become a valid tenant) -> KILLED (invalid-tenant test, confirmed 1 fail by name).
- C4: add a `patch` updateOne helper to events accessor -> KILLED. Remove Object.freeze -> KILLED.
- C5: validationAction error->warn -> KILLED. createIndex(keys, spec)->createIndex(keys) (unique lost) -> KILLED. Remove `db.databaseName !== target.dbName` guard clause -> KILLED.
- Surviving mutants: none.

## Adversarial hunt (tenancy, data write)
- Cross-tenant read: scopedCollection pins tenantId on every find/findOne/insert/update; `events.list` cursor lookup is tenant-scoped (cross-tenant afterId refused). No bypass found. A caller-supplied `linkId` filter in `events.list` is an untyped value at runtime but can only widen within the pinned tenant.
- Forged tenantId/live on insert: overridden (tested). Event top-level `tenantId` refused by the accessor allowlist.
- Append-only: enforced by accessor and test only; at the DB, update and delete on whatsapp_events succeed (probed). The manifest names this (open point 5, deployment role). Not a defect of this unit.
- No production Mongo touched; migration `up` is guarded by requireWorkDatabase and a name match; `down` refuses.

## PROPOSED-ISSUE (none block PASS; dual check, no ledger rows written by B)
PROPOSED-ISSUE: severity=low; whatsapp_events.at and the link timestamps are unconstrained strings in the Mongo validator (format date-time is dropped; probed: at:"zzz" and createdAt:"garbage" accepted). Events cursor paging orders by string `at`, so a malformed caller-supplied `at` misorders the audit log. Fix direction: add an ISO-8601 pattern to the schemas, or ignore caller `at` in events.insert. file-don't-fix.
PROPOSED-ISSUE: severity=low; userId uniqueness is by exact string ("U", "u", "U " are three distinct live links in one tenant, probed). Normalisation belongs to the users id format (A1/W5), so the W5 request path must canonicalise userId before insert. Not a W1 defect.
PROPOSED-ISSUE: severity=low; actorId/requesterId/approverId/targetUserId patterns accept a digits-only string, so a phone number would pass the id pattern (R-39 cannot be fully enforced by shape). Fix direction: the writers (W5/W7) must pass user ids from the session only. file-don't-fix.
PROPOSED-ISSUE: severity=low; archiverOwnerId is unique across tenants, so a duplicate-key error in tenant B reveals that an owner id is in use elsewhere (an existence oracle for a value the caller already supplied). Writers must not return the raw Mongo error to non-admins.

## Notes (not issues)
Maker's open points 1-6 are coordinator decisions (H-3 approval evidence, admin.raw_read event, blocksNewRequests enforcement in W5, no sync-run writer yet). Integer count fields reject values above 2^31 (bsonType int); irrelevant for the stated counts.

Metrics: check_min=8 falsifications=11 survivors=0 policy=proportional-verification/2026-10-19.17 cycle=0
