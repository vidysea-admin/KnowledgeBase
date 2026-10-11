# t037-veto-skip-reasons-and-optout-identity

Task: T-037 (scheduler switch-over; preconditions W1 and W2 of qa/contracts/t037-join-rules-veto-select.md). Lane `T037W1`, branch `lane/t037w1`. Class: SECURITY (join authorization).
Tier: roadmap task (backlog tier 3) closing ISS-T037VETO-001 (medium) and ISS-T037VETO-002 (high); full ceremony.

## What changed
1. **Part A, truthful skip reasons (ISS-T037VETO-001).** `SkipReason` (packages/core/src/domain/webinar-types.ts, the only place the union lives) gains three values. `applyJoinRules` uses them instead of `untrusted-sender`; the detail string is unchanged.
2. **Part B, opt-out follows the meeting (ISS-T037VETO-002).** `applyJoinRules` now tests each scheduled item under its own ids AND the ids of every record in the same selection that is the same meeting. Matching stays in `evaluateJoinRules` (single matcher): the veto only widens the list of ids offered to it.

## New SkipReason values: produced and consumed
| Value | Produced (join-rules-select.ts) | Operator sentence (skip-describe.ts `SKIP_REASON_MEANING`) |
|---|---|---|
| `opted-out` | engine `skip/meeting-opt-out` | the owner opted out of this meeting, so the bot will not join it |
| `rule-denied` | engine `skip/deny-rule` (and any other engine skip reason not mapped below) | a join rule denies this meeting, so the bot will not join it |
| `rules-unevaluable` | `needs-approval/invalid-rule-set`, evaluator throw | the join rules could not be read or evaluated, so the bot did not join (failing closed) |
`cancelled` and `no-join-link` are still used where exact. No value was added that is not produced.

Consumers (`git grep -n "untrusted-sender\|overlap-lost\|SkipReason" -- packages apps scripts`, full result reviewed):
- `schedule-tick.ts describeSkip`: moved verbatim into new `skip-describe.ts` (schedule-tick.ts was too close to its budget to take sentences). `SKIP_REASON_MEANING` is a total `Record<SkipReason, string>`, so a future reason without an operator meaning does not compile. Only the three veto reasons get the sentence appended; every older reason prints its exact old line (test pins `skip [past]`).
- `auto-record-policy.ts projectWebinarSelection`: passes `skipped` through verbatim; test asserts the three reasons survive projection.
- `apps/api/src/routes/brain.ts:100`, `capture/telegram-channel.ts:105`, `scripts/webinar/run-pipeline.mjs:226,241`: separate operation-reason vocabularies (strings, not typed on SkipReason). Nothing emits the new values into them because the veto layer is unwired. Not edited (scripts reserved). Filed as ISS-T037W1-003 for the wiring unit. The attention-alerts lane (unmerged, not touched) keys on skip reasons too and will need the three new values.
- `git grep` confirms no code branches on `untrusted-sender` apart from its producers in auto-join.ts (unchanged) and the union definition; nothing that used to see a rule refusal as `untrusted-sender` exists (nothing was wired).
- Exhaustive switches or records keyed by SkipReason: none other than the new table. apps/api and apps/web do not import `SkipReason`.

Budget: schedule-tick.ts 279 -> 276 by the repo counter (`countLoc`); the briefing said 300, the counter says 279 at HEAD. skip-describe.ts 30, join-rules-select.ts 113 (limit 300).

## Part B: how the same meeting gets different ids (established by reading auto-join.ts)
- Calendar event `id` -> `sourceId`, `sessionKey` `cal:<id>`; Gmail candidate `id` -> `sourceId`, `sessionKey` `gmail:<id>`.
- In **every-webinar mode** the selector replaces `sessionKey` with `webinar-<hash(url identity + start)>` BEFORE any skip decision, so the calendar copy and the Gmail copy share ONE sessionKey; one wins, the other is skipped (`needs-review`, `duplicate-session`, ...) and appears in `skipped` with the shared sessionKey but with no URL (skipped rows carry none). One `sourceId` survives.
- In **legacy mode** the two keep different sessionKeys and can both be scheduled (overlap resolution then keeps one if times overlap).

## Opt-out matching design (design (i), no storage change)
For the current selection (scheduled AND skipped), records are linked into groups (union-find) when they share a `sessionKey`, or, for scheduled items only, share a platform meeting identity from `meetingIdentity(item.meetingUrl)` (imported from `send-now.ts`, the already-checked extractor; no second URL parser). A scheduled item is then evaluated under its own `sourceId`, `sessionKey`, then every other `sourceId`/`sessionKey` in its group; any `meeting-opt-out` removes it, with detail suffix ` [same meeting, recorded under another source id]`. Deny rules and the invalid-rule-set check are unchanged (they do not depend on the id).
Why this design: it needs no change to the store, the API or the state format (all off limits) and repairs the recorded repro, where the shared webinar sessionKey links the surviving Gmail item to the skipped calendar row.

False match analysis. Matching can only REMOVE. Different meetings cannot share an identity: the extractor's own checker verification (send-now.ts, "the ONLY place a key is built"; `PLATFORM_EXTRACTORS` typed over every platform; passcodes, tracking, host case and region subdomains are ignored, ids are the platform's own meeting id) and the tests here (two Zoom ids, a Meet code vs a Zoom id are not confused). An item whose URL yields no identity (unparseable, unknown platform, non-meeting path) is linked by sessionKey/ids only (test). The conservative direction (recurring room, ISS-T037W1-002) over-removes and is fail-closed.

