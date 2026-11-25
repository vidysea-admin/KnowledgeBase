# Manifest — golive-launch-prep
**Contract:** qa/contracts/live-verify-script.md and qa/contracts/api-rate-limit.md (criteria listed on the Criteria line below)
**Goal task:** none
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/rate-limit.ts:31 (the diff changes how the authenticated session principal is keyed in the limiter: `limiterKey` reads `req.auth.principal/tenantId/userId`)
**Persona walk:** skip (no screen, flow or user type changed; an API middleware and an operator script)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** two small units with a precise design from the plan and contracts; no external executor was worthy.

## What changed
Branch `release/kb-golive` off `a9bbeb98`; contracts brought in from `c32c8bbc` unedited at `70010564`; code at `7aae458e`.
- apps/api/src/rate-limit.ts:18-34 — new `limiterKey(auth)`: a session principal with a non-empty `userId` is keyed on `"\u0001" + JSON.stringify([tenantId, userId])`; API keys keep `tenantId`; no principal falls through to `ipKeyGenerator`. `keyGenerator` at line 47 calls it. Window 60 000 ms, max 60, the 429 body and `Retry-After` are untouched. Mount at `server.ts:137` untouched.
- apps/api/src/rate-limit.test.ts (new, 9 tests) — drives the real `requireAuth` -> `createRateLimiter` chain over HTTP.
- scripts/live-verify.mjs — `--base` (http/https only, base path and trailing slash handled, API at `<base>/api`); signed-in mode from `LKB_LIVE_EMAIL` / `LKB_LIVE_PASSWORD` (no `--password`/`--email` flag); ask step with a citation check (speaker, start, end, end > start) and an opened-turn check (same id, same speaker, same time range); four viewer refusals that need exactly 401/403 and an operator-key existence control; sign-out proof on every route that answered 200 before it; a "NOT covered" list on console and in `summary.md`; clean exit on Windows (closes the undici pool instead of `process.exit` in signed-in mode). Without `--base` and without credentials nothing changes (L1-I1).
- scripts/live-verify.pinned-question.json (new DATA file, not a module) — the pinned UC question, kept in a committed file as L1-C3 requires. Flagged below.
- scripts/live-verify.test.mjs (new, 18 tests) — child-process runs against a stub HTTP server that reuses the real `csrf.ts`, `roles.ts`, `viewer-guard.ts`.
- falsified (unchanged): none. All falsifications ran on throwaway copies outside the worktree.

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (auth: the limiter key is derived from the authenticated principal; dual-trigger above)
Round: 5 files, 17 criteria (L1 9 + L2 9, two operator-only), est 60 min — two small files plus two test files and one data file
Criteria: `L1-C1`, `L1-C2`, `L1-C3`, `L1-C4`, `L1-C5`, `L1-C6`, `L1-I1`, `L1-I2`, `L2-C1`, `L2-C2`, `L2-C3`, `L2-C4`, `L2-C5`, `L2-I1`, `L2-I2`, `L2-I3` (L1-C7 and L2-C6 are operator steps on the test tag, listed under "Operator steps (not run)")
Owners: rate-limit (apps/api/src/rate-limit*.ts), live-verify (scripts/live-verify*)
Fan-out: both groups were built by this one builder in sequence; the groups share no file, port or state. SERIAL: live-verify waits on rate-limit only because one builder owns both.
Base / checked state: base a9bbeb98; head 7aae458e; worktree clean apart from this manifest.
Gate answers: none — no gate file applies; consent is out of scope (D-210); nothing writes to `lkb_prod`; no push, no deploy.
Affected tests / full-suite trigger: apps/api/src/rate-limit.test.ts (new), scripts/live-verify.test.mjs (new), apps/api/src/jobs/router.test.ts (the only other test importing the limiter, run for L2-I3). No full-suite trigger: no shared type or export changed (`createRateLimiter` signature is identical). The builder ran no full suite.
Tests[L1-C1]: scripts/live-verify.test.mjs::"a viewer signs in, asks ... [L1-C1]", "a base that is not an http(s) URL exits non-zero ... [L1-C1]", "without --base and without credentials the script behaves as before ... [L1-C1][L1-I1]" — base path and trailing slash are exercised by the stub base `<origin>/knowledgebase/`; ftp, junk and file: bases exit 5.
Tests[L1-C2]: scripts/live-verify.test.mjs::"no secret (password, operator key, session cookie, CSRF proof) appears in stdout, stderr or any written file ... [L1-C2]", "a wrong password stops at sign-in ...", "missing credentials ...", "a deployment that sets the Secure session cookie name ..." — the sentinel scan covers the password, operator key, cookie token and CSRF proof across stdout, stderr and every written file; `--password` is refused with exit 5.
Tests[L1-C3]: scripts/live-verify.test.mjs::"an answer whose citation has no speaker, no end time or no citation at all is a FAIL", "a cited turn that does not exist ...", "a citation whose end is not after its start, or a cited turn whose time range differs, is a FAIL", "the pinned question is read from the committed file, not written inline ..." — the first two prove the citation and cited-turn checks FAIL on bad answers, the third the strict end-after-start and time-range match, the fourth that the question comes from the committed file
Tests[L1-C4]: scripts/live-verify.test.mjs::"a viewer who can reach an admin route is a FAIL", "a refusal on a route that does not exist (typo'd path) is not a pass", "without an operator key the four refusal steps FAIL ...", "a refusal must be exactly 401 or 403 ...", "an admin account cannot stand in for the viewer ..." — the stub makes the viewer reach an admin route, hides a route, removes the operator key and returns a non-401/403, and each must FAIL; an admin account cannot pass
Tests[L1-C5]: scripts/live-verify.test.mjs::"a sign-out that leaves the session alive is a FAIL [L1-C5]", "sign-out is shown on a route that answered 200 before it ... [L1-C5][L1-C6]" — the first leaves the session alive after logout and must FAIL; the second shows the PASS line names routes that answered 200 before sign-out
Tests[L1-C6]: scripts/live-verify.test.mjs::"sign-out is shown on a route that answered 200 before it, and the run lists the row steps it did not cover [L1-C5][L1-C6]" — also asserts the only unsafe calls are login, ask, the refused empty ingest probe and logout; the first test asserts one PASS/FAIL line per step and exit 2 on FAIL.
Tests[L1-C7]: none — operator step on the test tag (see "Operator steps (not run)"); not runnable without the tagged URL and a viewer account, and the brief forbids running the script against a deployed URL.
Tests[L1-I1]: scripts/live-verify.test.mjs::"without --base and without credentials the script behaves as before: local default target, no sign-in, INCONCLUSIVE exit 3 [L1-C1][L1-I1]" — no pre-existing `live-verify` test exists in the repo (grep), so there is nothing to keep green; this test pins the no-`--base` behaviour, flags and exit codes instead.
Tests[L1-I2]: scripts/live-verify.test.mjs::"an admin account cannot stand in for the viewer: the refusal steps FAIL instead of passing vacuously [L1-C4][L1-I2]" plus the secret-scan test — no credential is in the repo (the tests use `viewer@example.test` and a generated password).
Tests[L2-C1]: apps/api/src/rate-limit.test.ts::"two viewers browsing at once in one tenant each get the full allowance ... [L2-C1]", "one viewer signing in again on a second browser shares ONE bucket: the key is the user, never the session id [L2-C1]" — the first drives user A to 429 while user B keeps a full bucket; the second shows one user on two sessions shares one bucket
Tests[L2-C2]: apps/api/src/rate-limit.test.ts::"the default allowance stays 60 per minute for a session user", "one API-key client keeps the per-tenant bucket ...", "an anonymous burst ... is still limited per client address", "a 429 keeps the existing body and Retry-After ...", "a session principal with no user id falls back to today's tenant key ..." — default 60 per window, API-key tenant bucket unchanged, anonymous IP bucket unchanged, the 429 body and Retry-After unchanged, and no-userId sessions keep the tenant key
Tests[L2-C3]: apps/api/src/rate-limit.test.ts::"a viewer cannot pick or share another bucket with a forged header, query or body value [L2-C3]" — forged x-user-id, x-tenant-id and similar headers, query and body fields leave the bucket unchanged
Tests[L2-C4]: apps/api/src/rate-limit.test.ts::"users of one tenant stay separate even when ids contain separators or equal a tenant id; the session key can never be a tenant-only key [L2-C4]" — ids with separators, equal to a tenant id, and tenants named like every session-key spelling never collide
Tests[L2-C5]: apps/api/src/rate-limit.test.ts (all 9) — the L2-C5 criterion is the unit tests themselves, and each goes red on the old tenant-only key (capability table: C1, C1 session id, C2, C3, C4, I2 rows).
Tests[L2-C6]: none — operator step on the test tag (see "Operator steps (not run)").
Tests[L2-I1]: apps/api/src/jobs/router.test.ts (5 tests, mounts the real `requireAuth`) plus every test in rate-limit.test.ts, which mounts the real `requireAuth` — `auth.ts`, the session guard, CSRF and the viewer read-only guard are not edited by this unit (`git diff a9bbeb98 HEAD --stat` lists no such file).
Tests[L2-I2]: apps/api/src/rate-limit.test.ts::"a 429 keeps the existing body and Retry-After, and names no user or session [L2-C2][L2-I2]" — the 429 body and headers carry no user, session or tenant id; `rate-limit.ts` adds no logging.
Tests[L2-I3]: apps/api/src/jobs/router.test.ts — the only other importer of `createRateLimiter`; the diff touches only `rate-limit.ts` in `apps/api/src`.
Sibling: apps/api/src/server.ts:137 — not affected because the mount line and the `RateLimitOptions` signature are unchanged.
Sibling: apps/api/src/jobs/router.test.ts — not affected: re-run green on this SHA (5/5).
Pre-check[L1-C1]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-C2]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-C3]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-C4]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-C5]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-C6]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-C7]: 7aae458e not run -> OPERATOR STEP (needs the test-tag URL and a viewer account; brief forbids a deployed-URL run) t=0
Pre-check[L1-I1]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L1-I2]: 7aae458e node --test --import tsx scripts/live-verify.test.mjs -> 18 passed, 0 failed t=18 blobs=scripts/live-verify.test.mjs:0fe88b0
Pre-check[L2-C1]: 7aae458e node --test --import tsx src/rate-limit.test.ts -> 9 passed, 0 failed (cwd apps/api) t=2 blobs=apps/api/src/rate-limit.test.ts:87b29be
Pre-check[L2-C2]: 7aae458e node --test --import tsx src/rate-limit.test.ts -> 9 passed, 0 failed (cwd apps/api) t=2 blobs=apps/api/src/rate-limit.test.ts:87b29be
Pre-check[L2-C3]: 7aae458e node --test --import tsx src/rate-limit.test.ts -> 9 passed, 0 failed (cwd apps/api) t=2 blobs=apps/api/src/rate-limit.test.ts:87b29be
Pre-check[L2-C4]: 7aae458e node --test --import tsx src/rate-limit.test.ts -> 9 passed, 0 failed (cwd apps/api) t=2 blobs=apps/api/src/rate-limit.test.ts:87b29be
Pre-check[L2-C5]: 7aae458e node --test --import tsx src/rate-limit.test.ts -> 9 passed, 0 failed (cwd apps/api) t=2 blobs=apps/api/src/rate-limit.test.ts:87b29be
Pre-check[L2-C6]: 7aae458e not run -> OPERATOR STEP (needs the test-tag URL and two viewer accounts; brief forbids a deployed-URL run) t=0
Pre-check[L2-I1]: 7aae458e node --test --import tsx src/rate-limit.test.ts src/jobs/router.test.ts -> 14 passed, 0 failed (cwd apps/api) t=6 blobs=apps/api/src/rate-limit.test.ts:87b29be,apps/api/src/jobs/router.test.ts:5b077b2
Pre-check[L2-I2]: 7aae458e node --test --import tsx src/rate-limit.test.ts -> 9 passed, 0 failed (cwd apps/api) t=2 blobs=apps/api/src/rate-limit.test.ts:87b29be
Pre-check[L2-I3]: 7aae458e pnpm typecheck -> exit 0 (cwd apps/api) t=23
mutant-cap-raise: two units (L1 and L2) with 16 criteria checkable here; one falsifying edit per criterion row gives 12 distinct mutants (6 rate-limit, 6 live-verify), each shown red in the capability table
Metrics: start=2026-11-25T00:00:00Z end=2026-11-25T00:00:00Z wall_min=60 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=12 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=45 mutants=12 defects_unit=0 defects_6c=0

