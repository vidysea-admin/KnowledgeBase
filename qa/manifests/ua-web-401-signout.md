# Manifest — ua-web-401-signout
**Contract:** none specific; scope is ISS-UAWEB-001 (`qa/issues.uaweb.jsonl`, severity high) and spec UA-30 (the cookie session; the web ends it only on the session's own end). Brief: fix in `apps/web` only, edit the existing api-client in place, do not change api auth semantics.
**Goal task:** ua-web follow-up (`ua-web-401-signout`, fixes ISS-UAWEB-001)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/web/src/api/client.ts:165
**Persona walk:** skip (client logic and a stateful fake of /auth; the live browser walk needs the work stack, see open point 1)
**Issues addressed:** ISS-UAWEB-001
**Executor:** claude (maker subagent, worktree `.worktrees/ua-web-401-signout`, branch `wave/ua-web-401-signout`, base d0416a8e)
**Round:** one round, Round est 60 min, tier H by the auth trigger (it changes when a signed-in person is signed out).

## Criteria
- C1 A 401 or 403 from a feature endpoint does not sign a cookie-session user out; the feature shows an unavailable/forbidden state.
- C2 A 401 from the session check (the real session-expired case) still signs the user out and returns to sign-in.
- C3 Every reproduction recorded in ISS-UAWEB-001 is measured and reported as N/N.

## What changed (base d0416a8e, head see the unit's last commit)
- `apps/web/src/api/client.ts` edited in place (the one source file; no new module). `send()` line 165 was `if (res.status === 401) invalidateAuth(apiKey, sentSession, serverMessage)` and is now `await onUnauthorized(path, apiKey, sentSession, code, serverMessage)`. This is the dual-trigger line.
  - `onUnauthorized` (`:181-189`): an API key, a `session_revoked` / `session_expired` body, or a 401 on `GET /auth/session` itself invalidates exactly as before (`:182-185`). Any other 401 on the cookie session (the keyless-principal 401 `unauthorized` of `GET /meeting-bot/capture-readiness`, `verified_key_identity_required`, and so on) is confirmed first: it invalidates only if the identity check also answers 401 (`:188`, with the probe's own message, else the original). A live session, a 5xx or no network leaves the person signed in and the caller still receives its `ApiError`, so the feature renders its existing unavailable state.
  - `probeSession` (`:196-213`) is `GET /auth/session` with `credentials: "same-origin"`, no Authorization, built on raw `fetch` (no recursion, never throws, never invalidates). Concurrent feature 401s share one in-flight probe per login (`:192-193`), and the invalidation is announced once per probe (`announced`). `invalidateAuth` still drops a result that belongs to a replaced login (the existing stale-401 guard).
  - A 403 never reaches this code: it was never an invalidation, and now has a test saying so.
- `apps/web/src/pages/meeting-bot/readiness/CaptureReadinessControls.tsx:8-10` is NOT edited: it already maps 403 to "Your account needs permission..." and every other error to "Capture review is unavailable...", which is the feature state C1 asks for.
- Tests: `apps/web/src/api/client.session.test.ts` +10 tests (21 total) with the `CORPUS` of 10 recorded reproductions (line 134); `apps/web/src/App.accounts.test.tsx` +4 tests (23 total), plus a `featureDenied` map on the existing fake server (`:17,:56-57`).
- Not touched: anything under `apps/api` (auth semantics unchanged; server-side 403 for keyless principals is open point 2), `AuthContext.tsx`, the API-key path, any consent code (D-210, no consent event, none read or relied on).

## Evidence
Pre-check[C1]: 05b07590 npx vitest run src/api/client.session.test.ts -> 21 passed, 0 failed (6 of the 10 new tests did not pass before the code change); src/App.accounts.test.tsx -> 23 passed, 0 failed
Pre-check[C2]: 05b07590 npx vitest run src/api/client.session.test.ts src/api/client.test.ts -> 32 passed, 0 failed; src/App.accounts.test.tsx -> 23 passed, 0 failed (incl. revoked, and the cookie-gone case)
Pre-check[C3]: 05b07590 npx vitest run src/api/client.session.test.ts -t "every recorded reproduction" -> 1 passed, 0 failed (the test asserts `10/10` and names the first reproduction that signed the session out)
Tests[C1]: client.session.test.ts — the 10-reproduction corpus (admin, viewer, member on capture-readiness; extraction-review, label-review, knowledge collections, registration-approvals, speaker-attributes; the 403 `/keys` and `/answer-policies`), a 403 never ends the session and costs no probe, a feature 401 is confirmed against GET /auth/session (same-origin, no Authorization), a probe that answers 5xx or fails is not a session end, simultaneous 401s share one probe. App.accounts.test.tsx — `/meeting-bot` with capture-readiness 401 `unauthorized` for a live cookie session: sign in lands on `/meeting-bot`, "Capture review is unavailable" is shown, no login page, no bounce after 200 ms, the server session untouched; the same with a 403 shows the permission message.
Tests[C2]: client.session.test.ts — a 401 on GET /auth/session ends the session once with the server message and sends no second probe; a feature 401 whose probe also answers 401 ends it once (two parallel requests, one event); `session_expired` and `session_revoked` from a feature route end it with no probe; a probe that lands after the login was replaced cannot end the new one; an API-key 401 is unchanged (invalidates, no probe). App.accounts.test.tsx — the pre-existing revoked test (still green) and a new one where the server forgets the cookie: sign-in page with "sign in required".
Tests[C3]: ISS-UAWEB-001 records its reproductions in its `evidence` and in the two verdicts it was reconciled from (`qa/verdicts/ua-web.md` P1, `qa/verdicts/ua-web.b.md` P1/P2). CORPUS R1..R10 is one entry per recorded request, answered as recorded: R1 admin, R2 viewer, R3 member `GET /meeting-bot/capture-readiness` 401 `{error:"unauthorized"}`; R4 `GET /extraction-review`, R5 `GET /label-review`, R7 `POST /registration-approvals`, R8 `GET /speaker-attributes` 401 `unauthorized`; R6 `POST /knowledge/document-sources` 401 `verified_key_identity_required`; R9 `GET /keys` 403, R10 `GET /answer-policies` 403. Measured against base d0416a8e (before the fix) and at 05b07590 (after):

  | | before the fix | after (05b07590) |
  |---|---|---|
  | session kept, R1..R10 | the corpus test stops at R1 (`R1 (admin session) ended the session`); the old code invalidated on every 401 by construction, so R1..R8 are the 8 expected sign-outs and the 403s R9..R10 never were one (a per-entry count before the fix was not run) | 10/10 |
  | the re-login loop (sign in at `/meeting-bot`, bounced again), App test | red | green (1/1) |

  The "before" column is the fix reverted at the call site (mutation M7): 7 tests red, including the corpus test and the App `/meeting-bot` test. R6 is the one recorded reproduction on a route whose body code is not `unauthorized`; it is covered by the same rule (any 401 that is not `session_revoked` / `session_expired` is confirmed). Two recorded observations are not sign-out reproductions and are named, not omitted: the console-error lines of P2 (open point 3) and the whole-page WriteScope of P3 (a different issue).
Falsification[C1]: (M1) `apiKey !== SESSION_CREDENTIAL ||` -> `true ||` (every 401 invalidates directly) -> 6 red (the corpus, the probe contract, the 5xx probe, the shared probe, the dead-cookie, the stale probe); (M7) the call site `await onUnauthorized(...)` -> the old `invalidateAuth(...)` -> 7 red incl. the App `/meeting-bot` test; (M4) `answer.status === 401` -> `!== 200` -> the "probe that cannot answer" test red; (M6) probe sharing disabled -> the shared-probe test red. Each restored from a per-mutation byte backup, `cmp` equal, `git hash-object` equal to the committed blob (D-020).
Falsification[C2]: (M2) `session_expired` removed from the immediate-invalidate list -> the session_expired/revoked test red; (M3) the `/auth/session` clause removed -> the "401 on GET /auth/session itself" test red (it sends one request, not two); (M9) `answer.status === 401` -> `false` (a dead cookie never signs out) -> the dead-cookie test and the App "cookie is simply gone" test red; (M5) the once-per-probe guard removed -> the dead-cookie test red (two events). Restored, `cmp` equal, hash equal to HEAD.
Falsification[C3]: M7 above is the C3 measurement: with the call site reverted the corpus test fails naming the first reproduction (`R1 (admin session) ended the session`), the N/N line fails, and the App re-login test fails; restored, the corpus passes 10/10. (M8, an API-key early return before the probe, is an equivalent mutant: the key branch already returns above it.)

Broad run (not a builder full-suite run): `src/api`, `src/auth`, `src/App.*.test.tsx`, `src/pages/user-accounts`, `src/pages/meeting-bot/readiness`, `src/pages/MeetingBotPage.test.tsx` — 22 files, 273 tests, 273 passed, 0 failed. `tsc --noEmit -p apps/web/tsconfig.json`: one error, the known `qrcode-generator` import in `src/pages/whatsapp-links/QrCode.tsx` (W10 dep absent from the main tree's node_modules); none from this unit. The App-level files import that module, so they were run with an untracked local vitest config that aliases it to a stub (`apps/web/vitest.tmp-ua401.config.ts`, deleted before the final commit, not part of the unit).

## Open points (declared, not defects)
1. **No live browser walk.** The sign-out is proven against a stateful fake of `/auth` and the real `apiFetch` / `AuthContext` / `App` / `MeetingBotPage`, not against a running API. The A9 live proof (member, viewer and admin open `/meeting-bot`) is the real check and should be repeated on the work stack.
2. **Server side not changed (by brief).** `GET /meeting-bot/capture-readiness` and the ~20 keyId-guarded routers still answer 401 to a keyless cookie principal where 403 would be the accurate code (the ledger row's server fix direction). With this unit that costs one extra `GET /auth/session` per such 401 and the feature shows "unavailable" instead of "needs permission" for those routes. A later api unit can switch them to 403 with no web change.
3. **Console error lines (ISS-UAWEB P2 of verdict b) remain:** the browser still logs a failed-resource line for each 401/403. The new probe adds a request only after a feature 401, and answers 200 on a live session, so it adds no console error there. Skipping `listKeys` for session principals is a separate issue.
4. **Behaviour that changed beyond the ledger row:** a wrong-password `POST /auth/login` 401 (`invalid_credentials`) while a session is already held no longer signs that session out (the probe finds it alive); with no session held nothing changes (nothing to end).
5. **API-key credentials are unchanged by design** (a 401 still means the key was refused): no probe, same event, same storage clearing.
6. **Pre-existing, not from this unit:** the `qrcode-generator` typecheck gap above.
7. **Consent (D-210):** no consent code was modified, extended or called; the R6 corpus entry is only a URL and a 401 body for a fake server, and no consent event or issue was added.
8. **Commit attribution:** the commits end `Co-Authored-By: Claude Sonnet 5.5` (the session's attribution reminder), not the Opus 5.5 line named in the brief.
