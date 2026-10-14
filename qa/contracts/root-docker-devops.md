# Root Dockerfile and DevOps handoff acceptance

Scope: the new repository-root container entrypoint and its immediate Compose/CI/DevOps consumers, under T-051. This is a new seam, not another general Compose-polish round. Existing runtime behavior is preserved; production deployment, migrations and completion of all T-051 gates are excluded.

## C1 — Build interface and default

- Root `Dockerfile` exposes `api`, `web` and `build` targets; an ordinary root build yields the API runtime, not the builder or frontend.
- Builder uses Node 24 and pnpm 10.33.0, frozen-lockfile installation and the existing `@lkb/api` esbuild command. Workspace manifests required by the lockfile are available.
- API runtime contains production external npm dependencies, the bundled entrypoint at `/app/apps/api/dist/server.js`, `schema/index.json` and `config/ai-routing.yaml`. It starts with plain Node, sets production mode, runs as non-root, exposes 3300 and retains a bounded `/health` probe.
- Web target compiles `@lkb/web` with build-time `VITE_API_BASE_URL`, serves static output with the existing nginx configuration on port 80, and retains SPA fallback and health probing.

## C2 — Immediate consumers and safety

- Compose uses the root Dockerfile and the correct explicit targets for API, web and migration builder. The migration service remains opt-in and cannot become an API startup dependency; no packaging check invokes it.
- Existing app Dockerfiles remain available. Mongo configuration remains external by default. Capture/transcription workers are not represented as packaged/live by this unit.
- Build context and runtime images exclude local secrets, credential files, raw recordings and local data. Preserve the ignored local `.env` without reading or publishing its contents. No real production URI, key or token enters CI fixtures/logs or committed examples.
- Root budget changes only from 15 to 16 with an append-script decision. Protected enforcement paths and frozen contracts are unchanged.
- DevOps instructions cover root/default/API/web builds, Compose start, required environment, frontend browser-reachable API URL and CORS origin, optional read-only data mounts, and explicit opt-in migration boundaries. They distinguish image packaging from operational-release completion.

## C3 — Executed acceptance evidence

- A Docker-enabled Ubuntu CI run for the reviewed source commit successfully builds the default API image and explicit web image, validates Compose using dummy environment values, and demonstrates the migration builder target is buildable/compatible.
- An isolated, ephemeral Mongo database and API container return HTTP 200 for `/health` and HTTP 401 for unauthenticated `/ask`; these probes require no provider request, production connection, production writes or schema migration.
- Frontend `/` and a direct `/settings` navigation return the compiled SPA. Checked API runtime user is non-root; required runtime assets exist; shipped images lack the prohibited secret/data/recording paths.
- Missing `MONGODB_DB` causes API startup refusal before a DB connection rather than silently choosing a database. Where CI tests this boundary, the observed exit/log must demonstrate that behavior.
- Network waits and jobs have time bounds; container/network cleanup runs on success and failure. Clean-checkout root structure checks and the frozen-contract validator pass with exact commands and output recorded.

## C4 — Checker/publishing provenance

- Manifest slug `root-docker-devops` carries the current fix cycle, affected-file/dependency map, source commit, final hashes and attributed command/output evidence. Checker verdict names the same cycle and rechecks final bytes.
- No PASS from static review alone: actual successful remote Docker CI evidence for the reviewed candidate is mandatory. Absent CI yields HOLD; a proven acceptance violation yields FAIL. Maker close-out follows only a matching-cycle PASS.
- Publication stages only this unit and required governance files, pushes the selected current branch without force, and reports divergence rather than rewriting remote history. Unrelated local edits remain untouched.