## How to verify (commands + expected)
- `node --test --import tsx src/rate-limit.test.ts` (cwd `apps/api`) -> expected: 9 pass, 0 fail
- `node --test --import tsx scripts/live-verify.test.mjs` (cwd worktree root) -> expected: 18 pass, 0 fail
- `node --test --import tsx src/jobs/router.test.ts` (cwd `apps/api`) -> expected: 5 pass, 0 fail
- `pnpm typecheck` (cwd `apps/api`) -> expected: exit 0
- Route set for L1-C4 (each requested as the signed-in viewer, each must answer 401 or 403): `GET /admin/users`, `POST /ingest` (empty body), `GET /whatsapp/groups`, `GET /meeting-bot/privacy`. Each is also asked with an operator key and an empty body; the answer must not be 404 (a POST gets its own 400 from validation, so nothing is ingested).

## Actual outputs (from maker's own run)
On 7aae458e (tests ran 35 s together):
```
rate-limit.test.ts : ℹ tests 9  ℹ pass 9  ℹ fail 0
live-verify.test.mjs: ℹ tests 18 ℹ pass 18 ℹ fail 0
jobs/router.test.ts : ℹ tests 5  ℹ pass 5  ℹ fail 0
pnpm typecheck      : exit 0
```

## Capability coverage (each new claim -> its isolating falsification)
One falsifying edit per criterion, each in a throwaway copy outside the worktree (`scratchpad/gl-prep-fals3` for rate-limit, `gl-prep-fals2` for live-verify), the copy restored from the worktree and `cmp`-verified identical afterwards. Baseline before every edit: rate-limit 9 pass / 0 fail, live-verify 18 pass / 0 fail.

