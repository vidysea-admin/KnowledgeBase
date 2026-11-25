# Verdict (coordinator B) — golive-launch-prep
Date: 2026-11-25 · Cycle checked: 0 · Bound to D:/KnowledgeBase/.worktrees/kb-golive · Policy-Version: proportional-verification/2026-11-22.19
Head checked: 8ba84690 (code 7aae458e) · Base: a9bbeb98 (equals `git merge-base HEAD release/kb-golive`)

## Check plan (step 0)
- Signals: logic changed (rate-limit key, live-verify script) -> affected tests + falsification floor; auth principal keying -> security read of `apps/api/src/rate-limit.ts` (dual-trigger cited, valid); no UI surface (verified from the diff: 8 files, none under apps/web or any rendered output) -> no Mode D, no persona walks (api-only + operator script); no prompt/LLM output -> no grader; no data artifact.
- Floor recompute (.19-2): `tick.mjs --route a9bbeb98..HEAD` -> floor L, dual false (only the `contracts` rule fired, for the two contract files). Manifest Tier L is not below the floor. The manifest's `dual-trigger: auth apps/api/src/rate-limit.ts:31` is a real file:line (I opened it: line 31 is the session-key return in `limiterKey`).
- Contract files: `git hash-object` of both contracts equals `c32c8bbc:qa/contracts/...` blobs (e92e1a75..., 250a93af...): byte-identical, not maker-edited.
- Sub-checkers: none spawned. SERIAL: the two units are small, test runs share the machine's ~1.7 GB headroom and the rules say one test run at a time; reading and falsification ran in this coordinator.
- Full suite: L auth unit -> `apps/api` package suite run once, concurrency 1. Repo-wide suite NOT run: `full-suite trigger: auth L unit` (for the pre-push check / CI).

## Evidence (all re-run by me, on this tree)
- `node --test --import tsx src/rate-limit.test.ts src/jobs/router.test.ts` (apps/api): 14 pass / 0 fail.
- `node --test --import tsx scripts/live-verify.test.mjs` (root): 18 pass / 0 fail.
- `tsc --noEmit -p tsconfig.json` (apps/api): exit 0.
- apps/api package suite (`src/**/*.test.ts`, concurrency 1, 1500 s cap): 2220 pass, 22 skip, 1 fail, last file cut off by my own 1500 s cap. The 1 fail is `activity-health/router.test.ts:60` "real production Mongo binding ... " with "upload queue operation timeout" (needs a real Mongo; that router does not import `rate-limit.ts`, and no changed file is in its closure): unrelated, environment. The cut-off file `user-accounts/viewer-guard.test.ts` re-run alone: 6 pass / 0 fail. Log: scratchpad `api-suite.log` (not committed).
- Criteria L2-C1..C5 and L1-C1..C6: each judged green on the named tests above, plus the falsifications below. L2-I1/I3: `git diff a9bbeb98..HEAD --name-status` lists no `auth.ts`, session guard, CSRF, viewer-guard or `server.ts`; `router.test.ts` (the only other importer of `createRateLimiter`) is green. L2-I2: 429 body and headers are asserted to carry no user/session/tenant id and `rate-limit.ts` adds no logging. L1-I1: the no-`--base` test pins local default target, no sign-in, exit 3; non-signed-in code paths are untouched (diff read in full). L1-I2: grep of the product diff finds no credential; the only password literals are throwaway test values.
- Security read of `limiterKey`: session + non-empty string `userId` -> `"\u0001" + JSON.stringify([tenantId, userId])`; everything else -> `auth?.tenantId` (old key), then `ipKeyGenerator`. Fields come only from `req.auth`, which `requireAuth` fills server-side (and strips `SESSION_FIELDS` from API-key records, auth.ts:101). A JSON array is injective for the pair; `isValidTenantId` (auth.ts:55-60, `CONTROL_CHARS` covers U+0001) means no API-key tenant can start with U+0001, so a session bucket cannot equal a key bucket, and IPs never start with it. A session with no userId keeps the tenant bucket (cannot escape the limit). No defect found.
- Real-server fit of the script (read, not run): login route returns `state/user/csrfToken` + Set-Cookie (`auth-service.ts:209`, `cookie.ts` names `__Secure-lkb_sid` / `lkb_sid`; the regex `/lkb_sid=./` matches both); header `x-lkb-csrf` and Origin check match `csrf.ts`; `/auth/session` answers 401 without a session (`auth-router.ts:122-128`); viewer scopes include `ask`, `sessions` (`roles.ts`); quotes carry `sessionRef, turnId, speakerRef, tStart, tEnd` (`ask/source-context.ts:60-61`); `POST /ingest` with `{}` is a 400 before any write (`routes/ingest.ts:29-33`).

