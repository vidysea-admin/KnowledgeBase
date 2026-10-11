# Verdict - u3-2-global-search-bar

VERDICT: PASS
Cycle checked: 0
Commit checked: 4429fb7 (lane/u32bar, from 2d1e738)
Scope: SOURCE SCOPE ONLY per D-024 (vitest + jsdom + tsc; no browser, nothing seen in a real page)
Checker: independent subagent, own harness and own tests (deleted after use)

## EXPLANATION

1. Crafted link: own test mounted `/search?q=` with script/img tags, `javascript:`, `data:`, `%0d%0a`, `../`, `//evil`, NUL, RTL override, 10,000 chars, `%E0%A4%A`, `%`, `%zz`, `a+b`, `a%20b`, `%2526`, 600 emoji, under StrictMode. Each gave at most one request, to the configured API origin `/search?q=<encoded once>`; no script/img element, no javascript:/data: href, `window` unchanged, `document.title` unchanged. `%2526` -> `%26` (decoded once). NUL/RTL become spaces and are trimmed. Query text appears only as React text nodes (`<p role="status">`) and the input value. The page sets no title and no aria-live; the only live region is the existing `role="status"` line, which carries the (inert, bounded) query text. Screen-reader noise only, low.
2. Request discipline: one request per distinct q on mount (also StrictMode), Back (`aa,bb,aa`) and same-query resubmit (one per submit click, no loop; no per-keystroke path). Out-of-order responses with controlled promises (A then B, and Back after A,B): the stale response is ignored, newer results stay. Cross-key: identical query after a key change goes out with the new key and A's text is never shown, including while A's identical request is still pending (in-flight id includes the key). No cross-key reuse.
3. Bound: 512 code points via Array.from, applied in the bar, the page box and the URL reader before state or request; the bar input also has maxLength 512 (UTF-16 units, so emoji input is capped near 256 code points; cosmetic). Lone surrogate typed in the bar becomes U+FFFD via URLSearchParams, no throw. The server has NO bound: `GET /search` only requires non-empty q and caps k at 50 (Node's ~16 KB header limit is the only ceiling). Ruling: 512 is reasonable for a search box; it is a client convenience, not a control. NOTE for owner (low, authenticated and tenant-scoped, not filed in the ledger): add a server-side q length cap in apps/api/src/routes/search.ts in an API unit.
4. History: a new query pushes one entry; same query via the page box does not push (re-runs in place); Back restores earlier results and URL. `/search`, `?q=`, whitespace q: idle, zero requests. Repeated `q` (`?q=one&q=two`): first wins. Unknown params are preserved while untouched (a Back to such a URL keeps them) and dropped when the bar or box submits (setParams/createSearchParams carry only q): deterministic.
5. Signed out: no bar, no request for `/search?q=x`. Test diff vs 2d1e738 is additions only (2 new files); existing 15 SearchPage tests unmodified and pass.
6. Accessibility from source: `role=search` form with aria-label, input with label via htmlFor/id, button "Go" has a text name, Enter submits the form.
7. Scope: only apps/web files and the manifest changed; client.ts untouched; no dependency change. `lint-dirsize` OK. SearchPage.tsx 107 lines, bar 31.

## Evidence

- vitest (bar, AppShell/layout, search page, App routes): 4 files, 40 passed. Own extra file: 9 passed (deleted).
- `tsc --noEmit` apps/web: exit 0. `node scripts/lint-dirsize.mjs`: OK (117 dirs).
- Mutations (own harness, per-mutation backup, restore in finally, `git hash-object` equal to HEAD after each): 10 run. Killed by assertion: stale response overwrites newer (own stale-response test); cache not keyed by key (own cross-key-pending test); bound removed (3 tests); double decode (own `%2526` test); push on identical query (2); request without key (13); dangerouslySetInnerHTML (2); effect deps widened (2). Killed only by timeout: 0. One of the first nine harness entries was a pattern miss and was re-run. Survived: effect-cleanup `generation.current++` removal (equivalent: `run()` also bumps the generation; low, not filed).
- `git merge-tree --write-tree HEAD codex/machine-migration-2026-10-09`: clean, no conflicts (tree 6e5fecf). Main did not change AppShell.tsx or styles.css here.

ISSUES-WRITTEN: none

## Merge conditions

None blocking. Merge by the normal path; browser validation of layout, focus order and landmark is still outstanding (D-024). Follow-up (separate unit, API): server-side cap on `q` length.
