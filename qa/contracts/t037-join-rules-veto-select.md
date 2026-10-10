# Contract — t037-join-rules-veto-select (T-037, lane T037VETO, SECURITY class)

> Ground truth, maintained by /checker; /maker reads only. Unit: `applyJoinRules` in
> `packages/meeting-bot/src/calendar/join-rules-select.ts` (new, unwired).

## Criteria (library, each machine-checkable)
1. **Subset property.** For every input, `out.toSchedule` is a subsequence (same objects, same order, no additions, no duplicates) of `in.toSchedule`; `out.skipped` = `in.skipped` (same objects) followed by exactly one entry per removed item; every removed item carries a string `reason` and a `detail`. Property test with a seeded generator, >= 20,000 cases, malformed rules/state and a misbehaving evaluator included.
2. **Never throws, never mutates** its inputs (deep-frozen inputs, JSON snapshot unchanged).
3. **Identity.** `rules === undefined` returns the SAME selection reference. A valid empty rule set and a valid empty state keep everything (same reference when nothing is removed). `null`, `{}`, `[]`, a string, an unknown version, or a malformed state is treated as malformed (skip, never join).
4. **Veto-only decision table** (engine pair -> action). REMOVE: `skip/meeting-opt-out`, `skip/deny-rule`, `skip/cancelled` (unreachable here), `skip/no-meeting-url` (reachable only for a whitespace-only URL), `needs-approval/invalid-rule-set`, evaluator throw/undefined. KEEP: `needs-approval/no-matching-rule`, `needs-approval/sender-unverifiable`, `join/allow-rule|approved-sender|approved-domain`, and any non-skip result (including garbage/Promise): the default is KEEP. Nothing a rule says can add or resurrect a join.
5. **Does not decide ISS-376.** An event with no explicit refusal (no match, unverifiable sender, allow, approval) is returned exactly as today.
6. **Single matcher.** Opt-out matching is done only by `evaluateJoinRules`; the unit calls it with `sourceId` and with `sessionKey` as the event id and removes if either refuses.
7. **No existing file edited**; tests + `auto-join.test.ts` + `join-rules.test.ts` pass; `tsc --noEmit` clean; `lint-dirsize` OK.

## Preconditions for the WIRING unit (blocking; the library is not wrong without them)
- **W1 (ISS-T037VETO-001, medium)** Do not label opt-out / deny / unevaluable removals `untrusted-sender` in persisted or operator-visible output: add dedicated SkipReason values in `packages/core/src/domain/webinar-types.ts` first, or prove no consumer branches on the reason. Today only `schedule-tick.ts describeSkip` and `projectWebinarSelection` read it, both display-only.
- **W2 (ISS-T037VETO-002, high)** Opt-outs must reach the surviving item across sources: in every-webinar mode one webinar identity collapses calendar + gmail ids into one sessionKey and only one `sourceId` survives; an opt-out recorded for the other id is missed (repro in the issue). Wiring must alias all collapsed ids (or key opt-outs on webinar identity) and add that repro as a regression test.
- **W3 (ISS-T037VETO-003, medium)** Invalid-rule-set policy (whole-tenant removal vs fail-open + alert) needs the Approver's explicit confirmation, a loud once-per-tick log carrying the validation error message, and a flag that defaults to today's behaviour.
- **W4 Tenancy.** Items carry no tenant id; `applyJoinRules` evaluates whatever it is given against the one rule set passed. The wiring must call it per tenant with a single-tenant selection. Wrong-tenant rules can only remove (never add), but would remove or keep the wrong events.
- **W5** Production must pass the real evaluator (three arguments); the 4th parameter is a test seam. A non-synchronous evaluator result (Promise) is read as "keep".
- **W6** Recurring events: opt-outs are exact, case-sensitive id matches; an opt-out for a series id does not remove an instance id. The opt-out UI/API must record the id of the instance (or wiring must expand series).
