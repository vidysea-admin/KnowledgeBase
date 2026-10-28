Status: checked-PASS
Fix cycle: 2
Lane: lane/w17-hardening (base 9e55b642)
Units (one commit each): 561036c3 (T-007 gate test), e5f5fbf4 (ISS-ALERTTENANT-001), see git log for private-acl F-1.
Changed: apps/api/src/native-evidence/message-publication.test.ts; scripts/webinar/start-record-detached.test.mjs; packages/meeting-bot/src/capture/record-consent/private-acl.{ts,test.ts}
Notes: ISS-ALERTTENANT-001 launcher already routes -Job through runScheduledDispatch (requireStateTenant); ps1 unchanged. T-007: with consent.given:false/withdrawn the downstream claimVisible also refuses, so only consent-absent isolates the line-47 gate (mutation evidence in packet).
Checks: node --test --import tsx for message-publication.test.ts (apps/api), start-record-detached.test.mjs (root), private-acl.test.ts (packages/meeting-bot).
Cycle 2: private-acl files restored to LF (diff vs base 5/23 lines); T-007 proxy now consented on reads 1 and 3+, so line-47 deletion fails given:false/withdrawn/absent direct tests (+ existing absent test).
