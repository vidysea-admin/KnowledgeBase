# Manifest — web-app-shell-brain-calendar

Status: checked-PASS (see qa/verdicts/web-app-shell-brain-calendar.md)
Contract: `qa/contracts/web-app-shell-brain-calendar.md`
Fix cycle: 1

## What changed

1. **`apps/web`** (new workspace package) — Vite+React+TS SPA. `package.json`, `vite.config.ts`,
   `tsconfig.json` (own, DOM-aware, does not extend root base), `index.html`, `.env.development`
   (gitignored), `.env.example`, `vitest.config.ts`, `src/setupTests.ts`.
2. **`src/api/`** — `client.ts` (fetch wrapper, `ApiError`), `types.ts` (hand-mirrored response
   shapes, imports zero `@lkb/core`), `sessions.ts`, `gaps.ts`, `sources.ts`, `graph.ts`.
3. **`src/auth/`** — `AuthContext.tsx` (React-ified key storage), `LoginGate.tsx`.
4. **`src/layout/`** — `AppShell.tsx`, `NavSidebar.tsx` (persistent sidebar, 5 internal routes +
   2 external links to `apps/api`'s existing `/compete`/`/docs-ui`).
5. **`src/pages/`** — `DashboardPage.tsx`, `SourcesPage.tsx`, `sessions/SessionsListPage.tsx`,
   `sessions/SessionDetailPage.tsx`, `BrainPage.tsx`, `CalendarPage.tsx`.
6. **`apps/api/src/routes/graph.ts`** (new) — `GET /graph`, injected `GraphReadDeps`.
7. **`packages/index/src/tree/flatten-graph.ts`** (new) — pure `flattenTreeToGraph`, exported
   from `packages/index/src/index.ts`.
8. **`apps/api/src/store.ts`** — `createMongoGraphReadDeps()`.
9. **`apps/api/src/server.ts`**, **`production.ts`**, **`fixtures.ts`** — `graph`/`corsOrigins`
   wired into `ServerDeps`; `fakeGraphReadDeps`.
10. **`apps/api/src/cors.ts`** (new) — hand-rolled, origin-allowlist CORS middleware.
11. **`.dependency-cruiser.cjs`** — added `.tsx` to `enhancedResolveOptions.extensions`.
12. **`scripts/seed-demo-server.mjs`** — added `"graph"` to the minted key's scopes.
13. **`apps/web/Dockerfile`**, **`apps/web/nginx.conf`** (new) — multi-stage build → static nginx
    serve, with SPA fallback routing.
14. **`docs/SNAPSHOT.md`** — regenerated (generated artifact, per ARCHITECTURE §5).
15. **`TASKS.md`** — T-010 updated from "deferred, not near-term" to `in_progress`, with a real
    note on what shipped and what (Phase 4, Settings) remains.

## Real bugs found and fixed during this unit (disclosed, not hidden)

1. **`VITE_API_BASE_URL` unset in dev** — every API call in dev mode hit the Vite dev server
   itself instead of `apps/api`, failing with a generic error. Fixed via `.env.development` +
   `.env.example`.
2. **`.dependency-cruiser.cjs` never knew `.tsx` existed** — its resolver's extensions list was
   missing `.tsx` (the first `.tsx`-containing package in the monorepo), so every internal
   `apps/web` import showed as unresolvable even though nothing was actually broken. Fixed by
   adding `.tsx` to `enhancedResolveOptions.extensions`.
3. **nginx served no SPA fallback** — a direct load or refresh of any client-side route
   (`/sessions`, `/brain`, etc.) would have 404'd against nginx's default static-file-only
   config. Fixed via `nginx.conf`'s `try_files ... /index.html`; verified with a real direct-load
   curl to `/sessions` against the built container (200, not 404).
4. **First draft of `fakeGraphReadDeps` was a broken placeholder** (`as never`/`as unknown as`
   casts) — caught during self-review before it ever ran; replaced with a real in-memory fake.

## Real evidence

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass   (+6 flatten-graph tests)
packages/ai:          54/54 pass
packages/ingest:      34/34 pass
packages/ask:         30/30 pass
packages/meeting-bot: 40/40 pass
apps/api:             37/37 pass   (+3 graph route tests, was 34)
apps/web:             13/13 pass   (new: CalendarPage, SessionsListPage, BrainPage, LoginGate)
Total: 240 tests, 240 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (175 file(s) within budget)
lint-dirsize: OK (70 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (218 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (863 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (113 lines, budget 200)
✔ no dependency violations found (195 modules, 541 dependencies cruised)
```

### Real Docker build + run, both apps, cross-origin (fresh, this session)
```
$ docker build -f apps/api/Dockerfile -t lkb-api:demo .
...DONE, exit 0
$ docker run -d --name lkb-api-demo -p 3400:3000 -e MONGO_URL=... -e MONGO_DB=lkb \
  -e GEMINI_API_KEY=... -e CORS_ORIGINS=http://localhost:8080 lkb-api:demo
@lkb/api listening on :3000

$ docker build -f apps/web/Dockerfile -t lkb-web:demo --build-arg VITE_API_BASE_URL=http://localhost:3400 .
...DONE, exit 0
$ docker run -d --name lkb-web-demo -p 8080:80 lkb-web:demo
$ curl -o /dev/null -w '%{http_code}' http://localhost:8080/            -> 200
$ curl -o /dev/null -w '%{http_code}' http://localhost:8080/sessions    -> 200  (SPA fallback)
```

### Real browser evidence (Playwright, against real seeded 23-session TOC data)
- `qa/evidence/spa-dashboard2.png` — real dashboard (dev mode, :5173/:3300).
- `qa/evidence/spa-sessions.png` — real 23-session list.
- `qa/evidence/spa-brain-graph.png` — real force-directed graph, session/topic clusters,
  visible dashed co-occurrence edges.
- `qa/evidence/spa-calendar.png` — real month-grouped past events (August 2026 shown first) +
  honest, permanent upcoming-empty-state.
- `qa/evidence/spa-docker-brain.png` — the SAME brain graph, FULLY CONTAINERIZED: SPA on :8080,
  API on :3400 (separate container), real cross-origin fetch via the new CORS middleware, zero
  console errors — proves the whole stack works in the production-shaped deployment, not just
  dev mode.
- Sources page verified via accessibility snapshot: all 23 real source documents listed with
  real file paths and real `createdAt` timestamps.

## How to verify (for the checker)
1. `pnpm -r test` from repo root — expect exit 0, 240/240.
2. `pnpm lint:structure` — expect exit 0; confirm dependency-cruiser shows `apps/web` with zero
   edges into `packages/`.
3. `pnpm --filter @lkb/web build` — expect exit 0, real `dist/` output.
4. Read the new/changed files listed above; confirm each matches this manifest's description.
5. Build and run both Docker images with real env vars, confirm real cross-origin data loads
   with zero CORS errors, and that a direct `curl` to `/sessions` on the web container (not via
   client-side nav) returns 200.
6. Confirm `TASKS.md`'s T-010 line now says `in_progress` with a real, specific status note.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
