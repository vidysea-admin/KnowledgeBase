# t037-join-rules-page-hints-and-busy-code

Status: checked-PASS (Checked: qa/verdicts/t037-join-rules-page-hints-and-busy-code.md, cycle 0, d1f5da1; source scope only)
Fix cycle: 0
Priority tier: 3 (roadmap follow-up; ISS-T037OPT-002 and ISS-JRLOCK-002, both medium, both touch a data-write path's client)
Security class: client of data-write routes (opt-outs, PUT) - no auth/tenancy change
Lane: `lane/webhints`, ledger shard `qa/issues.webhints.jsonl` (ISS-WEBHINTS-001)
Code commit: 197f1c0

## SOURCE SCOPE ONLY (D-024)

apps/web UI. NOT validated in a live browser: no browser, dev server or build was run (CPU reserved for the production worker). The most this unit can reach is PASS at source scope; the D-024 live-browser check is still owed. The retry-delay behaviour was exercised only under jsdom with fake timers.

## Scope (apps/web only)

1. `apps/web/src/api/client.ts` (shared): `ApiError` gained optional `code` (the body's string `error`) and `retryAfterSeconds` (`Retry-After`, delta-seconds form only, 0..999999). Additive: the constructor's third argument is optional, so every existing `new ApiError(status, message)` is unchanged. `apiFetch` fills both on a non-2xx.
2. `joinRulesClient.ts`: `classify` returns `busy` only for `status === 503 && error.code === "join_rules_busy"` (exact, case-sensitive). `BUSY_SERVER_MESSAGE` and the message comparison are deleted; no string is duplicated between api and web any more. Any other 503 (incl. `join_rules_unavailable`, no body, other codes) stays `unavailable`; any other status stays as before (500 = generic).
3. `JoinRulesPage.tsx`: the blocked (load failure) phase carries `waitSeconds` = `Retry-After` for busy only, capped at 60 s; the existing Retry button (already offered for busy and generic failures) is disabled until that delay passes. It never retries by itself. The write path has no retry control, so none was added.
4. `joinRulesClient.ts` `optOutBody(eventId, hints?)` + `postPending(..., hints?)`; `Pending.hints?` in the model; `confirmPending` forwards `p.hints`.

## What the page knows about a meeting, and what it sends (ISS-T037OPT-002 / W7 gate (b))

The join-rules page knows ONLY event ids. Its opt-out is a free-text field "Event id to opt out of"; `GET /calendar/join-rules` returns `state.optedOutEventIds: string[]` and no event list, no meetingUrl, no sessionKey (`parseView` in joinRulesModel.ts). So the page has no source for the hints and sends exactly `{ eventId }` (pinned by test "the page's opt-out ... sends exactly { eventId }"). Nothing is invented.

Built: the client path that carries the hints when a caller has them: `meetingUrl` / `sessionKey` under exactly the router's allow-listed names, only when a non-empty string, trimmed, no other keys, never logged, never in a query string, never rendered.

**W7 gate (b) is NOT met from the web side.** Missing data: the meeting's `meetingUrl` and `sessionKey` at the point of opting out. The web Calendar page does hold `meetingUrl` per event (calendar-model.ts) but has no opt-out control, and `sessionKey` appears in no web type. To meet (b): either a calendar-side "do not join" action (apps/web, supplies meetingUrl; sessionKey still needs a source), or the calendar API response carrying `sessionKey`/`meetingUrl` per event and the opt-out choosing from that list. Filed as ISS-WEBHINTS-001 (medium, open). ISS-T037OPT-002 stays open; its status is not edited here.

## Existing assertions edited (JoinRulesPage.test.tsx, 3 lines, no assertion text changed)

- test mock type `{ status; message? }` -> `{ status; message?; code? }`.
- `throw new ApiError(fail.status, fail.message ?? ...)` -> same plus `{ code: fail.code }`.
- busy test `[{ status: 503, message: busy }]` -> `[{ status: 503, message: busy, code: "join_rules_busy" }]`. Why: busy is now identified by the code, which the old fixture did not carry; the expectation ("Join rules are busy", not "not available") is unchanged. All other existing tests pass unchanged (the 503-without-code cases still show "not available").

## Evidence

```
cd apps/web; node node_modules/vitest/vitest.mjs run src/pages/join-rules
 Test Files  4 passed (4)
      Tests  65 passed (65)        (49 before; +16 new: joinRulesBusyHints.test.tsx 14, joinRulesApiError.test.ts 2)
cd apps/web; node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json  -> exit 0
node scripts/lint-dirsize.mjs -> lint-dirsize: OK (114 dir(s) within budget)
```
File sizes: new tests 100 and 22 lines (budget 400); JoinRulesPage.test.tsx 322 (unchanged count); every source file under 300.
A first test run caught a real defect of mine (regex written `/^d{1,6}$/` instead of `/^\d{1,6}$/`, so Retry-After was never parsed); fixed before commit.

## D-015 counts against the issues' recorded reproductions

- ISS-JRLOCK-002: 3/3 web-side recorded reproductions run, 1 api-side left out. (a) api message changed to "join rules are busy, retry shortly": run verbatim as test "ISS-JRLOCK-002 recorded reproduction", shows busy: 1/1. (c) load catch without busy retry button: test "busy on initial LOAD ... enabled Retry button": 1/1. (d) readText without busy branch (load would say "Unable to load join rules."): same test asserts the busy text: 1/1. (b) `BUSY_RETRY_AFTER_SECONDS 5 -> 50` is an api-side assertion; NOT addressed here (another lane owns apps/api/src/join-rules); left open by design. The duplicated-string dependency itself is removed. Mutations M-c/M-d of the issue were not separately re-run as mutants.
- ISS-T037OPT-002: 0/1 met from this page. Its recorded scenario ("a client that sends only eventId, every client today") is still exactly what the page does, because the page has no hint data (see above). Plumbing tests: 5/5 pass.

## Mutations (per-mutation byte backup, restore in `finally`, vitest under a 420 s kill timeout, then bytes equal AND `git hash-object` == `git rev-parse HEAD:<file>` for every file, all true)

Driver: scratchpad mut.js, run from HEAD 197f1c0. Test suite is `src/pages/join-rules` (4 files).

| # | mutation | killed | killing tests (first) |
|---|---|---|---|
| M1 | hints dropped from the body | yes (2) | "hints present: the opt-out body carries meetingUrl and sessionKey ..."; "body contains only allow-listed keys ..." |
| M2 | hints sent under `url` / `session` | yes (2) | same two |
| M3 | busy detected by message text | yes (4) | "ISS-JRLOCK-002 recorded reproduction ..."; "busy on initial LOAD ..."; "the old busy message text WITHOUT the code is not busy"; "Retry-After ... minimum delay" |
| M4 | any 503 treated as busy | yes (5) | "503 with the other code ... unavailable message and no retry"; "GET status 503 is shown distinctly ..."; "write status 503 is a generic failure ..."; two more |
| M5 | code compared case-insensitively / trimmed | yes (1) | "the busy code is compared exactly: upper-case or padded variants are not busy" |
| M6 | Retry-After ignored (wait always 0) | yes (1) | "Retry-After is a minimum delay for the Retry control ..." |
| M7 | apiFetch drops the body's error code | yes (2) | "apiFetch keeps the structured error code ..."; "apiFetch: no code for a non-JSON body ..." |
| M8 | extra caller keys spread into the body | yes (2) | "hints absent, empty, blank or non-string ..."; "body contains only allow-listed keys ..." |

8/8 killed. The first mutation run reported killers as empty because my parser did not strip ANSI colour codes; all runs exited 1 and the run was repeated with the parser fixed (the table is from the second run).

## Not verified / limits

No browser check (D-024). The api side (router.ts constant, Retry-After value) not touched or re-run. The `Retry-After` clamp of 60 s and delta-seconds-only parsing are my choices (HTTP-date form is ignored). ApprovalsPanel does not supply hints, by design.

## NOT changed

qa/contracts, qa/verdicts, enforcement paths, other ledger rows or statuses, anything outside apps/web (plus this manifest and `qa/issues.webhints.jsonl`).
