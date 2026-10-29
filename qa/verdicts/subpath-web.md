# Verdict — subpath-web

**Cycle checked:** 0
**Date:** 2026-10-29
**Commit under check:** c729cbb3 (code commit 3a442d3e; base 77ba22d8)
**Coordinator:** A (single check; Dual check: no)
**Policy-Version:** proportional-verification/2026-10-19.17
**Contract:** none (owner gate golive-batch4-2026-10-28, answer 1b); criteria C1-C7 are the manifest's

## VERDICT: PASS

**SCOREBOARD:** 7/7 criteria met

## What I re-ran (independently, one test file per vitest invocation, under `timeout`)

| File | Result |
|---|---|
| src/config/runtime.test.ts | 23 passed |
| src/config/runtime.wiring.test.tsx | 5 passed |
| src/config/noRootAbsoluteHrefs.test.ts | 2 passed |
| docker/runtime-config.test.ts (real sh, not skipped) | 14 passed |
| whole apps/web suite (full-suite trigger: client.ts base-URL change) | 1329 passed, 2 skipped, 1 failed (147 files, 146 passed) |
| tsc --noEmit -p apps/web | exit 0 |
| node scripts/snapshot.mjs --check | OK |
| vite build (outDir in scratch) | index.html keeps `<base href="/">`, `./config.js`, `./assets/*`; no root-absolute asset URLs |

The 1 failure is `KnowledgeSpeakerProfilePage.test.tsx` "immediate speaker UI replays actual scripted U24 producer output" (sha256 of an on-disk scripted artifact differs). It reads a data artifact hash, the diff touches nothing under apps/web/src/pages/knowledge or any data artifact, and it matches the manifest's disclosed pre-existing failure. Not attributable to this unit.

## Real-container evidence (my own build; local Docker only, no network)

