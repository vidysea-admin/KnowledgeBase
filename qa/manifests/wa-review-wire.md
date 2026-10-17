# Manifest — wa-review-wire

**Handshake status:** checked-PASS (cycle 2, scoped to write-side; ISS-WA-REVIEW-WIRE-006 read-side quarantine still blocks mounting)
Status: checked-PASS
Fix cycle: 2
Task: T-007 (parent stays open; this is a scoped wiring unit)
Lane: lane/wa-review-wire, branched from lane/codexwave1 (Codex foundation, pending merge)
Priority tier: 3 — dependency-ready roadmap feature, assigned by orchestrator.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md criteria 8, 9 (write-side only), 10, 11, 12 (partial), 14 (partial).
Foundation: qa/manifests/whatsapp-review-foundation-20261014.md (checked-PASS cycle 2), whose "Remaining whole-task gates" this unit works down.
Security flags: tenancy, data writes, publication, source evidence. Full ceremony.

## Policy note (read first)
D-166 and D-167 are about T-037 join-rules (`last-valid`, one-hour bound). They say nothing about WhatsApp review or consent, so they authorise no WhatsApp policy. This unit invents none: it implements contract criteria 7–14 as adopted. One mapping choice is flagged for the checker, not a consent policy: an approved candidate becomes a `claims` row with `status: "verified"`, `origin: "speaker-statement"` (see Assumptions).

## What changed (apps/api/src/whatsapp/review/ only; no server.ts / production.ts / schema edit)
- `ingest.ts` — `createReviewedWhatsAppDeps`: wraps the existing `createMongoWhatsAppDeps` built WITHOUT an indexer, so no `indexSession` write (claims, chunks, session_pages, tree_index, entities) ever happens for WhatsApp. After the raw upsert it invalidates stale candidates, loads tenant claims as `knownContent` (same-tenant duplicate flags), runs detection, and inserts via the transactional repository. A failure surfaces (route 502); re-ingest is idempotent.
- `materializer.ts` — candidate-only materialiser: one approved candidate -> exactly one `claims` row `wa-claim:<id>` with exact quoted evidence, run inside the decision transaction. Refuses non-approved and personal-excluded input.
- `invalidate.ts` — source-edit invalidation in one transaction: any candidate whose exact turn evidence no longer matches loses trust. Pending stale candidates are deleted; decided stale candidates keep their audit row and have their claim revoked.
- `quarantine.ts` — `auditWhatsAppQuarantine(db, tenantId)`: reports every claims/chunks/session_pages/tree_index row derived from a WhatsApp session that is not an approved candidate's own claim.
- `compose.ts` — `createWhatsAppReviewWiring({resolveOwner, ...})` returns `{whatsapp, reviewRouter, repository}`.
- `store.ts` — one-word change: `checkEvidence` is now exported.
- Tests: `wire.test.ts` (8), `wire-mongo.test.ts` (1, gated), `wire-fixtures.ts` (in-memory transactional Mongo double).

## One-line mount for the integrator (not done here)
1. `apps/api/src/composition/production.ts` ~line 232: replace `whatsapp: createMongoWhatsAppDeps(boundIndexer, {...})` with `whatsapp: createWhatsAppReviewWiring({ resolveOwner: createConfiguredWhatsAppOwnerResolver(process.env.WHATSAPP_TENANT_OWNER_MAP) }).whatsapp` (keep the wiring object to also expose `reviewRouter`).
2. `apps/api/src/server.ts`, after `app.use(createWhatsAppRouter(deps.whatsapp));` and after auth middleware: `app.use(wiring.reviewRouter);`.
Do NOT mount until the read-side gap below is closed.

