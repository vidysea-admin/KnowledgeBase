# Manifest — ua-deploy-cookie-proxy
**Contract:** none specific; scope `docs/features/user-accounts/plan.md` A8 (row ~44, acceptance block ~162) and spec UA-15, UA-23, UA-26. Also closes the deploy half of ISS-UAWEB-004 and ISS-UAWEB-005. Authorization: D-206.
**Goal task:** user-accounts A8 (docs by the maker; host work is human) plus the runtime flag
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** no (docs plus a runtime config flag that only writes the literal `true` or `false` into the public `config.js`; no auth, tenancy, session or data-write code changed; the cookie behaviour itself is proven in A3 and A9)
**Persona walk:** skip (no new screen, flow or user type; the flag only reveals screens A7 already built)
**Issues addressed:** ISS-UAWEB-004 (flag written by the container), ISS-UAWEB-005 (dev same-origin note)
**Executor:** claude-sonnet (builder in worktree `.worktrees/ua-deploy`, branch `wave/ua-deploy`)
**Round:** one round, est 25 min, tier L (config/runtime flag and docs).

## Criteria
- D-1 `docs/user-accounts/ops.md` (new, plan names it) holds: the env table with names only (AUTH_CSRF_SECRET, USER_SIGNUP_TENANT=toc, APP_PUBLIC_ORIGIN, APP_BASE_PATH, TRUST_PROXY_HOPS); the base-path cookie note (Path=<base>/api, HttpOnly, SameSite=Strict, Secure); the vidysea.com proxy chain forwarding Cookie/Set-Cookie, Origin, X-Forwarded-For and X-Forwarded-Proto for /knowledgebase/api/*; the forged X-Forwarded-For curl check; first-admin script usage; rollback (unset USER_SIGNUP_TENANT / AUTH_CSRF_SECRET); and the A8 checklist with evidence slots for the human.
- D-2 `docs/DEVOPS-HANDOVER.md` has a user-accounts section that names the same variables and points at `ops.md`; `.env.example` carries name-only lines for those variables and no value for any of them.
- D-3 `ops.md` states that same-origin serving or a dev proxy is required in dev (ISS-UAWEB-005).
- D-4 `apps/web/docker/40-lkb-runtime-config.sh` writes `userAccounts` into `config.js`: `false` by default, `true` only when `APP_USER_ACCOUNTS` is exactly `1` or `true` (any case); any other value (including `yes`, `on`, a typo or an injection attempt) is `false` and the raw value is never written. `runtime-config.test.ts` covers true, false and absent (ISS-UAWEB-004).
- D-5 `docker-compose.yml` is not edited (enforcement path); the exact forward lines needed are listed in the open points below.

## What changed (base f57ce7e1, head 0fd9a49c)
- `apps/web/docker/40-lkb-runtime-config.sh`: a `case` over the lowercased `APP_USER_ACCOUNTS` yields `accounts=true|false`; the `printf` that writes `config.js` now emits `userAccounts: %s`; the final log line states it. The name follows the sibling flags in the same script (`APP_BASE_PATH`, `APP_API_BASE`).
- `apps/web/docker/runtime-config.test.ts`: 14 new cases (absent; `true`/`TRUE`/`True`/`1`; `false`/`0`/empty/`yes`/`on`/`true;alert(1)`/space; the generated `config.js` evaluated as a script under a base path).
- `apps/web/src/vite-env.d.ts`: `userAccounts?: boolean` added to the `__LKB_CONFIG__` typing (the reader in `apps/web/src/api/user-accounts.ts:18` already checks `=== true`).
- `docs/user-accounts/ops.md` (new), `docs/DEVOPS-HANDOVER.md` section 4b, `.env.example` name-only block.
- `docker-compose.yml`: untouched.

## Evidence
Pre-check[D-1]: 0fd9a49c grep-per-required-token over docs/user-accounts/ops.md and .env.example (6 env names x 2 files, 13 cookie/proxy/script/rollback tokens, 2 DEVOPS-HANDOVER pointers) -> 27 passed, 0 failed
Pre-check[D-2]: 0fd9a49c grep -nE '^(# )?(AUTH_CSRF_SECRET|USER_SIGNUP_TENANT|APP_PUBLIC_ORIGIN|TRUST_PROXY_HOPS|USER_SIGNUP_DAILY_CAP|APP_USER_ACCOUNTS)=.+' .env.example -> 1 passed, 0 failed (0 matches; the only NAME=value in the new docs is the non-secret USER_SIGNUP_TENANT=toc the task names)
Pre-check[D-3]: 0fd9a49c grep -c 'ISS-UAWEB-005' docs/user-accounts/ops.md -> 1 passed, 0 failed
Pre-check[D-4]: 0fd9a49c npx vitest run docker/runtime-config.test.ts src/api src/config (cwd apps/web) -> 171 passed, 0 failed
Pre-check[D-5]: 0fd9a49c git diff --name-only f57ce7e1 HEAD | grep -c docker-compose.yml -> 1 passed, 0 failed (count 0)
Note[D-4]: docker/runtime-config.test.ts alone is 27 passed, 0 failed; before the script change it was 13 failed and 14 passed (red first); npx tsc --noEmit -p apps/web exit 0.
Tests[D-1]: docs/user-accounts/ops.md .env.example — token presence by grep; the proxy and curl procedures are human-run (A8 checklist, A9 live proof)
Tests[D-2]: .env.example docs/DEVOPS-HANDOVER.md — grep for assigned values
Tests[D-3]: docs/user-accounts/ops.md — grep
Tests[D-4]: apps/web/docker/runtime-config.test.ts — runs the real shell script under sh and evaluates the emitted config.js
Tests[D-5]: git diff name-only — no test file; the criterion is an absence
Falsification[D-1]: delete the X-Forwarded-Proto token from ops.md and re-run the grep pre-check -> expected red (27 total, 1 failed); declared, not run as a code mutation because the check is a document grep.
Falsification[D-2]: add a line AUTH_CSRF_SECRET=abc to .env.example and re-run the value grep -> expected match (red); declared, not run (document grep).
Falsification[D-3]: remove the ISS-UAWEB-005 sentence -> grep count 0 (red); declared, not run.
Falsification[D-4]: three per-mutation byte-backup mutants of 40-lkb-runtime-config.sh (backup taken per mutation, timeout 120, restored and cmp-equal after each, no EXIT trap; git hash-object equals git rev-parse HEAD:file after commit): (a) default branch accounts="true" -> 8 failed, 19 passed; (b) the 1|true branch yields "false" -> 5 failed, 22 passed; (c) drop the lowercase fold -> 2 failed (TRUE and True), 25 passed; all restored -> 27 passed.
Falsification[D-5]: a one-line edit to docker-compose.yml would make the grep -c return 1; declared, not run.

## Environment notes
- Junctions created in the worktree for testing: `D:\KnowledgeBase\.worktrees\ua-deploy\node_modules` and `D:\KnowledgeBase\.worktrees\ua-deploy\apps\web\node_modules`, both to the main tree; removed link-only (`cmd /c rmdir`) before handback.
- `pnpm lint:structure` run in the worktree with only those two junctions: its `dependencies` stage fails with 817 `no-unresolvable-workspace-import` errors, all in `apps/api` and packages (no `apps/api/node_modules` junction, an environment gap, not a change here); the other 9 stages passed. This unit touches no file those rules cover beyond the `.d.ts` typing line.

## Open points (declared, not defects)
1. **`docker-compose.yml` forwards need `Approved-by: Umesh` (plan H-11).** Nothing below reaches a container until it is merged. Names only, value-less pass-through (an absent name stays undefined, as for the T-028 block):
   - `api` service `environment:` add `AUTH_CSRF_SECRET:` `USER_SIGNUP_TENANT:` `USER_SIGNUP_DAILY_CAP:` `APP_PUBLIC_ORIGIN:` `APP_BASE_PATH:` `TRUST_PROXY_HOPS:`
   - `web` service `environment:` add `APP_USER_ACCOUNTS: ${APP_USER_ACCOUNTS:-}`
   - **`APP_BASE_PATH` is currently forwarded to `web` only (docker-compose.yml:110), not to `api`.** The api builds the cookie `Path` from it (`apps/api/src/composition/integrations/user-accounts.ts:131`), so without the api forward the cookie is set on `/api` while the browser calls `/knowledgebase/api` and the cookie is never sent. This is the most likely cause of a failed A9. `NODE_ENV=production` is already set by the Dockerfile (lines 95 and 107), which the `Secure` cookie needs.
2. **`TRUST_PROXY_HOPS=2` is an [ASSUMPTION]** (front proxy, web nginx, API). The forged `X-Forwarded-For` check in `ops.md` section 4 is how the human confirms it; it is not run here (needs the real chain).
3. Host work is human and unperformed: front-proxy header forwarding (vidysea.com team, H-7), HTTPS, secret generation (H-8), first admin (H-9). The A8 checklist in `ops.md` section 8 has the evidence slots.
4. Mail sender (Q-A / H-1) is undecided; `ops.md` says so and points at the admin issue-link fallback.
5. The web container reads `APP_USER_ACCOUNTS` while the api is gated by `AUTH_CSRF_SECRET`; setting one without the other leaves the UI and server disagreeing (documented in `ops.md` section 1).