Image built from the real `web` stage lines of the root Dockerfile (awk-extracted), real nginx.conf and docker/* hooks, stub dist, stub api container that echoes `$request_uri` and headers.

- APP_BASE_PATH=`knowledgebase/` (odd spelling) -> log `lkb: web base path '/knowledgebase', api base '/knowledgebase/api'`, container healthy.
- 200: `/knowledgebase/`, `/knowledgebase`, `/knowledgebase/watch`, `/knowledgebase/sessions/x`, `/knowledgebase/assets/a.js` (application/javascript), `/knowledgebase/config.js`, `/healthz`. 403 `/`, 404 `/watch`, 404 `/knowledgebaseX`, 404 `/knowledgebase/../etc`, 403 `/knowledgebase/%2e%2e/`. Nothing is served outside the base.
- Served index.html carries `<base href="/knowledgebase/">`; config.js `basePath: "/knowledgebase"`.
- `/knowledgebase/api/a/b?x=1` -> upstream saw `/a/b?x=1` (prefix stripped, query kept), `Authorization: Bearer K` forwarded intact. `/knowledgebase/api` -> relative 301 to `/knowledgebase/api/`.
- Default (no APP_BASE_PATH): `/config.js` `basePath: ""`, `/api/h` -> upstream `/h`, container healthy.
- Refusal at start through the real entrypoint (set -e): `APP_BASE_PATH=/a/../b`, `/a;b`, `/a$(id)`, `APP_API_BASE=x";alert(1);"`, `API_UPSTREAM=http://x;y`, `API_UPSTREAM=http://api:3300$uri` all exit 1 with an `lkb:` message and the container never serves. No injection reached config.js or nginx.
- Cleanup: containers lkb-chk-*, network lkb-chk-net and image lkb-chk-web:t removed.

## Falsifications (one per changed criterion, in a copy under scratch; per-mutation byte backup; restored copy `cmp`-equal to the clean bound-tree file; bound tree `git status` clean afterwards)

| Crit | Mutation (different from the maker's where practical) | Test file | Observed |
|---|---|---|---|
| C1 | runtime.ts drop `if (explicit) return explicit;` | runtime.test.ts | 2 failed / 21 passed |
| C2 | App.tsx `<BrowserRouter basename=...>` -> `<BrowserRouter>` | runtime.wiring.test.tsx | 1 failed / 4 passed |
| C3 | WatchPage.tsx:261 `<Link to="/calendar">` -> `<a href="/calendar">` | noRootAbsoluteHrefs.test.ts | 1 failed / 1 passed |
| C4 | nginx.conf SPA fallback `${LKB_BASE_PATH}/index.html` -> `/index.html` | runtime-config.test.ts | 4 failed / 10 passed |
| C5 | envsh remove the API_UPSTREAM unsafe-character guard | runtime-config.test.ts | 1 failed / 13 passed |
| C6 | nginx.conf `proxy_pass ${LKB_API_UPSTREAM}/;` -> no trailing `/` | runtime-config.test.ts | 6 failed / 8 passed |
| C7 | runtime.ts drop `if (args.configPresent === false) return "";` | runtime.test.ts | 1 failed / 22 passed |

## Criteria

- C1 met. Precedence VITE_API_BASE_URL > runtime apiBase > dev fallback > `<base>/api` pinned and falsified.
- C2 met. Real App mounted under `/knowledgebase` routes `/knowledgebase/ask`; basename removal fails it.
- C3 met. Independent grep over src for `href="#`, `url(#`, `location.*=`, `window.open`, `fetch("/`, `new URL("/` finds no root-absolute internal navigation; other modules read the API base only via client.ts (sessions.ts uses the same `API_BASE_URL`). WatchPage and AutomationPage use `<Link>`.
- C4 met. Real container serves every path variant; SPA fallback and bare-base both work; one image, env at start.
- C5 met. Refusals reproduced through the real entrypoint, not only the unit harness.
- C6 met. Prefix stripping, query and Authorization forwarding verified against a live upstream.
- C7 met. Legacy no-config.js default stays same-origin; workbench.ui test passes in the full suite.

## Adversarial hunt (auth / tenancy / data-write paths touched)

The diff adds an in-container reverse proxy in front of the API but does not touch API auth code. Checked: Authorization is forwarded unchanged; the API has no `trust proxy`, no IP allowlist and no loopback bypass (`grep` of apps/api/src: only the rate limiter reads `req.ip`, and it is keyed on the verified tenantId after `requireAuth`, so the web container's IP becoming `req.ip` creates no shared anonymous bucket). Client-supplied `X-Forwarded-For` is passed through with the real peer appended, and the API ignores it. Path traversal through the proxy and base (`..`, `%2e%2e`, double slash, sibling prefix) did not escape the base. Env injection into config.js and nginx is refused. No bypass found.

## PROPOSED-ISSUE (all low, file-don't-fix; none enters the backlog)

PROPOSED-ISSUE: severity=low | apps/web/nginx.conf `location ~ ^${LKB_BASE_PATH}$` uses the base path as a regex while the guard allows `.`; with APP_BASE_PATH=/a.b the bare path `/aXb` also returns index.html 200 (reproduced). Cosmetic; escape dots or use `location = ${LKB_BASE_PATH}`.
PROPOSED-ISSUE: severity=low | apps/web/nginx.conf `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto` forwards an empty value (header omitted) on a direct hit and trusts a client-supplied value; fine today (API ignores it) but `$scheme` fallback or a `map` would be safer if the API later keys on it.
PROPOSED-ISSUE: severity=low | express-rate-limit 8 may log ERR_ERL_UNEXPECTED_X_FORWARDED_FOR because requests now arrive with an X-Forwarded-For header while the API has no `trust proxy`; log noise only, not reproduced here (no API run).

## Not verified / limits

- No in-browser load of the built app under /knowledgebase (maker disclosed the same); app routing is covered by the jsdom App test and asset/deep-link serving by the curl evidence above.
- The root Dockerfile `web` target was not built whole (pnpm install needs the registry); its runtime-stage lines were built verbatim.
- `pnpm lint:structure` not rerun; snapshot check run and OK.

ISSUES-WRITTEN: none

Metrics: check_min=14 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=1 mutants=7 repeat_runs=0 tokens=unavailable
