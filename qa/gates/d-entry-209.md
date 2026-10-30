## D-209 | 2026-10-29 | type: decision | status: ACTIVE
**Title:** The single KB database is the existing lkb_prod; the copy tool is dropped
**What:** Umesh answered the D-208 database-name gate (qa/gates/single-db-2026-10-29.md): lkb_prod, which already lives on the MONGODB_URL server, stays the single source of truth. No new database is created and nothing is copied. D-208 item 4 (scripts/db/copy-kb-db.mjs) is withdrawn; items 1-3, 5 and 6 stand and target lkb_prod. Writes to lkb_prod keep going only through the D-204 opt-in and approved paths.
**Why:** The KB data is already in a database the KB owns on that server; a rename would add a production copy and cutover with no benefit.
**Result:** kb-db-copy cancelled before any commit; data-stores-inventory continues with lkb_prod as the target.
**Supersedes:** D-208 -- item 4 only (the copy tool); keeping lkb_prod avoids a production copy and cutover, items 1-3, 5, 6 stand
**Changes-authorized:**
- none beyond D-208 (minus scripts/db/copy-kb-db.mjs)
**Links:** qa/gates/single-db-2026-10-29.md, D-204, D-208
