# Manifest: t055-legacy-consent-backfill

Status: ready-for-check
Fix cycle: 1
Unit: ISS-T055STORE-001 / D-181, staging-only backfill of consent-given `sources` rows for legacy documents
Lane: w22-consentfill (lane/w22-consentfill, root C:\Users\product\Desktop\KnowledgeBase-lanes\w22-consentfill). Base 24c42b31 (lane/w21-integrate, PR #7 head). Code candidate 9c1fcb4f; decision commit b8868a14; this manifest is the commit after 9c1fcb4f.
Authority: D-181 (Approved-by Umesh, verbatim quote inside the entry). Production stays unauthorized (D-117).

## Changed paths
- docs/DECISIONS.md: D-181 appended via scripts/append_decision.ps1 (additions only, 17 lines). Commit b8868a14.
- scripts/operations/backfill-document-consent.mjs (new). scripts/operations/backfill-document-consent.test.mjs (new, 10 tests). Commit 9c1fcb4f.
- qa/manifests/t055-legacy-consent-backfill.md (this file).
- scripts/operations has 8 entries, dirsize budget 30.

## Behaviour
- Missing-row lookup is the same as `sourceWithdrawn` (collections-store.ts): scoped `sources.findOne({_id: document.sourceId})`; a document with no row (in its tenant) gets one.
- Inserted row: `_id` = sourceId, kind `document` (from format pdf/docx), captureMode `provided`, hash = document.version, consent {given: true, recordedBy: "owner-attestation:D-181", note}, createdAt = document createdAt, `backfill: {decision: "D-181", at}`. No path or url fields. Validated against schema/sources.schema.json via scripts/lib/mini-schema.mjs.
- Dry-run default, prints counts and ids only. Writes need `--execute --confirm-backfill D-181`. `--tenant` is mandatory and repeatable; every collection handle comes from scopedCollection.
- Insert-only (`insertOne`; duplicate key counted as `raced`). An existing row in any state is never modified.
- Guard: MONGODB_DB must be exactly `lkb_staging` (checked before connect), then `requireScriptDatabase(env, argv, {allowProduction:false})` (needs LKB_ALLOW_STAGING=lkb_staging and MONGO_WORK_DB=lkb_staging), then the core re-checks `db.databaseName`. The production flag is not implemented; unknown flags are refused.
- Sessions: NOT backfilled. `context()` in apps/api/src/visibility/knowledge.ts returns null when a session's source row is absent, so sessions already fail closed. The script only counts sessions without a row.
- Consumers: apps/api/src/knowledge/collections-router.ts routes (GET document, GET page, POST highlights) read the rows through `sourceWithdrawn`; no code change there.

## Checks (all in lane, timeout 600)
- `node --test --import tsx scripts/operations/backfill-document-consent.test.mjs`: tests 10, pass 10, fail 0.
- `node scripts/lint-loc.mjs --all`: exit 0, 10 stages 0 failed (run before one test-fake line, replaceOne, was added; re-run advised).
- `node scripts/lint-dirsize.mjs`: OK. `node scripts/tracker-audit.mjs --gate g1,g4,g5`: OK, exit 0 (advisories only). tsc not applicable (plain .mjs).
- D-020 mutations (per-mutation backup, subshell trap, `timeout 120`, `git -c core.autocrlf=true hash-object` vs `rev-parse HEAD:<file>`):
  - overwrite existing rows (skip existing check, replaceOne upsert): killed, pass 5 fail 5 (existing rows untouched, re-run inserts 0, created rows, dup race, dry-run).
  - skip staging guard: killed, pass 9 fail 1 ("a non-staging database is refused...").
  - both restored; script blob edf16482 == HEAD blob, test blob fe971418 == HEAD blob.
- Corpus: ISS-T055STORE-001 has a prose repro and no recorded case list; the fixture reproduces it as a document with no sources row (d1, d3) beside a withdrawn row (d2). Count 2/2 documents gain a row.

## Dry-run on staging (keys from the main .env, not printed)
`node scripts/operations/backfill-document-consent.mjs --tenant toc` with DOTENV_CONFIG_PATH, LKB_ALLOW_STAGING and MONGO_WORK_DB set: document_documents total 0, missing 0; sessions total 21, without source row 0; wouldInsert 0. Nothing written. Other tenants not enumerated (no unscoped query).

## Remaining
- Checker PASS required before any `--execute` run. Execution on staging is a no-op for tenant toc as measured.

## Fix cycle 1 (checker ff551635 note)
- Script now skips any document whose `sourceId` is referenced by a session in the same tenant (`skippedSharedWithSession`, ids in `skippedIds`); it never inserts for them, so no session is unhidden.
- Test added (11 tests): `node --test --import tsx` pass 11 fail 0. `lint-loc --all` exit 0 (10 stages, 0 failed).
- D-020 mutation (guard removed, backup + trap + autocrlf hash): killed, pass 10 fail 1; restored, blob dd05c7f3 before and after.
- Staging dry-run was not repeated (0 documents). Execute not run.
