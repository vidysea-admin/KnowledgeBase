# Verdict: iss-t037ui-002-sender-approval-nonascii

VERDICT: PASS
Cycle checked: 0
Commit checked: 14e7e109 (lane/webhigh)

EXPLANATION:
- Correctness of printable-ASCII-only: t037-* contracts say nothing about non-ASCII senders. Server-side the only acceptance logic is the engine's normalizeEmail (accepts any non-whitespace local part, ASCII-only domain via DOMAIN_RE, so punycode domains remain allowed in the web check). The engine's trust path (parseStrictEmail, ISS-CAPTURE-001) and core sender-authentication parseSender are both printable-ASCII-only, so a non-ASCII approved sender can never match a captured sender. The web guard blocks no rule that could ever take effect; consistent. Note: a Unicode (EAI) local part is thereby unsupported end to end, a product limitation, not introduced here.
- Server does NOT refuse these attacks (approvals -> recordApproval -> normalizeEmail). Filed separately as ISS-WEBHIGH-001 (qa/issues.webhigh.jsonl). Not a blocker for this client-side unit, whose row fix_direction was client-only.
- Replay of ISS-T037UI-002 recorded reproductions: the U+200B probe through the real ApprovalsPanel (1/1 refused, no dialog, no POST), U+200B/U+202E/U+0430 (3/3 refused), plain ASCII (2/2 confirms and posts unchanged) are covered by the unit's model and panel tests, which pass at HEAD.
- Full apps/web vitest: 66 files passed, 1 failed (AskPage, 2 tests, "Test timed out in 5000ms", CPU contention); AskPage rerun alone: 9/9 pass. Earlier maker run had a different unrelated timeout, so these are flaky-load timeouts, not caused by the change. tsc --noEmit exit 0.
- Mutations (per-mutation backup/restore, HEAD blob hash verified equal after): M1 check disabled, M2 allow U+00A0..U+FFFF, M3 only U+200B/U+202E, M4 check applied to domain part only: 4/4 KILLED (2 failed tests each). Tree clean after.
- Minor note (not filed): ledger row ISS-T037UI-002 status still open; close-out by maker.

ISSUES-WRITTEN: ISS-WEBHIGH-001
