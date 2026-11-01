# wa-unlink-consent coordinator B - falsification table (isolated copies of 26416d51 outside the bound root; green-before taken in each copy)
| id | criterion | edit (single hunk) | green-before (copy) | red-after (first failing test) |
|---|---|---|---|---|
| M1 | W8-1 | quarantineCandidates call -> Promise.resolve(0) (service.ts followThrough) | 21/21 | R-7 unlink order; R-8 revoke; R-7 data steps fail independently |
| M2 | W8-2 | removed `if (l.state === to) return finish(l,false)` | 16/16 | R-7 idempotent; R-7 archiver down; R-8 revoke |
| M2b | W8-2 (archiver) | `!l.archiverUnlinkPending ||` dropped (archiver re-called on repeat) | 16/16 | R-7 idempotent (no second archiver call) |
| M3 | W8-4 | accountChanged guard `status==="active"&&...` -> false (healthy event suspends) | 16/16 | R-10 account coupling |
| M4 | W8-5 | consent loop in createLinkDataPort removed (store.ts) | 5/5 | W8 withdraw; W8 withdraw+approve race; W8 interleaving sweep |
| M5 | W8-7 | revoke admits non-admin (`!p.admin` dropped) | 16/16 | R-8 revoke (owner cannot revoke) |
| M6 | F-1 | pre-QR `store.touch` removed | 16/16 | ISS-WALINKS-001 revoke after owner exists never gets QR |
| M7 | F-2 | resume role check -> false (viewer resumes) | 16/16 | ISS-WALINKS-006 |
| M8 | F-3 | `|| !p.actor` dropped from unlink | 16/16 | R-7 authorisation |
| M9 | F-4 | owed() ignores ownerInUseByOther | 16/16 | ISS-WASYNC-001 |
| M10 | W8-6 | quarantine updateOne status CAS dropped (store.ts) | 5/5 | W8 interleaving sweep |
| M11 | W8-3 | quarantine also rejects `approved` rows (find + update filter) | 5/5 | W8 quarantine; W8 interleaving sweep |
| M12 | W8-1 (archiver) | pending flag cleared although archiver step failed | 16/16 | R-7 archiver down |
| S1 | S-1 | schema anyOf (flag only on terminal state) removed | 7/7 migration test | fixture + archiverUnlinkPending schema tests (2 red) |
Harness: scratchpad mut.py (not committed); each mutant in its own copy dir with junctioned node_modules; the bound worktree and the pristine archive copy were never edited.

# Real Mongo (local mongod 7.0 replica set 127.0.0.1:27931, throwaway db lkb_test_wa_*, dropped; not production)
- committed unlink.mongo.test.ts as shipped: with WA_REVIEW_TEST_MONGO_URL only -> "explicit isolated work database and Mongo URL required; production writes refused"; with MONGO_WORK_DB/MONGODB_URL set to any fixed name -> "whatsapp_links: explicit isolated work database required; protected database refused" (db name is random inside the test). Same for pre-existing links.mongo.test.ts.
- copy patched to set process.env.MONGO_WORK_DB=name, MONGODB_URL=url: next failure `assert.rejects(reviews.decide(..."late-reviewer"))` at line 69 ("Missing expected rejection"): decide() resolves {result:"conflict"} for a candidate the unlink rejected (store.ts decide, row.status !== needs-review).
- copy with that assertion relaxed to "late approval changes nothing": 5 runs x 20 rounds, all pass; tallies approvalFirst/unlinkFirst: 20/0, 19/1, 20/0, 19/1 (+ first run); consent always withdrawn, one link.unlinked event per link, approved <=> claim, quarantined => no claim.
- migrations/whatsapp-links.migration.test.mjs with the Mongo URL: 8/8 incl. real-Mongo apply + flag only on terminal link.
- own probe (probe.tmp.test.ts, copy only): archiver down -> state unlinked, live false, archiverUnlinkPending true, archiver owner still active; retry with archiver up -> flag unset, owner unlinked, changed:false; third unlink archiver "none"; revoke of a suspended link by admin sets revokedReason + blocksNewRequests and a new request answers 403 link_blocked; owner revoke refused; unlink of a requested link owes nothing; cross-tenant admin refused.
