# compose-accounts-env

**Status:** checked-PASS (qa/verdicts/compose-accounts-env.md, cycle 0, 2026-11-01)
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config: docker-compose.yml)
Fix cycle: 0
Dual check: no - deploy config only: value-less env pass-through names, no auth/tenancy logic or data write changed; config stays L with one checker
Authorized-by: D-212 (Approved-by: Umesh, 2026-11-01)
Commit: bc89648d
Round: 1, est 10 min

## Why
docs/DEVOPS-REDEPLOY-2026-11-01.md BLOCKER: master's compose forwarded none of the user-accounts or archiver env, so a redeploy leaves accounts off, hides the sign-in UI and puts the cookie Path on /api.

## Acceptance criteria
- C1: api service environment lists AUTH_CSRF_SECRET, USER_SIGNUP_TENANT, USER_SIGNUP_DAILY_CAP, APP_PUBLIC_ORIGIN, APP_BASE_PATH, TRUST_PROXY_HOPS, WHATSAPP_ARCHIVER_API_URL, WHATSAPP_ARCHIVER_API_TOKEN, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP, all value-less (absent name stays undefined).
- C2: web service environment has APP_USER_ACCOUNTS: ${APP_USER_ACCOUNTS:-}.
- C3: nothing else in compose changes; compose still parses and existing compose-reading tests stay green.

## Evidence
Pre-check[C1]: bc89648d node --test scripts/operations/compose-t028-env.test.mjs -> pass (compose config -q exit 0; 9 value-less api lines in git show bc89648d)
Pre-check[C2]: bc89648d node --test --import tsx apps/api/src/composition/vectorless-routing.test.ts -> pass 4/4 (web line APP_USER_ACCOUNTS: ${APP_USER_ACCOUNTS:-} present)
Pre-check[C3]: bc89648d node --test scripts/lib/dbguard2.test.mjs -> pass (with C1 file 18/18; diff 14 insertions 0 deletions)
Tests[C1]: scripts/operations/compose-t028-env.test.mjs — pins the value-less pass-through rule for api env names in docker-compose.yml
Tests[C2]: apps/api/src/composition/vectorless-routing.test.ts — reads docker-compose.yml service env; guards the web/api env blocks still parse
Tests[C3]: scripts/lib/dbguard2.test.mjs — reads docker-compose.yml DB env guard lines that must stay unchanged
Falsification: none run by maker; checker runs one per criterion in a copy.
