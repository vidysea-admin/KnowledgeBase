# t057-d4-usage-events

**Handshake status:** checked-PASS (cycle 0)
Fix cycle: 0
Tier: 3 (next roadmap task, T-057 D4). Lane: lane/usageevents (base 15015cf). Class: schema change + data write (new collection, written on /ask and /search): FULL ceremony. Ledger shard `qa/issues.usageevents.jsonl` (ISS-USAGEEVENTS-001..005).
Authorized by: Approver ruling 2026-10-12 (2) ("usage_events: Haan, banao"); its D- id had not landed in this tree when written (DECISIONS entry being appended in parallel) - cite it once it does. Addresses ISS-T057OPS-001 (no usage events recorded) in code only; nothing is deployed or migrated.

## Scope
T-057 D4 only. T-057 still open: notifications, Sheets, live-browser validation of /analytics, /status, /ops-health, and live verification of this unit.

## Changes
- **schema**: `schema/usage_events.schema.json` (+ `schema/index.json` entry, 5 fixtures in `schema/fixtures/usage_events/`, regenerated `packages/core/src/generated/usage_events.ts` + `index.ts` via `scripts/gen-types.mjs`). Fields, all required: `_id` (UUID), `tenantId`, `kind` ask|search, `at` (ISO date-time), `day` (UTC YYYY-MM-DD bucket), `outcome` ok|error, `latencyMs` (int >= 0). `additionalProperties: false`. NO query text, answer text, key id/hash/secret, IP, user agent, request id.
- **migration**: `migrations/20261012100000-usage-events.cjs` (same shape as watch-heartbeat): createCollection if missing, indexes read from schema/index.json: `{tenantId:1}`, `{tenantId:1, day:1}`. NO TTL: grep of docs/DECISIONS.md and ARCHITECTURE.md finds no retention decision for usage events, so none invented (ISS-USAGEEVENTS-001). Never run against any database.
- **db**: `packages/db/src/collections/usage-events.ts` (`usageEvents(tenantId)` via `scopedCollection`; `buildUsageEvent` = the only place a row's shape is decided; `recordUsageEvent`; `listUsageEvents` projecting day/kind/outcome, capped at 50 000 rows with a truncation flag); exported from the index; tenant pin added to `tenantScope.typecheck-test.ts`.
- **write sites**: `apps/api/src/usage/recorder.ts`, ONE middleware mounted in `server.ts` after requireAuth + rate limit (not in the two handlers). On `res` "finish" of `POST /ask` / `GET /search` with 2xx/3xx (ok) or 5xx (error) it records one event; 4xx (400/401/403/404/429) are not recorded. Fire-and-forget after the response is sent: the write is raced against a 2 s timeout, at most 100 in flight (excess dropped with a warn), sync throw / reject / hang all contained. Log line = fixed message + usageKind + reason (error|timeout|backlog) + error NAME only. The middleware never reads body, query or headers.
- **read**: `apps/api/src/usage/router.ts` `GET /usage?days=`, scope `jobs` (precedent: /jobs, /activity-health, /watch-runs), tenant from `req.auth` only, `days` integer 1..90 default 30, any other param or body -> 400 `invalid_usage_query` before any read. Response `{days, from, to, byDay[{day, ask:{total,errors,errorRate}, search:{...}}], totals, truncated}`, zero-filled window, `errorRate` null when no calls, `Cache-Control: private, no-store`; store error / malformed row / no store wired -> fixed 503 `usage_unavailable`. `apps/api/src/usage/store.ts` wires it; `production.ts` gets `usage: createMongoUsageDeps()`. Absent `deps.usage` -> nothing recorded, /usage answers 503.
- **web**: `apps/web/src/api/usage.ts` (strict validator incl. rate == errors/total), `UsagePanel.tsx`, Analytics page panel "Usage: questions and searches" (totals, error rate, active-day list, truncation note, empty state, source line stating that 4xx are not counted and no text is stored). Own per-panel alert: 403 "lacks permission to read usage", else "Unable to load usage".
- Existing AnalyticsPage test updated: Source-line count 5 -> 6, `/usage` added to the default route map.

## How cross-package typing/running was verified (lane: @lkb/* resolves to the MAIN tree)
Temporary `apps/api/tsconfig.usage-tmp.json` and `packages/db/tsconfig.usage-tmp.json` (extends the package tsconfig, `baseUrl`, `paths`: `@lkb/core` -> `../../packages/core/src/index.ts`, `@lkb/db` -> `../../packages/db/src/index.ts`), both DELETED before commit. Used for `tsc --noEmit -p` and, for api tests, `TSX_TSCONFIG_PATH=tsconfig.usage-tmp.json node --test --import tsx`, so the lane's core/db are what actually ran. Without the mapping packages/db fails `TS2305: no exported member 'UsageEvents'` (main core), as expected. `apps/api/src/usage/store.ts` also imports the db collection relatively (jobs/store.ts precedent).

## Evidence
```
python schema/validate.py -> usage_events - 1 valid fixture(s) pass, 4 invalid correctly rejected; PASS: 28 collection schema(s)
node scripts/gen-types.mjs --check -> OK: 28 generated type file(s) + index.ts match schema/
node --test migrations/usage-events.migration.test.mjs -> 3 pass (fake Db; no TTL, no unique; idempotent; down)
node --test --import tsx packages/db/src/collections/usage-events.test.ts -> 5 pass
(apps/api, TSX_TSCONFIG_PATH=tsconfig.usage-tmp.json) src/usage/usage.test.ts -> 14 pass, 0 fail
(apps/api, same) server.test + production.test + cors + request-log + keys + search + ask -> 35 pass, 0 fail
apps/web: vitest run src/api/usage.test.ts src/pages/analytics -> 3 files, 42 tests pass
tsc --noEmit: packages/core 0, packages/db (tmp paths) 0, apps/api (tmp paths) 0, apps/web 0
lint-migrations OK; lint-dirsize/loc/dupes: only pre-existing violations (none in files this unit added)
```
Mutations (per-mutation byte backup, `timeout 120`, restored inline with `cmp`, no EXIT trap): 12 applied, all KILLED, after one test was added for 2 initial survivors (store and builder both forwarding extra input). Killed: 4xx counted as error; requireScope("jobs") removed; days max 99; tenant read from x-tenant-id header; backlog cap removed; timeout removed; store forwards whole input; builder spreads input; log carries the error object; migration adds expireAfterSeconds.

## Test coverage map
schema fixtures; migration dry-run; exact stored doc keys via the real builder over a fake Db (forbidden strings absent: query, user-agent, 127.0.0.1, key); write sites (event per request, 5xx -> error, 4xx/401/403/other routes record nothing, throwing store -> 200 and a log without content, hanging store -> response < 50 ms and reason timeout, backlog drop, sync throw); /usage (401, 403 before read, tenant isolation incl. spoofed x-tenant-id, 15 malformed queries -> 400 before read, 1/30/90-day windows, zero-fill, error rate, out-of-window rows ignored, 503 variants, truncation); web (render, empty, truncated, 403/503/500, malformed, network error, client validator).

## NOT covered
No real Mongo (migration never run, no index build, no real insert); no live API/browser/Vite; full api and web suites not run (targeted subsets above); `production.ts` wiring only typechecked and exercised by production.test.ts; no load test of the in-flight/timeout bounds against a real driver; day buckets are UTC; the D- id for the Approver ruling is not yet cited.