| Criterion | capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| L2-C1 | per-user bucket, shared across one user's sessions | rate-limit.test.ts "two viewers browsing at once ..." and "one viewer signing in again ..." | `keyGenerator` returns `req.auth?.tenantId` (the old key) | `pass 3 / fail 6`, incl. both C1 tests |
| L2-C1 (session id) | the key is the user, not the session id | "one viewer signing in again on a second browser shares ONE bucket" | key becomes `[tenantId, sessionId]` | `pass 8 / fail 1`: the "one viewer signing in again ..." test (a new login would reset the allowance) |
| L2-C2 | the default allowance stays 60 | "the default allowance stays 60 per minute for a session user" | default `opts.max ?? 60` -> `?? 100` | `pass 8 / fail 1`: that test red |
| L2-C3 | key built from server-verified `req.auth` only | "a viewer cannot pick or share another bucket with a forged header ..." | key reads `x-user-id` header | `pass 8 / fail 1`: that test red |
| L2-C4 | unambiguous encoding, no collisions | "users of one tenant stay separate even when ids contain separators ..." | key becomes naive `` `${tenantId}:${userId}` `` | `pass 8 / fail 1`; failing: "users of one tenant stay separate even when ids contain separators or equal a tenant id; the session key can never be a tenant-only key" |
| L2-C5 | unit tests go red on the old key | the C1 row | the old tenant-only key | see L2-C1 row: 6 of 9 red on the old key |
| L2-I2 | no user/session id in the 429 | "a 429 keeps the existing body and Retry-After, and names no user or session" | 429 message prefixed with `String(_req.auth?.userId)` | `pass 8 / fail 1`: "a 429 keeps the existing body and Retry-After, and names no user or session" red on a deep-equal assertion |
| L1-C1 | `--base` keeps the base path | live-verify.test.mjs signed-in test and 12 others via the stub base | `API` built from `new URL(BASE).origin` (drops the base path) | `pass 5 / fail 13` |
| L1-C2 | password never printed | "no secret (password, operator key, session cookie, CSRF proof) appears ..." | `console.log` of the password after the login call | `pass 17 / fail 1`; the secret-scan test red |
| L1-C3 | citation end strictly after start | "a citation whose end is not after its start, or a cited turn whose time range differs, is a FAIL" | `q.tEnd > q.tStart` -> `>=` | `pass 17 / fail 1` (see the correction below) |
| L1-C4 | a refusal on a nonexistent route is not a pass | "a refusal on a route that does not exist (typo'd path) is not a pass ..." | `exists = true` (skip the control) | `pass 17 / fail 1`; that test red |
| L1-C5 | sign-out proven on a route that was 200 before | "a sign-out that leaves the session alive is a FAIL" | sign-out step's pass condition replaced by `true` | `pass 17 / fail 1`; that test red |
| L1-C6 | the not-covered list is printed | "sign-out is shown on a route that answered 200 before it, and the run lists the row steps it did not cover" | remove the console NOT-covered line | `pass 17 / fail 1`; that test red |
| L1-C7, L2-C6 | operator steps on the test tag | not runnable here | n/a | `NO ISOLATING FALSIFICATION -- operator step on a deployed URL; the checker's tagged-URL run is the only discriminator` |
| L1-I1, L2-I1, L2-I3 | untouched behaviour | the no-`--base` test; `router.test.ts` and every rate-limit test through the real `requireAuth` | none: invariants of unchanged code (`auth.ts`, the session guard, `server.ts` are not in the diff) | `NO ISOLATING FALSIFICATION -- the invariant is "nothing changed"; the diff stat and the green re-run are the evidence` |

