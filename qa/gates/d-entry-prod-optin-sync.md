## D-204 | 2026-10-28 | type: decision | status: ACTIVE
**Title:** Webinar pipeline may write lkb_prod only through the three-part production opt-in
**What:** Umesh chose cutover option (a) on 2026-10-28 ("hnn jo doo , go with with best recommended manner"; recorded in qa/gates/golive-decisions-2026-10-28.md batch 2). scripts/webinar/sync-session.mjs gains the same three-part production opt-in already used by mint-key.mjs, recover-index-attempt.mjs and backfill-document-consent.mjs: caller allowProduction, the flag --i-know-this-is-production, and MONGODB_DB=lkb_prod. Without all three the existing refusal (isProtectedWorkDbName) stays exactly as today. isProtectedWorkDbName itself is NOT weakened and no other script gains the opt-in.
**Why:** The pipeline runs on the Ubuntu server and must write the production database after go-live, including reindexing the two FAILED sessions ("Visa Blueprint Part 2", "Funding Dreams"). Today sync-session.mjs refuses lkb_prod unconditionally, so the cutover is impossible without either this opt-in or a manual bypass; an explicit, logged, three-part opt-in is the narrowest change.
**Result:** Pending: maker unit prod-optin-sync (tier L, prod-write, dual check). Running it against lkb_prod on the server stays a separate human/devops step.
**Changes-authorized:**
- scripts/webinar/sync-session.mjs (production opt-in only), its tests, docs/GO-LIVE-UBUNTU.md (cutover command)
**Links:** qa/gates/golive-decisions-2026-10-28.md, scripts/lib/transcript-provenance.mjs, references/portals/lkb-live.knowledge.md
