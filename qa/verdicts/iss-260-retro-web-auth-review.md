# Verdict - iss-260-retro-web-auth-review

VERDICT: PASS
Cycle checked: 0
Reviewed: a5245b1 (manifest qa/manifests/iss-260-retro-web-auth-review.md, ledger qa/issues.iss260.jsonl)

## Per-commit agreement (I read each `git show <sha>` myself)
| Commit | Review's description | My read | Agree |
|---|---|---|---|
| fd1a5b3 | event on 401 AND 403; AuthContext clears if detail.apiKey equals state key; test added | Same (client.ts +10, AuthContext +24/-1, LoginGate.test +44) | yes |
| 2ad648d | decode-then-encode of session id, fallback on malformed; not auth | Same | yes |
| dd6a3b2 | invalidateAuth() removes key itself then dispatches; 403 dropped; handler rewritten with 3-way condition; STORAGE const exported | Same; unstated in subject: 403 removal, handler rewrite | yes |
| 026a5a6 | base-URL trim/slash, dev default :3300 on localhost/127.0.0.1 non-PROD else same origin, ApiError(0) wrapping, NavSidebar reuse | Same | yes |
| 91d7ed2 | vite server.host 127.0.0.1 | Same (1 line) | yes |
No auth-relevant hunk is missing from the record. It discharges ISS-260's "file per-commit retroactive manifests" option.

Citation fault (cosmetic, does not change the verdict): AuthContext.tsx has 61 lines, so the review's and ledger row's `AuthContext.tsx:140-146` / `:144` / `:142` are wrong. The handler is at AuthContext.tsx:38-45 (the guard condition is :43, the getItem :40, clearApiKey :44); `clearApiKey` is :32-36 (removeItem :34); the storage reads/writes are :26, :29. The defect itself is real.

## ISS-ISS260-001: CONFIRMED, severity medium kept
Code path: client.ts:42-48 leaves storage alone when stored (B) != failed key (A), then dispatches; AuthContext.tsx:43 passes (detail.apiKey A === state A) and :44 calls clearApiKey, whose :34 removeItem is unguarded.
Throwaway test (deleted, not committed): render AuthProvider with storage A, then `localStorage.setItem('lkbApiKey','B')`, stub fetch 401, `apiFetch('/sessions','A')`. Result: state -> null and `expected null to be 'B'` (storage is null). Control case (tab state B, late 401 for old A): nothing cleared, passes.
Impact is session loss only. Requests always use the React-state key (client.ts:79, sessions.ts:29,65); the handler only ever removes, never sets, a key. In the reverse ordering (state B, 401 for A) the guard :43 returns. A storage-null/state-differs case only clears state. I found no ordering that sends one account's key for another or shows one account's data to another. Medium is right (needs two tabs, a revoked or replaced key and a race).

## Independent findings (current code, apps/web/src)
- Storage: raw key in localStorage `lkbApiKey` (client.ts:32, AuthContext.tsx:26,29). No expiry, no sessionStorage, no cookies, no service worker, no module-level response cache (rg found none). Pasted via type=password input (LoginGate.tsx:21).
- Origins: only API_BASE_URL (client.ts:76, sessions.ts:28,64). It comes from build-time VITE_API_BASE_URL, else a localhost dev default or same origin (client.ts:15-25); no query string, route param or API response feeds it. Native fetch follows redirects and would resend Authorization only same-origin (spec strips it cross-origin). Media is fetched as a blob with the header; no key and no API-returned URL is fetched with the key (sessions.ts comment, :28,:64).
- 401: invalidateAuth then LoginGate prompt (client.ts:91 region, LoginGate.tsx:14). 403: not cleared.
- Leakage: no console.* in non-test source; error text is server message or generic; ApiError(0) text has host only (client.ts:84-85); key never in URL; external links use rel=noreferrer.
- Identity: no tenant or user id read from client state; tenancy is key-derived on the API (req.auth.tenantId, brain.ts:186).
- After clear: LoginGate unmounts children (LoginGate.tsx:14-15), so page state is dropped.
- Hardening note, not filed (conditional exploit): AgendaView.tsx:72 and EventDetail.tsx:49 put `meetingUrl` into `href` without a scheme check, unlike AskPage's `safeHttpUrl` (AskPage.tsx:23-30). The Gmail source is https-only by regex (gws-gmail.ts:66-67); the calendar source passes hangoutLink or a conferenceData entry-point uri through with only a length check (gws-calendar.ts:55-58,156). A `javascript:` uri would be same-origin script with access to the stored key, but I could not confirm Google Calendar accepts such a uri from an external organizer, so it is a defence-in-depth gap, not a proven medium. The review did not mention it.
- Not confirmed from the review: nothing contradicted. The ISS-281 relation text is outside what I checked.

## "Not filed" observations
- No logout UI: correct as observation (design gap).
- Key in localStorage, no expiry: correct as observation (matches the documented model).
- Media fetches do not invalidate on 401: correct as observation (a revoked key still bounces on the next apiFetch).
- Storage access without try/catch (AuthContext.tsx:26,29,34,40): correct as observation; unverifiable without a browser, availability only.
- Wrong key bounces silently: UX only.
- `a%41` id quirk (sessions.ts:4-10): observation is right, and I checked traversal. Client encodes with encodeURIComponent after decode, so `%2F` and `/` stay `%2F` (no extra segment) and the API reads `req.params.id` as one decoded segment (brain.ts:186) and looks it up by tenant. The only dot-segment case is id `..` (`.` is unreserved, so `/sessions/..` collapses to `/` in the URL parser); that already existed before 2ad648d via encodeURIComponent, is GET-only, same origin, same key, and returns nothing to the attacker. Not a defect.

## Tests (apps/web, vitest 2.1.8, timeout 300, three files)
```
 ✓ src/api/client.test.ts (4 tests)
 ✓ src/api/sessions.test.ts (3 tests)
 ✓ src/auth/LoginGate.test.tsx (4 tests)
 Test Files  3 passed (3)   Tests  11 passed (11)
```
Junctions were created for the run and removed.

ISSUES-WRITTEN: none
EXPLANATION: The five-commit record matches every diff and covers every auth-relevant hunk, so it discharges ISS-260. ISS-ISS260-001 reproduced with a throwaway test and its impact (session loss) and medium severity are right. My own read found no medium-or-higher defect the review missed; the unsanitised calendar `href` is noted above as a conditional hardening gap. The AuthContext line numbers in the manifest and ledger row are off (see above); the downstream fix unit should use :38-45.
