# Verdict: iss-t040judge-002-rules-also-run-with-judge

VERDICT: PASS
Cycle checked: 0
Checked at: lane/t040both HEAD 6e0059b4 (D-151 pending append in main tree; ISS-T040JUDGE-002)

EXPLANATION:
1. No-judge path byte-identical. Swapped the five changed sources (claims.ts, drop-mode.ts, evidence.ts, judge.ts, sentence-span.ts) to base b4f3452f and dumped the full no-judge output (page, dropped, degraded, sidecar) for items, claims and QA over 38 fixtures (31 ledger attacks, 3 rule-only, 1 clean, 3 controls): 90284 bytes each, identical. Files restored, hash == HEAD.
2. Rules never skipped with a judge. Matrix over item, claim, QA answer (batch) and late answer (judgePendingCandidates), against judge modes same / different / unsure / throw / no-verdict / invalid-verdict / cost-cap: a rule-rejected note dropped in every cell, including judge "same". A clean note ships only on "same". Judge error and cap paths still apply the rules.
3. dropBy correct in every cell: rules-only = "rules" (verdict same, rulesDropped counted, kept not counted); rules plus any non-same judge outcome = "both"; judge-only = "judge" (no rule field).
4. Replay of all 31 ISS-T040GEN-* cases (002:2, 006:5, 007:2, 008:6, 009:6, 010:4, 011:3, 012:3; -012 from lane t040reject ledger; corpus transcription compared against the ledger text and matches). Ships per id (no judge / always-same / oracle): 002 0/0/0; 006 0/0/0; 007 0/0/0; 008 0/0/0; 009 1/1/0; 010 4/4/0; 011 3/3/0; 012 3/3/0. Total 11 / 11 / 0. Claims and QA answers match items. The maker's 0/11 claim holds: the rules catch none of those 11 beyond what they already did without a judge; they are stopped ONLY by a real judge (oracle drops them). With a lax judge they ship. The rules add value for the JUDGE-002 probe classes (3/3 dropped), not for these 11. Controls ship.
5. Mutations (10, harness untracked and deleted, timeout 150s, per-mutation byte backup restored in finally, hash == HEAD verified each time): skip rules when judge present, dropBy both->judge, dropBy rules->judge, skip rules for claims, skip rules on judge error, skip on late-answer path, skip on QA batch path, skip for items, judge-only recorded as rules, settle ignores rule: 10/10 KILLED. One SURVIVED: removing the question-side lexical drop in tryQA (`if (q.lexical) return drop(...)`) is not covered by any test (low, note only).
6. tsc --noEmit clean; packages/index full suite 628/628 pass.

ISSUES-WRITTEN: none
