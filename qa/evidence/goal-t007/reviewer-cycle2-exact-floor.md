# Reviewer cycle-2 exact attack-floor reconciliation

Independent checker consumed actual broker receipt at 2026-10-14T22:33:50.9292156Z.
`ISS-T007REVIEWSOURCE-001: 2/2 original attack payloads refused; unaffected control 1/1 PASS`.
This is repaired attack-floor evidence, not a whole reviewer-source PASS or real Mongo MVCC proof.

Original RED remains: source `4991950A...`, original corpus full SHA256
`30D3D3B6720332FB1E993AA7F35D3A6AC25350A5A6E1E5DFC931E03AE9AD3F5A`, actual 0/2 refused/control 1/1.
Original byte copy and unchanged file are retained. Root explicitly authorized only fixture
client and findOne options/session forwarding with corresponding types. The new separate
adapter is `review-source-checker-snapshot.test.ts`, full SHA256
`F600541F8C0EE4E22A6EAA2F8C6553450F270D725B9B497B2C8990BFA625087D`.
Five mechanical declaration/facade edits reversed produce the original bytes exactly, as
asserted by `reviewer-snapshot-adaptation-cycle2.json`; all attack payloads, head lookup-6
trigger, stale-error rejection, triggered=true assertion, unchanged candidate assertion and
unaffected control are unchanged. The three tests passing proves those post-refusal assertions
ran; early unsupported-capability refusal is not credited.

Exact centrally executed invocation, repository cwd, bundled Node:
`--import tsx --test --test-concurrency=1 --test-timeout=30000 qa/evidence/goal-t007/review-source-checker-snapshot.test.ts`.
Outer 90-second bound; UTC 2026-10-14T22:32:59.791Z → 22:33:02.032Z;
exit 0, elapsed 2,234.2457 ms; 3 tests/3 pass/0 fail/0 skipped/cancelled.
Receipt `qa/evidence/goal-t051checker-broker-t007-reviewer-snapshot-exact-floor.json`
retains exact command and equal before/after 18 source/dependency pins plus the spec hash.
Sibling stdout contains the two exact attack names and safe control; stderr is empty.
Current reader `0C028641E96055E9DAC51FBD2B7C4684CB5F0C990DD08061D4BF7F29F9A12EEA`
and shared helper `1B97FF09D53B7C0F7FE10F13C23803290864E2F5D43C6F57568876AB281030CF`
match the receipt and current direct hash readback. Original and adapted corpus hashes also match.

The fix runs non-authoritative preflight, then validates one real session-pinned Mongo
snapshot transaction and projects only detached checked data synchronously after it closes.
The supplied fake Mongo does not prove real database snapshot isolation. Standing API/session
binding, current UI/mounted-consumer and compiler evidence remain separate required gates.
Historical cycle-1 FAIL must be preserved before any matching-cycle verdict replacement.
