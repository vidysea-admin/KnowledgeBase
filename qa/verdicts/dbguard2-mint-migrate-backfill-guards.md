# Verdict: dbguard2-mint-migrate-backfill-guards
VERDICT: PASS
Cycle checked: 0
Checker: independent, fakes only (no DB connected, no .env read). Worktree lane/dbguard2 @ 1bb648b2 (base main dcddfedb).

EXPLANATION:
- migrate-mongo-config: 17 env-only bypass cases replayed on resolveMigrateTarget. REFUSED: LKB_I_KNOW_THIS_IS_PRODUCTION "1 " and "true"; MONGODB_DB LKB/Lkb/"lkb "/"lkb/"/"x/lkb"/empty; lkb with no opt-in; opt-in with global_university_db; Lkb_Staging; lkb_staging without LKB_ALLOW_STAGING. A URI-path db is ignored (databaseName is explicit; unset DB refuses). Accepted only: exact lkb + flag/env "1", work DB, lkb_staging + allow. A typo'd env name (e.g. LKB_I_KNOWTHISISPRODUCTION) fails closed (refused); the correct name is documented in .env.example and the compose comments. Compose migrate still works with explicit envs (MONGODB_DB required via ${:?}; opt-in vars forwarded). docker was not run. Note: the argv flag may be rejected by migrate-mongo's own CLI parser, so env is the practical route.
- mint-key: spawned refusals exit 1 before connecting for no DB, lkb, LKB, empty, global_university_db, lkb_staging without allow, flag with no DB, flag with non-lkb DB, env opt-in alone. Production is reachable only via argv flag plus exact MONGODB_DB=lkb (D-150). The positive production path was not run (would connect).
- shared-db: only apps/api imports the bare @lkb/db (other mentions in packages are comments), so loadSharedDb (resolved from apps/api) gives one instance; assertConnected runs after connect() and before any getDb() use or write. It cannot silently pick a default DB (target comes from requireBackfillDatabase). Caveat: in a lane the resolution lands on the main tree's packages/db via junction; same instance, pre-existing layout.
- caller-visible.test.ts: the message update is legitimate, BUT the edit put a `//` comment before `assert.ok(!/tenantId is required/...)` on the same line, so that assertion is now dead code (a small weakening). Filed ISS-DBGUARD2-001 (medium, test-only; the tenant guard itself is covered by the neighbouring loop).
- Replay per id: ISS-LEGACYSEED-002 pass (default gone, guard before connect, refusals above); ISS-SCRIPTGUARDS-001 pass (17/17 plus defaults gone); ISS-NOLKBDEFAULT-001 pass (db-guard-paths 6/6 and its mutants killed).
- Mutations (10 attempted, timeout, per-mutation byte backup restored in finally, git hash-object == HEAD blob every time; harness deleted): 9 killed (migrate flag truthy-any, migrate DB check removed, migrate default lkb, migrate lkb unguarded, staging check bypass, mint allowProduction false, mint argv dropped, backfill assertConnected removed, shared-db resolve from wrong base); 1 no-match (my pattern, not a survivor).
- Tests: scripts guard tests 40/40. apps/api 764 tests, 763 pass; the 1 failure is activity-health router (Python subprocess under load), passes 3/3 in isolation, file untouched by this lane. tsc clean.

ISSUES-WRITTEN: ISS-DBGUARD2-001 (medium)

ISS-DBGUARD2-001 verified at 98de4c27: diff 614d34ea..98de4c27 is the single restored assertion line only; caller-visible.test.ts 7/7; mutation (message includes "tenantId is required") makes the positive control fail (6/7), file hash restored == HEAD. VERDICT remains PASS.
