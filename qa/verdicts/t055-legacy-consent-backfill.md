# Verdict: t055-legacy-consent-backfill

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: fa2d191a1e71760877aaa8a0d82c2241df602662
Base: 24c42b31 (code in 9c1fcb4f, decision in b8868a14)
Unit: ISS-T055STORE-001 / D-181 (data write, full ceremony)

## Checked
1. D-181: docs/DECISIONS.md diff is 17 added lines, no deletions; follows D-180; has `Approved-by: Umesh`; quotes the Approver's words exactly. PASS.
2. Script: dry-run default; `--execute` without `--confirm-backfill D-181` throws (parseArgs); `--tenant` mandatory (no unscoped run); MONGODB_DB must be exactly lkb_staging before connect, then requireScriptDatabase(allowProduction:false), then db.databaseName re-checked in the core; no production flag. Collections all via scopedCollection; insertOne only (E11000 counted as raced, so a cross-tenant `_id` clash cannot overwrite); existing rows incl. withdrawn never touched; no path/url fields; row validates against schema/sources.schema.json (extra `backfill` is allowed by additionalProperties:true). Idempotent (re-run inserts 0). PASS.
3. Sessions: knowledge.ts:44-46 `context()` returns null when the source row is missing, so sessions are already hidden. Backfilling would newly expose them. Maker reasoning correct.
4. Tenants: the script does not enumerate; the operator must name each `--tenant`. Read-only `distinct("tenantId")` on lkb_staging: sources/sessions have toc and vidysea; document_documents has 0 rows in every tenant. Dry-run for `--tenant toc --tenant vidysea`: documents 0, missing 0, wouldInsert 0 in both. Execute for both is safe and would insert nothing.
5. Independent runs (timeout 600): backfill-document-consent.test.mjs tests 10 pass 10 fail 0 (exit 0); `lint-loc --all` exit 0, 10 stages 0 failed (after the replaceOne fake line the maker flagged). Receipts in scratchpad chk-consentfill.
6. Own mutation: parseArgs confirm-token check disabled (execute without token). Killed: pass 9 fail 1 ("writes need --execute and --confirm-backfill D-181..."). Per-mutation backup, EXIT/INT/TERM/ERR trap, timeout 120. Restored: `git -c core.autocrlf=true hash-object` edf16482 == `rev-parse HEAD:` blob. Working tree clean.

## Notes (not issues)
- The script does not check that a document sourceId equals a session sourceId; if it did, the new row would unhide that session. Moot now (0 documents on staging); revisit before any run that has documents.
- Production stays unauthorized (D-117).

## Authorization
Ledger row ISS-T055STORE-001 may be flipped once a run (or the no-op) is recorded.
`--execute --confirm-backfill D-181` IS authorized against lkb_staging only, tenants toc and vidysea (expected no-op: 0 documents). Not authorized on production.

ISSUES-WRITTEN: none
