# Verdict: fixups

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 5fad5dd227cc9e021953c04843017c994dbf70e6
Base SHA: 0a1737068e4aabee68ef2d6a12f510df045dfd3b
Scope: test-only diff (2 files); product source byte-identical to base.

## Findings
1. Alias change (live-recording.test.ts:92-95): needed because send-now-command.ts:119-128 now fails closed on an active operations row without a reconciliation alias (t039-manual-jobs-operation-authority). The original assertions (exit 1, launched.length 0, /already queued/) are unchanged and the poller claim is still held, so "no second bot launches" is still shown. The new test (no alias) asserts /no verifiable meeting identity/ and launched 0. Mutation A (skip alias match) fails the verbatim test with the "cannot tell ... no verifiable meeting identity" message. Verdict: reproduction preserved.
2. EXPLANATION (low, not an issue): with the alias, the operations path alone now refuses, so the verbatim test no longer isolates the live-recording-claim path for pollers. Mutation B (readAllLiveJobs drops readLiveRecordings) leaves the verbatim test green but fails ISS-T039CMD-001 x2 and the UNREADABLE-view test, so the claim path stays covered, by manual-recording tests rather than a poller one.
3. `as never` (live-recording.test.ts:42): hides only that the fake `source` is partial (readLiveJobs reads only source.reconciliation.occurrences[].aliases[].key/identity, which the fixture matches). `tsc --noEmit -p packages/meeting-bot` reports 2 errors, in windows-capture-clock.ts and native-measurement.test.ts, neither touched by this unit; none in the changed files. Cast acceptable.
4. joiners timeoutMs 30000: test-only; the lifecycle test passed in about 21 s under load. Product default is unchanged.

## Commands (exit codes in qa/evidence-fixups/*.exit, untracked)
- live-recording.test.ts: 15 pass, 0 fail, exit 0.
- joiners.test.ts with --test-name-pattern "registration child lifecycle|registration uses|registration refuses": 15 pass, 0 fail, exit 0. "registration actual child timeout" NOT run (launches Chrome).
- Mutation A (alias match disabled): exit 1, only the ISS-T039CMD-002 verbatim test failed, on /already queued/.
- Mutation B (live recordings dropped): exit 1, 3 failures as above.
- Both mutations used a per-mutation byte backup, a timeout and a trap; afterwards cmp against the backup was clean and git hash-object equals HEAD:send-now-command.ts (2b24f30b6ecdb6bf70a3df571b4dc0cb54aee846).

## Not verified
The browser-launching timeout test; full suites; maker token usage (no packet). Checker usage not measured here.

ISSUES-WRITTEN: none
Ledger rows: ISS-T039CMD-002 unchanged (already verified); no rows to flip.
