# Verdict — ua-web-unverified-login (dual check, coordinator a)
**Checker:** /checker Mode A, blind coordinator 'a' (policy proportional-verification/2026-10-19.17)
**Unit:** ua-web-unverified-login, commit a2c2b4c0 (base 7388d5f0), Tier H, Fix cycle 0
**Cycle checked:** 0
**VERDICT:** PASS
**ISSUES-WRITTEN:** none

## What the API returns (confirmed independently, API unchanged)
- `apps/api/src/user-accounts/auth-service.ts:194-200`: wrong password or unknown user returns the generic 401 first (`failedLogin`). Only after the password verifies, a status other than `active`/`pending` emits `login_failed` (`not_active`) and returns `{ status: 200, body: { state: user.status } }` with no `sessionToken`. For an unverified account: `200 {"state":"unverified"}`, no cookie.
- `apps/api/src/user-accounts/auth-router.ts:146-156`: `out` is passed straight to `send`; the previous-session revoke runs only when `out.sessionToken !== undefined`, so an unverified login revokes nothing and sets no cookie.
- The web change matches this shape exactly (`body.state === "unverified"`, no session body).

## ISS-442 recorded reproduction (D-015)
The ledger row (qa/issues.jsonl:441) records one reproduction: an unverified account signs in, the API answers 200 {state:'unverified'}, `login()` (`apps/web/src/api/user-accounts.ts`) handles only rejected/disabled and throws 502, so the page shows "Something went wrong". Both new tests drive exactly that body. Before the fix `login()` rejected with `ApiError: unexpected sign-in response` (observed: with the unfixed `login()` simulated by F1 below, both ISS-442 tests fail with that rejection / generic message). Reproduction closed: 1/1.

## Criteria
| Crit | Result | Evidence |
|---|---|---|
| C1 `login()` maps 200 `{state:"unverified"}` to `{kind:"blocked",state:"unverified"}` | PASS | Diff `apps/web/src/api/user-accounts.ts:40,46,48`: type and check extended, `throw new ApiError(502, ...)` retained for every other state (unknown states still 502). Test "login() maps the API's 200 {state:'unverified'} ..." green in a HEAD-exact copy. Falsification F1 (remove `|| state === "unverified"`): 2 failed / 16 passed (C1 and C2 tests red). |
| C2 One plain sentence "Your email is not verified yet. Ask an admin for a verification link." in role=alert, not "Something went wrong", no session request after login | PASS | `LoginPage.tsx:34-38` `BLOCKED_MESSAGE`, rendered `:76` in `<p role="alert">`. `submit()` (`:52-58`) returns right after `setBlocked(out.state)`, before `fetchSession()`/`adoptSession()`: no session adopted, no cookie assumed. Page test asserts the text, absence of "Something went wrong", and no `/auth/session` call after `/auth/login`. F2 (message -> "Something went wrong."): 1 failed / 17 passed. F4 (drop the `return` after `setBlocked`, so the code falls through to `fetchSession`): 1 failed / 17 passed (the no-session-request assertion bites). |
| C3 rejected and disabled messages unchanged | PASS | Diff shows the `BLOCKED_MESSAGE` rejected/disabled strings byte-identical to the old ternary ("This account was not approved. Contact an admin." / "This account is disabled. Contact an admin."). `App.accounts.test.tsx` "a rejected or disabled account gets the message and no session" green. F3 (rejected text -> "declined"): 1 failed / 22 passed (that exact test). |

## Auth regression review
- No session adopted for unverified: confirmed (early return, F4 covers it).
- No cookie assumed: confirmed (no `fetchSession` call on the blocked path; API sets none).
- rejected/disabled behaviour unchanged (C3). Unknown states still `throw new ApiError(502, "unexpected sign-in response")` (code inspected; not separately exercised by a test of the new unit, unchanged line).
- `LoginResult` is consumed only by `LoginPage.tsx` (`grep` of `apps/web/src`); no other exhaustive switch to break.
- Stale-unverified rows answer the same 200 until swept, then the generic 401 (API behaviour, unchanged, noted in the manifest).
- No new source files; API, env, compose untouched; no consent code (D-210).

## Commands re-run by the checker (own run, not reused from the maker)
All runs were in a HEAD-exact copy built with `git archive a2c2b4c0` (apps/web plus `packages/ingest/src/join-policy`) in the scratchpad, with node_modules junctions, because the other dual coordinator was mutating `apps/web/src/pages/user-accounts/LoginPage.tsx` in the shared tree at the same time (an in-place run of mine saw a mutated `LoginPage.tsx`, blob 31b006eb, and 2 spurious failures; discarded).
- `vitest run src/pages/user-accounts/AccountPages.test.tsx src/App.accounts.test.tsx` (copy, single fork, 4 GB heap; the default parallel run hit a JS heap OOM on this machine): 2 files passed, 41 tests passed, 0 failed (matches the maker's 41/0).
- `tsc --noEmit` (copy): exit 0, no output.
- Falsifications F1-F4 above, run in the copy with a byte backup per mutation; after all of them `git hash-object` of the copy's `user-accounts.ts` = 67328251e8a76a556864366fa5477b574d7761de and `LoginPage.tsx` = bb53cb3dfe80eb38a766123cc0d0dfff63f74f35, both equal to `git rev-parse a2c2b4c0:<file>`. The copy and its junctions were removed (junctions unlinked with rmdir, not rm -rf; shared node_modules intact).
- Maker Pre-check evidence reused only as corroboration (same numbers: 18/0 and 41/0, hashes 67328251... and bb53cb3d...); the verdict rests on my own runs.

## Proposed issues
- PROPOSED-ISSUE (low, process, not a defect of this unit): two dual coordinators mutating the same files in the shared main tree contaminate each other's runs (observed here: a concurrent in-place mutation of `LoginPage.tsx` plus an untracked `LoginPage.tsx.bak` made my first run fail 2 tests spuriously). Suggest the dual-check dispatch template require mutation runs in a copy. Note-only per the severity gate; do not build.
- PROPOSED-ISSUE (low, note): no test pins that an unknown state from `/auth/login` still yields the generic 502 message after this change; unchanged line, covered by inspection only. File-don't-fix.
