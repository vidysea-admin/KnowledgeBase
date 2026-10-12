# deploy-compose-web-migrate-secrets

**Handshake status:** ready-for-check
Fix cycle: 2
Tier: roadmap (deployment readiness D3 + D5 + D6). Class: deployment config, no application code; no data writes executed. Verdict by the checker only.
Lane: lane/deploycompose. Lane ledger `qa/issues.deploycompose.jsonl`: ISS-DEPLOYCOMPOSE-001, -002 (both medium).

## Scope
Edited: `docker-compose.yml`, `.dockerignore`, `.env.example`. New: this manifest, `qa/issues.deploycompose.jsonl`. Not touched: Dockerfiles, apps/api source, nginx.conf, migrations/, .gitignore (already sufficient).

## Compose services now defined
`migrate` (one-shot), `api` (existing, now `depends_on: migrate: condition: service_completed_successfully`), `web` (new, `depends_on: api`, host port `${WEB_PORT:-8080}` -> 80, build arg `VITE_API_BASE_URL` default `http://localhost:3300`), `local-mongo` (unchanged; profile is `local-dev`).

## Migrate design
Builds `apps/api/Dockerfile` with `target: deps`, runs `npx migrate-mongo up -f migrate-mongo-config.cjs`, `restart: "no"`. Env: the same `MONGODB_URL` (required) / `MONGODB_DB` (default lkb) as api. `./migrations` and `./migrate-mongo-config.cjs` are bind-mounted read-only because the api runtime stage does not ship them (coupling: ISS-DEPLOYCOMPOSE-001). Nothing was run against any database. **A production run needs the owner's approval (D-117: production DB writes not authorized).** Note a plain `docker compose up` now runs migrations before api; for production, the owner must decide whether that is wanted.

## Secrets audit (D6)
- `git ls-files config/` -> `config/ai-routing.yaml` only. `config/client_secret.json` is NOT tracked; `git check-ignore -v` confirms `.gitignore:5:/config/client_secret.json`. No HIGH issue filed.
- `git ls-files | grep -iE "secret|token|credential|\.env$|\.pem$|key\.json"` -> names only: `.env.example`, `apps/web/.env.example` (templates), `config/ai-routing.yaml` is not a match (listed by the dir check), `packages/ai/src/providers/gemini-credentials.test.ts`, `packages/index/src/pipeline/quote/quote-token-rule.ts`, `quote-verify-token.test.ts`, `qa/token-ledger.jsonl`, and qa manifests/verdicts/evidence with "credential"/"token" in the name. All are source/test/QA files by name; contents not opened, not verified to be free of secrets. No `.env`, `.pem`, `key.json` tracked.
- `.gitignore` already covers `**/.env`, `**/.env.*` (not `.env.example`), `**/dist/`, `/config/client_secret.json`: verified with `git check-ignore -v`. No change.

