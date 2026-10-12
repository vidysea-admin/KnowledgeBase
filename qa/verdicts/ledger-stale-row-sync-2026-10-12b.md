# Ledger stale-row sync - 2026-10-12b

VERDICT: PASS (3 low rows flipped to `verified`; 2 left open as claimed-not-verified; 116 low genuinely open; 11 non-low rows re-checked, none stale)
Checked on: lane/ledgersync3 from ccfcde3 (HEAD moved from 9e24d1f while the run was in progress; today's merges included). Read-only audit plus three edited lines in qa/issues.t034ext.jsonl. No source, contract, manifest, decision, hook or test touched; nothing run.

Rule applied to each flip: (1) the verdict's latest cycle is PASS and states the id verified, not retracted by a later cycle; (2) manifest checked-PASS; (3) fix commit is an ancestor of HEAD (git merge-base --is-ancestor); (4) nothing later reopens it (git log --all --grep, qa/verdicts grep). Ids were searched with a word-boundary regex across every qa/verdicts file; ids in qa/verdicts/ledger-stale-row-sync-* and tracker-reconcile-* were treated as audit reports, not fix evidence.

## Counts

| bucket | critical | high | medium | low | total |
|---|---|---|---|---|---|
| audited | 0 | 0 | 11 | 121 | 132 |
| STALE-FIXED (flipped) | 0 | 0 | 0 | 3 | 3 |
| CLAIMED-NOT-VERIFIED | 0 | 0 | 0 | 2 | 2 |
| GENUINELY-OPEN | 0 | 0 | 11 | 116 | 127 |

The 11 medium rows are every open critical/high/medium row named in a PASS verdict committed today (other than the ledger-sync and tracker-reconcile reports): ISS-CORPUSRECONCILE-001, ISS-DEPLOYBUILD-001, ISS-DEPLOYCOMPOSE-001, ISS-JOBQLOST-001, ISS-JRENABLE-002, ISS-LEANWIRE-004, ISS-LOCKTAKE-005, ISS-SCHEMAEDIT-001, ISS-SOURCESREG-001, ISS-T039CMD-001, ISS-T057OPS-001. Each verdict says the row stays open, is filed file-dont-fix, awaits an owner decision, or only mentions the id incidentally (ISS-LOCKTAKE-005 in the G4 mutation text). ISS-JOBQLOST-001 is explicitly NOT flipped by its own verdict (no retention chosen, so nothing prunes).

Open rows before: critical 4, high 49, medium 110, low 121. On this branch: critical 4, high 49, medium 110, low 118. (High is 49, not 48, because rows were filed after the earlier sync.)

## Flipped to verified

| id | sev | evidence read (qa/verdicts/...) | fix commit |
|---|---|---|---|
| ISS-T034EXT-001 | low | t034-capture-failure-not-success.md:41-42 ("Verified by the new passing tests and mutations: -001, -002, -003, -005, -006, -007"); cycle 1 FAIL concerned flaky record-commands tests only, cycle 2 PASS (line 82+) does not retract; manifest checked-PASS cycle 2; recorder.test.mjs:146 pins it; recorder.js now skips queued chunks once failed | 709038c |
| ISS-T034EXT-003 | low | same :41-42; recorder.test.mjs:188 | 709038c |
| ISS-T034EXT-007 | low | same :41-42; recorder.test.mjs:184 asserts ret === true | 709038c |

Each row now carries status verified, verified_date 2026-10-12, fixed_date 2026-10-11 (709038c commit date; was null) and a verified_evidence string, following the ISS-T034EXT-002/-006 rows flipped in sync 2026-10-12. Scope caveat kept: logic with fakes, not a real browser. These rows record one reproduction each (no reproductions array), all pinned by the named tests. ISS-T034EXT-004 stays open (its test is an expected-fail todo).

## CLAIMED-NOT-VERIFIED (left open; missing piece)

- ISS-336 (low): SourcesPage.test.tsx now exists (commit 5453ef6, bulk checkpoint), but no verdict names the row.
- ISS-T034FIX-002 (low): verdict says "stays low, subsumed by -004"; -004 verified at cycle 2, but no verdict states -002 itself fixed or closed.

## Notes

- Id collision, not stale: speaker-denylist-ledger-corpus.md says "ISS-097 is genuinely closed", but that is the lane/a-speakers ISS-097 (canonical ISS-108, see divergence-mapping-correction.md:93). The canonical ISS-097 row (router.embed doc comment) is a different, still-open issue. Same family: ISS-101 and ISS-111 carry identical titles (111 flagged duplicate_of 101, both open).
- Rows whose own verdict files them "stays open" by design (not stale): ISS-LANGFUSE207-001/-002, ISS-TABCAPTURE-001/-002, ISS-SOURCESREG-002, ISS-T057OPS-002, ISS-REINGESTEJSON-001/-002/-003/-008/-009, ISS-RUNREVCLOSE-001, ISS-JOBQPID-001, ISS-JOBQSTALL-001, ISS-JOBQPRUNE-002.
- Low rows with no verdict naming them at all (e.g. ISS-088, ISS-275, ISS-277 to -280, ISS-301, ISS-330, ISS-338, ISS-339, ISS-344) cannot meet condition (1) and were left open; ISS-344 and ISS-119 were spot-checked and the defects are still in the tree.
- A few low rows use non-standard field names (seam/summary/description instead of feature/title/evidence, e.g. ISS-LEANWIRE-001, ISS-RUNLOCK-001/-002, ISS-AITRANSPORT-002); they parse and were counted.

## Genuinely open low rows, governance / process / tracker (43)

ISS-A035913-006, ISS-A035913-007, ISS-A035913-009, ISS-A0CDAEE-002, ISS-ALLOC-002, ISS-ALLOC-003, ISS-AUTHTENANT-003, ISS-C-UNRUN-WRITERS-013, ISS-CORPUSRECONCILE-002, ISS-CORPUSRECONCILE-003, ISS-JOBQPRUNE-003, ISS-JRENABLE-001, ISS-050, ISS-051, ISS-052, ISS-088, ISS-141, ISS-175, ISS-181, ISS-208, ISS-209, ISS-233, ISS-259, ISS-265, ISS-264, ISS-275, ISS-277, ISS-278, ISS-279, ISS-280, ISS-301, ISS-330, ISS-345, ISS-354, ISS-361, ISS-MEDFIX2-001, ISS-MEDFIX2-002, ISS-REINGESTSAFE-003, ISS-T-029-1, ISS-T-031-1, ISS-T057OPS-002, ISS-TABCAPTURE-002, ISS-U4BHB-004

## Genuinely open low rows, product / code (73)

ISS-274WIRE-1, ISS-274WIRE-2, ISS-274WIRE-3, ISS-AITRANSPORT-002, ISS-ALERTID-005, ISS-ALERTREDACT-001, ISS-ALERTTENANT-003, ISS-APILOGGER-002, ISS-APILOGGER-004, ISS-C-UNRUN-WRITERS-003, ISS-C-UNRUN-WRITERS-004, ISS-C-UNRUN-WRITERS-012, ISS-C-UNRUN-WRITERS-014, ISS-DEPLOYBUILD-002, ISS-DEPLOYBUILD-003, ISS-JOBQEPERM-001, ISS-JOBQLOST-002, ISS-JOBQPID-001, ISS-JOBQPID-002, ISS-JOBQPRUNE-002, ISS-JOBQSTALL-001, ISS-073, ISS-081, ISS-082, ISS-097, ISS-101, ISS-107, ISS-111, ISS-119, ISS-303, ISS-320, ISS-338, ISS-339, ISS-344, ISS-LANGFUSE207-001, ISS-LANGFUSE207-002, ISS-LEANWIRE-001, ISS-LEANWIRE-005, ISS-LOCKTAKE-001, ISS-LOCKTAKE-002, ISS-LOCKTAKE-006, ISS-LOCKTAKE-008, ISS-MEDFIX-001, ISS-PH3-003, ISS-PH3-005, ISS-PH3-007, ISS-REINGESTEJSON-001, ISS-REINGESTEJSON-002, ISS-REINGESTEJSON-003, ISS-REINGESTEJSON-008, ISS-REINGESTEJSON-009, ISS-REINGESTSAFE-002, ISS-RULESAPI-001, ISS-RULESWEB-001, ISS-RUNLOCK-001, ISS-RUNLOCK-002, ISS-RUNREVCLOSE-001, ISS-SCHEMAEDIT-002, ISS-SENDNOWAPI-002, ISS-SENDNOWAPI-004, ISS-SOURCESREG-002, ISS-STATUSWEB-001, ISS-T034EXT-004, ISS-T037W1-002, ISS-T037WIRE-003, ISS-TABCAPTURE-001, ISS-TENANTFLT-001, ISS-TENANTFLT-002, ISS-TENANTFLT-003, ISS-U3-001, ISS-U3-002, ISS-UNOPT-002, ISS-UNOPTLOCK-001
