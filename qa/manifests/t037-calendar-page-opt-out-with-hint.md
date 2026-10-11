# t037-calendar-page-opt-out-with-hint

Status: checked-PASS (Checked: qa/verdicts/t037-calendar-page-opt-out-with-hint.md, cycle 1, e638c01; SOURCE SCOPE ONLY per D-024)
Fix cycle: 1
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

## Fix cycle 1

Source scope only (D-024): no browser, dev server or build; jsdom with stubbed fetch. Live-browser check still owed.

### What failed (verdict cycle 0, FAIL)
ISS-CALOPT-001 (high): copy promised the bot will not join, but the scheduler does not apply join rules. ISS-CALOPT-002 (medium): the stored link identity vetoes every later meeting on the same link, no warning, no undo. ISS-CALOPT-003 (medium): a link with no derivable identity looked like a fully protected opt-out.

### The enforcement flag
`JOIN_RULES_ENFORCED = false` in apps/web/src/pages/join-rules/enforcement.ts (comment points at contract precondition W3). When the scheduler is wired (Approver ruling on W3), flip that ONE line: every enforced variant of every string below already exists and is tested (enforcedVariant.test.tsx mocks the flag true; the copy functions take the flag as a parameter).

### Strings changed (old -> new), flag false
Calendar page (OptOutControl):
- Confirm: "The bot will not join this meeting, even if a rule or an approval would otherwise allow it." -> "This records an opt-out for this meeting. Join rules are not enforced by the bot yet, so it may still join until enforcement is switched on."
- Success / loaded: "Opted out: the bot will not join this meeting." -> "Opt-out recorded for this meeting. It is not enforced by the bot yet: the bot may still join until enforcement is switched on."
- Undo line: "Undoing an opt-out is not available in this page yet." -> "Undoing an opt-out is not available in this screen yet."
- New, shown iff a meetingUrl is sent: "Opting out by this link will, once enforcement is on, also apply to other meetings that use the same link (recurring series, personal rooms)."
- New: dialog line "Meeting: <title>" (plain text; hostile titles inert).
- New, after success when the link was not recognised: "Recorded for this calendar entry only. The link could not be recognised as a meeting link, so a separate invitation for the same meeting would not be covered."
- New, when the identity count did not grow but entries exist: "No new link identity was added: the link was either already recorded or could not be recognised as a meeting link."

Join-rules page (strings only):
- Subtitle: "Decide which meetings the bot may join without a human click." -> "Edit the join rules. They are stored but not applied yet: Join rules are not enforced by the bot yet, so it may still join until enforcement is switched on."
- Approvals note: "An approval makes the bot join future meetings from that sender or domain with no human click." -> "An approval is recorded so that, once enforcement is switched on, the bot joins future meetings from that sender or domain with no human click. It is not enforced yet."
- Empty rules: "There are no rules. Without a rule or an approval, the bot never joins on its own." -> "There are no rules. Once enforcement is switched on, a meeting needs a rule or an approval before the bot joins it on its own."
- Options: "allow (join with no click)" -> "allow (join with no click, once enforced)"; "deny (never join)" -> "deny (do not join, once enforced)".
- Sender confirm: "Approving X means the bot will join future meetings from X automatically, with no human click." -> "Approving X records that, once enforcement is switched on, the bot joins future meetings from X automatically, with no human click. Join rules are not enforced by the bot yet: this is recorded, and the bot may still join until enforcement is switched on."
- Domain confirm: "...means the bot will join ... EVERY sender at X automatically..." -> "...records that, once enforcement is switched on, the bot joins ... EVERY sender at X automatically, ..." plus the same trailing not-enforced sentence.
- Opt-out confirm: "Opting out of event E means the bot will not join that meeting, even if a rule or an approval would otherwise allow it." -> "Opting out of event E records an opt-out for that event. Join rules are not enforced by the bot yet: this is recorded, and the bot may still join until enforcement is switched on."
- Success notices ("Approved X." / "Opted out of event E.") unchanged, followed by a span: " Recorded only: the bot does not enforce join rules yet."

### Response comparison rule (ISS-CALOPT-003)
The router answers `{ state }` and echoes derived identities only (`optedOutMeetings`, absent when none), never the raw URL. The page counts `url:` entries on its GET (before) and in the POST answer (after). Only when a meetingUrl was sent: after = 0 -> "unrecognised" note; after unchanged and > 0 -> "not new" note; grown -> no note; previous count unknown with entries present -> no claim. A response without `state.optedOutEventIds` (older or odd server) -> recorded, no extra claim. Identity strings are counted, never displayed. (An already-stored identity cannot be told apart from an unrecognised link when the count stays above zero, hence the softer "not new" wording.)

### Other
- Confirm dialog repeats the title; focus returns to the opener on Cancel/failure and moves to the result line on success.
- Existing assertions changed because their expected STRING changed: JoinRulesPage.test.tsx:111 (sender confirm; new text above), :143 ("the bot will not join that meeting" -> "records an opt-out for that event"), joinRulesModel.test.ts:107 (sender text), OptOutControl.test.tsx:144 (/Opted out/ -> /Opt-out recorded/). Nothing removed or weakened. The checker e2e test, client.ts, apps/api, packages/* untouched.
- New files: join-rules/enforcement.ts, calendar/optOutOutcome.ts, tests OptOutTruth / joinRulesTruth / enforcedVariant. useOptedOutIds now reads the raw GET via apiFetch (still one GET per page load).

### NOT done
Undo control (the server route `POST /calendar/join-rules/opt-outs/remove` exists; building the control is the natural next unit). Scheduler wiring (W1-W5; W3 needs the Approver). Live-browser validation (D-024). Ledger statuses untouched.

### D-015 counts (recorded reproductions from qa/issues.calopt.jsonl, re-run verbatim)
- ISS-CALOPT-001: 2/2 (the recorded confirm string and the recorded success string are both absent; scan of every state for /will not join|won't join|bot will skip|blocked/i clean).
- ISS-CALOPT-002: 1/1 (series1_20261012T100000Z with https://meet.google.com/xyz-wxyz-abc warns before the write; body unchanged).
- ISS-CALOPT-003: 2/2 (calReg registration link -> note; calZoom join link with optedOutMeetings [url:zoom:123456789] -> no note).

### Mutations (own harness, per-mutation byte backup, restore in finally, git hash-object equal to the pre-mutation blob after each, harness deleted)
All KILLED: flag flipped true (8 failing tests); "will not join" in success text (2); "will not join" in join-rules opt-out confirm (2); join-rules subtitle claim restored (3); shared-link warning removed (2); unrecognised note always (9); never (1); URL-less meeting gets a note (1); comparison inverted (5); comparison never not-new (1); unknown-before treated as not-new (1, needed a new test); title omitted (2); focus not returned (1). One equivalent mutant found and removed (a redundant growth line deleted from linkOutcome).

### Evidence
- `node node_modules/vitest/vitest.mjs run src/pages/calendar src/pages/CalendarPage.test.tsx src/pages/join-rules` (apps/web): Test Files 11 passed (11), Tests 186 passed (186).
- `node --test --import tsx scripts/qa/calendar-optout-id-space.test.ts`: tests 5, pass 5, fail 0.
- `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (apps/web): exit 0, no output.
- `node scripts/lint-dirsize.mjs`: lint-dirsize: OK (115 dir(s) within budget).
