# t037-auto-join-rules-engine

Status: ready-for-check
Fix cycle: 2
Priority tier: 3 — next unblocked roadmap task (T-037)
Security class: approval/trust logic (what may join without a click) — FULL checker ceremony, uncapped
Lane: lane/capture

## Scope

Adds a pure auto-join rules engine to `packages/meeting-bot/src/calendar/`. **This unit does NOT complete T-037**: no persistence, no editing surface (API/UI), and the scheduler is not switched over. T-037 stays open. Nothing existing was edited; nothing calls the new module yet. Task note honoured: the decision type carries only `action/reason/ruleId` — no registration field; approval is not registration success.

## Files added

- `packages/meeting-bot/src/calendar/join-rules.ts`
- `packages/meeting-bot/src/calendar/join-rules.test.ts`
- `qa/manifests/t037-auto-join-rules-engine.md` (this file), `qa/issues.capture.jsonl` (ISS-CAPTURE-001)

No barrel export added (index.ts exports only calendar-client and auto-join, not auto-record-policy).

## API

`evaluateJoinRules(event, ruleSet, state) -> {action: join|skip|needs-approval, reason, ruleId}`; `recordApproval`, `recordOptOut` (return NEW state); `ruleSetFromTrustedSenderConfig(cfg, ownDomains?)`; `validateJoinRuleSet(unknown)` (throws `JoinRuleSetValidationError` with a `$.path`); `normalizeEmail/Domain`. Rule = `{id, effect: allow|deny, match: {email?, domain?, subdomains?, platform?, scope?}}`, fields ANDed, at least one required. Platform detection reuses `detectPlatform`.

## Precedence (first match wins)

1. per-meeting opt-out -> skip `meeting-opt-out`
2. matching deny rule (list order) -> skip `deny-rule`
3. cancelled -> skip
4. no meeting URL -> skip
5. organiser missing/malformed -> needs-approval `sender-unverifiable`
6. matching allow rule (list order) -> join `allow-rule`
7. approved-once sender (exact email) or approved domain (exact) -> join
8. else -> needs-approval `no-matching-rule` (DEFAULT-DENY)

## Edge-case decisions

- Domain rules: exact or label-boundary subdomain; `subdomains:false` for exact-only. Look-alikes (`evil-example.com`, `example.com.evil.org`) never match. Approved-once domains are exact-only (stricter than rules).
- Sender approval is per exact email; it does not extend to the domain.
- Sender = `senderEmail ?? organizer`. Strict parse: exactly one `@`, no whitespace, multi-label domain; `Name <a@b>`, `a@b@c` etc. are malformed -> never join (deny rules are still evaluated first; scope rules cannot match without a sender).
- Trim + lowercase; one trailing dot on a domain is dropped.
- Deny rules are evaluated before the cancelled/no-URL/sender checks so the reported reason is the policy one.
- ~~Invalid values inside a rule never match (fail-closed for allow). Caveat: an invalid deny rule would fail to deny; the validator rejects such rules and callers must validate before use.~~ **FALSE - CORRECTED in fix cycle 2 (see below).** The cycle-1 checker showed an out-of-enum `scope` or string `subdomains` made an allow rule join (ISS-CAPTURE-002).
- `recordApproval/recordOptOut` throw on invalid input; idempotent; no mutation.
- Adapter domain rules are `subdomains:false` because `isTrustedSender` is exact-domain only.
- Deliberate divergence from `isTrustedSender` (tested): multi-@ senders (legacy uses the last `@`) are rejected; surrounding whitespace is trimmed.
- `isTrustedSender` is not called inside the engine (it lacks trimming/validation and accepts a caller `domain` that can diverge from the email); it is the equivalence oracle in tests. See ISS-CAPTURE-001.

## Relation to open issues

- ISS-322 (trusted-sender policy rests on unauthenticated From header): **does not touch**. The engine consumes whatever sender string it is given; sender authentication is still required upstream.
- ISS-333 (auto_approved skips isTrustedSender): **does not touch**. `selectAutoRecordItems` is unchanged. The engine has no pre-trusted bypass: only a recorded approval or an explicit allow rule yields join; this is a design aid for the later switch-over, not a fix.

## Evidence

Commands run in `packages/meeting-bot` with the portable node on PATH.

