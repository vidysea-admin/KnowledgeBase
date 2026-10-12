# deploy-compiled-api-build-and-healthchecks

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap: deployment readiness D1 + D2). Class: build/packaging only; no auth, tenancy or data-write code touched.
Lane: lane/deploybuild. Lane ledger `qa/issues.deploybuild.jsonl`: ISS-DEPLOYBUILD-001 (medium), -002, -003 (low).

## Scope
New `apps/api/scripts/build.mjs`; `apps/api/package.json` (scripts `build`, `start`; devDependency `esbuild` 0.28.2); `pnpm-lock.yaml` (one importer entry, hand-edited); `apps/api/Dockerfile` (multi-stage, non-root, HEALTHCHECK); `apps/web/Dockerfile` (HEALTHCHECK). Not touched: docker-compose.yml, .env.example, .dockerignore, apps/api/src/server.ts, index.ts, any route, /health behaviour (still returns all-tenant counts, awaiting owner ruling), .gitignore (`**/dist/` is already ignored; dist is not committed).

## Approach and why
esbuild bundle of `src/index.ts` to `apps/api/dist/server.js` (ESM, node24, 332,813 bytes plus a 962,631-byte linked sourcemap). tsc rejected: every `@lkb/*` package has `"main": "./src/index.ts"`, so a tsc build of apps/api alone would still import .ts at runtime. Real npm deps stay external (plugin: every bare specifier except `@lkb/*`): exactly `dotenv, express, express-rate-limit, mongodb`, all already direct deps of apps/api. esbuild is not on apps/api's resolution path, so it is added as devDependency 0.28.2 (the version tsx already locks; lockfile importer entry added by hand). `build.mjs` has a dev fallback that finds esbuild under node_modules/.pnpm.

## Runtime file dependencies (grep of readFile/readdir/existsSync/__dirname/import.meta/process.cwd in apps/api and bundled packages)
Repo-root lookups written as `new URL("../../../..", import.meta.url)` break after bundling. Handled by rewriting `import.meta.url` per module to `__lkbSrcUrl("<source path>")`, which resolves as if the module still sat at its source path under `<root>` (`<root>` = three levels above the bundle). `src/index.ts` is excluded so its run-directly guard still sees the real URL. The bundle must live at `<root>/apps/api/dist/server.js`.
- `schema/index.json` (store.ts, system-status-store.ts): schema/ copied into the image. Resolves to an existing file (checked).
- `config/ai-routing.yaml` (composition/production.ts): config/ copied into the image. Resolves to an existing file (checked).
- `<root>/.env` (index.ts dotenv, optional, absent in image; env vars are used instead).
- `<root>/data/toc-migrated/**`, `<root>/data/webinar-release/operations.json`, files named by `source.path` (routes/brain.ts): DATA, not shipped; routes guard with existsSync. ISS-DEPLOYBUILD-002 for the owner.
- `ai-transport.ts` existsSync is a Windows-only CLI exe lookup; n/a on Linux.
- Other packages' fs reads (ingest retention-report, core job-queue/run-state, meeting-bot state) take caller-supplied paths; `run-state-lock-real-kit.ts` (import.meta.url) is test-only and not in the bundle graph.

## Evidence (node off PATH; nothing installed; no real database)
- `node scripts/build.mjs` -> `built apps\api\dist\server.js (332813 bytes)` / `external packages: dotenv, express, express-rate-limit, mongodb`.
- `node --check dist/server.js` -> `CHECK_OK`. The bundle contains exactly 4 rewritten lookups (system-status-store.ts, store.ts, production.ts x2).
- Path arithmetic from the bundle URL: store.ts and system-status-store.ts -> `<root>\schema\index.json` exists=true; production.ts -> `<root>\config\ai-routing.yaml` exists=true and `<root>\` exists=true.
- Smoke start, `MONGODB_URL=mongodb://127.0.0.1:1 node dist/server.js` (36.8 s, then exit): first error line `@lkb/api failed to start: MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:1`. No module-resolution or missing-file error. (dotenv printed `injected env (0)` for the nonexistent root .env; .env contents were not read.)
- `node --test --import tsx src/server.test.ts src/routes/health.test.ts src/health-probe.test.ts` (apps/api, fakes only) -> `tests 30, pass 30, fail 0`.
- `docker`: not installed (`docker: command not found`). Images NOT built; no sizes. HEALTHCHECK lines as written:
  - api: `HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]` (/health returns 503 on db error, so unhealthy then; slim image has no curl).
  - web: `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1:80/ || exit 1`.

## NOT covered
Docker builds and container health (ISS-DEPLOYBUILD-001); `pnpm install --frozen-lockfile` with the hand-edited lockfile, and the `--prod --filter "@lkb/api..."` symlink layout copied between stages (unverified); the bundle running past the Mongo connect (schema/config reads verified by path arithmetic only, ISS-DEPLOYBUILD-003); /brain data mount (ISS-DEPLOYBUILD-002); registry and base-image policy (left as `node:24-slim`, `nginx:1.27-alpine`, owner's call); the web container's nginx master still runs as root (unchanged); typecheck not run (no .ts changed; build.mjs is outside the tsconfig include).
