# Verdict - ua-deploy-cookie-proxy (A8 + runtime flag) - cycle 0
Date: 2026-10-30. Bound to D:/KnowledgeBase/.worktrees/ua-deploy. Base f57ce7e1, Head 0ad45a1c (product commit 0fd9a49c). Policy proportional-verification/2026-10-19.17.
Cycle checked: 0
Contract: docs/features/user-accounts/plan.md A8 (row 44, acceptance ~162), spec.md UA-15 / UA-23 / UA-26, manifest criteria D-1..D-5 (no qa/contracts file).

## Check plan
TIER: L (runtime flag in the container entrypoint script apps/web/docker/40-lkb-runtime-config.sh:11-19; config class, one checker, no auth/tenancy/prod-write code changed, so no dual). Diff: 1 shell script, 1 test, 1 `.d.ts` typing line, `.env.example`, `docs/user-accounts/ops.md` (new), `docs/DEVOPS-HANDOVER.md` 4b, manifest. Routed checks: D-4 code (re-run + falsification), D-1/D-2/D-3/D-5 document greps, a fact-check of every product-behaviour claim in ops.md against the API/nginx code, lint:structure (docs/tree stage), diff-scope read (4c). No UI, no persona walk, no live (host work is human), no full suite.

## Evidence (I ran it)
- D-4: `npx vitest run docker/runtime-config.test.ts src/api src/config` (cwd apps/web) -> 14 files, 171 passed, 0 failed. `npx tsc --noEmit -p apps/web` -> exit 0. Script read: `case` over lowercased `APP_USER_ACCOUNTS`; only `1|true` -> `true`, everything else `false`; the `printf` writes the literal `$accounts`, never the raw value. The web reader `apps/web/src/api/user-accounts.ts:18` checks `=== true`. ISS-UAWEB-004 deploy half closed by the flag.
- D-1: ops.md holds the env table (all 5 named variables plus `USER_SIGNUP_DAILY_CAP`, `APP_USER_ACCOUNTS`), cookie table (section 2), proxy chain (section 3: Cookie, Set-Cookie, Origin, X-Forwarded-For, X-Forwarded-Proto for `/knowledgebase/api/*`), forged-XFF curl (section 4), first admin (5), rollback (6), A8 checklist with evidence slots (8). Token greps all >= 1.
- D-2: `grep -nE '^(# )?(<names>)=.+' .env.example` -> only the pre-existing `# APP_BASE_PATH=/knowledgebase` (line 199, not in this diff, non-secret); every new line is name-only. DEVOPS-HANDOVER 4b names the six variables and points at ops.md. No secret value in any changed file (grep for long tokens: none).
- D-3: ops.md section 7 states same-origin serving or a dev proxy is required (cites ISS-UAWEB-005).
- D-5: `git diff --name-only f57ce7e1 HEAD | grep -c docker-compose.yml` -> 0.
- Fact-check of ops.md against code (all read by me): cookie name/attrs/Path/Max-Age `apps/api/src/user-accounts/cookie.ts:3-5,13,30,44`; `Secure` dropped only if not production + loopback (`cookie.ts:39`); `trust proxy` log `effective hops=N`, 0..5 rule, invalid -> 0 + warn (`composition/integrations/user-accounts.ts:33-41`); `user accounts disabled` log (`:130`); `APP_PUBLIC_ORIGIN` + `CORS_ORIGINS` are the allowed cookie origins (`:132`); daily cap 200 (`:122`); login limit 20/15 min per IP, 429 handler (`throttle.ts:99,102-108`); create-admin flags, stdin password, exit 0/1/3, `admin_bootstrap` event (`scripts/create-admin.mjs:1-32`); password min 12 (`password-policy.ts:17`); web nginx appends XFF, passes X-Forwarded-Proto, forwards Origin/Cookie by default (`apps/web/nginx.conf:28-31`); `NODE_ENV=production` in the images (`Dockerfile:95,107`). The expected `TRUST_PROXY_HOPS=2` chain arithmetic (socket = web nginx, hop 2 = front proxy, req.ip = real client) is consistent with Express semantics.
- Hint verified: `APP_BASE_PATH` is forwarded to `web` only (`docker-compose.yml:110`); the `api` environment block (`:49-83`) has no `APP_BASE_PATH`, `AUTH_CSRF_SECRET`, `USER_SIGNUP_TENANT`, `APP_PUBLIC_ORIGIN` or `TRUST_PROXY_HOPS`, and the api reads it at `user-accounts.ts:131`. The manifest open point 1 is accurate; the compose forwards are a real prerequisite for A9 and are correctly left to the Approved-by gate (not a defect of this unit).
- lint:structure with junctions for apps/web, apps/api and all 7 packages: `lint:structure: OK (10 stages, 0 failed)` (tracker, dependencies, lint-tests included). Junctions removed link-only; main-tree node_modules verified intact.
- 4c diff scope: 7 files, all listed in the manifest "What changed"; 3 removed lines, all in-place replacements (printf, echo, the `__LKB_CONFIG__` typing); no function/route/test/config key deleted.

