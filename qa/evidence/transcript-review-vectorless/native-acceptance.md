# T054 isolated native acceptance

This is a runnable acceptance candidate, not evidence of native execution or whole-parent completion.

## Preconditions and isolation

- Coordinator holds the single database/test execution lease and verifies no live capture measurement conflicts.
- Use `LKB_T054_MONGO_URL` only for an explicitly approved staging replica set. Do not copy or print connection values into receipts. The test checks replica-set capability using `hello` before migration or seed writes.
- Set `LKB_T054_MONGO_DB` to `t054_test_vectorless`. The test rejects bases outside `^t054_test_[a-z0-9_-]+$`, then appends a random UUID. Its explicit `client.db(database)` selects only that fresh database even when the URI contains a different default database.
- Enable only with `LKB_T054_MONGO_RUN=1`. Do not point the application, a migration CLI, or a production `.env` loader at this test database. All provider responses are synthetic. The embedding callback throws if invoked.
- The test applies only the transcript-review migration inside its unique database, creates synthetic `t/s1` content, and drops only that database in `finally`. Connection interruptions may leave a uniquely named test database for coordinator cleanup; never issue broad prefix cleanup.

## Broker command

With the three explicit variables supplied by the coordinator without logging secrets, use the existing portable Node runtime and safe test loader:

```text
node --test --test-isolation=none --test-concurrency=1 --test-timeout=90000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/transcript-review/mongodb.integration.test.ts
```

Wrap the process in the coordinator's existing bounded runner and preserve command, exit, elapsed time, source pins and redacted stdout/stderr. A skipped test is not native acceptance.

## Required observations

1. The actual indexer publishes corrected claims/page/lexical chunks/tree/graph atomically, with no embedding calls and effective speaker attribution. Original turns and untouched reviewed claims survive.
2. The test closes all client sockets and reconnects through a newly constructed `MongoClient`. Revision, history and effective source evidence survive. This proves client reconnection, not database-server or application-process restart.
3. A correction committed during an older refresh causes a real transaction conflict; every derived collection retains its previous committed generation and the new revision remains pending.
4. Independently inspect required head/history indexes and tenant-specific counts in this unique database before cleanup when extending the harness; do not substitute an in-memory receipt for native evidence.

## Remaining whole-parent gates

- Actual application-process restart/recovery with explicit staging composition.
- Real mounted authenticated HTTP and browser review/save/reload/history/conflict/refresh/corrected downstream display, under separate leases.
- Existing source visibility, cross-tenant, orphan and immutable visual provenance cases remain required; current fixture evidence is reused only for unchanged checked bytes.
- Independent checker verdict and unchanged final pins. T054 remains in progress until its full contract is accepted.
