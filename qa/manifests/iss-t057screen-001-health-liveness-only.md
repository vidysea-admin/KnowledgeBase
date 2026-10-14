# iss-t057screen-001-health-liveness-only

**Handshake status:** checked-PASS (cycle 0)
Fix cycle: 0
Tier: 2/3 (open ISS-T057SCREEN-001). Lane: lane/healthlive (base e4d6f14). Class: security (cross-tenant read, unauthenticated). Authority: Approver Umesh 2026-10-12 ("Counts hatao, sirf liveness"); the DECISIONS entry amending qa/contracts/health-route.md C1/C2 was being appended in parallel and had not landed in this worktree (docs/DECISIONS.md tops out at D-128) -- the checker should cite it once present. qa/contracts/ NOT edited by this unit; contract C1/C2 are knowingly superseded by the ruling.

## Scope
apps/api only: routes/health.ts, health-probe.ts, store.ts (`createMongoHealthDeps`), fixtures.ts (`fakeHealthDeps`), tests health.test.ts + health-probe.test.ts.

## New public GET /health body
`{"db":"ok"}` (200) or `{"db":"error"}` (503). Nothing else; unauthenticated; still mounted before requireAuth in server.ts (C5 unchanged).

## Removed and why
- `collections` (collection name -> all-tenant countDocuments): the leak itself. No countDocuments/schema-index read remains on the path (`createMongoHealthDeps` is ping-only; `probeMongoHealth(ping)` no longer takes a count fn).
- `watchSilent` / `watchUnreadable`: aggregate counts of silent/unreadable watchers across ALL configured tenants -- tenant-fleet state to an anonymous caller; dropped. Not re-added anywhere unauthenticated.
- Kept (deliberately, say so if you disagree): the R2 detector still runs when db is ok, so operator Telegram alerts still fire (private channel, carries tenant/source); and `/health` still answers 503 when a heartbeat read failed (a single boolean, no identifiers; keeps the Dockerfile HEALTHCHECK comment true). Body is built from a whitelist, never `{...report}`.
- Note: the detector still does tenant-scoped heartbeat reads per anonymous hit (unchanged cost, config-derived tenants). Not in scope here.

## Consumers
- apps/api/Dockerfile HEALTHCHECK: `fetch(.../health).then(r=>exit(r.ok?0:1))` uses status only -> unchanged, verified by test (below). docker-compose.yml: no healthcheck. apps/web: already on /system-status (c98b4fc); only mentions are comments/tests asserting /health is never requested. scripts/live-verify.mjs:193 hits a different base expecting 404 (untouched, unrelated). No other consumer of the removed fields.

## Evidence
`node --test --import tsx apps/api/src/routes/health.test.ts apps/api/src/health-probe.test.ts apps/api/src/routes/system-status.test.ts` -> 34 pass / 0 fail (health.test.ts 24/24 alone).
`tsc --noEmit -p apps/api` -> no errors under apps/api/src (package-resolution noise from ../../packages is the worktree junction layout, pre-existing).
New/changed tests: exact body `{db:"ok"}` and no digits at all; fake returning extra keys is not serialised (whitelist); 503 exactly `{db:"error"}`; detector still alerts but body carries no watcher counts/tenant/source; source pin: no countDocuments/.collection(/schema index in health.ts, health-probe.ts, createMongoHealthDeps; the Dockerfile HEALTHCHECK command extracted verbatim and run with node against the test server -> exit 0 (200), exit 1 when server stopped, exit 1 on 503 db-down.
ISS-T057SCREEN-001 reproduction 1 (anonymous GET /health reads all-tenant counts): replayed as test "reproduction 1 replayed" -> body keys are exactly ["db"]; refused (1/1). Reproduction 2 (`grep apiFetch statusClient.ts`) already resolved by iss-statusscope-001; mount-order assertion in system-status.test.ts still true by design.
Not done: no mutation run, no live Mongo/Docker run.
