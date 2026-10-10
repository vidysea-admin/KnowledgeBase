# iss-capture-001-trusted-sender-domain-spoof

Status: ready-for-check
Fix cycle: 1
Priority tier: 2 — open security-class issue (ISS-CAPTURE-001; the checker's t037 cycle-1 review recommends high severity, ledger row still says medium and is not edited here)
Security class: auth/trust gate (what may auto-record without a click) — FULL checker ceremony, uncapped
Lane: lane/capture

## Scope
Fix the existing trust-gate defect in `packages/meeting-bot` only. Files: `src/calendar/auto-record-policy.ts` (`isTrustedSender`), `src/calendar/join-rules.ts` (one new exported helper), tests. Not touched: `apps/api`, any other package, hot files, TASKS.md, .goal, DECISIONS, contracts, .claude, package.json.

## Defect and root cause
`auto-record-policy.ts` (old `isTrustedSender`): `domainLc = (domain ?? domainOf(email))`; `domainOf` took everything after the LAST `@`. Two flaws: (1) a caller-supplied `domain` was used as-is and never compared with the email, so `isTrustedSender("evil@x.com","ashoka.edu.in",cfg)` was true; (2) multi-`@` strings were accepted, with no trimming or validation. Upstream, `apps/api/src/gws-gmail.ts:259` (`senderEmail.split("@")[1]`) takes the segment after the FIRST `@`, so From `x@ashoka.edu.in@evil.com` gave senderDomain `ashoka.edu.in` and the gate passed (checker's probe, t037 verdict "ISS-CAPTURE-001 review"). The ledger row's "safe because gws-gmail derives it from the same string" mitigation is wrong. Call site: `auto-join.ts:184` `isTrustedSender(item.sender, item.senderDomain, trustedSenders)`.

## What changed
- `isTrustedSender(email, domain, cfg)` now: parses `email` with `parseStrictEmail`; no valid email -> false. If `domain` is supplied (not undefined/null) it must equal the email's parsed domain after `normalizeDomain`, else false (so it can no longer grant trust; an empty-string domain also refuses). Trust = exact email in `cfg.emails` OR parsed domain in `cfg.domains`. Exact-domain semantics unchanged (no subdomains).
- `parseStrictEmail(value)` (new, `join-rules.ts`): printable ASCII only (`[!-~]`: no whitespace, control, non-ASCII or zero-width characters), none of `<>(),;:"` or backslash, at most 320 chars, then `normalizeEmail` must return the lower-cased input unchanged (exactly one `@`, non-empty local part, valid multi-label domain, no trailing dot). It never repairs input.
- Deliberately stricter than "trim": padded or trailing-dot addresses are refused, not repaired. The old function also refused padded input (the `join-rules.test.ts` "legacy does not trim" assertion is unchanged).

## Shared parser arrangement
One implementation: `normalizeEmail`/`normalizeDomain` stay in `join-rules.ts` unchanged; `parseStrictEmail` is added there, and `auto-record-policy.ts` imports `parseStrictEmail` and `normalizeDomain` from `./join-rules.js`. join-rules.ts does not import auto-record-policy.ts, so no cycle. `evaluateJoinRules` and all other join-rules behaviour are untouched; its 24 tests pass.

## Existing tests whose expectation changed (both encoded the unsafe behaviour)
1. `src/calendar/auto-join.test.ts:96-98` "isTrustedSender: explicit domain wins even if email itself isn't in the list": asserted `isTrustedSender("random@random.example","ashoka.edu.in")` is true, i.e. a supplied domain granting trust to an unrelated email, which is ISS-CAPTURE-001 repro (b). Now asserts false, plus an agreeing pair that stays true; comment references ISS-CAPTURE-001.
2. `src/calendar/join-rules.test.ts:266` (in "documented deliberate divergence"): asserted `isTrustedSender("evil@x.com@ashoka.edu.in")` is true, which is repro (a). Now false, with a comment. The engine assertion on the next line and the `"a@ashoka.edu.in "` pair are unchanged.
No assertion deleted; no other expectation changed. Every sender those tests treated as trusted is still trusted.

## D-015: recorded corpus by issue id
`ISS-CAPTURE-001: 3/3 refused` (test "ISS-CAPTURE-001 recorded reproductions (verbatim)" in `src/calendar/trusted-sender.test.ts`, default config): row evidence (a) `("evil@x.com@ashoka.edu.in", undefined)`; row evidence (b) `("evil@x.com","ashoka.edu.in")`; checker-verdict repro (c) `("x@ashoka.edu.in@evil.com","ashoka.edu.in")`. No recorded reproduction left open. Before the fix (a) and (b) were true per the ledger row and the old test assertions; (c) was true per the checker's probe (I did not re-run the old code).

## Additional cases (maker-authored, not part of the D-015 count)
Supplied-domain/email mismatch in both directions (incl. trusted email + wrong domain, bare domain with no email, empty email, empty-string domain); about 35 refused forms: multi-@, display-name/angle-bracket/quoted/comma lists, leading/trailing space, CR/LF (with header injection), NUL, tab, zero-width in local and domain, empty local/domain, single-label, trailing and leading dot, double dot, `ashoka.edu.in.evil.com`, `evil-ashoka.edu.in`, `sub.ashoka.edu.in`, `xashoka.edu.in`, `karunn@vidysea.com.evil.com`, Cyrillic homoglyphs, fullwidth letters, non-string inputs (each also with a supplied matching domain); mixed-case accepted; supplied `ashoka.edu.in.` agrees after normalisation; table of all 4 default entries (2 emails, 2 domains) still trusted.

## Evidence (real output, lane packages/meeting-bot)
- `trusted-sender.test.ts`: tests 6 pass 6 fail 0 (printed `ISS-CAPTURE-001: 3/3 refused`)
- `webinar-policy.test.ts` 19/19; `auto-join.test.ts` 33/33; `join-rules.test.ts` 24/24
- other `src/calendar` tests (callers): `schedule-tick` 14/14, `schedule-state` 18/18, `task-scheduler` 26/26. `calendar-client.ts` has no test file.
- `tsc --noEmit -p tsconfig.json`: exit 0.
- Not run: mutation testing (checker's job), apps/api tests, full suites.

## Relation to ISS-322 and ISS-333
- ISS-322 (no SPF/DKIM/DMARC authentication of From): adjacent, NOT addressed. This unit makes the gate reject malformed or inconsistent addresses; it does not establish that a well-formed From header is genuine. A forged `From: someone@ashoka.edu.in` is still trusted.
- ISS-333 (`approved`/`auto_approved` candidates bypass `isTrustedSender` through `preTrusted` in `auto-join.ts`): does not touch. Where `isTrustedSender` is called is unchanged.

## Remaining risks
1. Sender authentication (ISS-322) is out of scope: a genuine-looking forged From still passes.
2. Upstream `apps/api/src/gws-gmail.ts:259` still derives `senderDomain` with `split("@")[1]`; filed as ISS-CAPTURE-003 (defence in depth, wiring needed). The package-level gate no longer depends on it.
3. This lane's `apps/api` resolves `@lkb/meeting-bot` to MAIN's source, so apps/api tests (e.g. `routes/meeting-candidates.test.ts`) cannot be run against this change; they were not run.
4. Behaviour change for edge senders: non-ASCII (internationalised) local parts, padded or trailing-dot addresses, and an explicit empty-string `senderDomain` now refuse. Judged acceptable fail-closed; none appear in the tests or config defaults.
5. A supplied domain that is padded (e.g. " ashoka.edu.in") is normalised before comparison; it can only match the email's own domain, so it cannot grant trust.
6. `parseStrictEmail` is a trust-gate parser, not RFC 5322; quoted local parts are intentionally refused.
