# Verdict - t037-join-rules-editor-page

**Date:** 2026-10-10
**Contract:** `qa/contracts/t037-join-rules-editor-page.md` (authored by this checker)
**Cycle checked:** 0
**Mode:** A (event-driven unit check, no browser, no dev server; source scope)
**Worktree:** C:\Users\product\Desktop\KnowledgeBase-lanes\t037ui, HEAD fa82868

```
VERDICT: PASS (source scope only)
SCOREBOARD: 10/10 source criteria met (C11 live browser owed)
ISSUES-WRITTEN: ISS-T037UI-002 (medium, filed; does not block)
```

PASS certifies SOURCE SCOPE only. Live-browser validation under decision D-024 is still owed: the page at phone and desktop widths, the sender and domain approval confirmations, read-only mode, and the 503 state.

## 1. Scope and client.ts
`git show --stat fa82868`: only the join-rules directory, App.tsx +2 (import, `<Route path="/join-rules">` beside `/analytics`, inside the same guarded shell), NavSidebar.tsx +1, qa files, and api/client.ts 1 line. The client.ts diff is `"GET" | "POST" | "DELETE"` -> `"GET" | "POST" | "PUT" | "DELETE"`: type-only. `apiFetch` already passes `options.method ?? "GET"` to fetch, serialises any body with JSON.stringify plus `content-type: application/json`, and calls `invalidateAuth(apiKey)` with the same parameter for any 401, whatever the method. No runtime change was needed or made.
Tests: `vitest run src/pages/join-rules src/App.routes.test.tsx src/api src/auth` -> `Test Files 11 passed (11)`, `Tests 138 passed (138)` (includes client.test.ts and the AuthContext tests).

## 2. Request bodies (from tests and a throwaway probe)
| Action | Method / path | Body |
|---|---|---|
| load | GET /calendar/join-rules | none |
| save | fresh GET, then PUT /calendar/join-rules, then GET | `{"version":1,"ownDomains":[...],"rules":[...]}` only; ruleSetFromDraft builds it field by field from the draft, so loaded-response extras cannot leak; the test regex rejects state/tenant/approved/optedOut |
| approve | POST /calendar/join-rules/approvals | `{"kind":"sender","value":"x@example.com"}` |
| opt out | POST /calendar/join-rules/opt-outs | `{"eventId":"..."}` |
Probe P3 captured exactly one POST with exactly `{kind,value}`. No tenant or state in any body.

## 3. Data-loss paths
- (a) After PUT/POST the page GETs again and adopts the server's answer (mutation M3 killed).
- (b) ISS-T037UI-001 is real and correctly described: PUT has no precondition and GET returns no version, so a change landing between the page's freshness GET and its PUT is overwritten; the server's tenant mutex serialises writers but the GET is outside it. The page does not make it worse: probe P8 (freshness GET 500) -> no PUT, message shown; the comparison is a string `!==` and cannot throw; a mismatch shows the overwrite/discard/cancel dialog (M6 killed). Low: that failure reads "Unable to load join rules.", slightly misleading wording.
- (c) 400/403/413/500/503/0 on PUT keep the draft (tests plus P6); there is one PUT, so nothing is half-saved.
- (d) Load pending (P1, never-resolving fetch): only "Loading join rules...", 0 textboxes, no Save button. Load failed 403/500/503/401/0 (P2): alert only, 0 textboxes, no Save button, no "No sender is approved" or "There are no rules" text. The form and Save exist only when `loaded` is set and phase is ready; Save is also disabled when not dirty. No DOM path to a default-empty PUT.
- (e) Removing the last rule: the engine accepts `rules: []` (validateJoinRuleSet). P7: remove both rules, Save -> one PUT `{"version":1,"ownDomains":["corp.example.com"],"rules":[]}` with no extra confirmation. The UI shows "There are no rules. Without a rule or an approval, the bot never joins on its own." and the dirty note says approvals are kept. Acceptable (low: no explicit confirmation for an empty set).

## 4. Trust confirmation
The Approve buttons only call `ask`, which validates and opens the dialog; the sole caller of `onConfirm` is the dialog's Confirm button. There are no `<form>` elements.
- Enter key (keyDown/keyPress) in the input: no dialog, no request (P3).
- Double click on Confirm: exactly 1 POST (P3).
- Domain: Confirm is disabled until the checkbox is ticked; clicking early sends nothing (P4).
- Cancel sends nothing (test). The value shown is `Pending.value`, the same string sent (trim only). Case is not lower-cased client-side: shown and sent as typed; the server lower-cases (normalizeEmail), so shown equals sent.
- Look-alike/invisible: `"  Foo\u200B@Example.COM "` is accepted; the dialog shows the invisible character unflagged and the POST carries it (P5). Engine and server accept the same (only whitespace is refused in the local part; domains are ASCII-only). Filed ISS-T037UI-002 (medium). Shown equals sent, so it is not a wrong-value case.
- Public suffixes: `gmail.com` and `co.uk` open the same red "Warning: this trusts a whole domain" dialog with the checkbox "I understand that everyone at gmail.com will be trusted"; there is no free-mail-specific warning. `com` is refused client-side (multi-label rule). The server would accept free-mail and public-suffix domains.
- Low: with a confirmation already open, a Save that gets 403 leaves that dialog's Confirm enabled in read-only mode (P6); the POST would still be user-confirmed and the server answers 403.

