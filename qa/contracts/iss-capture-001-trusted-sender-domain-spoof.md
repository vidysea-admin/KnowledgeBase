# Contract — iss-capture-001-trusted-sender-domain-spoof (ISS-CAPTURE-001)

> Ground truth for `isTrustedSender` in `packages/meeting-bot/src/calendar/auto-record-policy.ts` and the shared
> `parseStrictEmail` in `join-rules.ts`. Source: ISS-CAPTURE-001 (`qa/issues.capture.jsonl`) and the "ISS-CAPTURE-001 review"
> in `qa/verdicts/t037-auto-join-rules-engine.md`. Written by the checker; the maker never edits it.

## Security property
`isTrustedSender(email, domain, cfg)` returns true only if the strictly parsed `email` is exactly a configured trusted
email, or its parsed domain is exactly a configured trusted domain AND any supplied `domain` agrees with that parsed
domain. A supplied domain never grants trust by itself.

## Criteria
1. **Recorded reproductions refused.** Every reproduction recorded in the ISS-CAPTURE-001 row and the t037 verdict
   (`("evil@x.com@ashoka.edu.in", undefined)`, `("evil@x.com","ashoka.edu.in")`, `("x@ashoka.edu.in@evil.com","ashoka.edu.in")`)
   returns false against the default config. Count reported by issue id; the regression test uses these recorded inputs
   verbatim (D-015). The pre-fix function must be shown to have trusted them (the defect was real).
2. **No trust from a supplied domain alone.** Missing/empty/invalid email with a trusted supplied domain, and any
   email/domain disagreement in either direction (including a trusted email with a wrong domain), return false.
3. **Strict parsing.** Multi-`@` in any position, display-name/angle/quoted/comment/route/group forms, whitespace,
   tabs, CR/LF, NUL and other controls, zero-width/bidi/non-ASCII characters, homoglyph/IDN/punycode look-alikes,
   trailing/leading/double dot, over-length input, and non-string email or domain arguments never yield trust and
   never throw.
4. **Exact-match semantics unchanged.** Domain match stays exact (no subdomain, no look-alike prefix/suffix); email
   match stays exact and case-insensitive; config entries that are empty, `*`, leading-`@`, padded or multi-`@` grant
   nothing; duplicate entries are harmless.
5. **Legitimate senders still trusted.** All four default-config entries, and every shape the real callers pass
   (Gmail `From` reduced by `extractEmail` + `senderDomain`; calendar `organizer` with no domain) are still trusted
   exactly as before for genuine addresses; any real caller shape that is newly refused is a regression and must be
   filed.
6. **Engine unchanged.** `join-rules.ts` change is additive only (`parseStrictEmail`); `evaluateJoinRules` and all
   other behaviour unchanged; its 24 tests pass.
7. **Changed tests justified.** Each changed existing expectation encoded the unsafe behaviour; no other assertion is
   weakened or removed.
8. **Tests non-vacuous.** Mutations of the gate logic (supplied-domain trust on invalid email, skipped agreement check,
   multi-`@` accepted, lower-casing dropped, subdomain match, display-name/non-ASCII accepted, repair accepted) are
   killed by the unit's tests or the survivors are shown to be equivalent or non-security.
9. **Bounds.** The commit touches only `packages/meeting-bot/src/calendar/`, the unit manifest and the lane ledger;
   nothing in `apps/api`, other packages or hot files. Remaining risks (sender authentication ISS-322, `apps/api`
   `senderDomain` split ISS-CAPTURE-003, DB auto-approve path ISS-333) are stated accurately and not claimed fixed.
