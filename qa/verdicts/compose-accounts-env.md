# Verdict - compose-accounts-env

**Cycle checked: 0**
**VERDICT: PASS**
**Date:** 2026-11-01
**Checker mode:** Mode A (single coordinator, fresh context, read-only toward the artifact). Policy proportional-verification/2026-10-19.17, Tier L, no dual check (config pass-through only).
**Product commit:** bc89648d (`docker-compose.yml` +14/-0, `docs/DECISIONS.md` +10; D-212 carries Approved-by: Umesh). The working-tree `docker-compose.yml` equals HEAD (git status clean for the file, `git diff bc89648d HEAD -- docker-compose.yml` empty).

## Criteria

| # | Criterion | Result | Evidence (independently re-run) |
|---|---|---|---|
| C1 | api env lists the 9 names, all value-less | PASS | `docker-compose.yml:89-97` hold exactly `AUTH_CSRF_SECRET, USER_SIGNUP_TENANT, USER_SIGNUP_DAILY_CAP, APP_PUBLIC_ORIGIN, APP_BASE_PATH, TRUST_PROXY_HOPS, WHATSAPP_ARCHIVER_API_URL, WHATSAPP_ARCHIVER_API_TOKEN, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP`, each `NAME:` with no value. `MONGODB_URL=x MONGODB_DB=y OLLAMA_API_KEY=z docker compose --env-file <empty> config` (exit 0) renders all 9 as `null` (absent from the shell stays unset, same as the existing T-028 names `LKB_HOSTING_STATE_DIR`, `WHATSAPP_MONGO_*`). With a dummy env file (APP_BASE_PATH=/kbtest, AUTH_CSRF_SECRET=dummy-not-real) the api block resolves those two to the dummy values and leaves TRUST_PROXY_HOPS `null`: pass-through works both ways. Every name is read by code (table below). |
| C2 | web env has `APP_USER_ACCOUNTS: ${APP_USER_ACCOUNTS:-}` | PASS | `docker-compose.yml:126`. Rendered `APP_USER_ACCOUNTS: ""` when absent, `"1"` when set. `apps/web/docker/40-lkb-runtime-config.sh:14-17` maps only exact `1`/`true` (case-insensitive) to `userAccounts: true`, else `false`, and writes only the literal boolean to `config.js`: empty default keeps the UI off, and the raw value is never exposed. |
| C3 | nothing else changed; compose parses; compose-reading tests green | PASS | `git show bc89648d --stat`: `docker-compose.yml | 14 +` only; diff has 0 deleted lines and every added line is a comment, a value-less api name or the one web line. `node --test --test-reporter=tap scripts/operations/compose-t028-env.test.mjs scripts/lib/dbguard2.test.mjs` -> 18 tests, 18 pass, 0 fail. `(apps/api) node --test --import tsx src/composition/vectorless-routing.test.ts` -> 4 pass, 0 fail. `docker compose config` exit 0. |

## Code-read confirmation of each forwarded name (grep apps/api/src, apps/web/docker)

| Name | Read at |
|---|---|
| AUTH_CSRF_SECRET | `apps/api/src/composition/integrations/user-accounts.ts:132,135,141`; length check `apps/api/src/user-accounts/csrf.ts:16-17` (typeof string and >= SECRET_MIN_BYTES) |
| USER_SIGNUP_TENANT | `user-accounts.ts:138-140` (trim, validate, else signup 503) |
| USER_SIGNUP_DAILY_CAP | `user-accounts.ts:123-126,141` (`parseSignupCap`) |
| APP_PUBLIC_ORIGIN | `user-accounts.ts:134,143`; `admin-service.ts:102,284` |
| APP_BASE_PATH | `user-accounts.ts:133` (`normalizeBasePath`, `cookie.ts:23-26`), `:143` |
| TRUST_PROXY_HOPS | `apps/api/src/server.ts:120`; `user-accounts.ts:34-41` (`parseTrustProxyHops`) |
| WHATSAPP_ARCHIVER_API_URL / _TOKEN / _ALLOW_PRIVATE_HTTP | `apps/api/src/whatsapp/archiver/config.ts:13-15,108-116`; `composition/integrations/knowledge.ts:41-43` |
| APP_USER_ACCOUNTS (web) | `apps/web/docker/40-lkb-runtime-config.sh:14` |

`buildUserAccounts(process.env, ...)` at `apps/api/src/composition/production.ts:265`, so container env is the only input.

## Value-less is the right form for each name

- `AUTH_CSRF_SECRET`: `${X:-}` would define "" and trip the `assertCsrfSecret` length check; value-less leaves undefined. Both fail closed (accounts off), but value-less keeps the "absent = undefined" rule and the clearer log line.
- `WHATSAPP_ARCHIVER_API_URL`/`_TOKEN`: `loadArchiverConfig` (`config.ts:111-115`) returns null when both empty; "" and undefined behave the same here. Still correct value-less; a defined-empty half pair would throw while undefined does not, so value-less is the safer form.
- `APP_BASE_PATH`: api value-less, web `${APP_BASE_PATH:-/}`. Same `.env` supplies both, so same value. When unset the api gets undefined and web gets `/`; `normalizeBasePath` maps undefined and "/" both to "" so the cookie Path stays consistent with the web root. No mismatch path found.
- `TRUST_PROXY_HOPS`, `USER_SIGNUP_*`, `APP_PUBLIC_ORIGIN`: all parsers treat undefined as "off/default/unset". Safe.
- No forwarded name should be removed. `AUTH_CSRF_SECRET` and the archiver token go only to the api service, never to web (web receives only `APP_USER_ACCOUNTS`, reduced to a boolean). `NODE_ENV=production` is set in the Dockerfile (lines 95, 107), so the cookie Secure flag is on without a compose line.

## Falsification (copies in D:/kb-scratch/e2e/fals/, working tree untouched)

- C1: copy `c1.yml` gives `AUTH_CSRF_SECRET` a value (`${AUTH_CSRF_SECRET:-}`): `docker compose config` shows `AUTH_CSRF_SECRET: ""` instead of `null`; value-less line count drops 51 -> 50. Copy `c1b.yml` drops `TRUST_PROXY_HOPS`: the name is absent from the rendered api env. Both are detected by this check.
- C2: copy `c2.yml` drops the web `APP_USER_ACCOUNTS` line: the rendered web env has no `APP_USER_ACCOUNTS`. Detected.
- C3: copy `c3.yml` changes `PORT: 3300` to `3301`: `diff` against `bc89648d:docker-compose.yml` shows exactly line 71, and the render shows `PORT: "3301"`. Detected.

## Notes (not filed)

- Static `docker compose config` shows unresolved value-less names as `null`; at `up` time compose omits them, which is the same behavior the T-028 names already rely on.
- A blank `NAME=` line in the server `.env` still defines an empty string (already documented in the compose comment at lines 74-76); `docs/DEVOPS-REDEPLOY-2026-11-01.md` should keep the instruction to comment out unused lines.
- No .env value was read or printed. The repo-root `.env` was bypassed with `--env-file` pointing at an empty file and a dummy file under D:/kb-scratch/e2e/tmp.

ISSUES-WRITTEN: none
