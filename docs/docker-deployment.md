# Docker deployment

The root `Dockerfile` builds two independent production images. Its final/default target
is `api` (Node 24, port 3300); target `web` serves the compiled React SPA through nginx
(port 80). `docker-compose.yml` builds both from the root. Existing Dockerfiles under
`apps/` remain available for callers that already use them.

## Build and start

Run from the repository root on a Docker-equipped host:

```sh
docker build --target api -t lkb-api .
docker build --target web --build-arg VITE_API_BASE_URL=https://api.example.com -t lkb-web .
docker compose build api web
docker compose up -d api web
docker compose ps
```

Before the Compose commands, supply operator-managed environment values, using a
private `.env` file or the deployment system's secret store. `.env.example` documents
available names. Never commit credentials or pass them as Docker build arguments.

| Value | Deployment use |
| --- | --- |
| `MONGODB_URL` | Reachable external MongoDB connection URI; Compose requires it. |
| `MONGODB_DB` | Explicit database name for standalone API containers and opt-in migration commands. Compose's API explicitly uses `lkb`; never omit the standalone value. |
| `GEMINI_API_KEY` | Runtime AI credential; required by Compose. |
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
health produces an unhealthy container. The web image probes `/` on port 80. Compose's
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
