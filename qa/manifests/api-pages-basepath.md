# Manifest — api-pages-basepath
**Contract:** none specific (ISS-408 medium; D-205 / D-206 go-live work; APP_BASE_PATH runtime support)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** no (no auth, tenancy or data-write change: HTML templates and their inline client script only; no new route, no scope change)
**Persona walk:** skip (no new screen, flow or user type; existing pages keep their layout, only link/fetch targets change)
**Issues addressed:** ISS-408
**Executor:** claude-sonnet-subagent
**Executor rationale:** scoped to the HTML-serving route files and their tests in apps/api plus one Docker e2e script; no nginx edit.

## Criteria
- C1 Every nav link the API-served pages emit (`/`, `/sessions-ui`, `/sessions-ui/:id`, `/dashboard-ui`, `/docs-ui`) is relative and resolves back under the page's own prefix, at every page depth and with or without a trailing slash.
- C2 The shared inline script (`apiFetch`) and the session-list links resolve through a per-request `API_ROOT` relative prefix; no root-absolute fetch, href assignment or src remains in any page.
- C3 `/compete` POSTs (`compete/start`, `compete/<id>/score`) resolve relative to the page, with `/compete` and `/compete/` both correct; the `__API_ROOT__` placeholder is always replaced.
- C4 `relRoot(req)` derives the depth from the raw request path including the trailing slash, so the same HTML works at `/`, under `/knowledgebase/api/`, or any other proxy prefix (nginx strips the prefix and sends no X-Forwarded-Prefix, so the server cannot know it and does not need to).
- C5 End to end through the repo's real web nginx template with `APP_BASE_PATH=/knowledgebase`: every page loads under `/knowledgebase/api/...`, and every nav link and script/POST target resolved relative to the page URL reaches the API (JSON or API page), not the SPA fallback.
- C6 No regression: existing pages/compete tests, typecheck, `lint:structure`, snapshot check.

## What changed
- apps/api/src/routes/ui-shell.ts: new `relRoot(req)` and `relHref(rootRel, path)`; `renderPage` takes `rootRel` (validated `./` or `../` chain), builds nav hrefs from it and prepends `const API_ROOT = "<rel>";` to the page script; `CLIENT_AUTH_JS` gains `apiUrl(path)` and `apiFetch` uses it.
- apps/api/src/routes/pages.ts: every route passes `rootRel: relRoot(req)`; the session list link is built with `apiUrl("sessions-ui/")`.
- apps/api/src/routes/compete/compete-page.ts: `API_ROOT` placeholder injected per request; the two `fetch` calls use `API_ROOT + "compete/..."`.
- Tests: apps/api/src/routes/pages.test.ts (+10), apps/api/src/routes/compete/compete.test.ts (+2; one existing assert loosened from `/compete/start` to `compete/start`).
- NEW scripts/qa/container-workflows/api-pages-basepath-e2e.ts: starts the real Express app with fakes on an ephemeral port, runs `nginx:1.27-alpine` with `apps/web/nginx.conf` and `18-lkb-base-path.envsh` mounted (`APP_BASE_PATH=/knowledgebase`), fetches every page through `/knowledgebase/api/...`, resolves nav hrefs and `API_ROOT` calls like a browser and requests them through nginx; removes its container (`api-pages-basepath-nginx-<pid>`) on exit.
- apps/web/nginx.conf NOT edited. No dependency, schema or doc change.

