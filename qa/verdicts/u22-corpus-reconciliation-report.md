# Verdict: u22-corpus-reconciliation-report

VERDICT: PASS
Cycle checked: 0
Commit checked: 01cede8 (lane/corpusreconcile)
ISSUES-WRITTEN: none (maker's ISS-CORPUSRECONCILE-001 medium, -002/-003 low stay open: owner decisions, not defects of this unit)

## EXPLANATION

- Re-run: `node scripts/eval-extraction.mjs reconcile --input data/eval/extraction-corpus.json --out-dir <scratch>` twice. Both runs byte-identical to each other and to the committed `data/eval/corpus-reconciliation-report.{json,md}` (cmp). Summary matches the manifest: 14 unresolved (14 turn-off-range; 1 reviewed, 7 weak hints, 6 none; matches corpus baseline), 6 missing artefacts, 3 invalid-time turns, 29 sessions = 23 originals + 6 additions. No absolute local paths in the outputs.
- Citations spot-checked against raw files: cast-c03 cites t190 in a 15-turn session; in-focus-4-c03 cites t102 in a 51-turn session; dual-enrollment-c02 cites t092 in a 90-turn session; ashoka-c01 cites t106 in 26. None exist in turns.json. The one reviewed mapping (ashoka-c01 to t014) is real: the reviewer file is INDEPENDENTLY_REVIEWED_REPLACEMENT_PROPOSAL, hash-bound, and t014 says "about 200, 260 plus companies that come on campus". The dual-enrollment hint (t033, about transferable subjects) looks poor for a "30 credits" claim; it is labelled unreviewed and not gold, so acceptable.
- Missing artefacts: three synthetic dirs (cli, production-cli, production-interrupt) absent and `git log --all` shows 0 commits; synthetic-controlled-* hold only source.json + validation.json. Correct.
- Bad times: my own scan of every turns.json found exactly 3 invalid turns (visa t141 2008>213, dual-enrollment t026 1644>1629, ucas t114 1883>1868), equal to the report; none missed.
- Provenance: first-adding commits re-derived (5760f5e, 72c212f, fd74864) as claimed.
- Read-only: the subcommand writes only the two report files; no Mongo or network import; no label field touched; the unit's test checks corpus bytes unchanged. Committing data/eval outputs follows the convention (extraction-report.json and other reports are tracked there).
- Tests: corpus-reconcile 8/8; claims.test.ts 24/24; tsc packages/index exit 0.
- Mutations (6, hash-verified, byte backup in `finally`): stale-mapping accepted KILLED; negative-start tolerance KILLED; original-evidence match ignored KILLED; hint threshold 0.6 to 0.3 SURVIVED (boundary untested); reversed-time tolerance `b < a - 20` SURVIVED (the tests' reversals are within 20 s, and the real ones are 15 s, so the unit test would not catch a tolerance regression; the committed real-data report would); `>` to `>=` on off-range is an equivalent mutant. Two low test-strength notes, no wrong behaviour. File equals HEAD blob; both trees clean.
