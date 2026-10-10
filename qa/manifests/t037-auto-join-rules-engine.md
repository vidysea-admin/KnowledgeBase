# t037-auto-join-rules-engine

Status: ready-for-check
Fix cycle: 1
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
- Invalid values inside a rule never match (fail-closed for allow). Caveat: an invalid deny rule would fail to deny; the validator rejects such rules and callers must validate before use.
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
