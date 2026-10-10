# Contract — t037-auto-join-rules-engine (T-037, unit 1: pure rules engine)

> Ground truth for `packages/meeting-bot/src/calendar/join-rules.ts`. Source: roadmap T-037 / `docs/meeting-bot-roadmap.md`
> ("per sender/domain/platform, external/internal, approve once -> trusted; opt out per meeting"; note: "approval does
> not prove registration success"), ADR 0005, and the security property below. Written by the checker; the maker never edits it.

## Scope
Pure evaluator + state helpers + rule-set validator + `TrustedSenderConfig` adapter. NOT in scope (T-037 stays open):
persistence, API/UI editing, scheduler switch-over, sender authentication (ISS-322/333), the "next webinar with no click" end to end.

## Security property
`evaluateJoinRules` returns `join` only when an allow rule or a recorded approval legitimately covers the event, and
never for an input that a rule author did not mean to allow, including rule data that is malformed.

## Criteria
1. **Default-deny.** Empty rule set + empty (or omitted) state never yields `join`; an unparseable/missing sender never yields `join`.
2. **Rule dimensions.** Rules match by sender email, sender domain (exact or label-boundary subdomain, `subdomains:false` = exact), meeting platform, and internal/external scope; fields AND; an empty matcher matches nothing.
3. **Domain/email hardening.** Look-alike suffix/prefix domains, `.`-prefixed/`*`/single-label/public-suffix-free rule values, multi-`@`, display-name, comma/semicolon/newline forms never produce an unjustified `join`; case and surrounding whitespace/one trailing dot are normalised.
4. **Approve-once scope.** A sender approval covers only that exact email; a domain approval covers only that exact domain (no subdomains); both survive across event ids; neither applies to a different sender/domain.
5. **Precedence.** opt-out > deny > cancelled > no-URL > unverifiable sender > allow > approval > default-deny; the ACTION is independent of rule-list order (a deny always beats an allow); the table is documented and tested.
6. **Opt-out per meeting.** Opting out meeting M skips M even when allowed/approved, and does not affect meeting N; `recordOptOut` refuses non-string/empty ids.
7. **State purity.** `recordApproval`/`recordOptOut` return new state, never mutate (frozen input ok), are idempotent, throw on invalid values; `evaluateJoinRules` does not mutate inputs.
8. **Decision type.** `{action, reason, ruleId}` only; no registration-success field.
9. **Validator.** `validateJoinRuleSet` rejects unknown top-level/rule/match fields (including `__proto__`/`constructor`), wrong types, bad enums, empty matchers, bad domains/emails, duplicate ids, and `subdomains` without `domain`; returns a normalised copy that round-trips JSON.
10. **Invalid rule data cannot widen access.** A rule with any invalid matcher value (e.g. `scope` not `internal`/`external`, non-boolean `subdomains`), evaluated WITHOUT first passing the validator, must never cause `join` for a sender its author did not allow (fail closed), and the module's documented claim about invalid values must be true.
11. **Adapter equivalence.** `ruleSetFromTrustedSenderConfig(cfg)` yields `join` for every sender `isTrustedSender` trusts and `needs-approval` for every sender it rejects, except documented differences that are STRICTER or pure normalisation of the same mailbox.
12. **Regression and bounds.** `join-rules.test.ts` passes; `auto-join.test.ts` and `webinar-policy.test.ts` still pass; meeting-bot `tsc --noEmit` clean; the commit changes no existing source file; engine not wired into the scheduler.
13. **Test strength.** A mutation of each security-relevant behaviour (default-deny, label boundary, opt-out, deny, approval scope, normalisation, validator strictness, unverifiable-sender, empty matcher) fails at least one test.

> Note 2026-10-10 (checker, cycle 2): C10 is satisfied by the evaluator validating its own inputs and failing closed (needs-approval, reason invalid-rule-set); skip on a matching per-meeting opt-out is also acceptable on invalid data. Criteria text above is unchanged.