### Limitation, precisely (filed as ISS-T037W1-001, HIGH, recommends design (ii))
Opt-outs are still stored as bare event ids. If the opted-out record is not in the current selection, the sibling from another source is not found. The opt-out still matches that id directly, but not the sibling. Concrete scenario: the person opts out of calendar event `calX`; on the next tick the Calendar feed is down or no longer returns `calX` (or `calX` is not yet due: `selectAutoRecordItems` drops not-due items without a skipped row); the Gmail candidate `g1` for the same Zoom meeting is selected alone and joins unattended. A second hole: `calX` skipped (no URL on skipped rows) and `g1` with a different start time, so URL identity is the only link. Test "CURRENT LIMITATION (ISS-T037W1-001)" asserts this as current behaviour so it is visible and cannot regress silently. Exact fix is in the issue: `JoinRuleState.optedOutMeetings` holding `meetingIdentity` values, written by the opt-out API alongside the event id, state version bump with an old-shape reader, identity check added to `evaluateJoinRules`.

## Safety property (re-proven)
`out.toSchedule` is a subsequence of `in.toSchedule`; `out.skipped` = `in.skipped` (same objects) + one entry per removal; rules `undefined` returns the same reference; also the same reference when nothing is removed; never throws (alias computation is wrapped: on failure the item is tested under its own ids only, which still never adds); inputs deep-frozen in tests. "No matching rule" still keeps the item (ISS-376 untouched). Hardening: a non-array `selection.skipped` no longer prevents removal.
Property test `property: 4000 seeded cases with cross-source duplicates` generates scheduled items from two sources sharing sessionKeys and Zoom ids (with differing passcodes), unparseable and non-meeting URLs, skipped siblings, opt-outs on any id including a ghost id; asserts subsequence, skipped prefix identity, every removal `opted-out`, same reference when nothing is removed, and the removed set EXACTLY equals an independently coded connected-components oracle. Result: 4000 cases, 3022 removals, 753 of them sibling-only (not opted out by own ids), all pass.

## D-015 counts by issue id (ledger repros replayed verbatim from qa/issues.t037veto.jsonl)
- `ISS-T037VETO-002: 5/5` (repro through the real `selectAutoRecordItems`: precondition reproduced (toSchedule = g1 under a webinar sessionKey, calX skipped needs-review); after the veto toSchedule is empty; g1 removed with reason `opted-out`; detail `meeting-opt-out (rule opt-out:calX)`, no URL leaked).
- `ISS-T037VETO-001: 6/6` (opt-out repro: reason `opted-out`, detail string unchanged, e1 kept; deny rule -> `rule-denied`; invalid rule set -> `rules-unevaluable`; evaluator throw -> `rules-unevaluable`).
- `ISS-T037VETO-003` is not part of this unit (see not delivered).
Recorded reproductions left open: none for 001/002. The unit's residual limitation is a NEW case (ISS-T037W1-001), not one of the recorded cases.

## Existing tests edited
`join-rules-select.test.ts` (existing file, edited): expected reasons updated to the new values; the `item()` fixture now gives each item its own meeting URL (it gave every item the same Meet URL, which under meeting-identity matching is legitimately one meeting, so opting out `e2` would remove `e1`). No assertion was weakened.
Cross-package note: `SkipReason` lives in packages/core, outside the briefed folder, but the union is defined only there; this is the single core edit (3 lines).

## Evidence (node 24 on PATH; run from packages/meeting-bot unless noted)
- `timeout 170 node --test --import tsx src/calendar/join-rules-optout-identity.test.ts` -> `ISS-T037VETO-002: 5/5`, `ISS-T037VETO-001: 6/6`, `property: 4000 cases, removed 3022, of which sibling-only 753`, `ℹ tests 10 / pass 10 / fail 0`.
- `join-rules-select.test.ts` tests 11 pass 11; `join-rules.test.ts` 24/24; `auto-join.test.ts` 33/33; `schedule-tick.test.ts` 14/14; `webinar-policy.test.ts` 19/19; `src/send-now.test.ts` 28/28; all fail 0.
- tsc: the lane junction makes `@lkb/core` resolve to the MAIN tree's unmodified union, so plain `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in the worktree reports only TS2322/TS2367 on the three new literals. With a temporary tsconfig (extends ./tsconfig.json, `paths: {"@lkb/core": ["../core/src/index.ts"]}`, deleted afterwards) mapping core to the worktree: exit with no output (clean). packages/core `tsc --noEmit -p tsconfig.json`: clean. apps/api and apps/web do not import `SkipReason`, so were not type-checked. After merge the plain command is clean.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`. `node scripts/lint-loc.mjs` reports only pre-existing violations (packages/index/src/pipeline/speakers-llm.ts:313, packages/meeting-bot/py/sb_join.py:1142), none in this unit's files.

## Not delivered
- Still NOT wired into `schedule-tick.ts` or any caller.
- W3 (ISS-T037VETO-003, invalid-rule-set policy: whole-tenant removal vs fail-open + alert) needs the Approver's confirmation at wiring; unchanged here (the reason is now the truthful `rules-unevaluable`).
- Storing the meeting identity with the opt-out (design ii) is a follow-up (ISS-T037W1-001); W4 (per-tenant call), W5, W6 unchanged.
- ISS-T037W1-003: other skip-reason vocabularies and the attention-alerts lane must adopt the three values at wiring/merge.
- T-037 stays in progress.

Status: checked-PASS
Checked: qa/verdicts/t037-veto-skip-reasons-and-optout-identity.md (cycle 0, 1689ee5)
Fix cycle: 0
