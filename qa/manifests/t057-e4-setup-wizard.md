# Manifest — t057-e4-setup-wizard

**Handshake status:** checked-PASS (cycle 0)
**Fix cycle:** 0
**Goal task:** T-057 feature E4 "Setup wizard" (docs/PROGRESS.md; /status is the "check" half). Tier 3 pull. T-057 stays open.
**Lane:** SETUPWIZARD (`qa/issues.setupwizard.jsonl`: ISS-SETUPWIZARD-001 and -002 medium, -003 low, all filed, none fixed here).
**Files:** new `apps/web/src/pages/setup-wizard/{setupModel.ts,SetupWizardPage.tsx,SetupWizardPage.test.tsx}`, `apps/api/src/activity-health/{setup-status.ts,setup-status.test.ts}`; edited `apps/web/src/App.tsx` (import + `/setup` route), `apps/web/src/layout/NavSidebar.tsx` (one entry), `apps/api/src/server.ts` (one import + one `app.use(createSetupStatusRouter())` after `requireAuth`).

## Items and their sources (existing read endpoints only)
| Item | Source | States |
|---|---|---|
| API reachable | GET /system-status | ok / problem (cannot connect, with start command) |
| Database ping | GET /system-status | ok / problem (db "error" or 503; MONGO_URI action) / unknown |
| API key valid | GET /system-status | ok / problem (401) / unknown |
| API key scopes | NO endpoint exists (GET /keys lists the tenant's keys, not the caller's) | always unknown; shows calendar/sources granted or denied (403) as observed from the reads below. Filed ISS-SETUPWIZARD-001 |
| Gemini / Tavily / Langfuse configured | NEW GET /setup/status | ok / problem (Gemini) / todo (Tavily, Langfuse optional) / unknown (404 older API, malformed) |
| Join rules present | GET /calendar/join-rules (scope calendar) | ok / todo (empty set, /join-rules action) / unknown (403 names scope, malformed) |
| Watched sources | GET /watched-sources (scope sources) | ok (count) / todo (0) / unknown |
| Google Calendar / Gmail | NO endpoint exists | always unknown, action text `gws auth status`. Filed ISS-SETUPWIZARD-002 |

Every item shows status, meaning, next action and its source. Secrets cannot be rendered: the inputs are booleans, counts and HTTP statuses; hostile extra fields in the booleans response are read-and-ignored (tested).

## New endpoint (justified: no existing route reports integration configuration)
`GET /setup/status`, mounted after `requireAuth`, any verified key, no scope (the `/system-status` precedent: a setup check, not tenant data; the answer is deployment-wide env presence so it is tenant-agnostic and cannot cross tenants). Exact 200 body, rebuilt from literal booleans:
`{"configured":{"gemini":boolean,"tavily":boolean,"langfuse":boolean}}` with `Cache-Control: private, no-store`. gemini = GEMINI_API_KEY non-blank; tavily = TAVILY_API_KEY non-blank; langfuse = LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY all non-blank (the sink's own requirement). 401 without a valid key. No values, prefixes, lengths. Placed in the existing `activity-health/` directory (9 -> 11 files, budget 30) because `apps/api/src/routes` is over its dirsize budget.

## Evidence
- `apps/api`: `node --test --import tsx src/activity-health/setup-status.test.ts`: tests 5 / pass 5 / fail 0 (env with fake secrets: exact shape deepEqual, no secret substring in body or headers, blank values false, partial langfuse false, 401 for no/bad key, source-shape: mounted after requireAuth, no request input read). `src/routes/system-status.test.ts` + `src/server.test.ts`: pass 16 / fail 0.
- `apps/web`: `vitest run src/pages/setup-wizard src/pages/system-status src/App.routes.test.tsx`: Test Files 3 passed, Tests 49 passed (16 new: all-healthy, API unreachable, db error, 503, 401 handled by AuthContext, integrations missing, 404 older API, malformed body, join rules empty, sources 0, 403 scopes, malformed join rules, Re-check, no key, only-GET-on-four-paths + key not in text + hostile fields, route + nav).
- `tsc --noEmit -p .` in apps/web and apps/api: no output (exit clean). `lint-dirsize`: no entry for activity-health or pages (pre-existing apps/api/src, routes, scripts/lib overages unrelated).
- Not run: mutation pass, full suites, browser.

## NOT done
No browser check; no scope or gws endpoints (filed); no live key-validity probes (ISS-SETUPWIZARD-003); no guided write actions (the wizard shows commands, it does not run them). E4 is the read-only first slice; T-057 stays open.
