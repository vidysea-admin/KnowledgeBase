# Transcript fixture peak-concurrency diagnosis — read-only

Root C:/Users/product/Desktop/KnowledgeBase. Source remains frozen; no source changes, tests, builds, DB/providers or runtime probes. Scoped static trace only; no native/Mongo acceptance claim.

Observed broker report: strengthened actual factory refresh test fails peak6 vs expected1 at transcripts.test.ts91. This is introduced by the new test-only independent readiness verifier, not evidence that the refresh transaction performs six concurrent Mongo operations.

Exact trace:
1. refresh-testkit.ts operation increments shared active/maxActive for EVERY collection operation. It tags calls.transaction from options.session but does not filter the peak by that flag. The setImmediate yield makes concurrent read promises count at once.
2. refresh-executor.ts creates one transactionReviewDb(deps.db, session, tenantId), and passes that view into indexSession. transaction-db.ts has one shared pending chain and enqueues all find.toArray/read/write operations, attaching the SAME session. Indexer's Promise.all is serialized through that chain.
3. composition transcript callback is unconfigured in this happy-path test. notifyIndexCommitted returns unconfigured BEFORE persistence reads, so it does not introduce parallel transaction or post-commit reads here.
4. My strengthened test added await verifyIndexGeneration(state.transaction.db,...) AFTER successful runRefresh and BEFORE the original peak==1 assertion. This is the raw root DB, with no session and after executor endSession.
5. generation.ts actualArtifacts intentionally starts six independent readonly jobs in Promise.all: effective turns, sources, session_pages, chunks, claims and tree_index. The fixture tags these calls transaction:false, but their overlap raises the shared lifetime maxActive to6. These independent post-commit verification reads have no Mongo transaction concurrency restriction.

Smallest repair proposal (exact lease requested only after broker source release): apps/api/src/grounded-postprocessing/transcripts.test.ts. Move the newly added independent verifyIndexGeneration assertion to immediately AFTER the existing unchanged maxActive()==1 serialization assertion at the end of that test. Add one short comment that the independent raw-DB verifier runs after measuring actual transaction serialization. Keep every assertion, expected peak1, actual production execution, lexical/tree/cited evidence checks and fixture counters unchanged. Do not change transaction-db.ts, generation.ts Promise.all, production refresh or fixture counting to manufacture sequence.

This preserves the exact original production phase under the existing concurrency assertion; only a subsequently added out-of-transaction test observation runs after it. If the broker still sees >1 BEFORE that verifier, stop and use existing calls.transaction tags to diagnose true session-bound concurrency; do not relax the assertion. No extra helper or serialization of ordinary nontransactional reads is warranted by this trace.

Required broker evidence after grant: rerun the scoped actual factory refresh test (and postcommit floor as combined receipt requires) on exact new pins. Real Mongo transaction/host/native acceptance remains separate.