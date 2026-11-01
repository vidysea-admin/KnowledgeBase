# Verdict (dual-b) — ua-web-unverified-login
**Checker:** /checker Mode A, blind coordinator b (dual check). Policy-Version: proportional-verification/2026-10-19.17
**Commit judged:** a2c2b4c0 (HEAD at check time; apps/web source tree clean)
**Cycle checked:** 0
**VERDICT: PASS**

## Independent API confirmation (not taken from the manifest)
- `apps/api/src/user-accounts/auth-service.ts:194-200`: wrong password / unknown user returns the generic 401 first; only after the password verifies does a status other than active/pending return `{status:200, body:{state:user.status}}` with no `sessionToken`. For unverified this is `200 {"state":"unverified"}`.
- `auth-router.ts:90`: Set-Cookie only when `out.sessionToken !== undefined`; `:146-156` passes `out` to `send` unchanged. So no cookie is set for the unverified response.
- Web `login()` now maps exactly that body to `{kind:"blocked", state:"unverified"}`; `LoginPage.submit` returns on `blocked` before `fetchSession`/`adoptSession`, so no session request and no session adopted. rejected/disabled branches unchanged; any other non-session body still reaches `throw new ApiError(502, ...)` (`user-accounts.ts:49`, unchanged line).

## Criteria
| # | Criterion | Result | Evidence |
|---|---|---|---|
| C1 | login() maps 200 {state:"unverified"} to blocked/unverified | PASS | diff `user-accounts.ts:40-48`; test "login() maps ..." green; falsification: removed ` \|\| state === "unverified"` -> 2 failed / 16 passed (login() test red with `ApiError: unexpected sign-in response`, page test red "Something went wrong. Try again."); restored, `git hash-object` 67328251... == HEAD blob |
| C2 | Page shows the one-sentence role=alert message, not "Something went wrong"; no session request after login | PASS | `LoginPage.tsx` BLOCKED_MESSAGE + `:76`; page test asserts exact text, not "Something went wrong", and no `/auth/session` call after the login call (initial restore call correctly excluded); falsification: message text replaced with "Something went wrong." -> 1 failed / 17 passed; restored, hash bb53cb3d... == HEAD blob |
| C3 | rejected/disabled messages unchanged | PASS | diff shows the two strings byte-identical inside BLOCKED_MESSAGE; `App.accounts.test.tsx` "a rejected or disabled account gets the message and no session" green; falsification: rejected text altered -> 1 failed / 22 passed (that test); restored, hash bb53cb3d... == HEAD blob |

## ISS-442 ledger row (D-015)
Row 441 of qa/issues.jsonl records a single reproduction: unverified sign-in shows "Something went wrong" because the API returns 200 {state:'unverified'} and login() handles only rejected/disabled. Measured 1/1: that exact body now yields the unverified message (C1 + C2 tests, red before per the TDD red evidence, red again under my mutation).

## Commands run by this checker
- `pnpm --dir apps/web exec vitest run src/pages/user-accounts/AccountPages.test.tsx src/App.accounts.test.tsx` -> 2 files passed, 41 tests passed, 0 failed (manifest's Pre-check[C3] count reproduced; my own re-run, not reused).
- `pnpm --dir apps/web exec tsc --noEmit` -> exit 0.
- Three per-mutation byte backups (no EXIT trap), each restored and hash-checked against `git rev-parse HEAD:<file>`; `git status --short apps/web/src` clean afterwards. One C2 mutation run hit a vitest "Worker exited unexpectedly" (no tests collected, infrastructure flake, not a result); re-run gave the 1 failed / 17 passed above.

## Notes (not defects)
- No test pins the "unknown state still 502" path; verified by reading (`user-accounts.ts:49` untouched, new condition is an explicit literal equality, not a typeof check). Unchanged pre-existing coverage gap; low, ledger-only per the repo severity gate.
- Message directs the person to an admin for a link because the server sends no email (manifest open point 2); consistent with the E2E not_covered list. Pending-with-session path unchanged.
- No consent code touched (D-210). API, .env, compose untouched by this commit.

ISSUES-WRITTEN: none
PROPOSED-ISSUE: (low, file-don't-fix) no test pins that an unknown 200 body state (e.g. {state:"weird"}) still throws the 502 "unexpected sign-in response" in login().
