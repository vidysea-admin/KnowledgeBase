Status: ready-for-check
Fix cycle: 1
Lane: lane/w17-hardening (base 9e55b642)
Units (one commit each): 561036c3 (T-007 gate test), e5f5fbf4 (ISS-ALERTTENANT-001), see git log for private-acl F-1.
Changed: apps/api/src/native-evidence/message-publication.test.ts; scripts/webinar/start-record-detached.test.mjs; packages/meeting-bot/src/capture/record-consent/private-acl.{ts,test.ts}
Notes: ISS-ALERTTENANT-001 launcher already routes -Job through runScheduledDispatch (requireStateTenant); ps1 unchanged. T-007: with consent.given:false/withdrawn the downstream claimVisible also refuses, so only consent-absent isolates the line-47 gate (mutation evidence in packet).
Checks: node --test --import tsx for message-publication.test.ts (apps/api), start-record-detached.test.mjs (root), private-acl.test.ts (packages/meeting-bot).