## Build context and .env.example
- `.dockerignore` rewritten: excludes .git, node_modules, dist, .env* (keeps .env.example), config/client_secret.json and `*client_secret*.json`, pem/key files, raw, data, qa, KnowledgeBase-lanes, recordings, reference, .claude, caches. Kept IN the context: `apps/*/src`, `packages/*/src`, `config/ai-routing.yaml`, `migrations/`, workspace package.json files, lockfile. The previous `*.png` rule was dropped (no tracked png under apps/ or packages/ at the time of check).
- `.env.example`: grepped `process.env.X` in apps/api/src, packages/*/src, workers (45 names); every name present except test fixture/OS vars (APPDATA, PATH, USERDOMAIN, FAKE_*, HOLD_MS, LOCK_STRESS_ROUNDS, LKB_FIXTURE_*, D2_FIXTURE_PYTHON, S) and `TELEMETRY_TRACE_FILE`, which I added with `WEB_PORT` (compose). All compose `${VAR}` names exist in .env.example (checked). No values.

## Evidence
docker is NOT installed here (`which docker` -> not found), so `docker compose config` was not run. Fallback: parsed with js-yaml 4.3.2 from the main tree's node_modules (no install):
`services = [migrate, api, web, local-mongo]`; `api.depends_on = {migrate:{condition:service_completed_successfully}}`; `web.depends_on = [api]`; `migrate.build.target = deps`; `web.build.args.VITE_API_BASE_URL` set; `local-mongo.profiles = [local-dev]`. This proves YAML validity and structure only, not compose semantics.

## NOT covered
- No image built, nothing started, no migration run; `docker compose config` never executed.
- `target: deps` and bind-mounts depend on the deploybuild lane keeping the `deps` stage (ISS-DEPLOYCOMPOSE-001); re-verify after it merges.
- Web-to-api path, hostnames, ports exposed publicly, TLS: owner decisions, left as placeholders (ISS-DEPLOYCOMPOSE-002).
- Tracked-secret scan was by file NAME only; no content scan, no history scan.

## Fix cycle 1 (responds to verdict cycle 0: ISS-DEPLOYCOMPOSE-003, -004, -005)
- **-003 (high):** `migrate.build.target` is now `build`. Read 643c096's apps/api/Dockerfile: stages are base, manifests, build, prod-deps, runtime (no `deps`). `build` = manifests (root package.json, which lists migrate-mongo 14.0.7 and dotenv 17.4.2) + `pnpm install --frozen-lockfile` at WORKDIR /app, so `/app/node_modules/.bin/migrate-mongo` and `dotenv/config` resolve; the existing `working_dir: /app`, `npx migrate-mongo up -f migrate-mongo-config.cjs` and the read-only bind mounts to /app/migrations and /app/migrate-mongo-config.cjs are consistent with that layout (the config's `migrationsDir: "migrations"` is relative to /app). The `build` stage also runs the api bundle step; accepted cost, no dedicated migrate stage (Dockerfiles not editable here).
- **-004 (medium):** `.env.example` CORS_ORIGINS now `http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080`, equal to the compose default.
- **-005 (medium):** `migrate` has `profiles: ["migrate"]`; api's `depends_on: migrate` is removed. A plain `docker compose up` neither builds nor runs migrate. Explicit command: `docker compose --profile migrate run --rm migrate`. Running it against production needs the owner's approval (D-117: production DB writes are not authorized); it migrates the database named by MONGODB_URL / MONGODB_DB in .env. Documented in the compose file comment.
- **Evidence** (js-yaml 4.3.2, structural only; docker not installed, `docker compose config` not run): Dockerfile stages `base,manifests,build,prod-deps,runtime`; `migrate profiles ["migrate"] target build EXISTS`; `api profiles [] depends_on null`; `web depends_on ["api"]`; `local-mongo profiles ["local-dev"]`. Every `target:` in the file exists in 643c096.
- **Still open / not covered:** no image built, no migration run; ISS-001 (coupling to stage name `build`, bind mounts) and -002 stay open; ledger statuses untouched; re-verify after both lanes merge.

## Fix cycle 2 (responds to verdict cycle 1: ISS-DEPLOYCOMPOSE-006, high)
- **-006:** added `./schema:/app/schema:ro` to the `migrate` service volumes (Dockerfiles untouched). Four migrations (baseline, meeting-candidates, source-watcher, watch-heartbeat) do `readFileSync(join(__dirname,"..","schema","index.json"))`; with `./migrations` at /app/migrations that is /app/schema/index.json, which the `build` stage lacks (`COPY schema` is runtime-only in the merged Dockerfile).
- **Runtime-file audit** (grep of `require|readFileSync|__dirname|join(|import(|process.env` in migrations/*.cjs and migrate-mongo-config.cjs; merged Dockerfile read from main HEAD):

| File read at runtime | Needed by | Resolved in migrate container by |
|---|---|---|
| /app/migrate-mongo-config.cjs | migrate-mongo `-f` | bind mount (ro) |
| /app/migrations/*.cjs (5 files) | migrate-mongo `migrationsDir: "migrations"` (cwd /app) | bind mount (ro) |
| /app/schema/index.json | 4 migrations (tenant-id migration reads nothing) | NEW bind mount `./schema:/app/schema:ro` |
| `dotenv/config` | config | /app/node_modules (build stage root install; dotenv 17.4.2) |
| `migrate-mongo` CLI (npx) | command | /app/node_modules/.bin (migrate-mongo 14.0.7) |
| `fs`, `path` | migrations | node builtins |
| MONGODB_URL / MONGODB_DB (env) | config | compose `environment` |
No other `require`/file reads found; schema/index.json contains no `$ref` or further file paths (grep count 0), and the whole schema/ directory is mounted anyway. A `.env` file is not needed (env is passed by compose).
- **Evidence** (js-yaml, structural only; docker not installed): services migrate,api,web,local-mongo   migrate volumes ["./migrations:/app/migrations:ro","./migrate-mongo-config.cjs:/app/migrate-mongo-config.cjs:ro","./schema:/app/schema:ro"]   profiles ["migrate"]   target build schema/index.json exists: true 
- NOT covered: no image built, no migration run, `docker compose config` never executed.
