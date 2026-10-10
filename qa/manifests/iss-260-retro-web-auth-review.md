# Manifest - iss-260-retro-web-auth-review (retroactive per-commit review)

Status: ready-for-check
Fix cycle: 0

**This is a review record. It fixes nothing and edits no source or tests.** Lane ISS260, branch lane/iss260 from 8c8429d. Reviews fd1a5b3, 2ad648d, dd6a3b2, 026a5a6, 91d7ed2 against ISS-260 (high). Related: ISS-281.
The only aggregate claim covering these commits is qa/manifests/session-loading-verification.md ("What the 5 commits contain (diff-reviewed)"); it also says no live-browser pass was run. This record re-reads each diff and the code at HEAD.

## Per-commit record

### fd1a5b3 (2026-09-10) "Fix stale API key recovery in web auth flow"
Files: apps/web/src/api/client.ts (+10), auth/AuthContext.tsx (+23/-1), auth/LoginGate.test.tsx (+44).
Behaviour: apiFetch dispatches window event `lkb:auth-invalidated` {apiKey} on 401 AND 403. AuthContext listens and calls clearApiKey() only if detail.apiKey equals the current state key, so LoginGate returns to the key prompt.
Stated vs diff: matches the subject. Uncovered hunks: none. Note it treated 403 as invalidation (narrowed by dd6a3b2).
Verdict: no defect found as shipped (clearing the key on a 403 was a design error corrected two days later; a limited-scope key would have been wiped on a 403).

### 2ad648d (2026-09-10) "Fix session detail id encoding in web API"
Files: api/sessions.ts (+11/-1), api/sessions.test.ts (+27). Not an auth change.
Behaviour: getSession path id goes through decodeURIComponent then encodeURIComponent; malformed input falls back to plain encode.
Stated vs diff: matches. Uncovered hunks: none.
Observation (not filed, correctness only): ids containing a literal percent escape are aliased (raw id "a%41" is fetched as "aA", sessions.ts:4-10). The server still enforces tenancy by key, so no cross-tenant effect.
Verdict: no defect found (auth-relevant).

### dd6a3b2 (2026-09-12) "fix session load auth key invalidation on 401"
Files: api/client.ts (+18/-3), auth/AuthContext.tsx (+7/-7), api/client.test.ts (+54).
Behaviour: adds invalidateAuth(), which removes the localStorage key itself and then dispatches the event; trigger narrowed to 401 only (403 no longer clears); storage key constant exported; the AuthContext handler is rewritten to also consult localStorage.
Stated vs diff: the subject says "on 401". The 403 removal, the storage deletion moved into client.ts and the new three-way handler condition are not in the message (the aggregate manifest mentions 401-only and the replacement-key guard). The handler hunk is where the defect is.
Verdict: DEFECT FOUND, ISS-ISS260-001 (medium). AuthContext.tsx:140-146 calls clearApiKey (:34-35, unguarded removeItem) whenever detail.apiKey equals the state key, so a late 401 for tab 1's key A deletes key B that tab 2 stored. Steps and failing assertion are in the ledger row. client.ts:42-48 (added later by e31065a) guards storage, but the handler defeats that guard cross-tab. Impact is session loss, not disclosure.

### 026a5a6 (2026-09-13) "fix api base url resolution for session loading"
Files: api/client.ts (+41/-13 incl. NavSidebar), layout/NavSidebar.tsx. No tests changed.
Behaviour: VITE_API_BASE_URL is trimmed and trailing slashes stripped; when unset, hostname localhost/127.0.0.1 and a non-PROD build default to `<protocol>//<host>:3300`, else same origin; API_BASE_URL is exported; fetch failures are wrapped in ApiError(0, "failed to connect to <target> (<err.message>)"); NavSidebar reuses the export.
Stated vs diff: the subject covers base-URL resolution and the NavSidebar reuse. The network-error wrapping (ApiError status 0) is not in the message (the aggregate manifest lists it). No test file changed.
Auth review: the Bearer key goes only to API_BASE_URL (client.ts:76-79, sessions.ts:28,64). In a PROD build the default is same-origin, so the dev default cannot send the key to :3300 in production. The key goes to whatever VITE_API_BASE_URL a deployer sets (build-time, not client-controlled). The error text contains the target URL and fetch's message, never the key.
Verdict: no defect found. Untested (no tests exist for resolveApiBaseUrl or ApiError(0)).

### 91d7ed2 (2026-09-15) "fix(web): bind development server to IPv4 loopback"
Files: vite.config.ts (+1): server.host "127.0.0.1".
Behaviour: dev server listens on loopback only (narrower than the prior default). No production auth surface.
Stated vs diff: matches. Verdict: no defect found.

