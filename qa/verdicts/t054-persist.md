# T-054 persist (durable atomic transcript corrections) - cycle 0

VERDICT: PASS (scoped)
Cycle checked: 0
ISSUES-WRITTEN: ISS-T054-PERSIST-001 (medium, tenancy-test gap), ISS-T054-PERSIST-002 (low, notes only)

Scope: commit c81ee6a2, contract qa/contracts/t054-transcript-review-planner-editor.md criteria 4, 5, 8 (server side) plus persistence, tenant/auth routes, schema/migration, refresh execution. NOT certified: mounting (server.ts untouched), real MongoDB (unique index and matchedCount CAS assumed from driver semantics), live browser, a real refresh executor, other readers of `turns`. The manifest's live gaps 1-9 are accurate and are not contradicted.

## Commands and results (lane worktree, node on PATH)
- `node --test --import tsx src/transcript-review/*.test.ts` (apps/api): tests 27 / pass 27 / fail 0.
- Full `node --test --import tsx "src/**/*.test.ts"` (D2_FIXTURE_PYTHON set): tests 954 / pass 954 / fail 0.
- `node --test migrations/transcript-reviews.migration.test.mjs`: pass 3 / fail 0.
- `python schema/validate.py`: PASS 32 schemas. `node scripts/gen-types.mjs --check`: OK 32 generated files match schema/.
- tsc with a temporary paths tsconfig over transcript-review/**: no errors (config deleted).
- `node scripts/lint-loc.mjs --all`: fails on loc (packages/meeting-bot/py/test_sb_join_ownership.py:408, untouched), snapshot (stale, regenerate at integration) and root (caused by my temporary harness file, since deleted). The migrations stage passes.

## Generated files
Produced by the repo generator: `gen-types --check` passes with the two new files and the two export lines (alphabetical, between topics and tree_index). The lane is branched from codexwave1 and no existing generated file was altered. A merge conflict in packages/core/src/index.ts is possible only if another lane adds exports at the same spot.

## Attack findings
1. Original turns: no code path writes `turns` (the store only calls find on it; commit writes head and revisions only). The guard is by construction plus a test that records writes per collection; a mutant that adds a turns write was KILLED.
2. CAS: head swap filter includes revision; the first commit uses a unique _id insert. Race tests give exactly one winner. Crash between head swap and history write: the head carries its own audit entry and the next commit heals the row (no-heal mutant KILLED). The history endpoint does not heal until the next commit (documented gap 3, low). ETag is a SHA-256 over tenant, session, parent revision and changes: predictable by a reader, but If-Match is concurrency control, not authorization, and a guessed value only passes if it equals the true current head. ABA is impossible because the hash chains the parent.
3. Tenancy: tenant and actor come only from `req.auth`; query is never read; body is strict-parsed (tenantId/actorRef/reviewedAt rejected 400). Cross-tenant GET/POST/history/refresh return 404 via the originals lookup; 428/400 precede it but depend only on the request, so no existence oracle. Production code is correct. TEST GAP: ISS-T054-PERSIST-001.
4. Refresh: progress writes are fenced on revision; a stale run returns null and the endpoint reports the head's current state. Concurrent in-process calls share one promise. Cross-process concurrent refresh could momentarily regress `completed` or status (same revision, idempotent executors, self-heals); known gap 4, low.
5. Migration: mirrors the speaker-suggestions migration; up() skips existing collections and createIndex is idempotent; unique tenantId+sessionId on head and +revision on history; no TTL; down() drops both (documented). It receives a `db` from the runner and holds no connection string or db name, so it cannot default to `lkb`. Not applied.
6. Content: reason <= 2000, text <= 20000 with no NUL, ids/labels <= 400 with no control chars, <= 100 corrections per request. Stored and returned as JSON strings with no-store; no HTML interpretation server-side. The overlay is unbounded per head document (turns x 20000 chars vs 16MB BSON): theoretical, low.

## Mutation run (per-mutation byte backup, restore in finally, hash verified each time; harness deleted)
17 mutants against persist+refresh+service (21 tests). KILLED 11: CAS without revision, tenant from body, history 404 check removed, refresh 404 check removed, write to turns, setRefresh without fence, no heal, overlay ignored, duplicate-insert counted as win, If-Match 428 removed, conflict swallowed. SURVIVED 5: headId without tenant, revisionId without tenant, tenant from query (tenancy, ISS-T054-PERSIST-001); history $set instead of $setOnInsert and ignoring the superseded return (low, ISS-T054-PERSIST-002). 1 equivalent (actor from body is already rejected by the strict parser). Every file restored byte-identical (hash verified); no source modified.

## Notes
Actor is `apikey:<tenantId>` (no key or user id on VerifiedKey): the audit cannot attribute a person (manifest gap 5). T-054 stays in_progress.
