# compose-ask-deadline-env

**Status:** checked-PASS
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config: docker-compose.yml)
Fix cycle: 0
Dual check: no - deploy config only: one value-less env pass-through name, no auth/tenancy logic or data write changed; config stays L with one checker
Authorized-by: Umesh in chat, 2026-11-01 (Haan, jodo); same pass-through pattern as D-212 (bc89648d)
Round: 1, est 10 min

## Why
docs/DEVOPS-REDEPLOY-2026-11-01.md: the Ask fast-path deadline defaults to 20 s (packages/ask/src/ask-v2.ts:29, override read at apps/api/src/answer-policy/application.ts:52-56) and a real LLM Ask took 26 s, so production would show stale with 0 sources (ISS-454). Compose did not forward LKB_ASK_FAST_DEADLINE_MS, so operators could not set it to 150000.

## Acceptance criteria
- C1: api service environment lists LKB_ASK_FAST_DEADLINE_MS as a value-less entry (absent from .env stays undefined, never an empty string), right after WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP.
- C2: docker-compose.yml diff is exactly one added line, 0 deletions; the runbook sentence says it is forwarded and to set LKB_ASK_FAST_DEADLINE_MS=150000 in the server .env.

## Evidence
Pre-check[C1]: a4d2f9fb node --test scripts/operations/compose-t028-env.test.mjs -> pass 6/6 (docker compose config --format json exit 0)
Pre-check[C2]: a4d2f9fb node --test scripts/operations/compose-t028-env.test.mjs -> pass (git diff --stat docker-compose.yml: 1 insertion, 0 deletions)
Tests[C1]: scripts/operations/compose-t028-env.test.mjs - ALL now includes ASK=[LKB_ASK_FAST_DEADLINE_MS]; pins value-less map entry, no value/default, forwarded verbatim when set, undefined when unset
Tests[C2]: scripts/operations/compose-t028-env.test.mjs - same file; docs line checked by reading docs/DEVOPS-REDEPLOY-2026-11-01.md line 116
Falsification: in a COPY (D:/kb-scratch/e2e/fals: the test file plus docker-compose.yml with the LKB_ASK_FAST_DEADLINE_MS line removed) the same test command gave pass 4 / fail 2: "C1/C2 static: the 9 names are value-less pass-through entries" and "C1/C2 behaviour: all 9 set in .env -> forwarded verbatim" both failed. The repo files were not mutated.
