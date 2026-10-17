# iss-alertid-001-skipped-sessions-persisted

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2 (open high ISS-ALERTID-001; also ISS-ALERTID-007 medium). Class: data write (new tenant-tagged state file): FULL ceremony.
Lane: lane/alertwho. Ledger rows ISS-ALERTID-001/-007 status NOT changed here (checker closes).
Authority: D-134 (pending append): Approver chose option 2 (accumulate keyed by sessionKey, drop rows whose start is older than 30 days).

## Scope
Skipped sessions (overlap-lost, untrusted-sender, no-join-link, unsafe-join-link, needs-registration, every reason in `result.skipped`) are persisted by `runScheduleTickOnce` (real run only, not --dry-run) so `lkb alert-who <id>` resolves them without operations.json. Alert-id computation (`alertIdFor`) untouched (ISS-ALERTID-002 left alone). optout lane files untouched.

## Files
- NEW `packages/meeting-bot/src/calendar/skipped-state.ts`: `<stateDir>/skipped-sessions.json` = `{version,tenantId,entries:{key:{sessionKey,startTime?,recordedAt,source,tenantId}}}`, mode 0600. No title, no URL, no detail. Start looked up from the tick's own calendar events / candidates by sourceId. Retention: start older than 30 days dropped on write; a row with no known start ages from `recordedAt` (a small addition to the D-134 field list, needed so such a row can ever expire). Untagged / other-tenant file: refused, never overwritten (tick logs and continues).
- `calendar/schedule-tick.ts` (+7 lines), `alert-who-command.ts` (reads the file, tagged bucket, realpath-in-root, 5 MB cap).
- NEW `alert-who-skipped.test.ts` (6 tests); `alert-who-production.test.ts` source-label pins updated (skipped keys now also report `skipped-sessions`).

## Reproductions
- ISS-ALERTID-001 / -007 (no recorded literal corpus; the row's scenario: a skipped no-join-link `cal:<id>` and needs-registration `gmail:<id>` alert with no operations.json): replayed through the real tick + real buildAttentionAlerts with operations.json absent: skipped alerts resolved 4/4 (no-join-link, unsafe-join-link, needs-registration, overlap-lost). Production per-kind table (alert-who-production.test.ts) still 15 reasons, all pinned entries pass.
- Not covered: kinds that emit no alert (past, duplicate-session, ...) are persisted but have no alert to resolve.

## Evidence (node from toolchain; temp dirs only, no network/browser)
```
alert-who-skipped.test.ts      ℹ tests 6  ℹ pass 6  ℹ fail 0   (30-day boundary exact kept / +1ms dropped, tenant tag, no URL/title/token strings, tenant B refused, untagged refused and not overwritten, dry-run writes nothing)
alert-who-production.test.ts   ℹ tests 4  ℹ pass 4
alert-who-command.test.ts      ℹ tests 19 ℹ pass 19
schedule-tick.test.ts          ℹ tests 14 ℹ pass 14 ;  schedule-state.test.ts ℹ tests 18 ℹ pass 18
tsc --noEmit -p packages/meeting-bot -> clean
```

## Not delivered / not verified
No mutation run. No row-count cap (age retention only, per D-134); a file over 5 MB is refused by alert-who with a warning. Real poller / real Windows scheduler not run. schedule-tick.ts is now 330 lines (was 323).