- `node --test --import tsx src/calendar/join-rules.test.ts` -> tests 20, pass 20, fail 0, exit 0
- `node --test --import tsx src/calendar/auto-join.test.ts` -> tests 33, pass 33, fail 0, exit 0
- `node --test --import tsx src/calendar/webinar-policy.test.ts` -> tests 19, pass 19, fail 0, exit 0
- `node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0

The first test run had one failing assertion in my own divergence test (whitespace placed in the local part, which legacy tolerates); I fixed the test, not the source. Mutation testing not run (checker's job).

## NOT covered

Persistence of rules/state; API routes and UI for editing; scheduler switch-over (`selectAutoRecordItems`/`schedule-tick` still use `isTrustedSender`); sender authentication (ISS-322/333); registration profile/scope and outcome (T-052); recurring-series opt-out; revoke/un-approve helpers; validation of persisted `JoinRuleState`; end-to-end "trusted sender's next webinar scheduled with no click".

## Wiring needed

1. Tenant-scoped storage for ruleSet + state, and API routes to read/edit them (validate with `validateJoinRuleSet`).
2. UI for editing rules, approve-once, per-meeting opt-out.
3. Scheduler (`schedule-tick`/`selectAutoRecordItems`) calls `evaluateJoinRules` via `ruleSetFromTrustedSenderConfig` plus stored state.
4. Gmail-candidate approval flow writes `recordApproval`; sender authentication per ISS-322/333.

## Fix cycle 2

**What failed (verdict cycle 1, C10, ISS-CAPTURE-002).** `evaluateJoinRules` trusted its input type. An unvalidated allow rule with `scope` of `"Internal"`, `"INTERNAL"`, `"both"`, `""`, `null`, `1`, `true` joined every external sender; `subdomains:"false"` joined `a@sub.x.com`; an invalid deny rule (`*.evil.com`, `scope:"Internal"`) failed to deny so a later allow joined. The cycle-1 claim "invalid values never match (fail-closed for allow)" was false.

**What changed (`join-rules.ts` only, plus tests).**
- `evaluateJoinRules` now runs `validateJoinRuleSet(ruleSet)` and a new `validateJoinRuleState(state)` before matching, and matches against their normalised output. These are the same validators used at the persistence boundary: one implementation, no per-field guards in the matcher.
- Any throw (non-object/null/undefined set, wrong types, unknown field/kind/enum value (case-sensitive), bad domain/email/platform, non-boolean flag, duplicate id, non-array list, malformed state) -> `{action:"needs-approval", reason:"invalid-rule-set", ruleId:"invalid-rule-set"}`. One invalid rule invalidates the whole set.
- A per-meeting opt-out is still honoured as `skip` when `state.optedOutEventIds` is an array containing the event id, even if the rest is invalid (skip can only narrow access).
- Corrected statement: **the evaluator fails closed; on any invalid rule set or state it never returns `join`.** Valid sets behave identically; all pre-existing tests pass unchanged.
- Adapter `ruleSetFromTrustedSenderConfig` now de-duplicates on the normalised value and drops entries the engine cannot represent (as it always effectively did), so env configs with duplicate emails/domains remain valid instead of becoming "never join". Rule ids use the normalised value.

**D-015 count against the ledger's recorded reproductions.** `ISS-CAPTURE-002: 17/17 refused` (none `join`, all `invalid-rule-set`). Cases run verbatim from the row: scope in {Internal, INTERNAL, both, "", null, 1, true} with external `a@other.com` (7); the same seven with internal `a@corp.com` (7, the verdict's counterpart); `subdomains:"false"` + `a@sub.x.com` (1); `[deny{domain:"*.evil.com"}, allow{domain:"evil.com"}]` + `a@evil.com` (1); `deny{scope:"Internal"}` followed by an allow (1). None left unfixed.

**Additional cases (mine, reported separately).** 22 invalid rule-set shapes (null/undefined/array/string set, bad version, unknown top/rule/matcher fields, non-array rules/ownDomains, bad ownDomain, duplicate id, `ALLOW`, missing/empty match, `Zoom`, non-string platform/domain, bad email, `subdomains` 0 or without domain, valid rule + one broken rule); the internal-sender inversion for internal/external/subdomain senders; 12 malformed-state shapes; opt-out still skips with invalid state and with a null rule set; `validateJoinRuleState` normalisation; adapter duplicate/unrepresentable-entry test.

**Notes decided.** (1) `co.uk`-style public-suffix rule: NOT addressed (operator-config risk, needs a public-suffix list; outside C10). (2) Duplicate adapter emails: fixed and tested. (3) `detectPlatform` ignoring URL scheme: another file, out of scope.

**Evidence (from `packages/meeting-bot`).**
- `node --test --import tsx src/calendar/join-rules.test.ts` -> tests 24, pass 24, fail 0
- `auto-join.test.ts` -> tests 33, pass 33, fail 0
- `webinar-policy.test.ts` -> tests 19, pass 19, fail 0
- `tsc.js --noEmit -p tsconfig.json` -> no output, exit 0
Mutation testing not run (checker's job).

**Still not covered.** Everything under "NOT covered" above; validation runs on every evaluation (pure, small sets, not optimised); a throwing getter or non-object `event` still throws (crash, not join); control/zero-width characters in email local parts; public-suffix rules.
