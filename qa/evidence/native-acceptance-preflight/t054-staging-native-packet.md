# T054 safe native acceptance candidate — preparation only

Lease: only t054-staging-native.test.ts, this packet and future exclusive run-UUID ownership receipts in this directory. Existing API source is unchanged. No execution, environment-file read, network, provider or DB operation performed during preparation. No native acceptance or checker PASS claimed.

Safety: fixed explicit lkb_staging, never alternate DB. Existing-server URI supplied privately by broker. Read-only hello requires writable replica-set primary, logical sessions and modern wire support before any fixture write; standalone yields explicit HOLD/skipped diagnostic with zero database mutations. All required existing canonical collections/index specs are checked; nothing creates/migrates/drops schema, indexes, collections or databases. Optional WhatsApp visibility collections are read-only and required to preexist conservatively.

Separate write gate: LKB_T054_WRITE_GRANT=bounded-owned-fixtures is required AFTER the broker obtains explicit bounded fixture-write authorization and read-only prerequisites. Other variables: LKB_T054_MONGO_RUN=1, LKB_T054_MONGO_DB=lkb_staging, LKB_ALLOW_STAGING=lkb_staging, LKB_T054_BROKER_LEASE=held, LKB_T054_SOURCE_SHA=checked candidate SHA, LKB_T054_MONGO_URL=private existing-server value. These are gates, not a substitute for authorization. Reject configured MONGODB_LOG_* before driver load.

Future broker command (do not run during preparation):

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-isolation=none --test-concurrency=1 --test-timeout=100000 --import ./.cache/coordination/safe-test-runtime/register.mjs qa/evidence/native-acceptance-preflight/t054-staging-native.test.ts
```

Use broker outer timeout, one CPU/database lease and no conflicting worker measurement. Driver operations have <=9s timeout and <=8s network/server bounds; product transaction commit has its existing15s cap. Whole fixture deadline90s. Timeout may interrupt cleanup; preserve the exact ownership receipt, never sweep by prefix/tenant/database. A skipped/HOLD result cannot count as native acceptance.

Before seeding, exclusive run directory and ownership manifest bind fresh UUID tenant/source/session/turn/claim IDs, source pins, runtime, schema/index fingerprints and all generated write IDs. A guarded real DB handle allows only known collections, exact tenant queries, bounded mutation operations and real startSession; no client.db/DDL escape. Every inserted/upserted identity is journaled before dispatch, including transaction-aborted identities. Finally validates ownership and verifies no unknown tenant record before deleting only tenant+exact journal IDs; count postconditions must prove absence. Cleanup failure remains HOLD with the durable receipt. No migration, server restart or broad cleanup fallback.

Real imports: service/store/refresh-executor/transaction-db, indexSession, effective-reader and grounded-content reader. Retains immutable source turn, reviewed claim, corrected evidence/speaker, real claims/page/chunks/tree/graph refresh, fresh-client reconnect, real concurrent correction and transactional rollback assertions. Synthetic zero-cost complete() only; embeddings forbidden; decisions/speaker providers disabled. Client reconnect does not prove application/server restart, mounted HTTP/browser acceptance or full parent completion.

Required independent checks later: review guard and every immediate production consumer; confirm exact final source pins and helper-import compatibility; focused broker readiness before any write grant; actual bounded replica run only when available. Candidate behavior remains unexecuted and may expose compatibility/fixture failures honestly. Missing indexes/collections require HOLD, never automatic repair.

Metrics: maker preparation active seconds not separately instrumented; tokens/cost unknown; execution seconds0; checks/tests not run. Root records exact base/candidate SHA and final file hashes at freeze. This packet is not ready-for-native-PASS.