## Findings (for the coordinator)
1. nginx forwards no `X-Forwarded-Prefix` (apps/web/nginx.conf), so relative references were chosen over a header-derived prefix; no proxy change is needed.
2. Other HTML the API emits: `composition/body-parser-error.ts` (error body, no links) and brain.ts `sendFile` (session media, not a page); neither has internal references, left untouched.
3. A bare `/knowledgebase/api` (no trailing slash) is not matched by nginx's `^~ <base>/api/` location and falls to the SPA; unchanged and out of scope.
4. Windows/Git Bash gotcha for mutation testing: MSYS rewrites an argument like `"/compete/start"` into `C:/Program Files/Git/compete/start`; run with `MSYS_NO_PATHCONV=1`.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 5 source files, 6 criteria, est 75 min, single builder, no checker dispatch by the builder
slow-plan: one nginx container run per e2e (about 20 s), 10 mutants with 25-70 s test runs each
Tier: M
Base / checked state: base 69806029; code commits 34e3784e (fix + tests + e2e script) and d6b7213c (executed apiFetch test); the manifest commit follows and touches only qa/.
Affected tests: apps/api/src/routes/pages.test.ts, apps/api/src/routes/compete/compete.test.ts, scripts/qa/container-workflows/api-pages-basepath-e2e.ts.
Independent review: NOT run by the builder; the checker owns review.
Not run / limits: no real browser (relative-URL resolution is simulated with WHATWG `URL` plus an executed `apiFetch` in `node:vm`); the SPA half of the web image is not in the e2e (only nginx + API); the web image itself was not built.
Tests[C1]: apps/api/src/routes/pages.test.ts::"GET <path>: nav links, script root and fetch targets stay under the proxy prefix (ISS-408)" over 8 paths (/, /sessions-ui[/], /sessions-ui/some-id[/], /dashboard-ui, /docs-ui[/]) — nav hrefs at every depth, with and without a trailing slash, resolved against the proxy-prefixed page URL
Tests[C2]: apps/api/src/routes/pages.test.ts::same 8 (API_ROOT + no root-absolute fetch/href) + "the shared client apiFetch resolves every API call against API_ROOT (executed, not pattern-matched)" — API_ROOT is declared and the shared client apiFetch builds its URL from it, executed in node:vm
Tests[C3]: apps/api/src/routes/compete/compete.test.ts::"GET /compete POSTs resolve under the proxy prefix..." and the "/compete/" variant; "GET /compete serves the plain HTML form" — both compete POST targets resolve under the prefix and the placeholder is replaced
Tests[C4]: apps/api/src/routes/pages.test.ts::the trailing-slash and depth variants above + "pages still resolve correctly when the API is deployed with no proxy prefix" — relRoot depth handling, plus the no-prefix deployment
Tests[C5]: scripts/qa/container-workflows/api-pages-basepath-e2e.ts (Docker; prints PASS/FAIL per link and `api-pages-basepath e2e: ALL PASS`) — real nginx template under APP_BASE_PATH=/knowledgebase reaches the API for every link and call
Tests[C6]: the two test files above in full, `npx tsc --noEmit -p apps/api`, pnpm lint:structure, node scripts/snapshot.mjs --check — typecheck, structure lint and snapshot guard the whole change
Pre-check[C1]: d6b7213c node --test --import tsx apps/api/src/routes/pages.test.ts -> exit 0, ok: 18 tests, 18 pass t=1
Pre-check[C2]: d6b7213c same run as C1 -> exit 0, ok: 18/18 pass (includes the executed apiFetch test) t=1
Pre-check[C3]: d6b7213c node --test --import tsx apps/api/src/routes/compete/compete.test.ts -> exit 0, ok: 12 tests, 12 pass t=1
Pre-check[C4]: d6b7213c same run as C1 -> exit 0, ok: 18/18 pass t=1
Pre-check[C5]: d6b7213c node --import tsx scripts/qa/container-workflows/api-pages-basepath-e2e.ts -> exit 0, ok: `api-pages-basepath e2e: ALL PASS`; afterwards `docker ps -a` shows no api-pages-basepath container t=1
Pre-check[C6]: d6b7213c pnpm --filter ./apps/api exec tsc --noEmit -> exit 0, ok: no output; lint and snapshot see Pre-check[T1] t=1
Pre-check[T1]: d6b7213c pnpm lint:structure; node scripts/snapshot.mjs --check -> exit 0, ok: `lint:structure: OK (10 stages, 0 failed)` and `OK: docs/SNAPSHOT.md matches a fresh regeneration (174 lines, budget 200)` t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C5); C2, C3 and C5 carry two or more because the nav, apiUrl, API_ROOT, session-link and POST-target sites are separate code paths
Metrics: builder_min=75 mutants=10 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
The tests encode the new relative-reference contract and fail against the mutants below, which reintroduce the old root-absolute targets (M1, M3, M5, M6, M8). The original unfixed code was not run red separately; the mutants are the red evidence.

## Falsifications (one or more per criterion)
Harness: per-mutation byte backup (`cp f bak`), exactly one text replacement (target count checked to be 1), `timeout 170` on the test, restore from THAT mutation's backup, then `git hash-object <file>` equal to `git rev-parse HEAD:<file>`. No EXIT trap; `MSYS_NO_PATHCONV=1`. All 10 fidelity checks OK, worktree `git status` clean afterwards, no leftover container. A first pass without `MSYS_NO_PATHCONV` mangled the M3/M5/M6 literals into `C:/Program Files/Git/...` and falsely "survived"; it was discarded and redone, which also exposed that M3 was not killed by pattern tests, so the executed `apiFetch` test was added.

| Criterion | falsifying edit | observed |
|---|---|---|
| C1 | ui-shell.ts `relHref`: `rootRel + path` -> `"/" + path` | pages.test.ts rc=1, 17 failing lines (every nav test) |
| C4 | ui-shell.ts `relRoot`: depth ignores the trailing slash | pages.test.ts rc=1, 7 failing lines (the trailing-slash variants) |
| C2 | ui-shell.ts `apiUrl`: `API_ROOT + path` -> `"/" + path` | pages.test.ts rc=1, 3 failing lines (executed apiFetch test and others) |
| C2 | ui-shell.ts `renderPage`: `API_ROOT` forced to `""` | pages.test.ts rc=1, 9 failing lines |
| C2 | pages.ts session link `apiUrl("sessions-ui/")` -> `"/sessions-ui/"` | pages.test.ts rc=1, 5 failing lines |
| C3 | compete-page.ts `fetch(API_ROOT + "compete/start"` -> `fetch("/compete/start"` | compete.test.ts rc=1, 5 failing lines (both variants) |
| C3 | compete-page.ts score fetch -> `fetch("/compete/" + evalRunId` | compete.test.ts rc=1, 5 failing lines |
| C3 | compete-page.ts router sends `PAGE` without the replace (placeholder left) | compete.test.ts rc=1, 5 failing lines |
| C5 | ui-shell.ts nav root-absolute, Docker e2e | e2e rc=1, 25 failing lines (nav links leave the API prefix) |
| C5 | ui-shell.ts `relRoot` always `"./"`, Docker e2e | e2e rc=1, 1 failing line (script fetch from `/api/sessions-ui/some-id` resolves to a non-API URL) |
