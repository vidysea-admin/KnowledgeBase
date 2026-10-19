# Docker deployment

The root `Dockerfile` builds two independent production images. Its final/default target
is `api` (Node 24, port 3300); target `web` serves the compiled React SPA through nginx
(port 80). `docker-compose.yml` builds both from the root. Existing Dockerfiles under
`apps/` remain available for callers that already use them.

## Build and start

Run from the repository root on a Docker-equipped host. Before **any Compose command**,
supply `MONGODB_URL`, `MONGODB_DB` and `OLLAMA_API_KEY` in a private `.env` file or the
deployment system's environment. Both API and migration services require the explicit
database target. For staging, set `MONGODB_DB=lkb_staging` and
`LKB_ALLOW_STAGING=lkb_staging`; the API does not silently choose production.

```sh
docker build --target api -t lkb-api .
docker build --target web --build-arg VITE_API_BASE_URL=https://api.example.com -t lkb-web .
docker compose build api web
docker compose up -d api web
docker compose ps
```

`.env.example` documents available names. Supply credentials through operator-managed
environment values or the deployment system's secret store. Never commit credentials
or pass them as Docker build arguments.

| Value | Deployment use |
| --- | --- |
| `MONGODB_URL` | Reachable external MongoDB connection URI; Compose requires it. |
| `MONGODB_DB` | Explicit API and migration target. Use the approved staging database for acceptance; production requires its separate authorization and opt-in. |
| `LKB_ALLOW_STAGING` | Must equal `lkb_staging` when selecting that staging database. |
| `OLLAMA_API_KEY` | Runtime Ollama Cloud text credential, forwarded only to API; never a build argument. |
| `OLLAMA_CLOUD_MODEL` / `OLLAMA_CLOUD_VERIFIER_MODEL` | Defaults `glm-5.3-flash` / `deepseek-v4.1-flash`. |
| `GEMINI_API_KEY` | Optional at startup; needed when the configured audio transcription path runs. |
| `VITE_API_BASE_URL` | Public API URL the user's browser can reach, e.g. `https://api.example.com`; baked into the frontend during build. Rebuild web when it changes. |
| `CORS_ORIGINS` | Comma-separated frontend origins including scheme and port, e.g. `https://kb.example.com`; must match the browser's frontend origin. |
| `WEB_PORT` | Host port mapped to nginx port 80; defaults to 8080. |

Plain `docker build -t lkb-api .` also builds the API. Its command is
`node apps/api/dist/server.js`; it runs as the image's `node` user. Supply credentials
at runtime and explicitly name the database, for example:

```sh
docker run -d --name lkb-api --env-file /secure/lkb-api.env -p 3300:3300 lkb-api
```

The web image's nginx configuration serves SPA deep links such as `/sessions`. It does
not proxy API requests. `VITE_API_BASE_URL` must therefore be the browser-reachable API
URL, not `http://api:3300` (the private Compose service address). Compose defaults to
`http://localhost:3300` for local use. DevOps supplies public hostnames, TLS termination
and external routing. Bind ports only where the chosen ingress can reach them.

## Data, health and optional integrations

MongoDB is external by default; the opt-in `local-dev` Mongo profile is for empty local
development data. Starting API/web does not copy local knowledge into a new database.
The image includes schema and configuration assets, but excludes `.env`, credential
files, raw recordings, transcripts, local browser profiles and QA artifacts through
`.dockerignore`.

For filesystem-backed `/brain` artifacts, mount the approved corpus directories at
`/app/data` and `/app/raw` read-only, preserving their repository-relative layout.
These mounts are optional and are not created by Compose. Ensure directories and
files are readable/traversable by the API's `node` user (UID 1000 on the Node image).
Writable operator workflows need separate explicitly owned directories.

The API image probes unauthenticated `/health`; failure to ping MongoDB or read watcher
health produces an unhealthy container. The web image probes `/` on `${PORT}` (default 80). Compose's
restart policy restarts exited processes; an unhealthy status alone does not restart
a container. Configure alerts/recovery in the deployment platform.

