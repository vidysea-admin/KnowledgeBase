# Manifest - u3-2-global-search-bar

Status: ready-for-check
Fix cycle: 0
Lane: lane/u32bar (from 2d1e738)
Tier: 3 (roadmap). A global search bar is a named deliverable of U3.2 ("Search page / global search bar"), not polish.
Seam count (round cap): PASSed verdicts naming the web search page seam = 1 (`qa/verdicts/authenticated-search-transcript-navigation.md`, cycle 1). Class: coverage/feature, not security class. 1 < 2, so under the cap. The unit touches the URL/untrusted-input boundary, so security-style review is welcome but not required by the cap.
Scope: SOURCE SCOPE ONLY (D-024): vitest + jsdom + tsc. No live-browser check was run; this unit does not claim browser validation.
Maker: u32bar lane maker subagent.

## Behavior

- `apps/web/src/components/GlobalSearchBar.tsx` (new): a `<form role="search" aria-label="Global search">` with a labelled text input ("Search all sessions") and a "Go" submit button. Rendered once, at the top of `<main>` in `layout/AppShell.tsx`, only when `useAuth().apiKey` is set. Submitting navigates with the router to `/search?q=<encoded>` (`createSearchParams`, so exactly one encoding; space becomes `+`, which the URL parser reads back as a space). Blank/whitespace-only (after stripping) is refused: no navigation. On `/search` the input shows the current `q`; on other routes it is empty (a `?q=` on another route is ignored).
- `apps/web/src/pages/search/query.ts` (new): `normalizeQuery()` and `MAX_QUERY_CHARS = 512`. Takes the first 512 code points BEFORE any other work, replaces C0/C1 controls and bidi marks/embeddings/overrides/isolates with a space, trims.
- `SearchPage.tsx`: the URL `q` is the single source of truth. The box is a draft that mirrors it. An effect keyed on the normalised URL `q` runs the search (one request per distinct q); empty/missing q is idle with no request. Submitting a different query does `setSearchParams({ q })` (a push, so Back works) and the effect runs the search; submitting the SAME query as the URL re-runs it in place (preserves the old "retry" behaviour; no push). A pending identical (key, q) request is reused, which is what keeps React StrictMode's dev double-mount to one request. A key change clears the URL `q` (replace) as the old code cleared the box; it never searches for the new key by itself. Blank-submit behaviour unchanged ("Enter a search query." alert, no request).
- `styles.css`: 3 lines for `.global-search`.

## Query length bound and its source

Neither `GET /search` (apps/api/src/routes/search.ts: only non-empty `q`, `k` capped at 50) nor `searchTranscripts` (apps/web/src/api/search/client.ts: trims, rejects blank, limit 1..50) bounds the query length, and the Ask page has no bound either. So there was no existing bound to reuse; 512 code points is a new client-side choice, flagged for the checker/Approver. It is applied before state, request or DOM, and is also set as `maxLength` on the bar input.

## Untrusted-query rules (how each is met)

- Text only: the query is rendered only as a React text node (`Results for “…”`, input value). No `dangerouslySetInnerHTML`, no href built from it. The only link on the page remains the existing session link built from API ids.
- Decode exactly once: only `URLSearchParams` (via router) decodes; malformed `%E0%A4%A` does not throw (the parser yields U+FFFD + `%A`, which is searched/shown as text).
- Bounded before state/request; controls and bidi stripped to spaces; trimmed.
- Sent only through `searchTranscripts` -> `apiFetch` to the configured API origin; the query is not logged.
- A crafted `?q=` causes only one search request for the normalised text; no navigation, no key change (a test asserts the location is unchanged and fetch is called once).
- Not done: the page does not rewrite a hostile/over-long URL to its normalised form (it stays in the address bar; the page uses the normalised text).

## Ask handoff

NOT built. `AskPage.tsx` takes its question only from local state (`useState`), with no `useLocation`/`useSearchParams`/router state. Adding one means changing the Ask page, which this unit must not do. Next slice: "Send to Ask" (needs an Ask-page `?q=` contract first).