## Falsification (copies outside the bound root, per-mutation byte backup, `timeout 120`, no EXIT trap)
Copy proven green first (27 passed) in each.
- F1 (floor, D-4 default-off): `*) accounts="false"` -> `"true"`: 8 failed / 19 passed (absent, `0`, ``, ` `, `false`, `yes`, `on`, `true;alert(1)`), assertion = `expected ... to contain 'userAccounts: false'`. Restored, `cmp` equal, `git hash-object` 6299ba9d = `git rev-parse HEAD:file`.
- F2 (beyond floor, raw value never written): printf arg `"$accounts"` -> `"${APP_USER_ACCOUNTS-}"`: 10 failed / 17 passed (`TRUE`, `True`, `1`, `yes`, `on`, injection string, absent). Restored, `cmp` equal, hash = HEAD blob.
D-1/D-2/D-3/D-5 are document or absence checks; the manifest declares them not mutated and the greps above reproduce each (floor for a document grep, recorded not run as code mutation, accepted).

## Result
VERDICT: PASS
SCOREBOARD: 5/5 criteria met (D-1..D-5), 0/0 invariants
TIER: L (config/runtime flag, apps/web/docker/40-lkb-runtime-config.sh:11-19)
FAILURES: none
CAPABILITY-COVERAGE: 2/2 code rows reproduced (D-4 default flip, raw-value write); D-1/D-2/D-3/D-5 not-applicable (document/absence greps)
LIVE-BROWSER: not-applicable (no UI path changed; container script, docs, typing line)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet (builder) / checker: claude-sonnet-subagent
EXPLANATION: The runtime flag is dark by default, turns on only for exactly `1`/`true` (any case), never echoes the raw value, and is covered by 14 new tests that go red under both mutants. The ops docs match the code on every behaviour I opened. Open points stand as declared: compose forwards (including APP_BASE_PATH to the api) are the gating prerequisite for A9, and `TRUST_PROXY_HOPS=2` stays an assumption until the human runs ops.md section 4. The manifest has no Metrics line; that is written by the maker at close-out and was not treated as a format gap.

PROPOSED-ISSUE: {"sev":"low","type":"doc-accuracy","file":"docs/user-accounts/ops.md","line":"section 1 USER_SIGNUP_TENANT row","detail":"Says signup and sign-in both answer 503 `signup_not_configured`. Code: signup answers `signup_not_configured` (apps/api/src/user-accounts/auth-router.ts:133), every other public route including login answers `auth_not_configured` (:119). The status 503 is right, only the error code string differs for sign-in.","fix_direction":"Name both codes in the row."}
PROPOSED-ISSUE: {"sev":"low","type":"doc-gap","file":"docs/user-accounts/ops.md","line":"section 1, paragraph after the table","detail":"The exact compose forward lines (including APP_BASE_PATH to the api service, the likely cause of a failed A9) exist only in qa/manifests/ua-deploy-cookie-proxy.md open point 1; the ops doc devops will read points at a qa file.","fix_direction":"Copy the names-only forward list into ops.md or DEVOPS-HANDOVER 4b so it travels with the docs when the Approved-by merge happens."}

Metrics: start=2026-10-30T13:22:53+05:30 end=2026-10-30T13:28:30+05:30 wall_min=6 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=337 mutants=1 defects_unit=0 defects_6c=0