## Auth behaviour at HEAD (8c8429d), with file:line
- Storage: raw API key in localStorage `lkbApiKey` (AuthContext.tsx:26,30; client.ts:32). No expiry; persists until a 401 or manual clear. No logout/sign-out UI exists (clearApiKey is only called from the 401 handler, AuthContext.tsx:43), so on a shared browser the user cannot sign out and a revoked key stays stored until some request 401s. Observation, design gap, not filed.
- Sent: `authorization: Bearer <key>` on apiFetch (client.ts:76-83) and the two media fetches (sessions.ts:28,64), only to API_BASE_URL. No key in any URL (sessions.ts comment "No key appears in a media URL"); no cookies.
- 401: client.ts:91 -> invalidateAuth -> event -> AuthContext clears -> LoginGate (LoginGate.tsx:14) unmounts children and shows the prompt. No loop: apiFetch with a null key throws locally (client.ts:72) without dispatching, and pages only mount with a key. The server returns 401 only for missing/malformed/invalid/revoked keys and 403 for insufficient scope, so clearing on 401 only is right. Media fetches (sessions.ts:28-34, 62-65) do not call invalidateAuth, so a revoked key on a media 401 shows "Recording unavailable" and stays stored. Minor, unfiled. A wrong pasted key bounces back to the prompt with no message (silent), UX only.
- 403: not cleared (client.ts:91); the page shows the server message.
- Stale data after logout/switch: LoginGate renders the prompt instead of children when there is no key (LoginGate.tsx:14-15), so all page state is unmounted; no module-level response cache found in apps/web/src/api. The only way to change keys is through the gate, so a switch always passes through unmount. Object URLs are revoked on unmount/change (SessionDetailPage.tsx:55-56).
- Tenant/user id from client: none sent. API modules state that tenancy comes only from the key (watched-sources.ts:11-14, watch-state.ts:20, whatsapp.ts:20, search/client.ts:39). The client only checks server answers for consistency (search/client.ts:34-35).
- Token leakage: no console.* in non-test web source; ApiError messages are the server message or generic; the ApiError(0) text has no key. The raw key is carried in the window event detail (client.ts:53), readable by same-origin scripts, which can already read localStorage; no new exposure.
- Redirects: no `next=`, location.href/assign or navigate-after-login code anywhere; no open-redirect surface.
- Before auth resolves: AuthProvider reads storage synchronously (AuthContext.tsx:26) and LoginGate renders children if any key is present, unverified (LoginGate.tsx:14); the shell and pages render and fetch, then bounce on 401. No data is exposed (the server enforces). Unguarded storage access: AuthContext.tsx:26,30,34,142 have no try/catch while client.ts treats storage failure as non-fatal (client.ts:49); in a browser state where localStorage throws, the provider would throw at mount. Not determined without a browser (none run, CPU constraint).

## Summary table
| Commit | Stated purpose | Matches diff? | Defects | Tests covering it |
|---|---|---|---|---|
| fd1a5b3 | stale API key recovery | yes | none (403 clearing later reverted) | LoginGate.test.tsx stale-key test |
| 2ad648d | session id encoding | yes | none auth-relevant | sessions.test.ts (3) |
| dd6a3b2 | invalidate key on 401 | partly (403 removal, handler rewrite unstated) | ISS-ISS260-001 medium | client.test.ts (4); handler only via the LoginGate test |
| 026a5a6 | api base url resolution | partly (ApiError(0) wrapping unstated) | none | none |
| 91d7ed2 | dev server IPv4 bind | yes | none | n/a (config) |

## Test results (run 2026-10-10 from apps/web, vitest 2.1.8, `timeout 300`, three files only)
```
 ✓ src/api/sessions.test.ts (3 tests) 10ms
 ✓ src/api/client.test.ts (4 tests) 21ms
 ✓ src/auth/LoginGate.test.tsx (4 tests) 1756ms
 Test Files  3 passed (3)
      Tests  11 passed (11)
```
Run with lane node_modules junctions to the main tree (removed afterwards).

## Auth behaviours with NO test
- AuthContext handler when storage differs from state (cross-tab): the ISS-ISS260-001 case.
- resolveApiBaseUrl (trim/slash, dev default :3300, PROD same-origin) and ApiError(0) wrapping.
- 403 leaves the key in place at AuthContext level (client.test.ts has an apiFetch-level 403 test only).
- Media fetches (getSessionMedia/streamSessionMedia) on 401.
- localStorage throwing in AuthProvider.
- Page data being dropped on logout.

## Relation to ISS-281
ISS-281 (medium) records client.ts churn and an unanswered auth-repair HUMAN_GATE. Per session-loading-verification.md the gate was answered 2026-09-21 ("verify, test, and land its work") and e31065a landed; no qa/gates file for it exists. This review shows the repair left one hole in the AuthContext half of the same plan (ISS-ISS260-001). ISS-281's remedy (consolidating unit, or accept the sequence) is not decided here and the row is not edited.

## Could not determine
Browser behaviour with blocked localStorage; a live multi-tab reproduction of ISS-ISS260-001 (derived from code reading only, no browser run).
