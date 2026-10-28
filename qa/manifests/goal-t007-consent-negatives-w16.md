# goal-t007-consent-negatives-w16

Status: checked-PASS
Fix cycle: 0
Base: 6b64964b66d9a92688221b8ae1ebfbca5b72bb66 (lane/w16-t007wa)
Candidate: see git log of lane/w16-t007consent (single commit)

## Changed paths
- apps/api/src/native-evidence/message-publication.test.ts (6 new tests: control, absent, given:false, withdrawn-before, 2x mid-transaction)
- apps/api/src/native-evidence/message-publication-fixture.ts (test-only onOperation hook)
- apps/api/src/knowledge-outputs/workbench.test.ts (consented source for the T007 approval test)
No product source changed. No hole exposed.

## Clauses
Native publication consent gate (message-publication.ts:47) must refuse missing/false/withdrawn consent and write nothing to tree_index.

## Mutation proof (scripts in KnowledgeBase-lanes/w16-t007consent-mut, per-mutation backup, timeout 300, HEAD-fidelity OK on every touched file)
- M1 gate `!== true` -> `=== false`: 1 fail (absent test)
- M2 gate removed: 1 fail (absent test)
- M3 gate + store.ts checkEvidence consent check removed: 1 fail (absent test)
- M4 store.ts checkEvidence check only removed: 0 fail (fence + visibility still refuse false)
- M5 gate + checkEvidence + fence `$ne:false` filter + visibility line 46 removed: 5 fail (absent, false, withdrawn, both mid-tx)
Layering note: false/withdrawn consent is refused by four independent layers; the gate at :47 is the sole layer for an ABSENT consent record, and that test is what catches loosening it.

## Evidence
message-publication.test.ts 11 pass 0 fail; whatsapp-authority.test.ts 8/0; review-source.test.ts 9/0; workbench.test.ts 22 pass 1 fail (fail = TOC sample needs untracked apps/api/data/toc-migrated, missing in main tree too, pre-existing).
tsc apps/api: 0 errors (review-source.test.ts:19 typing fixed with a cast; test logic unchanged).
