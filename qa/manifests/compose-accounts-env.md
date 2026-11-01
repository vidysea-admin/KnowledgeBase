# compose-accounts-env

**Status:** ready-for-check
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config: docker-compose.yml)
Fix cycle: 0
Dual check: no - deploy config only: value-less env pass-through names, no auth/tenancy logic or data write changed; config stays L with one checker
Authorized-by: D-212 (Approved-by: Umesh, 2026-11-01)
Commit: bc89648d
Round: 1 (single small config diff)

## Why
docs/DEVOPS-REDEPLOY-2026-11-01.md BLOCKER: master's compose forwarded none of the user-accounts or archiver env, so a redeploy leaves accounts off, hides the sign-in UI and puts the cookie Path on /api.

## Acceptance criteria
- C1: api service environment lists AUTH_CSRF_SECRET, USER_SIGNUP_TENANT, USER_SIGNUP_DAILY_CAP, APP_PUBLIC_ORIGIN, APP_BASE_PATH, TRUST_PROXY_HOPS, WHATSAPP_ARCHIVER_API_URL, WHATSAPP_ARCHIVER_API_TOKEN, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP, all value-less (absent name stays undefined).
- C2: web service environment has APP_USER_ACCOUNTS: ${APP_USER_ACCOUNTS:-}.
- C3: nothing else in compose changes; compose still parses and existing compose-reading tests stay green.

## Evidence
Pre-check[C1]: bc89648d MONGODB_URL=x MONGODB_DB=y OLLAMA_API_KEY=z docker compose config -q -> exit 0 (COMPOSE_CONFIG_OK); git show bc89648d -- docker-compose.yml shows the 9 value-less api lines
Pre-check[C2]: bc89648d git show bc89648d -- docker-compose.yml -> web line APP_USER_ACCOUNTS: ${APP_USER_ACCOUNTS:-}
Pre-check[C3]: bc89648d node --test scripts/operations/compose-t028-env.test.mjs scripts/lib/dbguard2.test.mjs -> 18/18 pass; node --test --import tsx apps/api/src/composition/vectorless-routing.test.ts -> 4/4 pass; git diff --stat = 14 insertions, 0 deletions
Tests[C1-C3]: scripts/operations/compose-t028-env.test.mjs, scripts/lib/dbguard2.test.mjs, apps/api/src/composition/vectorless-routing.test.ts
Falsification: none run by maker; checker to run one per criterion in a copy.
