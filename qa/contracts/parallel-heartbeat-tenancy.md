# Contract — parallel-heartbeat-tenancy

Issue: ISS-U4BHB-001 (high, security class). Scope: runtime regression coverage for the shipped heartbeat collection accessor. No Mongo connection, dependency addition, notifier wiring, or enforcement-path change.

- C1: The test invokes production `watchHeartbeat`/`listHeartbeats`, with one shared raw collection containing two tenants. The fake applies driver filters without imposing tenant isolation itself. Each tenant sees its own row; an absent tenant sees none.
- C2: `findHeartbeat` and direct accessor queries stamp the scoped tenant into driver filters. A crafted foreign tenant/filter cannot expose a foreign row.
- C3: `markHeartbeat` updates/upserts only the scoped tenant, recomputes the composite id, ignores a foreign document id/tenant, and retains foreign rows byte-for-byte. Repeated marks remain idempotent.
- C4: Empty tenant ids reject before any driver operation. Existing one-argument production callers continue to work without introducing a raw escape hatch.
- C5: D-015 corpus floor is the issue's ONE recorded raw-handle substitution, verbatim: replace the historical `return scopedCollection<WatchHeartbeat>(getDb(), "watch_heartbeat")(tenantId);` with `void tenantId; void scopedCollection; return getDb().collection("watch_heartbeat") as unknown as ReturnType<ReturnType<typeof scopedCollection<WatchHeartbeat>>>;`. The dedicated runtime suite must fail. Report any needed preimage adaptation explicitly; do not claim an exact historical preimage exists after dependency injection.
- C6: Also substitute the injected `db.collection("watch_heartbeat")` raw handle, accepting/discarding `tenantId`, to prove the test catches actual two-tenant leakage rather than relying only on the disconnected default database. Independent falsifications must also catch removing scoped write ids and bypassing scope on a public read helper.
- C7: Run bounded offline baseline and immediate downstream tests. Every mutation runs only after ownership is frozen, with timeout, a byte backup, restoration on error/timeout/interrupt, and exact byte comparison. Use `scripts/lib/mutate.mjs` for committed sources; if the source is dirty, an isolated copy avoids destructive restoration of another agent's work.

Only the independent checker can issue PASS after actual checks. Mutation detection is regression coverage, not proof of a live Mongo integration run.
