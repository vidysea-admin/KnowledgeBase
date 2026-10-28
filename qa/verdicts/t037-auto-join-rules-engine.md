# Verdict — t037-auto-join-rules-engine

VERDICT: PASS
Cycle checked: 2
(Cycle 1 was VERDICT: FAIL, ISSUES-WRITTEN: ISS-CAPTURE-002; its record below is kept intact. Cycle 2 section at the end.)
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

---

## Cycle 2 (fix cycle 2: af90e13 code+tests, c02ff90 manifest)

VERDICT: PASS
Cycle checked: 2
ISSUES-WRITTEN: none

### Bounds
`git diff --name-only 9c3a9e2 c02ff90` = join-rules.ts, join-rules.test.ts, the manifest only. Test-file diff reviewed in full: the original 20 tests are byte-unchanged (only the import line gained `validateJoinRuleState`; 82 added lines/4 new tests). Lane tree clean apart from my files.

### Re-run
`join-rules.test.ts` tests 24 pass 24 fail 0; `auto-join.test.ts` 33/33; `webinar-policy.test.ts` 19/19; meeting-bot `tsc --noEmit` exit 0.

### D-015 measurement (own probe, probe3.ts, not the maker's tests)
Re-ran every recorded reproduction verbatim against the new code: the 7 scope values (`"Internal"`, `"INTERNAL"`, `"both"`, `""`, `null`, `1`, `true`) x external sender `a@other.com` and x internal sender `a@corp.com` (14), `subdomains:"false"` + `a@sub.x.com` (1), `[deny{*.evil.com}, allow{evil.com}]` + `a@evil.com` (1), `deny{scope:"Internal"}` + allow (1).
**ISS-CAPTURE-002: 17/17 refused** (all `needs-approval/invalid-rule-set`, none join; before the fix the 7 external-sender cases, the subdomains case and the deny cases joined).
The maker's regression test "ISS-CAPTURE-002 recorded reproductions (verbatim)" uses exactly these inputs and asserts `17/17 refused`; no recorded case is missing or altered. The one case the ledger row described only in words (`deny{scope:"Internal"}`) is paired with an allow of the maker's choosing; my pairing also refuses.

### New-hole probes (all non-join unless the set and state are valid and an allow rule/approval covers the sender)
- Invalid rule-set shapes: nested-array rules, numeric-key object as rules, throwing getter, Proxy that throws on get/ownKeys, `NaN` version, Symbol/BigInt domain, extra field in match, object in ownDomains -> `needs-approval/invalid-rule-set`, no throw. 200,000-rule valid list evaluates fine. Symbol-keyed extra property on a rule is ignored (valid, same decision as without it).
- Invalid state: BigInt opt-out id, null state, bad approved entries, valid state + invalid set, invalid state + valid set -> `invalid-rule-set` (one bad half invalidates all; never join). Sparse array holes in state are skipped by `.map` and not rejected: harmless (no approval is created).
- Opt-out shortcut on invalid data: with an invalid set (`{version:9}`) and/or junk approvals, opt-out for the event id -> `skip/meeting-opt-out`; with a non-matching or array-like-with-overridden-`includes` state -> `invalid-rule-set`. It never produces `join`.
- Valid-set meaning unchanged: table of valid cases reproduces the cycle-1 outcomes (subdomain join, look-alike refused, internal/external scope, deny beats allow, sender approval, exact domain approval, default-deny, `co.uk` operator note). Original 20 tests pass unchanged.
- Event-field robustness (decision: NOTE, not a defect at this scope): `evaluateJoinRules(null, ...)`, `undefined`, and an event with a throwing getter throw; a Proxy or throwing-getter STATE throws at the opt-out shortcut (rule-set Proxies are caught). Events and state are typed internal data, attacker influence reaches only string field values, and all string variants (non-string organizer incl. throwing `toString`, object meetingUrl, 5 MB URL, 0.5 MB organizer) return a decision. The scheduler must wrap the call per event. Also pre-existing: `cancelled:"true"` (string) is not treated as cancelled; typed boolean, note only.
- Adapter: default config diffs vs `isTrustedSender` over 16 senders = 0. Custom config with duplicates and unrepresentable entries: de-duplication changes nothing (before, a duplicate made a validated set throw; now it is valid). Dropping unrepresentable entries (`"bad"`, single-label `com`/`localhost`) only makes those entries stop matching, as in cycle 1 (stricter; legacy trusted `z@com`, `z@localhost`, `bad`). Padded/dotted config entries (` r.org. `) are normalised so `z@r.org` joins where legacy (raw compare) says false; same host the admin named, safe. No previously untrusted legitimate sender becomes trusted except via config-entry normalisation; none of the differences yields a join for a non-configured mailbox. Passing an invalid `ownDomains` to the adapter now makes every decision `invalid-rule-set` (fail closed; note: the adapter does not validate `ownDomains`).

### Mutations on the new code (per-mutation byte backup, 60 s timeout, try/finally, hash check after each restore)
| Mutation | Result |
|---|---|
| N1 state validation skipped | KILLED (1) |
| N2 join returned on validation failure | KILLED (4) |
| N3 rule-set validation skipped | KILLED (2) |
| N4 opt-out shortcut returns join | KILLED (3) |
| N5 adapter e-mail de-duplication dropped | KILLED (1) |
| N6 scope validation dropped (invalid rule kept) | KILLED (3) |
| N7 invalid approved sender accepted | KILLED (1) |
| N8 subdomains type check dropped | KILLED (3) |
| N9 opt-out `typeof event.id === "string"` guard dropped | SURVIVED (equivalent for safety: a non-string id can only produce `skip`, never `join`; not filed) |

8/9 killed; 0 timeouts. Final `git hash-object` = `git rev-parse HEAD:` = b9e9091136cbc43b02e5d14b48b5ecc0068523a3 for join-rules.ts, verified after every restore and at the end.

### Contract status
C10 now PASS (17/17 refused, malformed shapes and states fail closed). C1-C9, C11, C12, C13 unchanged PASS; C12 re-run counts above; C13 re-evidenced by N1-N8 plus the cycle-1 13/13.

### Ledger
ISS-CAPTURE-002 marked `verified` (fixed 2026-10-10, af90e13, regression_check filled). ISS-CAPTURE-001 stays `open` (separate existing-code defect, not fixed here; my cycle-1 note recommending high severity stands).

ISSUES-WRITTEN: none
EXPLANATION: The fix is the right shape: the evaluator runs the same validators that guard persistence on both the rule set and the state and fails closed, so a single bad rule invalidates all rules and a broken deny can no longer let a later allow win. The recorded corpus is measured verbatim and refused 17/17 on my own probe; mutation testing of the new paths kills every behaviour-changing mutant. Remaining notes (not filed, low): evaluator throws on a null/throwing event or a throwing-getter state, so the scheduler must guard per event; sparse state arrays are not rejected; the adapter does not validate `ownDomains`; `cancelled` is only honoured as boolean true. T-037 itself is still open (persistence, editing API/UI, scheduler switch-over, ISS-322/333/CAPTURE-001, registration scope).
