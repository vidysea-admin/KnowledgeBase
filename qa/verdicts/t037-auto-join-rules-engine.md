# Verdict — t037-auto-join-rules-engine

VERDICT: FAIL
Cycle checked: 1
Scope: maker commit bd2aa47 (pure engine only; T-037 not claimed complete). Contract `qa/contracts/t037-auto-join-rules-engine.md` C1-C13. Security class, uncapped. Lane `lane/capture`.

## Independent results

- C1 PASS. Probe: empty rules + empty state, and `state=undefined`, for `a@x.com` -> `needs-approval/no-matching-rule/default-deny`. Unparseable senders (`Name <a@x.com>`, `a@b@x.com`, `@x.com`, `a@x.com\r\nBcc: ...`) -> `needs-approval/sender-unverifiable`.
- C2 PASS. Test file covers each dimension; probe confirms AND and empty-matcher = no match (`{foo:1}` -> default-deny).
- C3 PASS. Rule `example.com` vs `a@example.com.evil`, `xn--example.com`, Cyrillic-a homoglyph, `a@.example.com`, `a@a..example.com`, `a@example.com:25` -> no join. Rule values `com`, `.example.com`, `*.example.com`, `*`, `""` never match. Mixed case, one trailing dot, surrounding whitespace -> join as intended. Note (not filed): rule `co.uk` or `ownDomains:["co.uk"]` is accepted and covers every `*.co.uk` (no public-suffix list; operator-config risk).
- C4 PASS. Sender approval does not reach `other@uni.edu`; domain approval is exact only (sub., evil-, .evil.org all needs-approval); `approvedDomains:["*","com",".x.com"]` never match.
- C5 PASS. Action is order-independent: deny-then-allow and allow-then-deny both -> `skip/deny-rule/d`. Two allow rules of different kinds: same action, only `ruleId` depends on list order (documented "first match wins").
- C6 PASS. Opt-out beats allow + approval; another event id still joins. `recordOptOut(undefined|null|5)` throws; `" "` and `"e1 "` are accepted verbatim (harmless). An event with no `id` cannot be opted out (wiring note below).
- C7 PASS. Frozen-state test passes; probe: frozen empty state unchanged after `recordApproval`; `x.com` as sender, `a@x.com` as domain, `com`, `a@b@x.com` all rejected.
- C8 PASS. Test "decision type carries no registration outcome"; keys are `action, reason, ruleId`.
- C9 PASS. `__proto__` (JSON.parse own key) at top and rule level and `constructor` in match -> `unknown field`; `scope:null`, `domain:null`, array-like `rules` rejected. Observations: rule id `"__proto__"` accepted (harmless, uses a Set); ids `"r"` and `"r "` are distinct; a rule id may equal a synthetic id such as `default-deny` (cosmetic).
- **C10 FAIL.** Unvalidated set, `ownDomains:["corp.com"]`, one allow rule `{scope:S}`, empty state, meet URL: S = `"Internal"`, `"INTERNAL"`, `"both"`, `""`, `null`, `1`, `true` with sender `a@other.com` (external) -> `join/allow-rule/a`; the same S with `a@corp.com` -> `needs-approval`. A case typo inverts the rule. Also `{domain:"x.com",subdomains:"false"}` + `a@sub.x.com` -> `join`. Invalid deny rules fail to deny: `[deny{domain:"*.evil.com"}, allow{domain:"evil.com"}]` + `a@evil.com` -> `join`; `deny{scope:"Internal"}` likewise. `validateJoinRuleSet` rejects all of these, but the evaluator accepts the unvalidated type, and its header comment and the manifest say invalid values "never match (fail-closed for allow)", which is false for `scope` and `subdomains`. The maker disclosed only the deny case. Filed ISS-CAPTURE-002 (medium). On the deny question: the evaluator should not rely on callers validating; this is a defect at this unit's scope because the unit's own bar is "never join without legitimate coverage" and the claim made is falsifiable.
- C11 PASS. Adapter test passes. Differences, all judged safe: (a) multi-`@` senders (`x@a@ashoka.edu.in`) rejected by the engine, trusted by legacy -> stricter; (b) surrounding-whitespace trim -> engine `join`, legacy false: same mailbox, normalisation; (c) NOT mentioned by the maker, found by probe: one trailing dot (`a@ashoka.edu.in.`), whitespace after `@` (`a@ ashoka.edu.in`), trailing newline/tab also join where legacy says false -> same normalisation class, same host, safe but undocumented; (d) the engine ignores single-label config domains (`com`, `localhost`) that legacy would match -> stricter. A config with duplicate emails (`a@x.com,A@x.com`) makes `validateJoinRuleSet(adapterOutput)` throw `duplicate id "trusted-email:a@x.com"` (low wiring note, not filed).
- C12 PASS. Reran from `packages/meeting-bot`: `join-rules.test.ts` tests 20 pass 20 fail 0; `auto-join.test.ts` tests 33 pass 33; `webinar-policy.test.ts` tests 19 pass 19; `tsc --noEmit` exit 0. Maker's counts match. `git diff --name-only bd2aa47~1 bd2aa47` = join-rules.ts, join-rules.test.ts, qa/issues.capture.jsonl, the manifest; no existing source file changed; nothing imports the module; lane `git status` clean before my files.
- C13 PASS for the tested behaviours. 13 mutations, each with a per-mutation byte backup, 60 s timeout, try/finally restore, and `git hash-object` vs `git rev-parse HEAD:` after each restore:

