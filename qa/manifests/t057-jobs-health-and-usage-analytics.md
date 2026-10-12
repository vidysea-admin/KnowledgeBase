# t057-jobs-health-and-usage-analytics

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap task T-057, features D2 and D4). Lane: lane/t057ops, base d14128e. Read-only: no write path, no schema/ or migrations/ change, no dependency added. UI-touching (D-024): source scope only (jsdom), live-browser check owed. No qa/contracts file exists; the checker supplies one. Lane ledger `qa/issues.t057ops.jsonl` (2 findings: ISS-T057OPS-001, ISS-T057OPS-002).

## Decision: D2 built, D4 NOT built
D4 (usage and value analytics) is not decision-free. Nothing records usage events: `/ask` and `/search` write no per-request row (grep of apps, packages, schema for usage/query-log/ask-log found only LLM token fields in packages/ai trace and test fixtures); the request logger emits stdout lines only. So per-day /ask and /search counts cannot be read from existing data. Sessions indexed is already on the Analytics page (t057-analytics-page); active keys is already served by GET /keys (scope `keys`). D4 would need a decision on: a new `usage_events` collection (schema + migration + index on tenantId/at/kind), where it is written (middleware after requireAuth vs inside the ask/search handlers), retention, and whether failed/rate-limited calls count.

## D2: what shows and where the data comes from
New route `GET /watch-runs?limit=` (default 50, max 100), scope `jobs`, mounted after requireAuth in server.ts; tenant only from `req.auth.tenantId`; store reads `listWatchReports` (@lkb/db, scopedCollection/withTenant) from the existing `watch_reports` collection. Scope precedent: `/activity-health` and `/jobs` (both `requireScope("jobs")`, same strict-query / `Cache-Control: private, no-store` / 503-fixed-body pattern copied); `/system-status` has no scope (auth only), `/watch-state` uses `sources`. Served per run: id, runAt, mode, driveNewFound/Ingested/Failed (null when not recorded), errorCount. NOT served: error strings, digestPath. Summary over the returned window: runs, runsWithFailures, totalDriveFailed, totalErrors, lastFailureAt. Fail closed: no deps -> 503; malformed row -> 503.

Web: new page `/ops-health` (sidebar "Operations health"), three independent panels: Upload queue (GET /activity-health: status counts, automatic retries, failure classes, last failure), Provider jobs (GET /jobs: status counts, last failure; retries stated as not recorded), Watcher runs (GET /watch-runs: summary and table). Each fails on its own with 403/503/network text in role=alert; 401 via shared apiFetch/AuthContext. Windows (newest 50) stated on the page.
Deviation from the brief: a separate page rather than extending SystemStatusPage/AnalyticsPage, because both pages' existing tests assert exact fetch counts against a single mocked response and an added panel would change their contract.

## Files
New: apps/api/src/activity-health/watch-runs.ts, watch-runs.test.ts; apps/web/src/pages/ops-health/opsHealthModel.ts, OpsHealthPage.tsx, OpsHealthPage.test.tsx. Edited (additive): apps/api/src/server.ts (+4), apps/api/src/composition/production.ts (+2, wires createMongoWatchRunsDeps), apps/web/src/App.tsx (+2), apps/web/src/layout/NavSidebar.tsx (+1). New files only in existing subdirectories (api) plus one new web page dir. `node scripts/lint-dirsize.mjs` reports the same 4 violations as the base (meeting-bot calendar/capture, apps/api/src 32/31, routes 32/30); none from this unit.

## Evidence
API, from apps/api: `node --test --import tsx src/activity-health/watch-runs.test.ts` -> tests 5, pass 5, fail 0 (auth + scope refuse before any read; two-tenant isolation with a tenant-honouring fake db and tenant selectors in header/query refused; error text/digest path never served; empty data; truncation; 503 for unavailable/throwing/malformed readers).
Web, from apps/web: `node node_modules/vitest/vitest.mjs run src/pages/ops-health src/App.routes.test.tsx` -> 2 files, 10 tests passed (7 new: three-source figures with GET+bearer only, empty tenant, per-source 403/503/network/malformed, no-key and refresh, inert hostile text and strict reader, pure figures, route/sidebar once).
Typecheck: apps/web `tsc --noEmit` -> clean. apps/api `tsc --noEmit` -> 2 errors, both pre-existing on base (src/indexing/session.ts:161, src/routes/brain.test.ts:139); none in changed files.
Regression: src/server.test.ts and src/production.test.ts pass; src/activity-health/router.test.ts has 1 failing test ("actual producer -> Python ...", upload queue operation timeout) that fails identically on the base with my changes stashed (2 pass, 1 fail).
Mutations (api, per-mutation byte backup, restored; final blob 26b0f029b11fa407d4329f8c37dc3a42d6ab4825 = working file): hardcoded tenant, scope removed, truncation slice removed, errorCount zeroed, lastFailureAt nulled -> each killed (fail 1). Not mutated on the web side.
D-015: no ledger issue is being fixed; n/a.

## NOT DONE
- D4 (see decision). Remaining T-057: notifications and Sheets (need new endpoints), D4 usage analytics, live-browser validation of /analytics, /status and /ops-health.
- Browser check: states, widths ~360/768/desktop, table overflow of the watcher runs table on narrow screens, dark theme.
- Watcher windows are runs, not lifetime; watch_state failed rows (failureReason) are not summarised here (served by GET /watch-state under `sources`).
