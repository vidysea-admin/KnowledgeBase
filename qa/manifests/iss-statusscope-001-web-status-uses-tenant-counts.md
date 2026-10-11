# iss-statusscope-001-web-status-uses-tenant-counts

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Tier: 2/3 (open ledger issues ISS-T057SCREEN-001 and ISS-STATUSSCOPE-001). Lane: lane/statusweb (base e3599c9). Class: security (cross-tenant read). Ledger for this lane: qa/issues.statusweb.jsonl (ISS-STATUSWEB-001 filed).

## Scope
apps/web only (`apps/web/src/pages/system-status/`: statusClient.ts, SystemStatusPage.tsx, SystemStatusPage.test.tsx). No apps/api, contract, DECISIONS, client.ts change.
DEPENDS ON lane/statusscope (commit 5c1f23b, `GET /system-status`) being merged first; until then this page gets 404 from a real API and shows "Counts unavailable". Shape/status codes taken from that lane's apps/api/src/routes/system-status.ts: authenticated (401 without tenant), 200 `{db:"ok",collections}`, 503 `{db:"error",collections:{}}` when the reader throws/db error/no reader wired; no watchSilent/watchUnreadable.

## Changes
- `getSystemStatus` calls `apiFetch("/system-status", apiKey)` (same bearer path as other authenticated calls). No `/health` call anywhere on the page; no fallback.
- Same strict validation of `{db, collections}`; watch fields are not read.
- watchSilent/watchUnreadable: no tenant-safe source exists, so always `null` and rendered "unavailable (no tenant-scoped source)" (ISS-STATUSWEB-001).
- Liveness: the page shows only `db` from /system-status; it does not use /health at all.
- Error states, all headed "Counts unavailable": 401 (apiFetch/AuthContext drops key, sign-in note), 403 "not permitted", 503 "reader not available", other/network "unable to load". No table is rendered in any of them. apiFetch discards 503 bodies (known, as before).
- Header text now says counts are for the user's own tenant.

## Evidence (apps/web, node off PATH)
`node node_modules/vitest/vitest.mjs run src/pages/system-status src/App.routes.test.tsx` ->
```
 ✓ src/pages/system-status/SystemStatusPage.test.tsx (30 tests)
 ✓ src/App.routes.test.tsx (3 tests)
 Test Files  2 passed (2)
      Tests  33 passed (33)
```
`node C:/Users/product/Desktop/KnowledgeBase/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
New tests (describe "tenant scope"): fetch mock where `/health` returns 987654/123456 counts and watch 7/5: page requests only `/system-status`, never `/health`, rendered text contains neither number; status 401/403/503/500 each -> no table, no /health request, no leaked numbers, "Counts unavailable" alert (401: sign-in note); network failure -> unavailable, no fallback; watch fields shown unavailable even if the response carried them. Existing URL test now asserts `/system-status$`.

## Per-issue reproduction status
- ISS-T057SCREEN-001: reproduction 2 of 2 (`grep -n apiFetch apps/web/src/pages/system-status/statusClient.ts`) now shows `/system-status`, closed in web. Reproduction 1 (`/health` mounted before requireAuth, public with all-tenant counts) is NOT closed: it is API-side, outside this unit, and needs the Approver's ruling (ISS-STATUSSCOPE-001 fix_direction). The issue's "send the key to an endpoint that ignores it" and the dead 403 "lacks the scope" branch are resolved (403 now means /system-status refused).
- ISS-STATUSSCOPE-001: reproduction 1 of 1 (`grep -n apiFetch ...statusClient.ts`) closed in web. Its second half (Approver decision on /health) remains open.
- Ledger row statuses not changed.

## NOT covered
- Not run against a real API or browser (no Vite, no Playwright); jsdom only (D-024 live check outstanding).
- Requires lane/statusscope merged first.
- /health remains public and all-tenant (API-side, Approver's call).
- Watch counts unavailable on this page (ISS-STATUSWEB-001).
- No mutation run.
