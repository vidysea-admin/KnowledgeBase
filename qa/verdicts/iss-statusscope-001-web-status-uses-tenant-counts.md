# Verdict: iss-statusscope-001-web-status-uses-tenant-counts

VERDICT: PASS
Cycle checked: 0
Commit checked: c98b4fc (lane/statusweb, base e3599c9)
Scope: apps/web system-status page only; jsdom with mocked fetch; not run against a live API or browser.

## EXPLANATION

- Shape/URL/method/auth match the real route (statusscope apps/api/src/routes/system-status.ts, mounted in server.ts after requireAuth). Route: GET /system-status, 401 without tenant, 200/503 `{db, collections: Record<string,number>}`, 503 `{db:"error",collections:{}}` when the reader throws or none is wired. Client: GET `${API_BASE_URL}/system-status` via the shared `apiFetch` (`authorization: Bearer <key>`, same path as every other call), validates `{db, collections}` with non-negative safe integers, ignores watch fields. No field mismatch. apiFetch throws on non-2xx, so a 503 never reaches the renderer as data.
- /health: no request to `/health` anywhere in apps/web/src (grep of production and test code; other mentions are comments about the server-side predicate). No other page, tile, hook or cache reads `/health` counts. Activity & Health page uses `/activity-health`. So in the web app no all-tenant count reaches a signed-in screen. The public `/health` endpoint itself is still all-tenant (contract health-route.md C5/I1) and anyone with the URL, not through this UI, can read it.
- 401: handled in shared `apiFetch` (`invalidateAuth`), identical to every other page. A transient 401 on this endpoint therefore signs the user out, as it would on any page; that is app-wide policy, not new behaviour. 503 is shown honestly: alert "Counts unavailable: the system status reader is not available right now", Retry, no table, no "no collections" empty state.
- Rendered data: only `db` reachability and counts from `/system-status`; nothing from `/health`. Tests use a `/health` mock with 987654/123456 and watch 7/5 and assert neither number is rendered and `/health` is never requested; confirmed by mutation (below), including an added fallback.
- Contracts: no qa/contracts file defines the system-status page (no t057 status-page contract); health-route.md governs only `/health` and is not contradicted. No criterion requires watch counts on the page. Watch fields shown "unavailable" is honest; ISS-STATUSWEB-001 (low) records it.
- Measured: vitest system-status plus App.routes 33/33 passed; web tsc --noEmit exit 0.
- Mutations (5, per-mutation byte backup, finally restore): client to `/health` KILLED (7 red); added fallback to `/health` on error KILLED (9); bearer key replaced KILLED (4); 503 message softened KILLED (3); render watch counts KILLED (2). Hash of both production files equals HEAD blob; git status clean; harness deleted.
- ISS-T057SCREEN-001 stays OPEN: reproduction 2 (web reads `/health`) is closed in web; reproduction 1 (`/health` is public and all-tenant) awaits the Approver's ruling. Ledger status not changed here.
- Dependency: this page needs the statusscope API merged first (and a production wiring of `deps.systemStatus`); until then a real API returns 404/503 and the page shows "Counts unavailable". Jsdom only; D-024 live check outstanding.

ISSUES-WRITTEN: none
