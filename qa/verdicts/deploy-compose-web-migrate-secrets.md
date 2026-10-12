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

---

# Cycle checked: 1

VERDICT: FAIL
Cycle checked: 1
Commit checked: 01238e5 (lane/deploycompose), against the merged apps/api/Dockerfile (main HEAD, from 643c096). Cycle 0 FAIL was 3f6dfe2. Docker not installed; nothing built or run.

## EXPLANATION

Three cycle-0 findings are fixed, but the fix exposes a fourth defect that makes the migrate command fail: ISS-DEPLOYCOMPOSE-006 (high).

- ISS-DEPLOYCOMPOSE-006 (new, blocking): all four migrations do `readFileSync(join(__dirname, "..", "schema", "index.json"))`. With `./migrations` bind-mounted at /app/migrations that is /app/schema/index.json. The merged Dockerfile's `build` stage copies only manifests, packages/ and apps/api (`COPY schema` is in the runtime stage only), and compose mounts only migrations and the config. The first migration (baseline) dies with ENOENT. Fix: add `./schema:/app/schema:ro` to the migrate service.
- Verified OK in the merged Dockerfile: stages are base, manifests, build, prod-deps, runtime; `target: build` exists. `build` = manifests (root package.json lists migrate-mongo 14.0.7 and dotenv 17.4.2; lockfile importer `.` has migrate-mongo) + `pnpm install --frozen-lockfile` at WORKDIR /app, no `--prod`, so /app/node_modules/.bin/migrate-mongo (npx) and dotenv/config resolve. The config's `migrationsDir: "migrations"` resolves relative to /app. Config and migrations exist at repo root and are tracked.
- ISS-DEPLOYCOMPOSE-005 fixed: js-yaml 4.3.2 parse: migrate `profiles ["migrate"]`; api has no depends_on and no profile; web depends_on api only; local-mongo `local-dev`. A plain `up` neither builds nor starts migrate, and api starts without it. The documented command `docker compose --profile migrate run --rm migrate` is consistent. Not run (no docker).
- ISS-DEPLOYCOMPOSE-004 fixed: .env.example CORS_ORIGINS equals the compose default and includes :8080 on localhost and 127.0.0.1.
- ISS-DEPLOYCOMPOSE-003: the missing-stage defect is gone, but the row stays open because the migrate service still cannot do its job (see -006); close it with -006.
- .dockerignore vs merged Dockerfile COPY lines (package manifests, packages, apps/api, schema, config): none excluded (qa, raw, data, .env* are the only relevant exclusions; `config/client_secret.json` excluded, `.env.example` kept). Compatible.
- No secrets: grep for credentialed Mongo URIs, AIza, sk- in compose/.env.example/.dockerignore: none; only `.env.example` is tracked among .env files.
- Both trees clean before this section; no mutation was needed.

Rows: -004 and -005 set to verified; -003 left open; -001 and -002 unchanged.

ISSUES-WRITTEN: ISS-DEPLOYCOMPOSE-006 (high)

---

# Cycle checked: 2

VERDICT: PASS
Cycle checked: 2
Commit checked: 76e456a (lane/deploycompose), against the merged apps/api/Dockerfile (main HEAD). Docker not installed; nothing built or run.

## EXPLANATION

Independently listed every runtime read and resolved it (working_dir /app; `build` stage = root pnpm install, so /app/node_modules has dotenv 17.4.2 and migrate-mongo 14.0.7 from root package.json):

| Read | Resolves to | Source |
|---|---|---|
| `npx migrate-mongo` | /app/node_modules/.bin | build stage install |
| `-f migrate-mongo-config.cjs` | /app/migrate-mongo-config.cjs | bind mount |
| config `require("dotenv/config")` | /app/node_modules/dotenv | build stage |
| config MONGODB_URL / MONGODB_DB | process env | compose environment |
| config `migrationsDir: "migrations"` | /app/migrations (cwd-relative) | bind mount |
| 4 migrations `require("fs")`, `require("path")` | node builtins | n/a |
| 4 migrations `join(__dirname,"..","schema","index.json")` (baseline, meeting-candidates, source-watcher, watch-heartbeat) | /app/schema/index.json | NEW `./schema:/app/schema:ro` mount; file exists |
| tree-index-tenant-id | no requires, no file reads (db only) | n/a |

No unresolved read. The mounted schema/index.json is the repo copy the migrations were written against.

- `git diff 01238e5..76e456a`: only docker-compose.yml (+3 lines, the schema mount and comment), the issues ledger, manifest and verdict. No other production change.
- Compose parses (js-yaml 4.x): services migrate, api, web, local-mongo; migrate `profiles ["migrate"]`; api has no profile and no depends_on; web depends_on api only. Plain `up` neither builds nor runs migrate; api starts without it. Profile gating unchanged.
- No secrets: only `${VAR}` references in compose; no credentialed URIs or keys.
- Trees clean before this section.

Rows: ISS-DEPLOYCOMPOSE-003 and -006 set to verified. -001 and -002 unchanged (open, medium).

ISSUES-WRITTEN: none
