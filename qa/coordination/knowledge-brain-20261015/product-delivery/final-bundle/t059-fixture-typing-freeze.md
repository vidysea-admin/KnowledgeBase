# T059 fixture typing-only freeze

Root approved exact `apps/api/src/evaluation-flywheel/composition.test.ts:22–39` repair for the eight string-ID/ObjectId diagnostics in `qa/goal-vectorless-2026-10-15/verification-api-types-native-request-epoch.stdout.txt`. Added an explicit local string-ID `FixtureSession` type and passed it to `mem.db.collection<FixtureSession>("sessions")`. No casts, suppressions, strictness changes, runtime behavior or assertions changed. No diagnostic wrappers added; runtime503 cause remains unresolved.

Final composition.test.ts SHA256 `284080e7e2a0c2abd573982c1d589bf4603eb5f7bdf03e2bbfd34a3926abfe10` (replaces `6e5ccb6396f8f75d89687650558e263283ecb4711ef44ff7aa5be6ed1d1138d1`). Unchanged test-fixture.ts `4fd0bcbdd3f054c20e5e444f87900609ffb63d306c68b5a5fdaf5c84c4379cee`. No production code/write, local tests/builds or reruns. Source frozen pending sole broker ONE current API types after both owners acknowledge freeze. Previous18-config-pin collector closure is incomplete; full1245supplement remains pending. No full-freshness claim or compiler success is inferred.

Original downstream503 and helper/CAS pass receipts remain retained; this typing-only repair does not resolve or recertify runtime composition.
