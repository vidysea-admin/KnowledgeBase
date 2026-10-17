# Verdict: w17-u24audit

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 166ed6187dc22322f95c117f1c254ea0a0afb97c
Base: a0391420 (lane/w17-u24audit)

## Evidence (independently produced)
- Base claim verified: at a0391420 audit-closed-class.mjs already has PROBE_SHAPE / grounded replyFor {label,name,evidenceQuote,evidenceKind} and --self-test. The unit only exports the probe (+ setProbeShape hook), guards main() with an entry-point check, and adds the test.
- `node --test --test-force-exit --import tsx scripts/qa/audit-closed-class.test.mjs` (timeout 600): rc 0, tests 5 / pass 5 / fail 0.
- CLI unchanged: `--self-test` rc 0 (seeded CAUGHT, legacy DETECTED as blind), same on base file; plain CLI rc 0, `LIVE BYPASSES: 0 / 409`. Guard fires when run directly (output above proves it).
- Mutation (own, per-mutation backup + trap on EXIT/INT/TERM/ERR + timeout 600): probe shape stripped of `evidenceQuote` -> 3 of 5 tests fail (planted-bypass, clean-production, self-test), rc 1. Restored: cmp clean; `git hash-object` = HEAD blob 900e517dc500dae4576927769b34ea7efbc8332c.
- ISS-U24SMART-002 replay (D-015): the row records one failure shape (legacy-shape probe never sees a bypass), no word list. Test 1 shows production gate drops legacy reply; test 2 plants a bypass and reports 409/409; legacy-shaped probe throws "vacuous". Nothing left open. (The row's fix_direction suggested extractSpeakersRuleBased; the grounded-shape probe plus the rule-based legacy leg in probeCurrent is a stronger equivalent.)
- ISS-284: all 41 files in qa/evidence/u2-4-phase3-precision-regate-2026-09-22/ recomputed (sha256 + bytes) vs the manifest table: 41/41 match (more than the 5 requested); disk set == manifest set (none missing, none extra; base tree also has 41). Undisclosed 07-per-block.mjs and per-block-results.json are listed and flagged; corpus-drift note (496/242/30 vs 494/240/29, ISS-290 pin) present. `git diff a0391420 166ed618` touches no qa/verdicts or qa/evidence path; the manifest edit is additions only.
- `node scripts/tracker-audit.mjs --gate g1,g4,g5` (timeout 600): rc 0, only pre-existing advisory G4 lines.

## Not verified
- `lint-loc --all` / dependencies stage (maker's env gap), not re-run. Maker/checker token and time ratios not measured.

## Ledger
ISSUES-WRITTEN: none
ISS-U24SMART-002 (qa/issues.u24smart.jsonl) and ISS-284 (qa/issues.jsonl) may be flipped open -> verified.
Findings: none.
