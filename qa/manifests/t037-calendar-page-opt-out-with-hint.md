# t037-calendar-page-opt-out-with-hint

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 (roadmap follow-up). It closes W7 gate (b) of qa/contracts/t037-join-rules-veto-select.md ("a client sends the meeting hints with an opt-out") from the web side, via ISS-WEBHINTS-001 / ISS-T037OPT-002 (both medium, open).
Security class: data-write action from the UI (changes which meetings get recorded). Full ceremony.
Lane: `lane/calopt`, ledger shard `qa/issues.calopt.jsonl` (no issue filed yet)
Code commit: e30f9c2

## SOURCE SCOPE ONLY (D-024)

apps/web UI. NOT validated in a live browser: no browser, dev server or build was run (CPU reserved for the production worker). The most this unit can reach is PASS at source scope; the D-024 live-browser check is still owed. Behaviour was exercised under jsdom with a stubbed global `fetch`.

## Id-space finding (no mapping guessed)

The opt-out API record id is `eventId`; the join-rules engine matches `state.optedOutEventIds` against the calendar event's own id (`evaluateJoinRules`: `rawOptOuts.includes(event.id)`; `selectAutoRecordItems` sourceId = `e.id` of the gws calendar event). `GET /calendar/upcoming` returns the same ids as `UpcomingMeeting.id`. The Calendar page's grid id is a UI wrapper of it: `meeting:<UpcomingMeeting.id>` (calendar-model.ts). So they are the SAME id space with a display prefix. The control is given the raw `UpcomingMeeting.id` found from the page's `meetings` list (not by string-stripping). Not verified against live gws data (no network); verified from code only. Sessions (`session:<id>`) have no opt-out record id and get no control.

## What is built (apps/web only)

- `calendar/OptOutControl.tsx` (new): button "Opt out of this meeting" -> inline confirm dialog (same pattern as the join-rules page: alertdialog with Confirm/Cancel) -> `postPending(apiKey, "optout", eventId, meetingUrl ? { meetingUrl } : undefined)`. Reuses the existing client; no duplication. Controls disabled while in flight, plus a ref guard against double submit. No auto-retry.
- `calendar/useOptedOutIds.ts` (new): ONE `GET /calendar/join-rules` per page load (read scope `calendar`) to learn `optedOutEventIds`; a failed read leaves the state unknown and the action is still offered.
- `CalendarPage.tsx`: +13 lines; renders the control under the detail panel for a selected meeting when a key is set. 266 non-blank lines.

## What the request carries

`POST /calendar/join-rules/opt-outs`, JSON body exactly `{ "eventId": "<raw id>", "meetingUrl": "<as returned>" }` when the meeting has a URL, exactly `{ "eventId": "<raw id>" }` when not. `meetingUrl` is passed to the client function exactly as the API returned it; note the shared `optOutBody` (not edited) itself trims surrounding whitespace and omits blank values. No `sessionKey` (not available to the web, not invented). The URL is in the body only: never in a query string, never logged; the page renders it as a link only through the existing safe-url.ts path (unchanged).

## States

- Success: item shows "Opted out: the bot will not join this meeting." (local state; no second request).
- On load: shown as opted out if its id is in `optedOutEventIds` (only `optedOutEventIds` is exposed by the GET; `optedOutMeetings` is not parsed by the web, so a meeting opted out by URL identity only, under another id, is not shown).
- 403: "This API key lacks the join-rules write scope ..." ; 503 + code `join_rules_busy`: "busy, try again"; other 503: "not available on this server yet"; 400: invalid; 500/other: generic "could not be saved"; 401: the shared client signs the key out (existing behaviour) and the control disappears.
- Confirm text states that undoing an opt-out is not available in this page yet.

## NOT done