Correction found by this falsification: the first L1-C3 edit (`>=`) left the suite green (18/18) because the zero-length-citation test was caught by the cited-turn range check, not by the citation step. The stub was changed so a zero-length citation also has a zero-length turn, and the test now asserts the specific failing step (`ask: citation`). After that fix the same edit gives `pass 17 / fail 1`.

## Live browser evidence
Not UI-touching — no surface changed. Changed paths: `apps/api/src/rate-limit.ts`, `apps/api/src/rate-limit.test.ts`, `scripts/live-verify.mjs`, `scripts/live-verify.test.mjs`, `scripts/live-verify.pinned-question.json`.

## Flags for the coordinator and checker
- **New data file.** `scripts/live-verify.pinned-question.json` is new. The brief said no new source module; this is a data file, added because L1-C3 requires the question text "kept in a committed file, not inline". It holds `question`, `expectSession` and a `source` note. The script reads it from `scripts/`, and a test asserts the question text is not duplicated in the script.
- **API path assumption.** With `--base https://host/knowledgebase` the script calls the API at `<base>/api` and treats `<base>` as the web app. This matches the `<base>/api` shape in the plan but I could not confirm it against a deployment. `--api` and `--web` still override.
- **Operator key for L1-C4.** The route-existence control needs an operator key in `LKB_API_KEY` (or `--key`). Without it the four refusal steps FAIL by design, so a viewer-only run exits 2. This is the stricter reading of "each route is proven to exist". The key is used only for four empty-body control requests, is never printed or written (the sentinel test checks this), and a POST gets its own 400 so nothing is ingested.
- **Limiter store is in memory, per instance** (unchanged, and out of scope per the contract). With more than one running instance the L2-C6 probe can miss a 429 for user A; the contract says record the instance count and treat that as NOT-MEASURED.
- **L2-I1/I3 and L1-I1.** `requireAuth`, the session guard, CSRF and `server.ts` are not in the diff. No `live-verify` test existed before this unit, so L1-I1 is evidenced by a new test pinning the no-`--base` behaviour, flags and exit codes.
- **Windows exit.** In signed-in mode the script closes the undici pool and sets `process.exitCode` instead of `process.exit`, because `process.exit` with live keep-alive sockets crashed node with 0xC0000409 after all steps had passed.
- **Not covered by the script** (printed in every signed-in run): a phone on mobile data, sign-up of a new person, admin approval as viewer. Sign-up and approval stay manual.

