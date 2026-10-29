# Verdict - api-pages-basepath

**Cycle checked:** 0
**Verdict:** PASS
**Commits:** 34e3784e, d6b7213c (base 69806029; manifest commit b3916c12)
**Policy-Version:** proportional-verification/2026-10-19.17 (coordinator A, single check)

## Evidence (re-run by the checker on HEAD b3916c12, not reused from the maker)
- C1/C2/C4: `node --test --import tsx apps/api/src/routes/pages.test.ts` -> rc 0, 18 pass / 0 fail (nav links at depth 0/1/2, with and without trailing slash; API_ROOT; executed apiFetch in node:vm).
- C3: `node --test --import tsx apps/api/src/routes/compete/compete.test.ts` -> rc 0, 12 pass / 0 fail (`/compete` and `/compete/`, placeholder replaced).
- C5: `node --import tsx scripts/qa/container-workflows/api-pages-basepath-e2e.ts` (real nginx:1.27-alpine, apps/web/nginx.conf + 18-lkb-base-path.envsh, APP_BASE_PATH=/knowledgebase) -> rc 0, 35 PASS / 0 FAIL, "api-pages-basepath e2e: ALL PASS"; all 6 pages answer as API pages (not SPA), every nav href resolves to an API page, script fetch reaches `/knowledgebase/api/sessions` JSON, compete POST reaches the API. No leftover api-pages-basepath container.
- C6: `pnpm --filter ./apps/api exec tsc --noEmit` rc 0; `pnpm lint:structure` OK (10 stages, 0 failed); `node scripts/snapshot.mjs --check` OK (174 lines).
- Source read: grep of pages.ts, ui-shell.ts, compete-page.ts finds no remaining root-absolute fetch/href/src/action; `__API_ROOT__` appears once (declaration) and is replaced per request; the only other HTML emitters (body-parser-error.ts, gws) have no internal references. All pages are mounted before requireAuth as before; no route, scope or auth change.

## Falsification (in a copy under the scratchpad; per-mutation byte backup; `git hash-object` of restored file == `git rev-parse HEAD:<file>` after each; no EXIT trap; bound tree `git status` clean afterwards; copy used junctions to the unmutated packages, removed with rmdir)
| id | criterion | edit | observed |
|---|---|---|---|
| M1 | C1 | ui-shell.ts `relHref` stops stripping the leading slash | pages.test.ts rc 1, 17 failing lines. KILLED |
| M2 | C4 | `relRoot` drops `.filter(Boolean)` (empty first segment counted) | pages.test.ts rc 1, 17 failing lines. KILLED |
| M3 | C2 | shared client `apiUrl` regex no longer strips a leading slash | pages.test.ts rc 1, 3 failing lines. KILLED |
| M4 | C2 | pages.ts session detail `apiFetch("/sessions/"+id)` -> root-absolute `fetch` | pages.test.ts rc 1, 5 failing lines. KILLED |
| M5 | C3 | compete route injects a fixed `relRoot({originalUrl:"/x"})` | compete.test.ts rc 1, 3 failing lines. KILLED |
| M6 | C5 | `relRoot` over-climbs (`depth + 1`) | Docker e2e rc 1, 6 failing lines (`../../*` nav leaves the API prefix). KILLED |
All restored: fidelity True for ui-shell.ts (6ab40ff2), pages.ts (e526baea), compete-page.ts (33bc4c9b). A first M3/M4 attempt had target count 0 (MSYS path conversion of "/" in args), asserted before any write, and was redone with MSYS_NO_PATHCONV=1.

## Adversarial hunt (no auth/tenancy/data-write path touched; pages remain pre-auth static markup)
- Injection: `relRoot` output is built only from "./" and "../"; `renderPage` re-validates it with `^(\./|(\.\./)+)$` and JSON.stringify's it; compete uses `String.replace` with that value (no `$` possible). A hostile path cannot inject markup or script.
- Hostile depth: extra path segments 404 (only `/sessions-ui/:id` takes a parameter); an encoded `%2F` in `:id` yields a depth matching what the browser sees. Query/fragment stripped before counting.
- Residual (low, out of scope): a request path with doubled slashes (`/knowledgebase/api//sessions-ui`) is merged by nginx before the API sees it, so the server-derived depth would be one short of the browser's; self-inflicted, no data exposure.

## PROPOSED-ISSUE lines
PROPOSED-ISSUE: {"severity":"low","title":"relRoot depth is wrong when a client sends // (nginx merge_slashes) in the page path","detail":"relRoot counts non-empty segments of originalUrl; a browser URL like /knowledgebase/api//sessions-ui has an extra empty segment the API never sees, so relative refs resolve one level short. Self-inflicted URL, no exposure.","fix_direction":"none required; file-don't-fix"}

## Metrics
Metrics: start=2026-10-29T10:24:00+05:30 end=2026-10-29T10:43:00+05:30 wall_min=19 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable builder_min=75 check_min=19 policy=proportional-verification/2026-10-19.17 check_s=1140 mutants=6

ISSUES-WRITTEN: none