- No un-opt (undo) control: its API route exists only in an unmerged lane.
- `sessionKey`: no source in the web; W7 (b) is therefore met for `meetingUrl` only.
- No live-browser validation (D-024). No check against real gws event ids.
- Operational note for the owner: opt-out needs the `join-rules` WRITE scope; most API keys do not have it today, so most users will see the 403 message until a key with that scope is issued.
- Nothing changed in apps/api, packages/*, client.ts, contracts, enforcement paths, TASKS.md, goal.json, nor the join-rules page or its tests.

## Existing assertions edited

None. CalendarPage.test.tsx, calendar-model.test.ts, join-link.test.tsx and the join-rules tests pass unchanged. (The existing Calendar tests do not stub `fetch`; the extra join-rules GET fails quietly there and is ignored by design.)

## Evidence

Commands run from `C:\Users\product\Desktop\KnowledgeBase-lanes\calopt\apps\web` with the machine's node.

```
node node_modules/vitest/vitest.mjs run src/pages/calendar/OptOutControl.test.tsx
 Tests  22 passed (22)       (before the 401 test was corrected: 21 passed, 1 failed; see below)

node node_modules/vitest/vitest.mjs run src/pages/calendar src/pages/CalendarPage.test.tsx src/pages/join-rules/joinRulesBusyHints.test.tsx src/pages/join-rules/joinRulesModel.test.ts
 Test Files  6 passed (6)
      Tests  125 passed (125)

node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json     (apps/web)
 no output (clean)

node scripts/lint-dirsize.mjs
 lint-dirsize: OK (115 dir(s) within budget)
```

Non-blank lines: CalendarPage.tsx 266, OptOutControl.tsx 76, useOptedOutIds.ts 23, OptOutControl.test.tsx 187 (budgets 300 / 400).

The first run of the 401 test failed in the test, not the source: the shared client clears the key on any 401, so the control legitimately disappears and the message is unreachable. The test now pins that behaviour.

## D-015 counts (recorded reproductions, re-run through the Calendar page)

- ISS-WEBHINTS-001 (the Calendar page holds meetingUrl but offers no opt-out; the join-rules page sent `{eventId}` only): web-side reproduction "an opt-out made from the web carries the meeting hint": 4/4 (zoom, meet, teams, zoom with `?pwd=`) send `{eventId, meetingUrl}`, plus the no-URL case sends `{eventId}` only.
- ISS-T037OPT-002 (a client sending only eventId stores the id alone): same 4/4 cases. ISS-T037OPT-004's recorded URL `https://zoom.us/j/123456789` is case 1 of the 4.
- Left open and named: `sessionKey` (no web source); the server-side storage of the hint (verified by other units, not re-run here). The ledger rows record no attack corpus beyond that one URL; the other three URLs are authored additions, not substitutions.

## Mutations (harness untracked in this worktree, deleted before commit; absolute paths inside the worktree only; per-mutation byte backup, restore in `finally`, then `git hash-object` == `git rev-parse HEAD:<file>`: true for all 11 runs)

| Mutation | Killed | Killing test(s) |
|---|---|---|
| hint dropped | yes (5 fail) | "a meeting with a URL sends exactly { eventId, meetingUrl } ..." and the 3 recorded-reproduction cases |
| URL normalised (lower-cased) client-side | yes (1) | recorded reproduction `https://example.zoom.us/j/987654321?pwd=AbC` |
| confirmation skipped | yes (17) | "nothing is sent until confirmed; cancel sends nothing ..." and all request tests |
| double submit: `disabled` removed on confirm | yes (1) | "a double click on confirm sends one request and the buttons are disabled while in flight" |
| double submit: ref guard AND `disabled` removed | yes (1) | same |
| double submit: ref guard removed only | SURVIVED | equivalent mutant: the `disabled` button is a second, sufficient layer in jsdom |
| 403 shown as generic failure | yes (1) | "403: says plainly that the key lacks the join-rules write scope" |
| URL placed in query string | yes (1) | "the URL is sent verbatim in the body only: never in any request URL ..." |
| prefixed grid id used as record id | yes (10) | "the record id is the raw meeting id, not the page's meeting: prefixed id" and others |
| busy shown as unavailable | yes (1) | "503 + join_rules_busy: busy, try again ..." |

Not mutation-tested: `useOptedOutIds` (covered by 3 tests for load state, one GET, failed read; no mutation run).
