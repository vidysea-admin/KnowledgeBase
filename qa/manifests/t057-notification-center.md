# t057-notification-center

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-057, feature D5, in-app notification list only). Lane: lane/notifcenter, base 9e24d1f. Read-only: no write path, no schema/ or migrations/ change, no dependency added, no new collection. UI-touching (D-024): jsdom source scope only, live-browser check owed. No qa/contracts file exists; the checker supplies one. Lane ledger `qa/issues.notifcenter.jsonl` (ISS-NOTIFCENTER-001..003).

## Scope decision: what is built and what is not
Built: `GET /notifications` plus a `/notifications` page. NOT built (out of scope, owner decisions): email/Telegram digest delivery (delivery targets undecided), saved views, scheduled digests, a header bell/unread badge (would poll on every page), server-side read state.

## Event survey (what already produces operator-facing events)
- Persisted and tenant-scoped, therefore aggregated: upload-queue failed jobs (GET /activity-health reader), provider audit failed jobs (GET /jobs reader), source-watcher runs with failures (`watch_reports` via GET /watch-runs reader).
- NOT persisted anywhere, therefore absent: r1 attention alerts, join-rules skips, capture failures (Telegram delivery only; grep found no event write). A persisted notifications collection needs schema + migration = owner decision, so none was built (ISS-NOTIFCENTER-001).

## API
`GET /notifications?limit=` (default 50, max 100, strict query, no body), scope `jobs` (same as /activity-health, /jobs, /watch-runs), tenant only from `req.auth.tenantId`, `Cache-Control: private, no-store`. It calls the three existing deps with the same bounded limit via Promise.allSettled, re-projects each with the existing strict projectors (projectActivitySnapshot, projectJobSummary, projectWatchRun), keeps failures only, merges newest first, slices to limit. Item: id (`source:rowId`), source, severity ("error"), title (fixed template), detail (built from enums/numbers; provider kind/provider only if a plain token, else dropped), occurredAt. Never served: error text, digest path, stack, tenantId, deadlines. A source failing is reported `sources.<name>: "unavailable"` (never silently empty); all three failing -> 503 fixed body. `truncated` is true when any source had older rows or more than `limit` failures were found. Wired in server.ts from the existing deps (no new dep, no production.ts change).

## Web
Page `/notifications` (sidebar "Notifications"): unread count, list, per-item "Mark as read" and "Mark all as read" (client-side only, localStorage key `lkbNotificationsRead`, capped at 500 ids, try/catch around storage, stated on the page), per-source outage banners (role=alert), 401/403/503/network/malformed error text, empty note that does not claim all-clear when a source is down, Refresh. Strict response reader (`loadNotifications`).

## Files
New: apps/api/src/activity-health/notifications.ts, notifications.test.ts; apps/web/src/pages/notifications/{notificationsClient.ts, NotificationsPage.tsx, NotificationsPage.test.tsx}; qa/issues.notifcenter.jsonl. Edited (additive): apps/api/src/server.ts (+4), apps/web/src/App.tsx (+2), apps/web/src/layout/NavSidebar.tsx (+1). New api file is in the existing activity-health dir (now 9 files); new web dir.

## Evidence
API, from apps/api: `node --test --import tsx src/activity-health/notifications.test.ts` -> tests 6, pass 6, fail 0 (auth+scope before reads; two-tenant isolation with tenant-honouring readers, tenant header/query refused; no leaked fields; bounded limit and truncation; per-source degradation and all-fail 503; empty and invalid inputs).
Web, from apps/web: `node node_modules/vitest/vitest.mjs run src/pages/notifications src/pages/ops-health src/App.routes.test.tsx` -> 3 files, 19 tests passed (9 new).
Typecheck: apps/web `tsc --noEmit` clean; apps/api `tsc --noEmit` clean (no output).
Regression: `src/activity-health/*.test.ts src/server.test.ts` -> 26 tests, 25 pass, 1 fail: router.test.ts "actual producer -> Python ..." (upload queue operation timeout), pre-existing on base (ISS-T057OPS-002).
Mutations (api, per-mutation byte backup, restored, final blob 15443a0d798875895ea716b00911bf8258414643 = pre-run working blob): scope removed (fail 1), failed-filter removed on jobs (fail 2), watcher rows dropped (fail 2), limit slice removed (fail 1) -> all killed. Web side not mutated.
D-015: no ledger issue is being fixed; n/a.

## NOT DONE
Live-browser check (widths, dark theme); digest delivery; saved views; scheduled digests; bell/badge; server-side read state; persisted event store (owner decisions above).
