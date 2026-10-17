# Current workspace failure diagnosis (read-only source)

Latest repair-stage receipt: `../broker/repair-workspace-original-receipt.json` (started 2026-10-15T23:06:05Z; exit 1; pins_unchanged=true; 12 tests, 11 pass, 1 fail). Complete log: `../broker/repair-workspace-original.log`, SHA256 80f2b7ded606f2d385c395d8fa6cc72f93a905bffa36e90623e2eb44718a781c. Verified runtime alias adapter is in argv. Reported stack line 314 is adapter-transformed location; canonical physical source assertion is `packages/meeting-bot/src/capture/workspace/tab-session-workspace.test.ts:219`: observation.mediaStartedAt equals consent.mediaStartedAt. Actual observation is 1900000000000; consent expected argument is undefined.

## Cause

Stale fixture clock model, not evidence of a production lifecycle origin regression. The fixture mocks Date.now (`current=1899999999000`, line 163/166), then advances current by 2000ms synchronously when the second tab factory starts (line 179). It never mocks performance.now. `record-consent/runtime.ts` installs real privacy control. `record-consent/privacy.ts:20-21,27,82-85` compares epoch and monotonic elapsed time before accepting producer origin, rejecting discontinuities exceeding audio guard 100.001ms (`coverage.ts:29`). Synthetic wall-clock advances while real monotonic time hardly advances; consent correctly retains unknown origin. Independent workspace readiness observer checks producer epoch bounds only, so its observation retains the fixture origin. The assertion reveals the fixture's inconsistent two-clock premise.

Existing dedicated guard repro `record-consent/privacy.test.ts:132` intentionally decouples epoch/monotonic and requires undefined origin plus whole-capture conservative private window. Preserve this exact repro and security behavior. T-011 contract criteria 5/6 and T-034 criteria 3/4/5 require privacy, ownership and lifecycle safety, not accepting a synthetic clock discontinuity. No assertion change is justified.

## Smallest proposed fix / exact lease

Lease ONLY `packages/meeting-bot/src/capture/workspace/tab-session-workspace.test.ts`, within the existing real-record-caller test. Add an explicitly restored performance.now mock tied to the same logical current clock (e.g. current minus initial epoch), alongside Date.now mock, and restore it in finally. Preserve all existing assertions, fixture producer origin, ownership attacks and downstream checks. Do not alter production privacy/readiness source, thresholds, contracts or recorded reproductions. Broker reruns the same three workspace tests plus the existing privacy clock-discontinuity node under exact post-edit pins. The new test clock is fixture-only, not a production timing proof.

No source edits or tests/build/provider/DB/browser operations performed during diagnosis. No PASS claim.
