# Verdict: iss-r1alerts-009-alert-secret-echo

VERDICT: PASS
Cycle checked: 0
Commit checked: d1cc020 (lane/alertredact, from 031b0e2)
Scope: unwired; policy `masked` only (default `omit` unchanged); masked remains gated by contract W8 (Approver acceptance).

## EXPLANATION

- ISS-R1ALERTS-009 (my count): the 15 titles were re-read from the row (evidence + checker_evidence) and fed through the real buildAttentionAlerts under titlePolicy masked on both routes (skipped item, job row): 15/15 redacted on skipped, 15/15 on job (maker: 15/15). Test asserts each string occurs verbatim in qa/issues.r1alerts.jsonl. alert-title-policy.test.ts independently prints `[masked] 009 15/15, 010 12/12, 011 5/5` and the same for omit. The un-titled classes (p/i/n, c0de, Armenian, Cherokee, '1 2 3 4', Cyrillic word) are covered by authored extra cases, and by the design: any non-listed word or digit hides the whole title.
- Changed tests, ruling: (1) masked 009/010 `< length` to `== length`: legitimate, stricter. (2) two "Weekly tiger" opt-in checks now expect `Event: (hidden)`: legitimate; "Weekly tiger" is the leak the issue is about, and the own-property opt-in is still proven by a different output than omit. (3) alert-text.test.ts "Hello World" to "Weekly Class": legitimate, that test checks separator splitting, not the policy; the intent (separator becomes a space, text survives) is preserved. No test weakened.
- Contract (qa/contracts/r1-attention-alerts.md): says masked does not close 009/010 and stays gated by W8. The new behaviour is stricter, nothing is wired, grep for buildAttentionAlerts outside alerts/ unchanged (alert-who and production.ts reference alert-resolve, not the builder). No contradiction; W8 is not relaxed.
- Bypass search: free text reaches alert text only via build() `t`; reason is whitelisted (KNOWN_REASONS else "unspecified"); start is re-formatted from a parsed instant; zone validated; id is a hash. No description/location/organiser fields exist. Probes (21): full-width letters, zero-width and combining marks inside words (sanitiser strips them, output is the plain allow-listed word), Kelvin sign, long s, Cyrillic homoglyph, NBSP, slash/hyphen/paren/comma joins: all either hidden or reduced to listed words. Fails closed.
- Mutations (7, per-mutation byte backup, finally restore, 3 test files): killed 5 (allow-check always true; drop word-set check keeping regex; attention-alerts back to neutralizeText; add "tiger" to list; ...). Survived 2, both equivalent: dropping the ASCII regex, or adding digits to it, changes nothing because list words are all [a-z&-]. One mutation text did not match and was skipped.
- Gates: 5 test files 6/6, 12/12, 9/9, 15/15, 11/11; tsc --noEmit exit 0.
- Notes (not filed): ISS-ALERTREDACT-001 (low) stands; masked now hides most real titles (utility, ~100 words). The "may"/"march"/"open" style words are ordinary and could equal a passcode, same residual.
- HEAD fidelity: git hash-object equals HEAD blob for title-allowlist.ts and attention-alerts.ts; harness files deleted.

ISSUES-WRITTEN: none
