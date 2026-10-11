# iss-r1alerts-009-alert-secret-echo

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2 (open HIGH issue ISS-R1ALERTS-009, r1-attention-alerts seam). Class: security (credential handling), full ceremony.
Lane: lane/alertredact. Ledger for this lane: qa/issues.alertredact.jsonl (ISS-ALERTREDACT-001 filed, low). Package: packages/meeting-bot only.

## Scope
Stay out of the alert-id resolver and scheduler state files (lane alerttenant). Touched only the alert text path. Unwired: no sender attached; default policy `omit` unchanged.

## Design: ALLOW-LIST (not a longer deny-list)
The issue's fix_direction rules out listing words. Its complete fix (stop echoing free text) is what `omit` already does (default). The residual was the opt-in `masked` policy. New `alerts/title-allowlist.ts`: after the existing sanitiser (`sanitize`, unchanged), a title is echoed ONLY if every word is in a fixed set of ~100 lower-case ASCII meeting-title words (no digits, no number words, no names/colours/animals); one unknown word, any digit, any non-ASCII word, or any (link)/(email)/(hidden) marker hides the WHOLE title as `(hidden)`. `attention-alerts.ts build()` now calls `allowlistTitle(title)` instead of `neutralizeText(title)` for `masked` (2-line change). alert-text.ts untouched.

## Files
- NEW packages/meeting-bot/src/calendar/alerts/title-allowlist.ts, title-allowlist.test.ts (6 tests)
- EDIT attention-alerts.ts (import + call)
- EDIT alert-title-policy.test.ts: masked 009/010 now asserted fully refused (was "< length", the documented limit); two "Weekly tiger" opt-in assertions now expect `Event: (hidden)`.
- EDIT alert-text.test.ts line 55: `Hello World` -> `Weekly Class` (not allow-listed words would now be hidden).
- NEW qa/issues.alertredact.jsonl, this manifest.

## Evidence (packages/meeting-bot, node off PATH, one file at a time)
- `node --test --import tsx src/calendar/alerts/title-allowlist.test.ts` -> tests 6, pass 6, fail 0. Printed: `ISS-R1ALERTS-009: 15/15 redacted (masked, skipped and job routes)`. The 15 titles are the ledger's checker_evidence strings; a test asserts each occurs verbatim in the row read from qa/issues.r1alerts.jsonl.
- `... alert-title-policy.test.ts` -> tests 12, pass 12, fail 0; prints `[masked] ISS-R1ALERTS-009: 15/15 refused`, `-010: 12/12`, `-011: 5/5`; `[omit]` same; generator 400 titles x 2 routes 0 leaks.
- `... alert-text.corpus.test.ts` -> 9/9 pass; masked and omit ISS-R1ALERTS-001..008: all full (21/21, 1/1, 4/4, 2/2, 4/4, 37/37, 3/3, 2/2).
- `... alert-text.test.ts` -> 15/15 pass (after the line-55 change; before it, 14/15 with that one expected break).
- `... attention-alerts.test.ts` -> 11/11 pass.
- `node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot) -> exit 0.

ISS-R1ALERTS-009: 15/15 redacted under masked (was 0/15 per checker cycle 1); 15/15 under omit (unchanged). Reproductions left open: none of the 15. The evidence text's un-titled examples (p/i/n, c0de, Armenian/Cherokee confusables, '1 2 3 4') are covered by authored extra cases, not by ledger strings.

## NOT covered
- A passcode that equals an allow-listed word (ISS-ALERTREDACT-001, low).
- No mutation run (no harness executed); the new test's coverage of the allow-list gate is by direct negative cases only.
- masked remains gated by contract W8 (Approver acceptance); nothing is wired. Status of ISS-R1ALERTS-009 not changed (checker's call).
- Utility: masked now hides most real titles (any title with a name, number or unlisted word).
- Other fields (reason, ids, start time) were not re-audited here; they are not free text.
