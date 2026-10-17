# Manifest — goal-t007-privacy-fixtures-w16

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t007wa (branch lane/w16-t007wa), base a9fac545. Candidate SHA: the lane HEAD commit (see commit).
Task: T-007 (data-write/privacy, full ceremony). Issues: ISS-T007VISIBILITY-001, ISS-T007REVIEWSOURCE-001 (ledger rows stay open until a checker verdict; ISS-WA-REVIEW-WIRE-006 NOT touched, different readers/packages, left).

Finding: at base a9fac545 the production source already contains both repairs (knowledge.ts trustedTree taint propagation; review-source.ts snapshot read). Both ledger reproduction corpora pass unchanged. Production source is NOT changed in this unit. The unit repairs three stale TEST fixtures that fail at base and hide the withdrawn-consent regression proof:
- apps/api/src/visibility/knowledge.test.ts: "actual materialized approved WA loses every trusted projection when source consent is withdrawn" used session {} and a consent-less source, but native publication (native-evidence/message-publication.ts lines 40, 47) requires an in-transaction session, explicit consent.given===true and a tree_index write. Fake db now handles tree_index updateOne; test passes a transaction-shaped session and consented source.
- apps/api/src/whatsapp-review/review-source.test.ts fixture(): source now consent given:true (same reason); fixes "real repository approval/materialization..." case.
- apps/api/src/whatsapp/review/test-fixtures.ts matches(): $ne shortcut applies only to a sole-$ne predicate, so mixed {$in,$ne} keeps the documented unsupported-equality behavior (case "source/raw/effective changes..." asserted this and failed at base). NOTE: this changes the fixture file pinned (F104) in the checker evidence receipts; those pins must be re-derived.

Changed paths: the three above plus this manifest.
Contract clauses: qa/contracts/goal-t007-visibility.md (C9 pruning/taint), qa/contracts/goal-t007-review-source.md (consent withdrawal/pending-invalidation during final head lookup).

Checks a checker must run (cwd apps/api, node on PATH from codex runtime):
 node --test --import tsx --test-concurrency=1 <lane>\qa\evidence\goal-t007\visibility-checker.test.ts src/visibility/knowledge.test.ts
 node --test --import tsx --test-concurrency=1 <lane>\qa\evidence\goal-t007\review-source-checker-snapshot.test.ts src/whatsapp-review/review-source.test.ts src/whatsapp/review/store.test.ts
Fake-DB only; no browser, Mongo or provider. Slow (many minutes) because tsx on shared CPU.

Evidence: see maker report in the final packet; raw outputs at C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t007wa-run{1..5}*.txt.
Not established: real replica-set/MVCC behaviour, web28 (apps/web, out of this lane's paths), ISS-WA-REVIEW-WIRE-006 readers.