## 5. Status table (tests and probes)
| Status | GET (load / fresh GET) | Write |
|---|---|---|
| 401 | "Your API key was rejected. Sign in again." (apiFetch also invalidates auth) | same, form kept |
| 403 | "This API key lacks permission to read join rules."; no form | read-only: banner and notice; rule controls, add inputs and Approve buttons disabled (P6); `readOnly` is reset only by `load()` (reload or key change), not by a later successful GET after a write |
| 400 | n/a | "The server rejected this change: <message>" as a text node |
| 413 | "Unable to load join rules." | generic failure, form kept, "HTTP 413" |
| 500 | same plus Retry | generic, form kept |
| 503 | "Rule editing is not available on this server yet.", no form | same message |
| network (0) | "Unable to load join rules." plus Retry | "network error", form kept |
Unexpected GET shape -> load failure (parseView null), never an empty set.

## 6. Rendering safety
`grep -n "dangerouslySetInnerHTML|innerHTML|href={|src={|window.open"` over the non-test sources: no matches. All API strings are JSX text or controlled `value=`; the server message is interpolated into a string rendered as a text node (M4, an innerHTML mutation, killed by the page test).

## 7. Client vs engine validation
joinRulesModel.ts against join-rules.ts and join-rules-normalize.ts: DOMAIN_RE character-identical; normalizeDomain and normalizeEmail identical; PLATFORMS identical (7); rule name non-empty and unique, matcher required, subdomains only with a domain, effect and scope enums: same.
- Client accepts, engine refuses: none found beyond the size check, which counts characters not bytes (a multi-byte set near 100 kB can pass the client and get a server 400/413, which is rendered).
- Client refuses, engine accepts: none found. Sender approvals cap at 320 characters, matching the API. A loaded rule with explicit `subdomains:true` is re-sent without it (same meaning, default is true).
- Drift guard: none reads the engine (apps/web cannot import it). `joinRulesModel.test.ts` ("normalisers mirror the engine", "refuses what the engine refuses") restates expectations by hand; the copied regexes can drift silently. Low; not filed.

## 8. Commands and results
- vitest (default flags, timeout 300-400 s): section 1; JoinRulesPage 30/30.
- `cd apps/web && node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> `tsc exit 0`.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`.
- `node scripts/lint-loc.mjs | grep` for join-rules, client, App, NavSidebar -> no output (no budget breach).

### Mutations (each: byte backup per mutation, timeout 300, trap restore, cmp afterwards)
| # | Mutation | Result |
|---|---|---|
| M1 | PUT body `{...ruleSet, state: {}}` | killed (1 of 30 failed) |
| M2 | domain Confirm no longer gated by the checkbox | killed (1 failed) |
| M3 | skip re-fetch after PUT | killed (2 failed) |
| M4 | notice rendered via dangerouslySetInnerHTML | killed (2 failed) |
| M5 | write 403 no longer sets read-only | killed (1 failed) |
| M6 | stale compare skipped (`if (false)`) | killed (2 failed) |
Not mutated: "enable Save while loading" (no seam; covered by probes P1 and P2).

HEAD fidelity after all mutations (git hash-object equals rev-parse HEAD:path): joinRulesClient.ts bf0914b7a27a45937148139bf3d9ae1c6a0840f3, ApprovalsPanel.tsx df8737e3f137737a76af94a0064ad3a10b8a8909, JoinRulesPage.tsx 03ea24151290606650b7fb86af999266f1fb81e8 (all equal HEAD). The throwaway probe file was deleted.

## 9. Manifest accuracy
Request bodies, status table and NOT DONE section match observation. One imprecision: the manifest says a write 403 disables all write controls; an already-open confirmation's Confirm button stays enabled (low).

EXPLANATION: No path wipes or corrupts rules (no Save before data, none after a failed load, no PUT after a failed freshness GET); no trust approval or opt-out is sent without the confirmation and the shown value equals the sent value; API strings are text. ISS-T037UI-001 (race, needs an API version) is real and the page does not worsen it. ISS-T037UI-002 (invisible or look-alike characters in a sender local part are not revealed) is medium: it sends exactly what is displayed, so it does not meet the FAIL bar in the brief. Low notes: no free-mail-specific warning; empty-rule-set save unconfirmed; open Confirm survives read-only; freshness-GET failure wording; no drift test.
