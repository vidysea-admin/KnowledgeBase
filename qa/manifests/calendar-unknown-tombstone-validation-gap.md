# calendar-unknown-tombstone-validation-gap

Status: ready-for-check
Fix cycle: 0
Lane: lane/w17-tombstone2 (base b44dc2c8, tip of lane/w17-tombstone with the PASS verdict for tombstone-expiry-ruling3)
Candidate SHA: the commit carrying this manifest (see git log)
Changed paths: packages/meeting-bot/src/calendar/tombstone/unknown-tombstone-non-interference.test.ts (one test added), this manifest. Test-only; no source change.

## Gap closed
The PASS checker's mutation "accept future firstSeen" (drop the `> checkedAt + 60000` clause in validateReconciliationState, calendar-client.ts) passed every maker test. The new test asserts, through reconcileWebinarSources in both scopes: future (+61s, year 2099), garbage (not-a-date, "", impossible dates, number, null, object) and non-canonical (no millis, +05:30 offset, ".0Z") firstSeen on a stored unknown-tombstone row all throw; a valid past canonical value and one inside the 60s skew allowance are accepted.

## Evidence
- Test file: 17 tests, pass 17, fail 0 (node --test --import tsx, timeout 600).
- tsc --noEmit -p packages/meeting-bot/tsconfig.json: exit 0.
- Mutation "accept future firstSeen" (per-mutation backup, trap EXIT/INT/TERM/ERR, timeout 600): pass 16, fail 1, killed by `future firstSeen "2026-10-11T10:06:01.000Z" must be rejected`. Restore verified: `git -c core.autocrlf=true hash-object calendar-client.ts` equals `git rev-parse HEAD:` (9762e184...); git status shows only the intended files.

## Checker to run
The test file and tsc; optionally re-run the mutation above.
