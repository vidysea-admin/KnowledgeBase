# Manifest — subpath-web
**Contract:** none (owner gate qa/gates/golive-batch4-2026-10-28.md, Answered 2026-10-29T07:09:09+05:30: 1b, product lives at https://vidysea.com/knowledgebase, base path must be runtime-configurable)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
Fix cycle: 0
**Dual check:** no (no auth, tenancy or production-write change: web routing/config plus the web container's nginx; the API client's auth code path is untouched, only the base URL string it prefixes)
**Persona walk:** skip (no new screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-opus-builder
**Executor rationale:** multi-file deploy/config change with a precise design; edit-in-place on existing files.

## Criteria
- C1 The API base is `<basePath>/api` by default, an explicit runtime `apiBase` overrides it, and `VITE_API_BASE_URL` stays a backward-compatible override over both; the vite dev fallback (localhost:3300) still applies when nothing is configured.
- C2 The router mounts under the runtime base path (BrowserRouter basename), so the real App serves `<base>/ask`.
- C3 No hard-coded root-absolute internal href/src/fetch/window.location navigation remains in apps/web/src (WatchPage and AutomationPage now use router Links).
- C4 One built web image works at any base path chosen at container start via APP_BASE_PATH (default "/"; "/knowledgebase", "/knowledgebase/", "knowledgebase", nested paths): config.js, `<base href>`, nginx locations and docroot are generated from env; SPA fallback and `<base>` without a trailing slash both work.
- C5 An unsafe APP_BASE_PATH / APP_API_BASE / API_UPSTREAM is refused at container start (no config injection into config.js or nginx).
- C6 `<base>/api/*` proxies to API_UPSTREAM with the prefix stripped.
- C7 A bundle served without config.js (legacy) keeps the old same-origin default, so existing behaviour and tests are unchanged.

## What changed (all edited in place unless listed as new)
- apps/web/vite.config.ts `base: "./"`; apps/web/index.html loads `./config.js` and carries `<base href="/">` (rewritten at container start).
- NEW apps/web/src/config/runtime.ts (no config module existed): normalizeBasePath/normalizeApiBase/readRuntimeConfig/withBasePath/resolveApiBase/routerBasename. NEW apps/web/public/config.js (dev default: root, no explicit api base).
- apps/web/src/App.tsx `<BrowserRouter basename={routerBasename}>`; apps/web/src/api/client.ts `resolveApiBaseUrl` now delegates to resolveApiBase (VITE_API_BASE_URL kept); vite-env.d.ts types `window.__LKB_CONFIG__`.
- apps/web/src/pages/WatchPage.tsx:261 and pages/automation/AutomationPage.tsx:35: `<a href="/…">` -> router `<Link to>`.
- apps/web/nginx.conf: now an envsubst template (`${PORT}`, `${LKB_BASE_PATH}`, `${LKB_DOC_ROOT}`, `${LKB_API_UPSTREAM}`); adds /healthz, the `<base>/api/` proxy, the bare-`<base>` location and the SPA fallback under `<base>/`.
- NEW apps/web/docker/18-lkb-base-path.envsh (sourced by the nginx entrypoint: normalise + validate env, build docroot symlink) and 40-lkb-runtime-config.sh (writes config.js, sets `<base href>`); .gitattributes forces LF for them and nginx.conf.
- Dockerfile (`web` target) and apps/web/Dockerfile (`runtime` stage): COPY the template and hooks into /etc/nginx/templates and /docker-entrypoint.d, ENV defaults, healthcheck on /healthz (works under any base).
- docker-compose.yml `web`: APP_BASE_PATH / APP_API_BASE / API_UPSTREAM; the VITE_API_BASE_URL build arg default is now empty (was http://localhost:3300). .env.example documents them.
- docs/GO-LIVE-UBUNTU.md 4a, docs/DEVOPS-HANDOVER.md 4a, docs/docker-deployment.md updated.
- Tests (new): src/config/runtime.test.ts, runtime.wiring.test.tsx, noRootAbsoluteHrefs.test.ts, docker/runtime-config.test.ts. No existing assertion edited.
- Design deviation 1: vite `base: "./"` alone breaks a refresh on a deep link (`/knowledgebase/sessions/x` would request `/knowledgebase/sessions/assets/…`), so the entrypoint also sets `<base href="<base>/">`. Deviation 2: when no config.js ran at all (legacy), the API default stays same-origin "" (src/pages/knowledge-outputs/workbench.ui.test.tsx stubs PROD and expects it).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 25 files, 7 criteria, est 45 min, single builder, one test file per vitest invocation, no checker dispatch by the builder
slow-plan: seven criteria across web runtime, container entrypoint and nginx; real-container curl evidence needed a Docker build
Tier: L (nginx and compose changed; no auth/tenancy/production-write: Dual check no)
Base / checked state: base 77ba22d8; code commit 3a442d3e on branch wave/subpath-web (the manifest commit follows and touches only qa/).
Affected tests: the four new files, src/App.routes.test.tsx, src/pages/WatchPage.test.tsx, src/pages/knowledge-outputs/workbench.ui.test.tsx. DISCLOSURE (policy .7): the builder ran the whole apps/web suite (3 times: it found the workbench.ui.test.tsx regression before C7 was added), so the Metrics line omits suite_runs rather than record a false 0; the full-suite trigger (client.ts base-URL change touches every API caller) is the checker's to run. Last whole-suite result on the final code: 1328 passed, 2 skipped, 1 failed. The 1 failure is src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx "immediate speaker UI replays actual scripted U24 producer output" (hash mismatch); it fails identically with client.ts and App.tsx restored to HEAD, so it is pre-existing and not caused by this unit (not fixed, not hidden).
Independent review: NOT run by the builder; the checker owns review.
Known limits: (1) API-served HTML pages (/compete, /docs-ui) are reachable via <base>/api/… but their internal links are root-relative and break under a prefix (gate item 1b already noted this); (2) a missing file under <base>/assets/ returns index.html with 200 (SPA fallback, same as before); (3) the web container resolves the API_UPSTREAM host at start, so a standalone web container needs API_UPSTREAM to a resolvable host; (4) an in-browser load of the built app under /knowledgebase was NOT done (the shared Playwright profile was in use by another session); app-level routing is covered by the jsdom App test, asset and deep-link serving by the curl evidence below; (5) the root-Dockerfile `web` target was not built whole (its pnpm install needs the npm registry; only image pulls were allowed). Its runtime-stage lines were built verbatim on nginx:1.27-alpine (only the dist COPY source differs).
Tests[C1]: apps/web/src/config/runtime.test.ts::"resolveApiBase" — pins the default <basePath>/api, explicit apiBase and VITE_API_BASE_URL precedence, and the dev fallback
Tests[C2]: apps/web/src/config/runtime.wiring.test.tsx::"the real App routes /knowledgebase/ask to the Ask page when mounted under /knowledgebase" — mounts the real App under a configured base path
Tests[C3]: apps/web/src/config/noRootAbsoluteHrefs.test.ts::"finds none" — scans every non-test source file for root-absolute internal links
Tests[C4]: apps/web/docker/runtime-config.test.ts::"APP_BASE_PATH=%j serves under /knowledgebase, with and without a trailing slash" — runs the real entrypoint hooks and renders the real nginx template for four spellings of the path
Tests[C5]: apps/web/docker/runtime-config.test.ts::"refuses unsafe APP_BASE_PATH %j" — and the APP_API_BASE / API_UPSTREAM refusal test; the real hooks must exit non-zero
Tests[C6]: apps/web/docker/runtime-config.test.ts::"APP_BASE_PATH=%j serves under /knowledgebase, with and without a trailing slash" — asserts proxy_pass with the URI part "/" (prefix stripping) in the rendered template
Tests[C7]: apps/web/src/config/runtime.test.ts::"without any runtime config (legacy deployment) the default stays same-origin" and the existing workbench.ui.test.tsx that stubs PROD and expects same-origin URLs — together they pin the legacy default
Pre-check[C1]: 3a442d3e npx vitest run src/config/runtime.test.ts (cwd apps/web) -> exit 0, 23 passed t=1 blobs=apps/web/src/config/runtime.test.ts:d44fb4d1
Pre-check[C2]: 3a442d3e npx vitest run src/config/runtime.wiring.test.tsx (cwd apps/web) -> exit 0, 5 passed t=1 blobs=apps/web/src/config/runtime.wiring.test.tsx:4529541d
Pre-check[C3]: 3a442d3e npx vitest run src/config/noRootAbsoluteHrefs.test.ts (cwd apps/web) -> exit 0, 2 passed t=1 blobs=apps/web/src/config/noRootAbsoluteHrefs.test.ts:c65b647e
Pre-check[C4]: 3a442d3e npx vitest run docker/runtime-config.test.ts (cwd apps/web) -> exit 0, 14 passed t=1 blobs=apps/web/docker/runtime-config.test.ts:bce107a9
Pre-check[C5]: 3a442d3e npx vitest run docker/runtime-config.test.ts (cwd apps/web) -> exit 0, 14 passed t=1 blobs=apps/web/docker/runtime-config.test.ts:bce107a9
Pre-check[C6]: 3a442d3e npx vitest run docker/runtime-config.test.ts (cwd apps/web) -> exit 0, 14 passed t=1 blobs=apps/web/docker/runtime-config.test.ts:bce107a9
Pre-check[C7]: 3a442d3e npx vitest run src/config/runtime.test.ts; npx vitest run src/pages/knowledge-outputs/workbench.ui.test.tsx (cwd apps/web) -> exit 0, 23 + 1 passed t=1 blobs=apps/web/src/config/runtime.test.ts:d44fb4d1
Pre-check[R1]: 3a442d3e npx vitest run src/App.routes.test.tsx; npx vitest run src/pages/WatchPage.test.tsx (cwd apps/web) -> exit 0, 4 + 19 passed, unmodified t=1 blobs=apps/web/src/App.routes.test.tsx:aef9f406
Pre-check[T1]: 3a442d3e npx tsc --noEmit -p tsconfig.json (cwd apps/web) -> exit 0, clean t=1
Pre-check[S1]: 3a442d3e pnpm lint:structure -> exit 0, OK (10 stages, 0 failed); node scripts/snapshot.mjs --check -> OK, docs/SNAPSHOT.md matches t=1
Metrics: builder_min=45 mutants=7 policy=proportional-verification/2026-10-19.17 cycle=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
runtime.test.ts, noRootAbsoluteHrefs.test.ts and runtime.wiring.test.tsx were written before src/config/runtime.ts and the page/App edits existed (the module import would fail; the hard-coded hrefs at WatchPage.tsx:260 and AutomationPage.tsx:34 are exactly what the lint test flags). The first run of runtime.test.ts after implementation showed 1 failed / 21 passed (trailing-slash apiBase not normalised in resolveApiBase), fixed in place. The legacy-default rule (C7) was driven by a real red: workbench.ui.test.tsx failed ("reading 'map'" of undefined) when the default became "/api", and passed again after the config-presence rule.

## Falsifications (one per criterion)
Per-mutation byte backup taken immediately before each single mutation on the committed tree and restored right after it (timeout 200, no EXIT trap). After each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (OK for all 7); git status clean afterwards.

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | runtime.ts resolveApiBase default `${basePath}/api` -> `"/api"` | runtime.test.ts | 1 failed / 22 passed |
| C2 | App.tsx `<BrowserRouter basename={routerBasename}>` -> `<BrowserRouter>` | runtime.wiring.test.tsx | 1 failed / 4 passed |
| C3 | WatchPage.tsx `<Link to="/calendar">` -> `<a href="/calendar">` | noRootAbsoluteHrefs.test.ts | 1 failed / 1 passed |
| C4 | 18-lkb-base-path.envsh `LKB_BASE_PATH="/$_lkb_trim"` -> `""` | docker/runtime-config.test.ts | 5 failed / 9 passed |
| C5 | 18-lkb-base-path.envsh removed the `*[!A-Za-z0-9._~/-]*` guard | docker/runtime-config.test.ts | 4 failed / 10 passed |
| C6 | nginx.conf `proxy_pass ${LKB_API_UPSTREAM}/;` -> no trailing `/` | docker/runtime-config.test.ts | 6 failed / 8 passed |
| C7 | runtime.ts removed `if (args.configPresent === false) return "";` | runtime.test.ts | 1 failed / 22 passed |

## Evidence: real container (Docker Desktop 29.6.1, nginx:1.27-alpine)
Built from a scratch context holding the real apps/web/dist (vite build), apps/web/nginx.conf, apps/web/docker/* and the `web` stage lines of the root Dockerfile verbatim (awk-extracted; only `COPY --from=web-build …/dist` became `COPY apps/web/dist`). Network lkb-sp-net; stub api container lkb-sp-api (alias `api`, port 3300, echoes $request_uri and Authorization); web containers lkb-sp-web-kb (`-e APP_BASE_PATH=/knowledgebase`, host port 18081) and lkb-sp-web-root (default, host port 18082). Entrypoint log: `Sourcing …18-lkb-base-path.envsh`, `Launching …40-lkb-runtime-config.sh`, `lkb: web base path '/knowledgebase', api base '/knowledgebase/api'`; both containers reported `healthy`.
```
APP_BASE_PATH=/knowledgebase
GET /knowledgebase/                         -> 200 text/html
GET /knowledgebase                          -> 200 text/html   (no trailing slash)
GET /knowledgebase/watch                    -> 200 text/html   (deep link = index.html, <base href="/knowledgebase/">)
GET /knowledgebase/sessions/abc123          -> 200 text/html
GET /knowledgebase/assets/index-*.js        -> 200 application/javascript
GET /knowledgebase/config.js                -> window.__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "" };
GET /knowledgebase/api/health               -> {"stub":"api","saw":"/health","auth":""}   (prefix stripped)
GET /knowledgebase/api/sessions/1/media?x=1 -> "saw":"/sessions/1/media?x=1"               (query kept)
GET /knowledgebase/api/health + Authorization: Bearer TESTKEY -> "auth":"Bearer TESTKEY"   (header forwarded)
GET /healthz -> 200 ok ; GET / -> 403 ; GET /watch -> 404   (strict: nothing served outside the base)
default APP_BASE_PATH (/)
GET / , /watch , /assets/index-*.js         -> 200 ; /config.js -> { basePath: "", apiBase: "" } ; /api/health -> saw "/health"
```
Cleanup: removed containers lkb-sp-web-kb, lkb-sp-web-root, lkb-sp-api, network lkb-sp-net and image lkb-sp-web:test (all created here). The pulled nginx:1.27-alpine image was left in place.

## The exact upstream rule for the vidysea.com team
```nginx
location /knowledgebase/ {
    proxy_pass http://<LKB-SERVER>:<WEB_PORT>;   # no path after the port: full original URI forwarded, no rewrite
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 1g;
    proxy_read_timeout 300s;
}
```
Operator side: `APP_BASE_PATH=/knowledgebase` in .env, then `docker compose up -d web` (no rebuild).

## How to verify
`cd apps/web && npx vitest run src/config/runtime.test.ts` (then the other three new files, one per invocation); docker/runtime-config.test.ts needs a POSIX sh. Container check: build the `web` target, `docker run -e APP_BASE_PATH=/knowledgebase -p 18081:80 --network <net with an api alias on :3300> …`, curl the paths above.
