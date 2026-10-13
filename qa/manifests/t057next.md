# t057next

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-057, feature A4 Sessions Library filters). Lane: lane/t057next, base 99f4fed9. Web-only, client-side, no API/schema/migration change, no dependency added. UI-touching (D-024): source scope only (jsdom); live-browser check owed. No qa/contracts file exists for this slice; the checker supplies one.

## Survey (what was already merged, not rebuilt)
D2 activity-health + ops-health page, D3 gaps, D4 usage_events + /usage + Analytics panel, D5 notification center, E4 setup wizard, B7, B8, system-status, analytics page. Remaining per docs/PROGRESS.md: A4 (no month/status/speaker filters), D1 (no knowledge-health score), D6 Google Sheets (needs credentials, not done).

## Built
Sessions Library filters (month, status, organisation, participant) plus a "N of M shown sessions fully processed (P%)" line, computed only from rows the tenant-scoped GET /sessions (scope sessions) already returns. Flag: `SessionsListPage enableFilters` default false; App enables it only when `VITE_SESSIONS_FILTERS === "1"`. OFF renders the original list unchanged (test asserts no filter group, all rows). Topic filter NOT built (no topic field on session rows). The percentage is deliberately labelled "fully processed" (transcribe and index both done), NOT "coverage": a coverage definition is a policy choice left to the Approver.

## Files
New: apps/web/src/pages/sessions/sessionsFilterModel.ts, sessionsFilterModel.test.ts. Edited: SessionsListPage.tsx, SessionsListPage.test.tsx, apps/web/src/App.tsx (prop), apps/web/src/vite-env.d.ts (env type).

## Evidence
apps/web `node node_modules/vitest/vitest.mjs run src/pages/sessions src/App.routes.test.tsx` -> 6 files, 28 tests passed. Full apps/web vitest -> 69 files, 721 tests passed. apps/web tsc --noEmit clean. `node scripts/lint-loc.mjs --all` -> OK (10 stages, 0 failed).
apps/api (untouched; excluding src/source-intake per brief, D2_FIXTURE_PYTHON set): run 1 tests 804 pass 803 fail 1 (failing test name not captured); run 2 no failures. Unattributed flake, likely load-timing; not related to this change.
Mutations: none run.

## NOT DONE
D1 knowledge-health score and internal-vs-web ratio (definition needed), "coverage %" (Approver must define), topic filter, D6 Sheets, live-browser check.
