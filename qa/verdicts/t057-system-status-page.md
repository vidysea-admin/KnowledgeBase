# Verdict: t057-system-status-page

VERDICT: PASS
Cycle checked: 0
Commit checked: 552ad09 (branch lane/t057screen, base 5f8eb75)
Scope: SOURCE SCOPE ONLY per D-024 (jsdom/vitest, tsc; no browser, so layout, truncation look, dark theme and the real network panel are NOT validated).

## EXPLANATION
1. Exposure. GET /health is mounted before requireAuth (server.ts) and returns, to any unauthenticated caller, `{db, collections{name:count over ALL tenants}, watchSilent?, watchUnreadable?}` (counts only, no tenant names). The page therefore exposes nothing new; it surfaces public data inside the product UI, so every tenant user sees cross-tenant volume (pre-existing property of /health). It does make one thing marginally worse: it sends the tenant bearer key to an endpoint that ignores it (low; apiFetch always attaches it, and client.ts is out of scope for this lane). The web app does not know key scopes (AuthContext holds only apiKey), so scope-gating the page is not possible without an API change. Not blocking; filed ISS-T057SCREEN-001 (medium) for the Approver. Related, not new: ISS-368 (health unreadable-watcher semantics; qa/contracts/health-route.md C1 is stale since watchSilent/watchUnreadable were added).
2. Validation (own probe tests, run then removed, not committed): `__proto__`, constructor, toString, hasOwnProperty collection names render as rows, no pollution; counts MAX_SAFE_INTEGER+2, 1e21, NaN, null, {}, [1], true -> error state, no table; MAX_SAFE_INTEGER accepted; hostile text rendered as text only (committed tests). 10,000 collections render 10,000 rows (about 7 s in jsdom): there is NO row cap. Low observation (collection list is schema-derived server-side, so bounded in practice). Long and RTL names: overflow hidden, ellipsis, nowrap, maxWidth classes present (style presence only).
3. States: no key -> no fetch (apiFetch also refuses); loading; 401 via AuthContext unchanged; 5xx/network/malformed -> generic fixed text + manual Retry; two rapid clicks on a stale Retry reference gave exactly 1 extra fetch (2 total); unmount during a pending request -> no console.error, 1 fetch. Observations (low): the 403 branch ("lacks the scope") is dead code since /health cannot return 403; the 503 message ("Unable to load system status. The service may be down or unreachable.") is honest and does not imply health, but cannot show db:error detail (apiFetch drops the body). No committed test for unmount or proto keys.
4. Routing: /status once in App.tsx and once in NavSidebar; vite.config.ts has no proxy; the dev client uses the API base URL directly, so no clash. App.routes passes.
5. Scope: diff touches only apps/web (App.tsx +2, NavSidebar +1, 3 new page files), the manifest, no client.ts or package change. lint-dirsize OK. `git merge-tree` against codex/machine-migration-2026-10-09: clean, no conflicts (main changed only join-rules files in apps/web).
6. Mutations (7 own, per-mutation byte backup, restore in finally, hash equals HEAD blob verified): validation skipped KILLED; error rendered as empty KILLED; raw fetch without header KILLED; auto-retry loop KILLED FAST (17 s run, fails in ordinary tests, not a hang; earlier maker hang concern does not apply); proto-key unguarded object SURVIVED the committed suite, KILLED by my probe (test gap, low); retry +2 generation SURVIVED (equivalent, still one fetch per click); guard-removal in the hook SURVIVED (equivalent, apiFetch refuses a null key). Harness note: my harness ran from the shared scratchpad (written by me this run), chdir to this worktree, touched only SystemStatusPage.tsx and statusClient.ts here; deleted.
7. Tests: vitest SystemStatusPage + App.routes: 2 files, 27 tests passed. tsc --noEmit apps/web: exit 0. No NavSidebar test file exists (sidebar-once test is inside the page test file).
8. Remaining T-057 screens: no notifications or Sheets route, store or collection exists in apps/api or schema (only unrelated notifyWatchSilent alert hooks); the manifest's proposals for new endpoints are sound.

ISSUES-WRITTEN: ISS-T057SCREEN-001 (medium, Approver decision on exposure and key transmission)

## Merge conditions
- Merge is source-scope only; a live-browser check remains owed (D-024).
- Approver to rule on ISS-T057SCREEN-001; does not block merge.
- Optional follow-up: add proto-key and unmount tests, a row cap.