## Files

New: components/GlobalSearchBar.tsx (28 nonblank lines), components/GlobalSearchBar.test.tsx (66), pages/search/query.ts (14), pages/search/SearchPage.url.test.tsx (105). Modified: layout/AppShell.tsx, pages/search/SearchPage.tsx (101), styles.css. No change to apps/api, packages/*, client.ts, contracts, enforcement paths, TASKS.md, goal.json, calendar or join-rules files.

## Existing assertions edited

None. All 15 existing SearchPage tests and the 3 App.routes tests pass unmodified. (The bar's input is `type="text"` inside `role="search"` so it does not collide with the page's `searchbox`-role queries.)

## Evidence

```
$ node apps/web/node_modules/vitest/vitest.mjs run src/components src/pages/search src/App.routes.test.tsx --reporter=dot   (cwd apps/web)
 Test Files  4 passed (4)
      Tests  40 passed (40)
$ node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json   (cwd apps/web)
tsc exit 0
$ node scripts/lint-dirsize.mjs
lint-dirsize: OK (117 dir(s) within budget)
```

Tests added (22): bar submits from /, /sessions, /ask, /calendar, /search; blank refused; trim; 10,000-char and emoji bound; `& # % + ? " ' नमस्ते 世界 😀 50%25 a=b&c=d` round-trip encoded once (`50%25` becomes `50%2525`); control/bidi stripped; shows current q on /search only; malformed percent-encoding; not rendered signed out; shell renders it once. Page: idle for missing/empty/whitespace/control-only q with zero requests; one request under StrictMode; bar-from-another-route one request and no loop after 50 ms; Back/Forward re-run earlier queries (`first, second, first, second`); same-query retry; malformed encoding; hostile q (`<script>`, `<img onerror>`, `javascript:`, RTL override, BEL, 10,000 z's) inert, <=512 code points sent, API-origin only, one request; no request or bar without a key; key change clears URL q with no new request.

## Mutations

Harness: lane-private untracked script inside the worktree (deleted before commit), byte backup per mutation, restore in `finally`, 150 s hard kill per run, post-run `git hash-object` equal to the pre-run blob for all three touched files. Run set: GlobalSearchBar.test, SearchPage.url.test, SearchPage.test.

| # | Mutation | Result |
|---|---|---|
| 0 | blank accepted in bar | killed by assertion: "blank and whitespace-only queries are refused" |
| 1 | double encoding | killed by assertion (9, every bar navigation test) |
| 2 | status line via innerHTML | killed by assertion: "hostile q renders inert..." |
| 3 | length bound removed | killed by assertion (2): bar over-long + hostile q |
| 4 | submit also runs directly + dedupe removed (two fetches) | killed by assertion (10; first run with dedupe left in SURVIVED - the dedupe masks it, so the pair is the real defect) |
| 5 | effect rewrites URL (URL->state->URL loop) | killed by assertion (4) |
| 6 | bar rendered when signed out | killed by assertion (2) |
| 7 | in-flight dedupe removed | killed by assertion: "exactly ONE request ... StrictMode" |
| 8 | control/bidi stripping removed | killed by assertion (4) |
| 9 | trim removed | killed by assertion (4) |
| 10 | key change keeps URL q | killed by assertion (1) |

Killed only by timeout: none. Survived: none (after the correction noted in #4).

## NOT done

- No live-browser validation (D-024). Focus order, the `role="search"` landmark and the layout were not seen in a browser.
- No filters/pagination on the search page. No "Send to Ask" (see above). The bar has no autosuggest.
- U3.2 stays open. U3.1 is still in_progress for a browser-test wording only; the search page itself exists.
- The 512 bound is new, not inherited (see above).

Please issue the Cycle 0 checker verdict at `qa/verdicts/u3-2-global-search-bar.md`.
