# iss-t040judge-002-rules-also-run-with-judge

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap T-040, owner decision). Class: notes pipeline, no auth/tenancy/data write. Verdict by the checker only.
Lane: lane/t040both. Authority: D-151 (pending append), Umesh 2026-10-13: with the note judge (D-144) enabled the rule-based lexical negation checks ALSO run; a note is dropped if either rejects it. Resolves ISS-T040JUDGE-002 (ledger row status NOT changed here).

## Scope (packages/index/src/pipeline/notes only)
- `sentence-span.ts`: lexical half split into exported `lexicalNegationProblem` (omits-qualifier, negated-by-reply). `sentenceSpanProblem` is byte-equivalent for the default path; judged mode still returns structural results only.
- `evidence.ts`: in judged mode `resolveEvidence` evaluates the lexical rules too (preferring a location they accept) and returns `lexical?`; `auditGroundedNotes` reports it. No-judge result objects are unchanged (no new key).
- `drop-mode.ts`: lexical hit recorded per built note (WeakMap); a question with a hit is dropped; answers/items are judged anyway (so "both" is observable) then `settleDrop` drops if judge OR rules rejected. Reasons: `note judge ...` (judge only, text unchanged), `note rules <problem>`, `note judge+rules ...`.
- `judge.ts`: sidecar entry gains `dropBy: judge|rules|both`, `rule`, verdict may be "same" (rules-only drop); sidecar gains `rulesDropped`.
- `judge-rules.test.ts` (new, 7 tests).

## Claims (added in fix pass, coordinator-authorized)
`claims.ts` now records the lexical hit per claim and gates through the shared `settleDrop` (exported from drop-mode.ts): judge OR rules drops, sidecar `dropBy`; no-judge path unchanged. Tests: 2 claim tests in judge-rules.test.ts (9 total). Mutations C1 (hit not recorded), C2 (judge-only gate): 2/2 killed. Full packages/index suite: 628/628 pass. The gap below is CLOSED.

## (closed) Not covered
`claims.ts` calls `resolveEvidence(..., {judged:true})` and ignores `lexical`, so judged CLAIMS still skip the lexical rules. Needs a follow-up edit to claims.ts (and grounded-summary.ts passes no state, which is fine: the WeakMap travels with the entry).

## Evidence
- `node --test --import tsx src/pipeline/notes/*.test.ts src/pipeline/claims.test.ts src/pipeline/summarize.test.ts` (packages/index): tests 84, pass 84, fail 0 (was 77 before this lane). tsc --noEmit -p tsconfig.json clean.
- Replay of all 31 ISS-T040GEN-* cases (002/006/007/008/009/010/011/012) against an always-same judge: 11 shipped before D-151 (009: 1, 010: 4, 011: 3, 012: 3). The rules now catch 0/11 (ISS-T040GEN-009 0/1, -010 0/4, -011 0/3, -012 0/3): ledger rows are by construction attacks the lexical layer already missed. The classes the rules DO catch under a lax judge are the ISS-T040JUDGE-002 probes (3/3 dropped by rules).
- Mutations (5, harness untracked and deleted, per-mutation backup in finally, timeout 120s, hashes verified): M1 evidence ignores lexical, M2 settle ignores rule hits, M3 both recorded as judge, M4 lexical rule disabled, M5 rules-only drop not removed: 5/5 killed.