## Evidence
- `cd apps/api; node --test --import tsx src/whatsapp/**/*.test.ts src/whatsapp/*.test.ts`: tests 45, pass 44, fail 0, skipped 1 (the gated real-Mongo test). Of these 8 are new in-memory wiring tests.
- Scoped type check (temporary tsconfig with `paths` into the lane's packages, deleted afterwards): exit 0, no diagnostics. The default `tsc -p tsconfig.json` in this lane resolves `@lkb/core` to the MAIN tree, which lacks the generated `WhatsappCandidates` type, so it errors on the foundation files too: environment gap, not a regression.
- Criterion-8 mutation probes, `qa/evidence/wa-review-wire-mutate.mjs` (run from apps/api). Shape chosen after the in-place variant was denied by the auto-mode classifier: the tracked `detection.ts` is never modified; each mutant is a throwaway copy exercised by a copy of `detection.test.ts`; copies are removed in `finally`. Control (unmutated) exit 0. Result 6/6 KILLED: topic detection removed, decision detection removed, sensitive flag removed, personal/excluded flag removed, duplicate flag removed, evidence corrupted. First run showed 5/6: my "sensitive" mutation was ineffective (the `||` alternatives still fired), corrected to remove the `flags.push`, then killed.
- lint-loc (`node scripts/lint-loc.mjs --all`): all new files within budget. Two stages fail on the lane base, not on this unit: `packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400)` and `docs/SNAPSHOT.md is stale`.
- Full apps/api suite: see Full suite line below.

## Full suite
`cd apps/api; node --test --import tsx $(find src -name "*.test.ts")` (D2_FIXTURE_PYTHON set, TSX_TSCONFIG_PATH unset): tests 942, pass 941, fail 0, skipped 1 (gated real-Mongo test).

## Assumptions the checker should challenge
1. Approved -> `claims` row `status: "verified"`. The `claims` enum has no "approved"; "needs-review" would not be trusted, "verified" is the only reviewed value.
2. Source-edit invalidation cannot mark a decided candidate `invalidated` without a schema enum change plus regenerated `packages/core` types, both outside this lane's paths. It revokes the claim and keeps the decision row; `get` on it then reports evidence unavailable (honest error) rather than silently succeeding.

## Live gaps (T-007 is NOT done by this unit)
1. Read-side quarantine is NOT enforced. This unit prevents unreviewed content reaching `claims`/`chunks`/`session_pages`/`tree_index`/entities on the write side and provides the audit. But raw WhatsApp `turns` still exist and `/ask` lexical, `/search`, semantic-search, grounded-content, graph and store readers in `apps/api/src/ask`, `search-store.ts`, `semantic-search`, `grounded-content`, `store.ts` and `packages/ask` have no WhatsApp-session predicate. They are outside this lane's allowed paths. Criterion 9's tests (tree/vector/lexical arm would select the planted text without the guard) are not written.
2. WhatsApp content ALREADY indexed by the old production wiring (claims/chunks/tree) is not purged; the audit will report it. No deletion of existing data was attempted.
3. Real Mongo proof not run: no Mongo or Docker on this machine and the repo has no test-Mongo pattern. `wire-mongo.test.ts` is written, skipped without `WA_REVIEW_TEST_MONGO_URL` (replica set; db name forced to `lkb_test_wa_review_*`, `lkb` structurally refused), never executed here.
4. Not mounted; no UI (criterion 13); approved knowledge is a claim only, not yet chunked/embedded/in the tree, so approved `/ask` citation (criterion 9/12 positive path) is unproven.
5. Edit-then-revert of a source turn leaves an approved candidate without its claim (no automatic re-materialisation).
6. Full-suite status and the two pre-existing lint failures are listed above; no tracker (TASKS.md, goal.json) edited.

## Fix cycle 1 (responds to qa/verdicts/wa-review-wire.md, cycle 0 scoped PASS, issues ISS-WA-REVIEW-WIRE-001..007)

Counts by issue id (all tests in `wire-fix1.test.ts` unless stated; ledger reproduction replayed verbatim):
- ISS-WA-REVIEW-WIRE-001 (HIGH) FIXED 2/2. Verbatim repro (approve both, drop m1 upstream, re-ingest): claims 2 -> 1, turns 3 -> 1, pending candidate of the deleted message gone, never re-proposed, idempotent on repeat. The ingest captures the authoritative fetched snapshot (AsyncLocalStorage around the fetcher, fail-closed if absent); `invalidate.ts` removes absent turns, revokes/deletes derived claims/candidates and writes a `whatsapp_review_log` history row (`kind: upstream-deleted`, text SHA-256 only, never the deleted text) in ONE transaction.
- ISS-WA-REVIEW-WIRE-002 (medium) FIXED 1/1. A durable `pending-invalidation` marker is written before any raw write and cleared after invalidation. Failure leaves the marker, and the audit now flags any approved claim whose quote no longer equals its live turn. `wiring.repairPendingInvalidations(tenantId)` converges (claim revoked, marker cleared) and a second call is a no-op.
- ISS-WA-REVIEW-WIRE-003 (medium) FIXED. All 6 cycle-0 survivors now killed, plus the new code: `qa/evidence/wa-review-wire-mutate-cycle1.mjs` 9/9 KILLED (status label, personal-excluded guard, non-approved guard, unscoped invalidate find, unscoped revoke, deleted-turn removal, marker clearing, source field, stale-quote audit). Mutants run on a throwaway copy dir only. The redundant `row.tenantId` guard in invalidate was removed because the scoped query makes it unreachable. A first run showed the non-approved guard surviving; test sharpened, then killed.
- ISS-WA-REVIEW-WIRE-005 (HIGH policy) DECIDED by Umesh, relayed by the coordinator, verbatim: "mark it verified with soruce as whatsapp". Implemented in one place (`materializer.ts`: `WA_APPROVED_CLAIM_STATUS = "verified"`, `WA_CLAIM_SOURCE = "whatsapp"`). Every WhatsApp-materialised claim carries `source: "whatsapp"` and its tenantId; claims has no existing `source` field (only `origin`), the schema allows additional properties, so no schema edit (core types untouched). Audit flags an approved claim lacking it. Asserted in 2 tests.
- ISS-WA-REVIEW-WIRE-004 (low) NOT FIXED, listed: edit-then-revert leaves an approved candidate without its claim.
- ISS-WA-REVIEW-WIRE-007 (low) NOT FIXED, listed: needs indexing-path changes outside this lane's paths.
- ISS-WA-REVIEW-WIRE-006 (HIGH tenancy, read-side quarantine) unchanged and still blocks mounting.

Cycle-1 evidence: WhatsApp tests (`node --test --import tsx src/whatsapp/review/*.test.ts src/whatsapp/*.test.ts`, TSX_TSCONFIG_PATH set to the absolute temporary paths tsconfig, deleted afterwards): tests 51, pass 50, fail 0, skipped 1 (gated real Mongo). Scoped tsc with that tsconfig: exit 0. Full apps/api and lint-loc: see line below.
Full apps/api (TSX_TSCONFIG_PATH absolute temp tsconfig): tests 948, pass 947, fail 0, skipped 1. lint-loc: no violation in any new/changed file; `lint-loc --all` fails only on the two pre-existing stages (meeting-bot py test 408 lines, stale SNAPSHOT.md).

## Fix cycle 2 (responds to cycle-1 scoped PASS, issues ISS-WA-REVIEW-WIRE-008..012)

Counts by issue id (`wire-fix1.test.ts`; fixture now enforces Mongo `_id` uniqueness across tenants):
- ISS-WA-REVIEW-WIRE-008 (tenancy) FIXED 1/1. Review-log ids (marker and deleted-turn history) are `whatsAppLogId(tenantId, ...)`, a length-prefixed tenant-structured id, so a leftover tenant-A marker cannot E11000 tenant B (two-tenant test on the unique-_id fixture; boundary-ambiguity assertions included).
- ISS-WA-REVIEW-WIRE-009 (data loss) FIXED 4/4. `SnapshotShrinkError` is thrown before any write when the snapshot is empty over stored turns, or would delete more than `maxDeleteFraction` (default 0.5, configurable, "over" not "at"). It is logged durably (`snapshot-refused` row), alerted (`console.error` "ALERT whatsapp-review"; no email channel exists in this lane), and leaves the pending marker. Bypass only through `wiring.forceIngestGroup` (operator-only, not on any route). Tests: empty snapshot, empty with threshold 1, 3-of-4 mass shrink, exactly-50% allowed, configurable 0.9, single legitimate deletion.
- ISS-WA-REVIEW-WIRE-010 (low) FIXED 1/1. Deleted-message text and evidence quotes are redacted from decided candidate rows; contentHash, decision and status remain; test greps candidates, log, claims and turns for the deleted text. The unsalted-hash note is not addressed (log stores a plain SHA-256; salting needs a secret store, listed).
- ISS-WA-REVIEW-WIRE-011 (low) FIXED 1/1. Missing snapshot throws with turns/claims/candidates byte-identical; affected-candidate lookup asserted tenant-scoped.
- ISS-WA-REVIEW-WIRE-012 (low) FIXED. `schema/claims.schema.json` gains optional `source` enum `["whatsapp"]`; `node scripts/gen-types.mjs` regenerated only `packages/core/src/generated/claims.ts` (and `gen-types --check`: 30 files match). The two files sit outside apps/api/src/whatsapp, in the schema-owning paths the brief allowed.
- Mutation probes `qa/evidence/wa-review-wire-mutate-cycle2.mjs` (throwaway copy dir): 11/11 KILLED (first run 10/11: the empty-snapshot refusal was masked by the fraction rule, fixed with a threshold-1 test).
- Still open: ISS-WA-REVIEW-WIRE-004, ISS-WA-REVIEW-WIRE-006 (blocks mount), ISS-WA-REVIEW-WIRE-007, hash salting, no alert channel beyond console and the log row.

Cycle-2 evidence: WhatsApp tests 57 total, 56 pass, 0 fail, 1 skipped (gated real Mongo); scoped tsc with temporary absolute paths tsconfig (deleted afterwards): exit 0. Full apps/api and lint-loc: see line below.
Full apps/api (absolute TSX_TSCONFIG_PATH): tests 954, pass 953, fail 0, skipped 1. lint-loc: only the pre-existing meeting-bot py test (408 lines) fails; no new/changed file over budget.
