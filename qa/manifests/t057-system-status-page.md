# t057-system-status-page

Status: ready-for-check
Fix cycle: 0

Task T-057, the "setup" part, as a System status / setup check page. Lane T057SCREEN (branch lane/t057screen, base 5f8eb75). Backlog tier 3 (roadmap task). SOURCE SCOPE ONLY (D-024): jsdom tests only, no browser; this unit cannot be called validated until a live-browser check is run. Read-only; no API, client.ts, package, contract, TASKS.md or goal.json change; no dependency added. No ledger issue fixed (D-015 n/a); no issues filed (qa/issues.t057screen.jsonl not created). No qa/contracts file exists; the checker must supply one.

## Which screen and why

T-057 lists: sessions explorer, graph health, jobs, analytics, notifications, Sheets, setup. Already built: sessions (SessionsListPage/DetailPage), explorer (t057-b8), graph health (graph-confidence t057-b7, activity-health), jobs (JobsPage), analytics (t057-analytics-page), gaps (t057-d3). Remaining: notifications, Sheets, setup.
- Notifications: no GET route exists in apps/api (grep of routes/server.ts: nothing). Needs a new endpoint.
- Sheets: no Sheets route exists. Needs a new endpoint.
- Setup: `GET /health` exists (apps/api/src/routes/health.ts), so a setup/status check can be built with no API change. Chosen.

## Endpoint used

`GET /health`. It is mounted BEFORE requireAuth, so it is unauthenticated and needs no scope; the page still requires a key (login gate, no request without one) and sends it through the existing `apiFetch`. Response: `{ db: "ok"|"error", collections: Record<string, number>, watchSilent?: number, watchUnreadable?: number }`, aggregate service-wide counts (not tenant scoped, and the page says so). Validated strictly in statusClient.ts; any other shape is an error state. Known limit: for 503 (db error / unreadable watchers) `apiFetch` discards the body, so the page shows the generic load-failed state with Retry, not the `db: error` detail; the "NOT reachable" line only shows if a 200 carries `db: "error"`. Fixing that needs a client.ts change, out of scope.

## Files

New (apps/web/src/pages/system-status/): statusClient.ts (39 non-blank), SystemStatusPage.tsx (91), SystemStatusPage.test.tsx (155). Edited: App.tsx (+2: import and `/status` route), layout/NavSidebar.tsx (+1: "System status"). `node scripts/lint-dirsize.mjs`: OK (116 dirs within budget).

## States

No key: sign-in note, no request. Loading (role=status). Error: 403 names the missing scope + Retry; other/5xx/network fixed generic text + Retry (manual only, one fetch per click, no auto-retry); server message text is never displayed. 401: handled by the existing apiFetch/AuthContext (key dropped, sign-in note shown); the page's own "unauthorised" branch is a defensive fallback only. Empty: db ok with zero collections. Loaded: checks list, collections table (caption, column and row headers), Refresh. Malformed body (null, array, wrong types, negative/float/string counts, null optional counts) is an error, never data.

## Hostile payload

Collection names `<script>…`, `javascript:alert(1)`, RTL-override text and a 5000-char name render as text: no script/a elements, no side effect, full 5000 chars retained and truncated in CSS (overflow hidden, ellipsis). The payload carries no URLs, so no href is built (safe-url.ts not needed; the "href without safe-url" mutation is therefore not applicable and was replaced).

## Evidence

From apps/web, node v24.19.0 on PATH from the codex runtime:
`node node_modules/vitest/vitest.mjs run src/pages/system-status src/App.routes.test.tsx` ->
```
 ✓ src/App.routes.test.tsx (3 tests)
 Test Files  2 passed (2)
      Tests  27 passed (27)
```
(24 in SystemStatusPage.test.tsx, including route-once and sidebar-once tests; App.routes 3.) No NavSidebar test file exists in the repo; the sidebar-once test lives in my file.
`node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

## Mutations (each: byte backup per mutation, restore in finally, hash checked)

All 7 killed. Files are new, so the hash check compares to the backup; the committed blobs must equal the working tree (see Status line commit).
- M1 request without auth header (raw fetch, no key) -> killed by "request is a GET to /health carrying the bearer key…" and 3 others.
- M2 error shown as empty state -> 14 tests, e.g. "5xx shows an error not an empty state…", "403 names the missing scope…".
- M3 hostile HTML via dangerouslySetInnerHTML -> "hostile collection names render as inert text…".
- M4 retry auto-loops -> infinite loop; run hit the 240 s timeout and was killed (hang counted as killed; the "no auto-retry" test is the intended killer). File restored.
- M5 count validation removed -> three "malformed response (count …)" cases.
- M6 db error shown as reachable -> "db error is shown as NOT reachable, not as healthy".
- M7 request when no key -> "no key: no request is made and a sign-in note is shown", "401 is handled by AuthContext…".
Replaced (n/a): "href without safe-url".

## NOT DONE

- Browser validation (D-024): states, widths ~360/768/desktop, truncation look, dark theme, header present in network panel.
- Notifications screen: needs e.g. `GET /notifications` (scope `notifications`, tenant from key) returning `{ notifications: [{ id, kind, severity, message, createdAt, readAt|null }], limit, truncated }`, plus a write route for mark-read if wanted.
- Sheets screen: needs e.g. `GET /sheets/status` (scope `sheets`) returning `{ connected: boolean, spreadsheetId?: string, lastSyncAt|null, lastError|null, rows?: number }`.
- A richer setup checklist (keys, sources, watchers per tenant) could reuse /keys and /watch-state, not done here.
