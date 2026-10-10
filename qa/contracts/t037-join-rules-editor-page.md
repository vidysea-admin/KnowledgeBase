# T-037 / join-rules editor page - criterion contract

Checker-owned. Scope: the web page `/join-rules` (apps/web/src/pages/join-rules/) that reads and edits the tenant's auto-join rules through GET/PUT /calendar/join-rules and POST .../approvals, .../opt-outs. Source scope only. Live-browser validation (D-024) is a separate, still-owed criterion (C11). No ledger issue is being fixed, so no D-015 corpus applies.

## Criteria

- **C1 - Scope.** Only the join-rules directory, a 2-line App.tsx edit (import + route inside the existing guard/shell), a 1-line NavSidebar entry, and the single shared-code change in api/client.ts, which must be type-only (`"PUT"` in the method union) and keep passing the same key variable to `invalidateAuth` on 401.
- **C2 - Request bodies.** Save sends ONLY `{version, ownDomains, rules}` (no `state`, approvals, opt-outs, tenant or server metadata); approve sends exactly `{kind, value}`; opt-out exactly `{eventId}`.
- **C3 - No wipe.** No UI action can PUT while the load is pending or failed (no Save control, no editable form); a failed pre-save freshness GET never leads to a PUT; a 400/403/413/500/503/network failure on a write keeps the user's input and writes nothing partial; after a successful write the page re-fetches and renders the server's answer. The compare-then-PUT race is acknowledged as best effort (needs an API version field).
- **C4 - Empty rule set.** Saving zero rules is permitted only if the engine permits it, and the UI states what no rules means.
- **C5 - Trust confirmation.** No approval or opt-out request is sent without the confirmation step (Enter key, double click, early Confirm, handler order); Cancel sends nothing; the confirmation shows exactly the value sent; a domain approval carries a stronger warning and an acknowledgement gate.
- **C6 - Status handling.** 401, 403 (read and write), 400 (server text), 413, 500, 503, network each produce an honest message; a failed or 503 load never renders an empty editable form or "no rules" text; write-403 locks every write control for the life of the page load.
- **C7 - Rendering safety.** Every API-supplied string is a React text node or controlled input value; no dangerouslySetInnerHTML, innerHTML, href, src or window.open fed by API data.
- **C8 - Validation parity.** Client refusals mirror the engine's (join-rules.ts, join-rules-normalize.ts); the client never refuses an input the engine accepts, and any input the client accepts but the engine refuses surfaces the server 400 properly.
- **C9 - Verification.** Focused vitest for join-rules, App.routes, client and auth tests pass; apps/web `tsc --noEmit` exits 0; dirsize and file budgets hold; mutations (state in PUT body, domain gate removed, re-fetch skipped, innerHTML, read-only lock dropped, stale compare skipped) are killed, each run under a timeout with a per-mutation byte backup and a final HEAD-fidelity hash check.
- **C10 - Manifest honesty.** The manifest's request-body table, status table and NOT DONE section match observed behaviour.
- **C11 - Live browser (OWED, not certified by a source-scope PASS).** In a real browser with a real key: phone (~375 px) and desktop widths; the sender and domain confirmations; read-only mode with a key lacking the join-rules scope; the 503 state.
