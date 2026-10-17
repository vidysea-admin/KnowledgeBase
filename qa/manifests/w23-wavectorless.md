# Manifest - w23-wavectorless

Status: ready-for-check
Fix cycle: 1
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w23-wavectorless (lane/w23-wavectorless)
Base: 3c99337f (origin/master)
Issues: ISS-WAVECTORLESS-001, -002, -003 (ledger rows not flipped; qa/issues.WAVECTORLESS.jsonl)

## State found
The base already had the -001 refusal (`consent.given === false`), the -003 `$setOnInsert` upsert and a UUID write-fence for -002, all from the unexecuted whatsapp-vectorless-integration / whatsapp-consent-race units. This unit hardens and verifies them.

## Changes
- schema/sources.schema.json + packages/core/src/generated/sources.ts (gen-types): optional `sourceMeta.authorizationRevision` (integer >= 0, absent = 0).
- apps/api/src/whatsapp/review/store.ts:
  - checkEvidence fails closed unless `consent.given === true` (absent/malformed refused, not just explicit false); rejects a non-integer/negative revision; returns the revision it validated.
  - fenceApproval is now a CAS: filter on that revision and consent.given === true, `$inc` revision.
  - new `withdrawWhatsAppSourceConsent`: conditional on the revision it read, `$inc` revision, bounded re-read/retry on lost CAS, throws on exhaustion, idempotent.
- apps/api/src/whatsapp/review/test-fixtures.ts, wire-fixtures.ts: `$inc`, null-equals-missing matching, session-scoped undo journal (so a concurrent out-of-session commit survives rollback); reviewInput source carries consent.
- consent-race.test.ts: fence filter/revision assertions strengthened (revision CAS added).
- consent-cas.test.ts (new, 6 tests).
- apps/api/src/whatsapp/store.ts is unchanged (-003 already `$setOnInsert`).

## D-015
- ISS-WAVECTORLESS-001: 3/3 recorded floor tests (store.test.ts 'withdrawn source consent refuses proposal insertion...', 'withdrawal between proposal and approval...', 'idempotent approval retry rechecks...') pass.
- ISS-WAVECTORLESS-003: 3/3 recorded cases (namespaced, legacy bare-hash, withdrawal immediately before upsert) pass in store-source-id.test.ts.
- ISS-WAVECTORLESS-002: recorded repro is conceptual (pause after source read, owner withdraws, resume): covered by consent-cas.test.ts 'withdrawal committed after the approval's source read aborts approval' on the in-memory fixture. Left open: the real-Mongo replica-set run (consent-race-mongo.test.ts, opt-in via LKB_WHATSAPP_CONSENT_MONGO_RUN=1) was NOT run - no isolated replica set available and rules forbid real MongoDB.

## Checks run (all from lane)
- node --test (apps/api): review/*.test.ts, whatsapp/*.test.ts, whatsapp-review/*.test.ts, composition/integrations/*.test.ts: tests 104, pass 102, fail 0, skipped 2 (the native Mongo opt-in tests).
- Concurrency (consent-race.test.ts + consent-cas.test.ts) repeated 15x: 15/15 pass; the interleaving test also loops 15 rounds in both orders.
- apps/api tsc --noEmit: clean. packages/core tsc --noEmit: clean.
- scripts/lint-loc.mjs --all: OK (10 stages, 0 failed).
- schema/validate.py (main .venv): PASS 46 collection schemas. gen-types.mjs --check: OK.

## D-020 mutations (per-mutation byte backup, trap INT/TERM/ERR, cmp restore; script outside repo)
- M1 consent check `!== true` -> `=== false` (001): 1 fail caught.
- M2 fence revision filter dropped (002): 2 fail caught.
- M3 withdrawal `$inc` dropped (002): 2 fail caught.
- M4 store.ts (whatsapp) `$setOnInsert` -> `$set` (003): 6 fail caught.
- M5 fence `consent.given: true` -> `$ne: false`: 1 fail caught.
All restored; apps/api/src/whatsapp/store.ts hash equals HEAD blob.

## Checker should run
The two race test files and store.test.ts / store-source-id.test.ts; schema/validate.py; gen-types --check; lint-loc --all; at least one mutation of the fence revision filter.

## Fix cycle 1 (checker verdict ba318a36 on 382e0c14)
- tsc: the cycle-0 "clean" claim was wrong; consent-cas.test.ts(112,50) TS2322. Fixed with a typed `collection<{_id: string; ...}>` helper (no `as never`). apps/api tsc exit 0, packages/core tsc exit 0.
- M1 survivor: new test "revision bump between the withdrawal's read and write forces a retry" asserts 3 sources writes with revision filters {$in:[null,0]} then 1, final revision 2. Mutation removing the revision from the withdrawal filter: killed (pass 6, fail 1).
- Production caller GAP (explicit): no API route, review action or store method writes WhatsApp source consent=false anywhere in apps/api or packages (greps find only readers: collections-store.sourceWithdrawn, visibility, head-store, speaker-profiles). `withdrawWhatsAppSourceConsent` therefore has no production caller; the owner-withdrawal entry point must be built and must call it, or the CAS protects nothing. Not wired here: needs an owner-facing route decision.
- Results: whatsapp tests (review, whatsapp, whatsapp-review) see commit message counts; race files repeated 15x; lint-loc --all OK.
