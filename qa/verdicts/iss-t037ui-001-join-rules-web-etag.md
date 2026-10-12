# Verdict: iss-t037ui-001-join-rules-web-etag

VERDICT: PASS
Cycle checked: 0
Commit checked: 818d768 (lane/rulesweb, base b9e6f80). Checked against lane/rulesapi 0343f22 + 30b524f, read-only.
Scope: apps/web only; jsdom with a stubbed fetch (real `apiFetch`); not run against a live API pair or a browser (D-024 live check still owed). ISS-T037UI-001 stays OPEN until both lanes land together and the pair is exercised.

## Measured
- vitest (apps/web: src/pages/join-rules, src/pages/calendar, src/App.routes.test.tsx, src/api): 17 files, 254/254 passed (maker's number reproduced). `tsc --noEmit` exit 0.
- Own temporary probes (4 tests, deleted): "Keep editing" then Save, three times -> three PUTs, every one `If-Match` = the original GET ETag, three 412 dialogs, `currentEtag` from the 412 body/header never used; double click on Save (two clicks on the same button) -> 1 PUT; sign-out then sign-in with another tenant's key in the same mounted page -> tenant B's rules and ETag shown, tenant A's dialog gone, Save disabled until edited, B's PUT carries B's ETag with B's key; direct key switch (no sign-out) -> same result.
- apiFetch additivity: new options are optional; `headers` is spread BEFORE `authorization` and `content-type`, so it cannot override them in the code (but see M5: untested); no state shared between calls; `onResponseHeaders` runs only after `res.ok`, never on the 401/412/network paths, so error handling, return type and `invalidateAuth(apiKey)` on 401 are unchanged; every other caller passes neither option. The 401 path through the shared wrapper is untouched (the 401 row of joinRulesEtag.test.tsx is green).
- Existing tests: JoinRulesPage / BusyHints / Truth diffs read line by line. Mock changes only add an ETag. Removed: the stale-compare "Overwrite" / "Discard" / "Cancel" tests, replaced by 412 tests of equal or greater strength (no retry, edits kept, exactly 1 PUT, header asserted verbatim, server's rule not overwritten, reload adopts the new ETag). No assertion about the 503 busy hint, Retry-After, 403 lock, 401, network failure or the dirty guard was weakened.

## Mutations (5; harness rulesweb-chk-mut.mjs, per-mutation byte backup, restore in `finally`, 240 s timeout, deleted afterwards; each confirmed applied by a changed file hash)
| Mutation | Applied | Result |
|---|---|---|
| M1 send no precondition header (`headers: {}`) | yes | KILLED, 14 red |
| M2 stale ETag after a successful save (re-adopt the old one) | yes | KILLED, 2 red (second-save tests) |
| M3 auto-retry on 412 with a freshly fetched ETag (silent overwrite) | yes | KILLED, 6 red (412 tests in two files) |
| M4 Save enabled when the stored set has no ETag | yes | KILLED, 1 red (no PUT is ever sent) |
| M5 caller `headers` override Authorization (spread moved after) | yes | SURVIVED, 140/140 green |

M5 is a coverage gap, filed as ISS-RULESWEB-002 (medium: it guards the auth header; latent, since the only caller passes If-Match / If-None-Match). The production code is correct; the test is missing. It is to be added inside the next unit that touches client.ts.
HEAD fidelity: `git hash-object` equals `git rev-parse HEAD:<file>` for client.ts, joinRulesClient.ts and JoinRulesPage.tsx (89d3413, 2d7e72b, cdb7325). `git status --porcelain` is empty in the worktree and the main tree; harness and probe file deleted.

ISSUES-WRITTEN: ISS-RULESWEB-002

## EXPLANATION

### Contract C1 ruling
`qa/contracts/t037-join-rules-editor-page.md` C1, verbatim: "Scope. Only the join-rules directory, a 2-line App.tsx edit (import + route inside the existing guard/shell), a 1-line NavSidebar entry, and the single shared-code change in api/client.ts, which must be type-only (`"PUT"` in the method union) and keep passing the same key variable to `invalidateAuth` on 401."

Read literally, this unit's runtime edit to `apiFetch` contradicts it; the maker said so itself and did not edit the contract. I rule that C1 is the delivery-scope clause of the unit that created the page (fa82868, whose verdict certified exactly the 1-line type change; the clause also lists the one-time App.tsx and NavSidebar edits), not a standing ban on later units. Evidence: lane/webhints 197f1c0 already changed `apiFetch` / `ApiError` at runtime (code, retryAfterSeconds) and was PASSed as purely additive without any amendment. This unit meets the same standard (options optional, defaults unchanged, Authorization not overridable in code, `invalidateAuth` call unchanged) and C1's last clause. Alternatives that satisfy C1 literally exist (a local fetch helper in joinRulesClient.ts), but `invalidateAuth` is module-private to client.ts, so the helper would have to duplicate the 401 sign-out logic or export it (itself a non-type change); that is worse than the additive option. This is a judgement on the text, so the Approver should amend C1 or confirm this reading at merge. Not a FAIL.

Removed "Overwrite" dialog: not contract-required. C3 only says a failed pre-save freshness GET never leads to a PUT (now vacuously true) and records the compare-then-PUT race as "best effort (needs an API version field)"; no criterion requires the compare or an Overwrite path. C9 lists "stale compare skipped" among mutations; that mutation no longer exists, and M1-M4 replace it. C2, C3 (no wipe, re-fetch after a write, edits kept on failures), C6 and C7 hold.

### Compatibility with lane/rulesapi
Read: router.ts, cors.ts, join-rules-store.ts (validator). URL `/calendar/join-rules`; PUT; body = the rule set only; GET body `{ruleSet, state}`; PUT success body `{ruleSet, state}` (the page ignores it and re-fetches); header names `ETag` / `If-Match` / `If-None-Match`; quoting `"<64 hex>"` (the page forwards `Headers.get("etag")` verbatim, which matches the API's strict `^"[0-9a-f]{64}"$`). CORS allows PUT and both precondition headers and exposes ETag.
- (a) Nothing stored: API sends no ETag, empty set -> page sends `If-None-Match: *` -> API expected=absent -> save works.
- (b) Stored, non-empty: ETag sent -> `If-Match` verbatim -> save works.
- (c) Stored but empty (for example created by an approval or opt-out): the API's validator uses file existence, so it still sends an ETag; the page then sends `If-Match` (a non-null etag wins over the emptiness heuristic) -> save works. ISS-RULESWEB-001 only bites when the ETag is hidden.
- The page cannot send both headers (`preconditionHeaders` is an either/or on `etag !== null`), nor a weak or garbled tag (it forwards only what the server sent; a blank header counts as absent).
- 412 is recognised by status; Reload does a fresh GET and adopts its ETag; 428 by status.
Mismatches: none.

Notes (low, no issue): (1) after a successful PUT whose follow-up re-fetch fails, the old ETag is kept, so the user's next Save gets a 412 "changed by someone else" for their own change; safe and misleading, and the page already tells them to reload. (2) A PUT in flight when the key changes still adopts its re-fetch afterwards (no `keyRef` check in `doPut`, same as before this unit); a tenant-A view with A's ETag could then show under B, and a save from it would be refused with 412 (different tenant file, different hash). Narrow race, safe. (3) A real double click cannot send two PUTs (button disabled before the second click; observed 1 PUT), so the "changed by someone else" dialog does not appear for a user's own duplicate click.

### Merge condition
Must land together with lane/rulesapi (0343f22 + 30b524f). Alone, against the current API (no ETag, no precondition handling), this editor refuses to save any non-empty stored rule set, and the new API alone answers every old-editor PUT with 428. Both in the same release. Before merge: the Approver confirms or amends C1. After merge: a real exercise of the pair (D-024 live check) closes ISS-T037UI-001 (status not changed here), and the ISS-RULESWEB-002 test is added at the next client.ts touch.
