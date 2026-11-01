# Manifest — ua-web-unverified-login
**Contract:** none specific; user-accounts web sign-in (UA-12 / UA-30). Fixes ISS-442 (E2E-D1, `qa/evidence/e2e-local-2026-11-01/report.json` flow F13).
**Goal task:** user-accounts web follow-up from the 2026-11-01 real-browser E2E walk
**Date:** 2026-11-01
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** H (sign-in path; auth trigger)
**Status:** checked-PASS (dual: qa/verdicts/ua-web-unverified-login.dual-a.md + .dual-b.md, cycle 0, 2026-11-01)
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/web/src/api/user-accounts.ts:48
**Persona walk:** skip (one message on an existing screen; the E2E walk F13 screenshot `shots/09-unverified-login-generic-error.jpg` is the before state)
**Issues addressed:** ISS-442
**Executor:** claude (maker subagent, main tree, branch docs/devops-golive-2026-10-26, base 7388d5f0)
**Round:** one round, Round est 20 min.

## What the API really returns (checked first; API unchanged)
- `apps/api/src/user-accounts/auth-service.ts:196-200`: after the password verifies, any status other than `active`/`pending` emits `login_failed` (`not_active`) and returns `{ status: 200, body: { state: user.status } }` with no `sessionToken`. For an unverified account that is `200 {"state":"unverified"}`, no cookie. Wrong password still answers the generic 401 first (`:194`), so the status is revealed only after the password verified (pinned by `auth-service.test.ts:123-146`).
- `apps/api/src/user-accounts/auth-router.ts:146-156`: `POST /login` passes `out` straight to `send`; no status rewriting.
- A stale unverified account (older than `UNVERIFIED_MAX_AGE_MS`, `auth-service.ts:32`, `isStaleUnverified` `:113`) is not special-cased in `login` (`:184-206`); the row is removed only by `sweepUnverified` (`:115`, called from `maybeSweep` `:118`). So a stale row not yet swept answers the same `200 {state:"unverified"}`, and a swept one answers the generic 401 `invalid_credentials` (already shown by the existing "Incorrect email or password" path). No API change is needed.
- Web before the fix: `apps/web/src/api/user-accounts.ts:43-50` knew only `rejected`/`disabled`, so `unverified` fell to `throw new ApiError(502, "unexpected sign-in response")`, which `describeAuthError` renders as "Something went wrong. Try again."

## Criteria
- C1 `login()` maps the API's `200 {state:"unverified"}` to `{ kind: "blocked", state: "unverified" }` instead of throwing a 502.
- C2 The sign-in page shows one plain sentence for it: "Your email is not verified yet. Ask an admin for a verification link." (role=alert, not "Something went wrong"), and makes no session request after the login.
- C3 The rejected and disabled messages are unchanged (existing `App.accounts.test.tsx` "a rejected or disabled account gets the message and no session" stays green).

## What changed (base 7388d5f0)
- `apps/web/src/api/user-accounts.ts` edited in place: `LoginResult` blocked state and the `login()` check (`:40-48`) now include `"unverified"`; doc comment updated.
- `apps/web/src/pages/user-accounts/LoginPage.tsx` edited in place: `blocked` state type (`:47`) includes `"unverified"`; the inline two-way ternary is replaced by a `BLOCKED_MESSAGE` map (`:34-38`, rendered at `:76`) with the existing rejected/disabled texts byte-identical.
- `apps/web/src/pages/user-accounts/AccountPages.test.tsx`: new describe "sign-in of an unverified account (ISS-442)" with 2 tests plus a small `LoginAfterRestore` wrapper that runs `restoreSession()` like `App.tsx:158`. No test file existed for `login()`, so its unit test lives here.
- No new source files; API, `.env`, compose, `qa/.6c-green`, `qa/.paused` untouched. No consent code (D-210).

## Evidence
- Pre-check[C1]: 7388d5f0+wt `pnpm --dir apps/web exec vitest run src/pages/user-accounts/AccountPages.test.tsx` -> 18 passed, 0 failed
- Pre-check[C2]: 7388d5f0+wt same command -> 18 passed, 0 failed (test "the sign-in page says the email is not verified ...")
- Pre-check[C3]: 7388d5f0+wt `pnpm --dir apps/web exec vitest run src/pages/user-accounts/AccountPages.test.tsx src/App.accounts.test.tsx` -> 41 passed, 0 failed (23 in App.accounts.test.tsx)
- Typecheck: `pnpm --dir apps/web exec tsc --noEmit` -> exit 0, no output
- TDD red first (before the code change): both new tests failed — `promise rejected "ApiError: unexpected sign-in response" instead of resolving` (C1) and the alert read "Something went wrong. Try again." (C2). Green after: 18/18.
- Falsification[C1]: per-mutation byte backup of `apps/web/src/api/user-accounts.ts`, mutation: removed ` || state === "unverified"` at `:48` -> 2 failed / 16 passed (C1 and C2 red); restored, `git hash-object` equal to the pre-mutation blob 67328251e8a76a556864366fa5477b574d7761de. No EXIT trap used.
- Falsification[C2]: per-mutation byte backup of `LoginPage.tsx`, mutation: "Your email is not verified yet." -> "Something went wrong." in `BLOCKED_MESSAGE` -> 1 failed / 17 passed (C2 red); restored, `git hash-object` equal to bb53cb3dfe80eb38a766123cc0d0dfff63f74f35.
- Falsification[C3]: per-mutation byte backup of `LoginPage.tsx`, mutation: "This account was not approved." -> "This account was declined." -> `App.accounts.test.tsx` 1 failed / 22 passed (the rejected/disabled test red); restored, hash equal to bb53cb3d....
- Tests[C1-C3]: `apps/web/src/pages/user-accounts/AccountPages.test.tsx`, `apps/web/src/App.accounts.test.tsx`

## Open points (declared, not defects)
1. A `pending` account that signs in gets a session and goes to `/pending` (`LoginPage.tsx:55`); unchanged. The E2E report's "likely pending-without-session" guess does not occur: the API gives pending a zero-scope session (`auth-service.ts:196`).
2. The message tells the person to ask an admin for a link because the server sends no email by design (E2E not_covered list).

## Metrics
builder_min=20