## Capability coverage (falsification, 12 rows, each in its own throwaway copy outside the bound root, single named node)
Copies: scratchpad `glb/rl` (rate-limit, green-before 9/9) and `glb/lv` (live-verify, green-before 6/6 named nodes); junctions to node_modules only, no deletes. Every mutant a single hunk in a file named in "What changed".
| Row | Edit (my own, single hunk) | Red-after, assertion that fired |
|---|---|---|
| L2-C1 / C5 | `limiterKey` condition `false &&` (old tenant key) | 6 of 9 red incl. both [L2-C1] tests |
| L2-C1 session id | `[tenantId, sessionId]` | 1 red: "one viewer signing in again ... ONE bucket" |
| L2-C2 | `opts.max ?? 100` | 1 red: "default allowance stays 60" |
| L2-C3 | key reads `x-user-id` header | 1 red: "cannot pick or share another bucket with a forged header" |
| L2-C4 | naive `${tenant}:${user}` | 1 red: "users of one tenant stay separate ... separators" |
| L2-I2 | 429 message prefixed with `req.auth.userId` | 1 red: "a 429 keeps the existing body ... names no user or session" |
| L1-C1 | API built from `new URL(BASE).origin` | red: "a viewer signs in ..." (login HTTP 404) |
| L1-C2 | `console.log(LIVE_PASSWORD)` | red: "Zq7-co... is not on the console" |
| L1-C3 | `tEnd > tStart` -> `>=` | red: "ask: citation" FAIL line missing (citation step went PASS) |
| L1-C4 | existence control `exists = true` | red: "typo'd path is not a pass" |
| L1-C5 | sign-out pass condition `true` | red: "a sign-out that leaves the session alive is a FAIL" |
| L1-C6 | NOT-covered console line off | red: "sign-out is shown on a route ... lists the row steps" |
L1-I1, L2-I1, L2-I3: invariants of unchanged code; the diff stat plus the green re-runs are the evidence (no isolating edit exists). Mutants beyond the floor: 0.

## Criteria not judged here
- L1-C7 (run against the test tag exits 0, evidence header [GI1]) and L2-C6 (two-user probe on the tagged URL, instance count recorded): operator steps on a deployed address. Project rule and dispatch forbid running against any run.app / vidysea.com host. They are neither met nor failed by this verdict: this PASS covers the checkable criteria only and does not close L1-C7 / L2-C6 or goal row G01.
HUMAN_GATE-REQUEST: run the two operator steps (L1-C7 with a viewer account and operator key; L2-C6 with two viewer accounts of one tenant, recording the instance count first) on the test tag and record the results; the owner's yes is needed because both write to the deployment (login sessions, one Ask).

## Findings (non-blocking, wording or hardening; no FAIL)
PROPOSED-ISSUE: {"severity":"low","type":"hardening","file":"scripts/live-verify.mjs","line":361,"summary":"the route-existence control treats any status other than 0/404 as 'route exists' (`exists = c.status !== 0 && c.status !== 404`). A wrong or revoked LKB_API_KEY answers 401 on every path, so a typo'd POST path (a viewer gets 403 from the read-only guard before routing) would still read as 'refused and exists'. Contract wording is 'does not return 404', so the script conforms; the strict form would require the control to authenticate (2xx/400) before counting.","fix_direction":"count the control only when its status is not 404 AND not 401/5xx, or add a preliminary authenticated GET with the same key that must be 200"}
PROPOSED-ISSUE: {"severity":"low","type":"test-gap","file":"scripts/live-verify.test.mjs","line":349,"summary":"the 'only unsafe calls' assertion filters on /^(POST|PUT|PATCH|DELETE) / so the operator-key control `KEY POST /ingest` (empty body) is outside it. It is safe today (ingest answers 400 before any write, routes/ingest.ts:29-33) but L1-C6 'no data-changing call other than login, logout and Ask' is not asserted for control requests.","fix_direction":"also assert the KEY-prefixed requests are only the four existence controls"}
Observation, not an issue: the limiter store is in memory per instance (declared out of scope by L2).

VERDICT: PASS
SCOREBOARD: 11/13 criteria met (L1-C1..C6, L2-C1..C5; L1-C7 and L2-C6 are operator steps, not judged here), 5/5 invariants hold
TIER: L (auth: `apps/api/src/rate-limit.ts:31` keys the limiter on the authenticated session principal; floor recompute L, matches the manifest)
FAILURES: none
CAPABILITY-COVERAGE: 12/12 rows reproduced (green-before in copy, red-after on the named assertion)
LIVE-BROWSER: not-applicable (changed paths: apps/api/src/rate-limit.ts, apps/api/src/rate-limit.test.ts, scripts/live-verify.mjs, scripts/live-verify.test.mjs, scripts/live-verify.pinned-question.json, qa/*)
ISSUES-WRITTEN: none (dual check: findings are P1, P2 above as PROPOSED-ISSUE lines)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Both units hold up on evidence I produced: the limiter key is injective, server-sourced and cannot alias an API-key bucket; the script's checks each go red on their named falsification and fit the real routes I read. One environment-only red (activity-health Mongo) in the apps/api suite is unrelated to the diff. L1-C7 and L2-C6 stay open for the operator on the tagged URL; `full-suite trigger: auth L unit` is left for the pre-push check.
Metrics: start=2026-11-25T07:25:32Z end=2026-11-25T07:56:00Z wall_min=30 agent_min=30 blocked_min=0 suite_runs=1 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=1830 mutants=0 defects_unit=0 defects_6c=0
slow: apps/api package suite 24 min (concurrency 1, 2200+ tests; policy .7 auth L unit)
