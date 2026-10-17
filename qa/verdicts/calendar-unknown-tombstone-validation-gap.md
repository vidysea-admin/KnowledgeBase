# Verdict: calendar-unknown-tombstone-validation-gap

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 2f89f5ef263263d519af9311544e6b21ca63d479
Base SHA: b44dc2c8
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-tombstone2 (lane/w17-tombstone2)
ISSUES-WRITTEN: none

## Checks
1. **The diff is test-only and uses LF.** `git diff --stat b44dc2c8 2f89f5ef` touches only unknown-tombstone-non-interference.test.ts (+18) and the manifest. The diff contains 0 CR bytes, and `git ls-files --eol` reports i/lf w/lf. calendar-client.ts is unchanged: its blob is 9762e184, the same one reviewed at 20b000e3.
2. **The future-`firstSeen` mutation is now killed.** The mutation removes ` || Date.parse(firstSeen) > Date.parse(checkedAt) + 60000` at calendar-client.ts:113-114. It was run with a per-mutation byte backup, an EXIT/INT/TERM trap and `timeout 600`. Result: exit 1, 16 pass / 1 fail; the failing test is the new "validateReconciliationState rejects a future, garbage or non-canonical firstSeen...". After the run, `git -c core.autocrlf=true hash-object` equals HEAD:calendar-client.ts (9762e184...), and the git status shows nothing but the untracked evidence directory. This closes low finding L1 of tombstone-expiry-ruling3 (cycle 0).
3. **The 60 s skew was not invented by the test.** At base b44dc2c8, calendar-client.ts:114 allows `firstSeen` up to `checkedAt + 60000`. That allowance came in with 20b000e3, and it mirrors the provider-revision skew already present at 9e55b642 (lines 117 and 207). The test accepts +30 s and rejects +61 s, so it pins the source boundary.
4. **The file passes.** `timeout 600 node --test --test-force-exit --import tsx src/calendar/tombstone/unknown-tombstone-non-interference.test.ts` gave exit 0, 17/17 pass (7 s).

## Notes (low, no backlog)
- The `assert.throws` calls have no error matcher. Mutation M2 still proves the future-value case is attributable.

## Ledger
No row changes come from this unit. It is a test-gap close-out for the ISS-TOMBSTONE-001 PASS.

Evidence (uncommitted): qa/verdicts/calendar-unknown-tombstone-validation-gap.evidence/ (green.log, M2.summary, mutation log, mutate.sh).
