# Spec - u3.2-search-page

**Status:** describes behaviour verified at main HEAD c2d9db9a. Sources: `qa/manifests/u3-2-global-search-bar.md`, `qa/evidence/u32-browser-check-2026-10-13/README.md`, `apps/web/src`, `apps/api/src/routes/search.ts`.

## What it does

1. **Global bar** (`apps/web/src/components/GlobalSearchBar.tsx`): a `role="search"` form, input "Search all sessions" plus a "Go" button, rendered once at the top of `<main>` in `layout/AppShell.tsx`, only when an API key is set. Submit navigates to `/search?q=<encoded>`. Blank or whitespace-only input is refused (no navigation, no request). On `/search` it shows the current `q`.
2. **Search page** (`apps/web/src/pages/search/SearchPage.tsx`): the URL `q` is the single source of truth. One request per distinct `q`; empty `q` is idle with no request. A different query is pushed (Back works); the same query re-runs in place. Each result shows session title, date, speaker, time range, the quote, and an "Open transcript" link. No hits shows "No passages found".
3. **Open transcript** links to `/sessions/<sessionId>#turn-<turnId>`; the live check confirmed the cited turn renders highlighted and in the viewport.

## Routes (web, `apps/web/src/App.tsx`)

| Route | Purpose |
|---|---|
| `/search` | Search page; query in `?q=` |
| `/sessions/:id#turn-<id>` | Transcript, scrolled to the cited turn |
| every signed-in route | hosts the global bar (live check: `/`, `/sessions`, `/ask`, `/calendar`, `/search`, one bar each) |

## API called

`GET /search?q=<query>&k=<n>` (`apps/api/src/routes/search.ts`), required scope `search`. The web client (`apps/web/src/api/search/client.ts`, `searchTranscripts`) sends `k=20` from the page and accepts 1..50.

- `q` missing or blank: HTTP 400. `k`: default 10, capped at 50.
- Response: `{ query, hits: [{ turnId, sessionId, score, turn, session }] }`. The client rejects malformed or inconsistent responses (message "Search results could not be read").
- **Lexical only today.** Scoring is `lexicalSearchTurns` from `@lkb/index`, after a Mongo pre-filter (`apps/api/src/search-store.ts`).

## Tenant scoping

The tenant is taken from the authenticated key (`req.auth.tenantId`) and passed to the search store. The client has no tenant parameter. Live check J: a key for a different tenant got zero hits for the same query; K: an invalid key shows the sign-in prompt and no results. Not covered: a 403 for a key lacking the `search` scope.

## Limits

- Query capped at **512 code points**: applied first in `normalizeQuery()` (`pages/search/query.ts`) and as `maxLength=512` on the bar input. This is a client-side choice; neither `GET /search` nor the client bounds the length on its own (manifest, "Query length bound"). Live check: a 2000-character `?q=` sent at most 512.
- C0/C1 control characters and bidi marks/overrides are replaced with a space, then the query is trimmed.
- Results per request: 20 from the page; the API maximum is 50.

## Untrusted query handling

The query is rendered only as a React text node. It is decoded once (router `URLSearchParams`) and sent only to the configured API origin. Live check F2 (hostile `?q=`): no dialog, no injected element. Malformed percent-encoding via in-app navigation does not crash (F4).

## Pending

- **Semantic and hybrid ranking:** not built into `GET /search`. Live check P1 is recorded as "pending-embeddings": `lkb_staging` held 751 chunks of an expected 1905, with embeddings expected to finish 14-15 Oct. Re-run P1 after.
- **Send to Ask:** not built (live check P2).
- Production-build / static-host behaviour was not tested.

## Evidence

Screenshots stay in `qa/evidence/u32-browser-check-2026-10-13/` and are linked, not copied: [signed out](../../../qa/evidence/u32-browser-check-2026-10-13/A-signed-out.png), [dashboard with bar](../../../qa/evidence/u32-browser-check-2026-10-13/B-dashboard-with-bar.png), [results](../../../qa/evidence/u32-browser-check-2026-10-13/C-results-counselling.png), [special characters](../../../qa/evidence/u32-browser-check-2026-10-13/E-special-chars.png), [hostile URL](../../../qa/evidence/u32-browser-check-2026-10-13/F-hostile-url.png), [malformed % (in-app)](../../../qa/evidence/u32-browser-check-2026-10-13/F4-malformed-percent-spa.png), [malformed % (Vite 500)](../../../qa/evidence/u32-browser-check-2026-10-13/F4-malformed-percent.png), [cited turn](../../../qa/evidence/u32-browser-check-2026-10-13/G-transcript-citation-target.png), [no results](../../../qa/evidence/u32-browser-check-2026-10-13/I-no-results.png), [other tenant](../../../qa/evidence/u32-browser-check-2026-10-13/J-other-tenant-empty.png), [invalid key](../../../qa/evidence/u32-browser-check-2026-10-13/K-invalid-key.png), [mobile 390px](../../../qa/evidence/u32-browser-check-2026-10-13/L-mobile-390.png), [Enter key](../../../qa/evidence/u32-browser-check-2026-10-13/M-keyboard-enter.png). Full table: [README](../../../qa/evidence/u32-browser-check-2026-10-13/README.md); requests: `network-api-calls.json` in the same folder.

## Known issues (both low, open, file-don't-fix; ledger `qa/issues.u32live.jsonl`)

- **ISS-U32LIVE-001:** a direct browser load of a URL with malformed percent-encoding (e.g. `/search?q=%E0%A4%A`) returns a blank HTTP 500 from the Vite 6.0.5 dev server before the app loads. Dev-server behaviour; to be verified against the production static host before treating it as a product issue.
- **ISS-U32LIVE-002:** the Search page shows two search boxes (global bar and the page's own "Search transcripts" form), and shows raw speaker refs such as `spk:2`. Speaker names depend on the ISS-104 seam.
