# w26-composeenv: forward T-028 env to the api container without breaking auth when unset

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w26-composeenv.md
Fix cycle: 2
Lane: KnowledgeBase-lanes/w26-composeenv  Branch: lane/w26-composeenv  Base: 96463791
Candidate SHA: see `git log -1 lane/w26-composeenv` (the commit that adds this file)
Prior verdict: qa/verdicts/w26-composeenv.md (0906fc68), cycle 0 FAIL, reviewed 9113881b.

## Fix for cycle 0 finding 1
- Removed the five `${VAR:-}` lines from the api `environment:` block. Compose no longer defines any T-028 name by default, so hosting.ts:59 and source-jobs.ts:48 (`!== undefined`) see them undefined and auth works as before.
- Added `env_file: [{path: .env.t028, required: false}]` on api only. A separate file, not `.env`, because `.env` is copied from `.env.example` with many blank names that would all become defined-empty in the container. `.env.t028` is already ignored by `**/.env.*` in .gitignore and .dockerignore.
- State-dir defaults dropped (the code treats a set dir without the key as misconfigured); the guide now gives the exact paths to put in `.env.t028`. Named volumes and the Dockerfile node-owned mkdir are unchanged.
- `.env.example` documents the five names as comments only. Guide section 9 rewritten: use `.env.t028`, single-quote JSON, all five together, back up volumes and key, key is 64 hex.
- Auth code untouched. migrate, web and local-mongo services untouched (env_file is on api only).

## Fix cycle 2 (verdict 2d40f787, docs only)
- Guide prerequisites now require Docker Compose v2.24+ (older compose cannot parse `env_file` `required: false`), with an Ubuntu upgrade hint.
- Section 9 warns that a partially filled `.env.t028` makes every authenticated route 503: fill all five or none.

## Changed paths
docker-compose.yml, .env.example, docs/GO-LIVE-UBUNTU.md, qa/manifests/w26-composeenv.md (Dockerfile unchanged since cycle 0)

## Checks
- compose YAML parsed with js-yaml: api has env_file with required false, no LKB_HOSTING_*/LKB_COUNSELLOR_* in environment.
- Not verified: `docker compose config` / container start (no docker on this machine). Requires compose 2.24+ for `required: false`.
