# Verdict: deploy-compose-web-migrate-secrets

VERDICT: FAIL
Cycle checked: 0
Commit checked: 5417d70 (lane/deploycompose), checked against lane/deploybuild 643c096
Scope: docker-compose.yml, .dockerignore, .env.example. Docker is not installed; no image built.

## EXPLANATION

The lane is internally sound but breaks `docker compose build` as soon as deploybuild merges (ISS-DEPLOYCOMPOSE-003, high).

- Compatibility with the other deploy lane: `migrate.build.target: deps` points at a stage that deploybuild removed. 643c096's apps/api/Dockerfile stages are `base, manifests, build, prod-deps, runtime`; there is no `deps` (the pre-lane file had it). Compose would fail with "target stage deps could not be found". The full-install stage that holds root node_modules (migrate-mongo 14.0.7 and dotenv 17.4.2 are root package.json dependencies, so `npx migrate-mongo` and `dotenv/config` resolve) is now `build`. Required change is in THIS lane: `target: build` (or deploybuild restores a `deps` stage; this lane should not rely on a stage name it does not own). No `command:` override runs tsx; `api` has no command and takes `CMD ["node","apps/api/dist/server.js"]`; port 3300 and PORT=3300 match the Dockerfile EXPOSE/HEALTHCHECK. Compose adds no healthcheck of its own, so the image HEALTHCHECK applies.
- Merge order: after the `target` fix, deploybuild first, then deploycompose (either order builds only once the fix is in; with the unfixed target, merging deploybuild first breaks compose, merging this lane first is fine until deploybuild lands). Re-check with the merged Dockerfile stage list.
- Build context simulation (js-yaml 4.3.2 and `ignore` 7.0.6 from the main tree, conservative gitignore semantics, over `git ls-files`): for every COPY source in both Dockerfiles (pnpm-workspace.yaml, pnpm-lock.yaml, package.json, packages/ 463 files, apps/api/ 117, apps/web/ 155, schema/ 83, config/ 1, workers/transcribe/package.json, plus migrations/ 5 and migrate-mongo-config.cjs for the bind mounts) excluded files = 0. `.env`, `apps/api/.env`, `config/client_secret.json`, `raw/`, `data/`, `qa/` are excluded; `.env.example` is kept.
- Compose parses (services migrate, api, web, local-mongo; api.depends_on migrate service_completed_successfully; local-mongo profile local-dev). This proves YAML only; `docker compose config` was never run.
- Secrets: `.env.example` has no real values (only CORS_ORIGINS=localhost URLs); compose contains no keys or credentials (grep for AIza/sk-/credentialed URIs/IPs: none); `config/client_secret.json` is untracked (maker's check, and `git ls-files` shows only .env.example files).
- Production safety (ISS-DEPLOYCOMPOSE-005): MONGODB_URL has no default, so nothing runs with an empty environment, but compose auto-reads .env and `up` would migrate whichever database it names with no gate beyond a comment. Owner variables are required, but not a deliberate act.
- ISS-DEPLOYCOMPOSE-004: `.env.example` CORS_ORIGINS lacks :8080, overriding the compose default for anyone who copies it to `.env`.
- ISS-DEPLOYCOMPOSE-001 and -002 stay OPEN; 001 is now realised as -003. Image security (non-root, no secrets in the image) is covered in the deploybuild verdict.

ISSUES-WRITTEN: ISS-DEPLOYCOMPOSE-003 (high), ISS-DEPLOYCOMPOSE-004 (medium), ISS-DEPLOYCOMPOSE-005 (medium)
