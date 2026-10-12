# deploy-compose-web-migrate-secrets

**Handshake status:** ready-for-check
Fix cycle: 0
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