These images package API and web. The Python transcription worker, upload producer,
watchers, scheduler and browser/OBS capture processes require separate deployment and
their own prerequisites. Optional Claude fallback requires an installed/authenticated
`claude` CLI, Ollama requires a reachable server, and Calendar/Gmail integrations require
the `gws` CLI and its authentication. Those binaries and credentials are not supplied by
these images. Configure any optional integration environment on the specific service;
Compose forwards only values explicitly listed under that service's `environment`.

## Migrations and release checks

Schema migration is deliberately opt-in. Normal `docker compose up` does not run it.
The `migrate` profile uses the root Dockerfile's `build` target and read-only mounts of
migration scripts, migration configuration and schemas. Name an isolated work database
explicitly for validation:

```sh
MONGODB_DB=lkb_work_dockercheck docker compose --profile migrate run --rm migrate
```

This command writes to the selected database. Production migration remains an owner
approved operation and requires both `MONGODB_DB=lkb` and
`LKB_I_KNOW_THIS_IS_PRODUCTION=1`; packaging does not authorize executing it.

Before promoting images, build both targets, validate Compose configuration, and test
the API health/authentication and browser-to-API request path against an isolated
database. Check a direct SPA deep link and verify the deployed origins/URLs. Build CI
can verify image construction without database credentials or provider calls. Successful
image builds do not establish the remaining T-051 operational/live-release acceptance.

## DevOps quick start

Plain `docker build .` produces the Cloud Run-ready API image (default target `api`):

```sh
docker build -t lkb-api .
docker build --target web --build-arg VITE_API_BASE_URL=https://api.example.com -t lkb-web .
docker run --rm -e PORT=8080 -e MONGODB_URL=... -e MONGODB_DB=... -e OLLAMA_API_KEY=... -p 8080:8080 lkb-api
```

- Required runtime env names: `MONGODB_URL`, `MONGODB_DB`, `OLLAMA_API_KEY` (see the table above for optional names).
- Ports: the API listens on `PORT` (default 3300); the `web` image's nginx listens on `PORT` (default 80). Cloud Run injects `PORT`; no flag needed.
- Entrypoint: `startup-diagnostics.sh` prints UID, `PORT` and whether each required variable is set or MISSING (never the values), then `exec`s `node apps/api/dist/server.js`.
- The build checks `apps/api/dist/server.js` and `source-worker.js` exist and parse (`node --check`).
- Runs as the non-root `node` user (UID 1000). The sibling autoTesting image uses UID 10001; switching needs a matching change to the state-volume `chown` in `scripts/qa/container-workflows/run.sh`.
- Health: `/health` (Cloud Run uses its own startup/liveness probes; the Dockerfile `HEALTHCHECK` is ignored there).
- CI (`.github/workflows/docker.yml`, job `build-targets`) builds the `api` and `web` targets with `push: false`; no registry credentials are involved.

## Send-now host (which process to run)

`POST /calendar/send-now` (and `GET /calendar/send-now/jobs*`) is served by exactly one supported process: `scripts/webinar/join-rules-api-host.ts` (ruling 6, ISS-SENDNOWAPI-004). Run it with `node --import tsx scripts/webinar/join-rules-api-host.ts --i-know-this-is-production` on the capture host (ISS-LEGACYSEED-004: `MONGODB_URL` is required (no localhost fallback). A production start needs `MONGODB_DB=lkb` and the `--i-know-this-is-production` argument; any other start needs `MONGO_WORK_DB=<isolated db>` (`MONGODB_DB`, if set, must equal it).); it needs a key carrying the `send-now` scope.

- A plain API start (`apps/api/src/index.ts`, or the `lkb-api` container's `node apps/api/dist/server.js`) intentionally has no send-now launcher. Authenticated callers with the `send-now` scope get `503 {"error":"send_now_unavailable","message":"send-now is served by the join-rules API host; no bot was sent"}`; keys without the scope get 403. This is by design, not a fault: `apps/*` may not import `packages/meeting-bot`, so the real adapter lives only in the host script.
- Do not run both hosts against the same state directory; the host script takes a single-host lock.

