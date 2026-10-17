# dbguard2-mint-migrate-backfill-guards

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2 (high: ISS-SCRIPTGUARDS-001) + ISS-LEGACYSEED-002 (high, D-150) + ISS-NOLKBDEFAULT-001 (medium) + one live-run defect. Class: SECURITY / DATA-WRITE: FULL ceremony. Verdict by the checker only.
Lane: lane/dbguard2 (base 8961ddd1, then fast-forwarded to main dcddfedb so the nolkbdefault code is present). No new ledger shard rows; ledger statuses of the three issues are NOT changed here.

## Changes
- `scripts/mint-key.mjs` (ISS-LEGACYSEED-002, D-150): `requireScriptDatabase(env, argv, {allowProduction: true})`. lkb only with `--i-know-this-is-production` AND `MONGODB_DB=lkb` exactly; no DB refuses; otherwise work/staging DBs only. Refuses with exit 1 before connecting.
- `migrate-mongo-config.cjs` (ISS-SCRIPTGUARDS-001): no default DB, no default URL. Same rule inlined (compose bind-mounts only this file): lkb needs argv `--i-know-this-is-production` or env `LKB_I_KNOW_THIS_IS_PRODUCTION=1` AND `MONGODB_DB=lkb`; opt-in with another DB refused; `global_university_db` refused; `lkb_staging` needs `LKB_ALLOW_STAGING`.
- `docker-compose.yml` migrate service: `MONGODB_DB: ${MONGODB_DB:?...}` (no pinned lkb), forwards `LKB_I_KNOW_THIS_IS_PRODUCTION` and `LKB_ALLOW_STAGING`; usage comment updated. `.env.example` documents it. CI: `.github/workflows/ci.yml` has no migrate step, so nothing to change there.
- `scripts/backfill.mjs` + new `scripts/lib/shared-db.mjs`: cause of "Mongo not connected": the CLI imported `../packages/db/src/index.ts` and called connect() on that copy, but the apps/api stores (createMongoJobWriter etc.) import the bare `@lkb/db`. Where the workspace link resolves to a different file (lane worktree junctions to the main tree) these are two module instances with separate `db` variables (reproduced: relative copy vs apps/api copy `connect` identity false). The CLI now loads `@lkb/db` as apps/api resolves it (identity true) and asserts the connection after connect().
- Tests (fakes only): `scripts/lib/dbguard2.test.mjs` (12), `scripts/webinar/db-guard-paths.test.mjs` (6): ISS-NOLKBDEFAULT-001's four paths (validateRunGate behavioural; run-pipeline-deps Gmail preflight with a fake fetch; sync-session and join-rules-api-host source-level because they are side-effecting entry points).

## Reproductions replayed (per id)
- ISS-LEGACYSEED-002: 1/1 (mint-key.mjs:43 default gone; no-DB refuses) plus 7/7 spawn refusals (exit 1, no key printed).
- ISS-SCRIPTGUARDS-001: 1/1 (config:6-7 defaults gone; nothing-set refuses) plus 13/13 refusals and 5/5 acceptances on config load.
- ISS-NOLKBDEFAULT-001: mutants M3a/M3b/M3d/M5 recorded in qa/verdicts/nolkbdefault-api-db-required.md: 4/4 now killed (below).
- Not left open. Not exercised: a real mint or real migration (no DB is ever connected).

## Evidence (node bin prepended to PATH)
- scripts: script-db-guard + legacy-unbound + dbguard2 + db-guard-paths + run-pipeline tests: tests 62, pass 62, fail 0.
- Mutations (10, harness in-worktree, untracked, deleted before commit; per-mutation byte backup restored in finally; git hash-object == pre-mutation blob every time): 10/10 killed: mint-key lkb default, migrate default lkb, migrate flag accepts any DB, migrate lkb without flag, backfill relative db import, validateRunGate old list, deps preflight guard dropped, sync-session env arg dropped, join-rules host lkb default, mint-key allowProduction dropped.
- apps/api full suite: tests 764, pass 763 (after updating caller-visible.test.ts mint-key positive control to the new DB-guard message: 7/7); the 1 failure is activity-health router (Python subprocess 20 s timeout under load), pre-existing per the nolkbdefault verdict, passes 3/3 in isolation with D2_FIXTURE_PYTHON.

## Not verified
No real Mongo, mint, migration, backfill or docker compose run. `scripts/lib` is already over the lint-dirsize budget (pre-existing). The recovery-chunks backfill path was not changed.