| Mutation | Result |
|---|---|
| M1 default-deny returns join | KILLED (11 failures) |
| M2 drop label boundary | KILLED (2) |
| M3 opt-out never applied | KILLED (2) |
| M4 deny rules never applied | KILLED (3) |
| M5 sender approval matches by domain | KILLED (1) |
| M6 email not lower-cased | KILLED (5) |
| M7 validator accepts unknown fields | KILLED (1) |
| M8 approved domain matches subdomains | KILLED (1) |
| M9 cancelled not checked | KILLED (1) |
| M10 unverifiable sender joins | KILLED (5) |
| M11 empty matcher matches all | KILLED (1) |
| M12 duplicate rule id accepted | KILLED (1) |
| M13 scope check dropped | KILLED (1) |

13/13 killed, 0 survived, 0 timeouts. Final: `git hash-object` = `git rev-parse HEAD:` = 038f1d5fab869567e28a645a7e5d01f72f3a7794 for join-rules.ts. The tests never feed the evaluator an unvalidated bad rule, which is why C10 was not caught.

## ISS-CAPTURE-001 review (row not edited)
Real and reproducible in existing code, and the row's mitigation sentence is wrong. The row says it is safe "because gws-gmail derives senderDomain from the same string". It does not: `apps/api/src/gws-gmail.ts:259` uses `senderEmail.split("@")[1]` (segment after the first `@`), while `isTrustedSender` takes an explicit domain argument as-is. Reproduction (probe2.ts, default config): From `x@ashoka.edu.in@evil.com` -> FROM_RE yields the whole string, `senderDomain = "ashoka.edu.in"`, `isTrustedSender(senderEmail, senderDomain, cfg)` = true (real domain evil.com). The new engine returns `needs-approval/sender-unverifiable` for the same string. I would rate it high, not medium: it is a bypass of the auto-record trust gate reachable from the live Gmail path with no code change, adjacent to ISS-322/333 (both high); the only unverified precondition is whether Gmail delivers an unquoted double-`@` From (I sent no mail). The row's fix_direction (derive the domain from the validated email at switch-over) is right.

## Notes not filed
- Platform rules use `detectPlatform`, which ignores scheme: `ftp://meet.google.com/x` and `javascript://meet.google.com/%0a...` count as `meet`. Pre-existing; the switch-over should require http(s).
- Opt-out is keyed by raw `event.id` only; there is no tenant/owner notion in `JoinRuleState` or the event. Wiring risk: state storage must be per tenant; recurring-series ids are not covered; events without an `id` cannot be opted out.
- Local part allows control characters and zero-width characters; the domain governs trust, so only exact email rules are affected.
- Missing `match` or missing state arrays throw (fail closed by crash).
- Still needed for T-037: persistence, editing API/UI, scheduler switch-over, ISS-322/333 sender authentication, ISS-CAPTURE-001, registration profile/scope (T-052), and the end-to-end "next webinar with no click".

ISSUES-WRITTEN: ISS-CAPTURE-002
EXPLANATION: The engine is well built: default-deny, label-boundary domain matching, approval scope, precedence, purity and validator strictness all hold on my own probes, and the tests are strong (13/13 mutants killed, file restored to the HEAD blob). It fails C10 on one point: given an allow rule that the validator would reject but the evaluator accepts, an out-of-enum `scope` joins every external sender (the inverse of an intended `internal` rule), which contradicts the "fail-closed for allow" claim in the code and manifest. Because this is trust logic gating unattended joining, any unjustified `join` fails the unit. The fix is small (make `ruleMatches` reject out-of-domain values or require a validated set, plus tests with unvalidated bad values); cycle 2 can re-check it.
