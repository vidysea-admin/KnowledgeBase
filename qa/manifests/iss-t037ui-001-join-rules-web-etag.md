# iss-t037ui-001-join-rules-web-etag

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Tier: 3/roadmap-adjacent (open medium ledger issue ISS-T037UI-001, web half; step 3 of 3 after store CAS and the API lane). Lane: lane/rulesweb (base b9e6f80). Class: data write (rule-set PUT). Ledger for this lane: qa/issues.rulesweb.jsonl (ISS-RULESWEB-001 filed).

**MERGE CONDITION: this lane must not be merged alone. Against the current API (which ignores preconditions and returns no ETag) the editor would refuse to save any stored rule set; it lands together with lane/rulesapi.**

## Contract as coded (agreed text, not observed from the API)
- GET: stored rule set -> header `ETag: "<sha256 hex>"` (strong, quoted). Unstored -> no ETag, body/status unchanged.
- PUT: exactly one of `If-Match: <ETag verbatim, quotes included>` (replace) or `If-None-Match: *` (create, when the GET had no ETag). 428 `{error:"precondition-required"}` = neither sent. 412 `{error:"precondition-failed", currentEtag}` = changed/created since load, nothing written. Success -> ETag header with the new validator.
- API exposes `ETag` via CORS and allows `If-Match` / `If-None-Match` request headers.

## Scope
apps/web only: `src/api/client.ts`, `src/pages/join-rules/{joinRulesClient.ts,JoinRulesPage.tsx}`, tests `JoinRulesPage.test.tsx`, `joinRulesBusyHints.test.tsx`, `joinRulesTruth.test.tsx` (mocks made ETag-aware), new `joinRulesEtag.test.tsx`. No apps/api, contract, DECISIONS, ARCHITECTURE change.

