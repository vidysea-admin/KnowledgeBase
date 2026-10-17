# Verdict: legacyseed-legacy-unbound-toc-seed
VERDICT: PASS
Cycle checked: 0
Checker: independent, fakes only (no DB connected, no .env read).

EXPLANATION:
- Guard probe: 13 name variants (lkb, LKB, Lkb, "lkb ", tab, "lkb_staging/../lkb", "lkb_staging?authSource=lkb", trailing space/newline/NUL, empty, global_university_db) x LKB_ALLOW_STAGING {unset, lkb_staging, empty, upper} x MONGODB_DB {unset, lkb, lkb_staging} x URI path lkb x 4 guards. No combination resolves to lkb. The URI path and authSource are ignored because connect() takes dbName explicitly. Empty env refuses. Flag without opt-in and opt-in without flag both behave as specified in backfill (opt-in without flag refuses).
- backfill and sync-speakers: lkb default removed, refuse with no DB, lkb_work_* still accepted, staging only with flag + opt-in.
- Stamp: source, session, turn, claim, page all stamped (21 real dirs loaded, 0 unstamped); chunks stamped via backfill. No-flag path is the unchanged assertDerivedArtifactsCurrent. No dir has a proof file, but the test covers a present proof going through normal validation. The 8 invalid-evidence sessions are still refused; 3 synthetic dirs lack session.json.
- 8 mutations killed, 0 survived, each restored with hash equal to the HEAD blob: guard accepts lkb; case bypass; stamp missing; flag ignored; staging without flag; opt-in value unchecked; backfill default restored; sync-speakers default restored. Harness deleted.
- Tests: legacy-unbound 7/7, transcript-provenance 15/15, apps/api legacy-unbound-chunks + session 30/30, tsc apps/api clean.
- Writer sweep: maker's 001-007 confirmed. Missed: apps/api/src/index.ts:21 defaults to lkb (filed high). Other connects (upload/queue, whatsapp store, recover-toc, toc-embedding-backfill, sync-real-turns) are guarded or non-lkb.
- Note: lkb_staging is reachable via plain requireWorkDatabase without the double opt-in (ISS-LEGACYSEED-010, medium; lkb stays refused).

ISSUES-WRITTEN: ISS-LEGACYSEED-009 (high), ISS-LEGACYSEED-010 (medium)