## Operator steps (not run)
Run by whoever has the tagged URL and the accounts; nothing below was run here.
- **L1-C7** (green on the test tag; this does not by itself satisfy G01):
  `LKB_API_KEY=<operator key> LKB_LIVE_EMAIL=<viewer email> LKB_LIVE_PASSWORD=<password> node scripts/live-verify.mjs --base https://<tagged host>/knowledgebase`
  Expected: exit 0, every step PASS. Record the evidence header per [GI1]: revision, images, time. The account must be a viewer, not an admin.
- **L2-C6** (two-user probe on the tagged URL): sign in as viewer A and as viewer B of the same tenant (two cookie jars) and use only a read-only route such as `GET <base>/api/auth/session` or `GET <base>/api/sessions`.
  1. Record the running instance count of the tagged revision first (for example `gcloud run revisions describe <revision> --region <region> --format='value(status.conditions)'` and the service's min/max instances); the store is per instance.
  2. Drive A past 60 requests in under a minute, for example `for i in $(seq 1 70); do curl -s -o /dev/null -w '%{http_code}\n' -H "Cookie: <A cookie>" https://<tagged host>/knowledgebase/api/auth/session; done | sort | uniq -c`; expect some 429.
  3. In the same window, one request as B: expect 200.
  4. With more than one instance and no 429 for A, record NOT-MEASURED, not PASS.

## Status: checked-PASS (qa/verdicts/golive-launch-prep.md + qa/verdicts/golive-launch-prep.b.md, cycle 0, 2026-11-25)