## Changes
- **Shared fetch wrapper WAS extended, minimally and additively** (`apiFetch`, ApiFetchOptions): optional `headers` (extra request headers, spread before authorization/content-type so it cannot override them) and optional `onResponseHeaders(headers)` called on 2xx before the body is parsed. Return type, error handling and every existing caller unchanged. Note: contract t037-join-rules-editor-page C1 says the single shared-code change in client.ts must be type-only; that criterion scoped the original page unit. The brief permits a minimal extension when the wrapper hides headers, so I did it; the checker should rule on C1.
- `getJoinRules` now returns `{view, etag}` (ETag verbatim, null when absent/blank). `putRuleSet(key, ruleSet, etag)` sends `If-Match: etag` or `If-None-Match: *` (never neither) and returns the response ETag or null. Exports `preconditionHeaders`, `looksStored`.
- Page: `Loaded.etag` kept in component state (no localStorage). After a PUT the editor re-fetches (as before) and adopts the PUT response's ETag; only if the PUT response had none does it use the re-fetched ETag. Approvals/opt-outs re-fetch adopts the new ETag only when the draft is reset (clean draft); otherwise the old ETag stays with the old rule set.
- **Removed the pre-save "fresh GET compare" and its Overwrite/Discard/Cancel dialog.** The precondition supersedes the best-effort compare (the issue's fix_direction says to replace it). Consequence: a save is one PUT, no pre-GET; there is no "Overwrite with my version" path at all (no silent or one-click overwrite). Contract C3's "failed pre-save freshness GET never leads to a PUT" is now vacuously true. The old stale-compare tests were replaced by 412 tests.
- 412: `alertdialog` "Rules changed on the server" with the text "The rules were changed by someone else since you opened them, so nothing was saved. Your edits are still in the form. Reload the latest rules to see the other change (this discards your unsaved edits), then re-apply them." Buttons: "Reload latest rules (discards my edits)" (explicit GET, adopts rules + new ETag) and "Keep editing" (dismiss; a further Save will send the same If-Match and be refused again). No auto-retry, no merge UI.
- 428: error alert "The editor sent a save without a version check, which the server refuses. This is a bug in the editor ... nothing was saved and your edits are still in the form. Reload the page and try again." One PUT, no retry.
- **Missing ETag on a stored rule set (my choice):** Save button disabled and alert "Saving is unavailable: the server did not send a version tag ... Nothing will be sent." No PUT is ever sent, no unconditional fallback. "Stored" is a heuristic (see below).
- Other statuses unchanged: 401 (wrapper drops key, sign-in gate), 403 (read-only lock), 400 (server text), 503 busy/unavailable (existing busy hint, Retry-After on load), 500/network ("could not be saved", edits kept).

## Header values sent (asserted verbatim in joinRulesEtag.test.tsx)
| Case | PUT headers added |
|---|---|
| GET had `ETag: "aaaa...(64 hex)"` | `If-Match: "aaaa...a"` (byte-equal incl. quotes), no If-None-Match |
| GET had no ETag, rule set empty | `If-None-Match: *`, no If-Match |
| second save after a successful PUT | `If-Match:` the PUT response's ETag (not the stale re-fetch one) |
| after 412 + reload | `If-Match:` the reloaded GET's ETag |
| stored set, GET had no ETag | no PUT at all |

## Evidence (apps/web, node off PATH)
`node node_modules/vitest/vitest.mjs run src/pages/join-rules src/pages/calendar src/App.routes.test.tsx src/api` ->
```
 Test Files  17 passed (17)
      Tests  254 passed (254)
```
(Earlier run without src/pages/calendar: 12 files, 139 tests passed. src/pages/calendar was added after tsc showed OptOutControl uses the `Failure` type; see below.)
`node C:/Users/product/Desktop/KnowledgeBase/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output. (A first attempt that added `stale`/`precondition-required` to the exported `Failure` union broke apps/web/src/pages/calendar/OptOutControl.tsx's exhaustive message map, TS7053; reverted, 412/428 are now matched on `status` in the page and `Failure` is unchanged.)
New file `joinRulesEtag.test.tsx` (12 tests incl. 4 table rows) uses the REAL `apiFetch` with a stubbed global `fetch` returning real `Response` objects.

## Per-issue reproduction status
- ISS-T037UI-001: web half - reproductions 3 of 3 closed against a mocked API (fetch stub): (1) two editors load, A saves, B saves with the old ETag -> B's PUT carries the old If-Match, a 412 is shown, B's edits stay, nothing overwrites (the stub's refusal is the mock's; the real refusal is the API lane's); (2) B reloads then saves -> new If-Match, success; (3) the issue's "racy GET-then-PUT window" no longer exists in the page (no pre-GET). **Not run against the real API.** The ledger row's status is NOT changed; it stays open until the API lane and this lane land together and the real pair is exercised.
- ISS-T037UI-002, ISS-WEBHINTS-001, ISS-T037OPT-002, ISS-JRLOCK-002: context only, untouched.
- ISS-WEBHINTS-002 / busy hints: existing busyHints tests (retry button, Retry-After minimum delay, PUT busy text) pass unchanged except the mock now supplies an ETag.

## Assumptions the API must match (not fixed by the contract text)
1. "Stored" vs "unstored" is inferred client-side: non-empty rules or ownDomains = stored. A stored-but-empty rule set whose ETag is hidden is treated as create and gets a 412 (safe, misleading) - ISS-RULESWEB-001.
2. The re-fetch after a PUT reads the same endpoint; the editor trusts the PUT's ETag over the re-fetch's when both exist.
3. 412 is recognised by status alone (the body code is not required); 428 likewise.
4. ETag values are compared/sent as opaque strings; a blank ETag header counts as absent.

## NOT done / left open
- No mutation run (no harness created; nothing to clean).
- No browser/Vite/Playwright; jsdom + stubbed fetch only (D-024 live check outstanding, C11 of the page contract).
- ISS-RULESWEB-001 (above) open, low.
- Contract C1 (client.ts type-only) is deviated from by the additive wrapper options; flagged for the checker.
