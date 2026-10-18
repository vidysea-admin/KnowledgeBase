# w23-webhints

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w23-webhints (branch lane/w23-webhints)
Base: 3c99337f (origin/master)
Web commit: 8c46caae. Candidate = lane HEAD (this manifest's commit, api test only on top of 8c46caae).

## Issues
- ISS-WEBHINTS-001 (opt-out UI cannot send meetingUrl): ApprovalsPanel gains an optional "Meeting link for the opt-out (optional)" field; checkMeetingUrl (joinRulesModel.ts) accepts blank or http(s) <= 2048; value rides in Pending.hints to postPending/optOutBody; shown in the confirmation; never on approvals. sessionKey still has no web source (left open, needs an API/calendar source).
- ISS-WEBHINTS-002 (60 s cap, timer cleanup unpinned): two fake-timer tests in joinRulesBusyHints.test.tsx.
- ISS-RULESWEB-002 (Authorization override unpinned): client.test.ts case. The repro found a real defect: a differently-cased duplicate key ("Authorization: Bearer evil2") was merged by fetch into "Bearer real-key, Bearer evil2". client.ts now drops caller authorization/content-type in any letter case (callerHeaders).
- ISS-JRLOCK-002: (a) api test pins message literal and busy code; web test pins BUSY_ERROR_CODE literal (the web no longer uses the message text, so the web copy of the message no longer exists); (b) api test pins Retry-After "5"; (c)/(d) web busy-on-load tests already existed on master (joinRulesBusyHints.test.tsx), re-verified by mutation M5.

## D-015 (recorded reproductions, replayed)
- ISS-WEBHINTS-002: 3/3 mutations (cap removed, clearTimeout removed; regex {1,6}->{1,12} NOT replayed: parseRetryAfter digit-width mutation is covered only by the 999999 test passing through 6 digits; left open, low value)
  -> counted: 2/3 killed, 1 left open (regex width).
- ISS-RULESWEB-002 M5 (spread options.headers after authorization): 1/1 killed (M1b).
- ISS-JRLOCK-002: (a) 1/1 killed (M7), (b) 1/1 killed (M6), (c) 1/1 killed (M5), (d) readText busy branch: not separately mutated, covered by the same load-busy test; counted 3/4 mutated + 1 argued.

## Checks a checker must run
- cd apps/web: node node_modules/vitest/vitest.mjs run src/pages/join-rules src/api src/pages/calendar  -> 22 files, 312 passed
- cd apps/web: tsc --noEmit -> exit 0; cd apps/api: tsc --noEmit -> exit 0
- cd apps/api: node --test --import tsx src/join-rules/router.test.ts src/join-rules/busy-status.test.ts -> pass 34, fail 0
- node scripts/lint-loc.mjs --all -> OK (10 stages, 0 failed)

## D-020 mutations (scripts: KnowledgeBase-lanes/w23-webhints-mut/mut.sh, per-mutation backup + trap, cmp restore, hash check vs HEAD)
M1 callerHeaders passthrough (case-variant dup) killed; M1b spread after authorization killed; M2 no cap killed; M3 no clearTimeout killed; M4 hints dropped killed; M5 load catch without busy killed (4 tests); M6 api Retry-After 50 killed (5 fail); M7 api message changed killed (5 fail).
Post-run: router.ts and JoinRulesPage.tsx hash-object (autocrlf=true) equal HEAD blobs.

## Left
- ISS-WEBHINTS-001 sessionKey source; regex-width mutation of parseRetryAfter.
- Ledger rows not flipped (per brief).
