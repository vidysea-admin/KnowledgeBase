# t037-join-rules-veto-select

Task: T-037 (first half of the "scheduler switch-over"). Lane `T037VETO`, branch `lane/t037veto`. Class: SECURITY (join authorization).
Tier: roadmap task (backlog tier 3); security class, full ceremony.

## What
`applyJoinRules(selection, rules, context?, evaluate?)` in `packages/meeting-bot/src/calendar/join-rules-select.ts`: takes the result of `selectAutoRecordItems` plus ONE tenant's rule set and state; returns a result of the same shape in which the join-rules engine (`evaluateJoinRules`, no second matcher) can only REMOVE scheduled items.

## Safety property
For every input, `output.toSchedule` is a subsequence of `input.toSchedule` (subset, no duplicates, survivors in input order); `output.skipped` = `input.skipped` unchanged, followed by exactly one entry per removed item. Nothing skipped can become scheduled; nothing absent can appear.
Proof: test "property: 3000 seeded random cases keep the subset property" (seeded LCG, random selections, rule sets incl. undefined and malformed, opt-outs, approvals, deep-frozen inputs) asserting subsequence, no duplicates, skipped prefix unchanged, skipped count rises by exactly the removed count, removed keys equal the skipped suffix, identity when rules undefined, and that more than 500 removals occurred (not vacuous).

## Identity vs fail-closed
- `rules === undefined` (no rule file): returns the input selection, the SAME reference. Not an error.
- `rules` present but malformed (null, wrong shape, bad rule) or bad `state`, or the evaluator throws for an item: that item is SKIPPED (reason `untrusted-sender`, detail "join-rules veto: rules could not be evaluated (failing closed)"). The function never throws. A per-event opt-out is still honoured on an invalid set (engine behaviour).
- `null` rules is treated as malformed, not as absent; only `undefined` is identity.

## Decision table (engine decision -> veto layer)
| Engine action / reason | Veto layer | Skip reason emitted |
|---|---|---|
| skip / meeting-opt-out | remove | untrusted-sender (+detail) |
| skip / deny-rule | remove | untrusted-sender (+detail) |
| skip / cancelled | remove | cancelled |
| skip / no-meeting-url | remove | no-join-link |
| needs-approval / invalid-rule-set | remove (fail closed) | untrusted-sender, "could not be evaluated" |
| needs-approval / no-matching-rule | KEEP (does not decide ISS-376) | none |
| needs-approval / sender-unverifiable | KEEP (sender authentication untouched) | none |
| join / allow-rule, approved-sender, approved-domain | KEEP; never adds or resurrects | none |
| evaluator throws | remove (fail closed) | untrusted-sender, "could not be evaluated" |

Detail format: `join-rules veto: <engine reason> (rule <ruleId>)`; never contains the meeting URL.
Opt-out ids are tried as `sourceId` and as `sessionKey` (either removes; can only narrow).

## Skip-reason choice
`SkippedItem.reason` is an existing `SkipReason`; no type changed. Rule/opt-out refusals use `untrusted-sender` + detail carrying the engine reason (as the scoping note suggested). Caveat for the checker: `untrusted-sender` is the closest existing label for "refused by this tenant's rule"; for an opt-out it is a loose fit and the `detail` is the truthful part. `cancelled` and `no-join-link` are used where they are exact.

## Tenancy
Items carry no tenant field. The function is handed one tenant's rules; it keeps no state. Test shows two tenants' rules applied to the same selection give independent results.

## Seam
Optional 4th parameter `evaluate` (type `JoinRuleEvaluator`), default `evaluateJoinRules`. Production callers pass three arguments.

## Evidence
Run from `packages/meeting-bot` (node 24 from the codex runtime on PATH):
`timeout 120 node --test --import tsx src/calendar/join-rules-select.test.ts src/calendar/auto-join.test.ts src/calendar/join-rules.test.ts`
-> `ℹ tests 68 / ℹ pass 68 / ℹ fail 0` (new file alone: 11 tests, 11 pass, property test 1.7 s).
`timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`.
Files: join-rules-select.ts 67 lines, join-rules-select.test.ts 141 lines. No existing file edited.

## Not delivered
- NOT wired into `schedule-tick.ts` or any caller; production behaviour is unchanged. Wiring is a later unit behind a flag that defaults to today's behaviour.
- Rules are NOT the ALLOW authority: an event with no matching rule is not skipped. Making them so, and anything touching every-webinar mode (ISS-376, D-058), waits for the Approver's decision.
- Sender authentication is not read or changed here.
- Which id the product records for opt-outs (event id vs session key) is not verified end to end; both are honoured.
- T-037 stays in progress.

Status: checked-PASS
Checked: qa/verdicts/t037-join-rules-veto-select.md (cycle 0, 2fb5e84) - unwired library; wiring preconditions W1-W6 in the contract
Fix cycle: 0
