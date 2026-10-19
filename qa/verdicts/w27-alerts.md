# Verdict: w27-alerts

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 072255982db59554dcd4e4d91a42b32d4f7c2f1b
Base SHA: 4264418c
Reviewer: Sonnet 5.5 (Opus at its limit; this was a Sonnet review, not Opus). Ship-mode review, no budget metrics recorded (tokens/active time unknown).

## Independently run (node --test --import tsx, timeout 600, all exit 0)
- alert-text-typos.test.ts: ISS-R1ALERTS-010 12/12 refused (inputs verified verbatim in qa/issues.r1alerts.jsonl; sanitize and neutralizeText).
- alert-who-printed-fields.test.ts: ISS-ALERTID-008 47/47 (tokened registrationUrl https://events.example.com/register?token=REGTOKEN123, boss@corp.example, organizer, zoom meeting URL with pwd; probes verbatim in the row; print-time allowlist plus the 4 other recorded survivors).
- state-key-tenant-binding.test.ts: ISS-ALERTTENANT-002 20/20 refused with the flag ON; flag OFF test passes (no key request, mismatch does not stop the tick).
- Flag-off regression: schedule-tick (14), schedule-tick-rules-integration (8), state-tenant-tag, key-tenant, key-tenant-hints, join-rules/*.test.ts (188/188 pass), alert-text, alert-text.corpus (D-015 ISS-R1ALERTS-001..008 all full), alert-title-policy, attention-alerts, alert-who-command/production/skipped: all exit 0.
- tsc --noEmit -p tsconfig.json (meeting-bot): exit 0, empty output.
- Benign guard (BENIGN list in alert-text-typos.test.ts) passes; my own probes (Sweden, Crossword, Swedish, Swords, Broadsword, Sword making) are not hidden (PW_TYPO requires a leading p).
- Mutation (own): dropped PC_TYPO from the first KEYWORD_RES alternation in alert-text.ts. Killed: 'Webinar Pasccode tiger' (ISS-R1ALERTS-010 test) and the authored-extras test failed (exit 1). Per-mutation byte backup, trap, cmp restored; git -c core.autocrlf=true hash-object = HEAD blob 1479d24ea01d4a0ececef8ddebc8b2c229267fe9.

## Findings
- None blocking. Note (low, EXPLANATION only): with the flag off, the key-tenant loader (only when join rules are enforcing) is now awaited before the dedup-state load instead of after it. Same decision and same inputs; only call order and timing differ. Not a behaviour change for the verified suites.
- Flag is not set anywhere in production wiring (grep: schedule-tick.ts and the test only).

## Ledger rows
- ISS-R1ALERTS-010: may flip to verified/closed for the default omit path. Policy caveat in the row (masked policy gated by W8, ISS-009 class narrowed not closed) is the Approver's call; this unit closes the 12 recorded spellings.
- ISS-ALERTID-008: may flip to verified/closed.
- ISS-ALERTTENANT-002: stays OPEN. Binding is opt-in and OFF by default; the Approver must decide to enable it in production wiring (costs one request per tick).

## Not verified
- lint-loc/lint-dirsize and the maker's 15-mutant runner not re-run; no full suites, browsers or network.

ISSUES-WRITTEN: none
