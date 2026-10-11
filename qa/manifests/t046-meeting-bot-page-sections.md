# t046-meeting-bot-page-sections

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 (roadmap): T-046 "real /meeting-bot web page (upcoming · live status · past recordings · transcript links)", docs/meeting-bot-roadmap.md row T-046. T-046 STAYS OPEN.
Security class: read-only UI over existing GET endpoints; no auth, tenancy or data-write change. Hostile-data rendering is nevertheless tested.
Lane: `lane/t046page`, ledger shard `qa/issues.t046page.jsonl` (none filed; no issues found while building)
Code commit: 2bf6853 (from f73eca0)

## SOURCE SCOPE ONLY (D-024)

apps/web UI only. NOT validated in a live browser: no browser, dev server or build was run. Exercised under jsdom with a stubbed global `fetch`. At most a source-scope PASS; the D-024 live-browser check is still owed.

## Round cap (project CLAUDE.md)

Seam = the meeting-bot web page (`MeetingBotPage`). Prior verdict files naming it: 4, of which exactly 1 is a PASS (web-ingest-and-meetingbot, an early ingest + page unit); evidence-trust-by-content is FAIL, webinar-bot-live is a FAIL-then-fix record, webinar-portable-release is NOT VERIFIED. Prior PASS count on this seam: 1 (< 2). Classification: not security class; the sections are named deliverables of roadmap task T-046 (not polish), so the cap does not forbid the unit.

## Sections built (apps/web only; no API change)

| Section | Endpoint (existing) | Scope | Fields used |
|---|---|---|---|
| Upcoming meetings on the calendar | `GET /calendar/upcoming` (`listUpcomingMeetings`) | `calendar` | `meetings[].title`, `startTime`, `endTime`, `meetingUrl` (host only -> platform label, and known/not known; the link is never rendered) |
| Live now | `GET /webinar-operations` (`listWebinarOperations`) | `sessions` | `operations[]` with `status` recording or processing: `title`, `status`, `attempts`, `reason`, `startTime`, `updatedAt` |
| Webinar operations (existing content, kept) | same single request as Live now | `sessions` | other operations (queued/failed/ready/action_required), `omitted`, `discovery.{calendar,gmail}` health; "Open recording and knowledge" link for `ready` rows via the router |
| Past recordings | `GET /sessions` (`listSessions`) | `sessions` | `sessions[]._id`, `title`, `date`, `status.transcribe`, `status.index`; link `/sessions/<encoded id>` ("Open session and transcript") |

Request count: 3 per page load, one per endpoint; Live now and Webinar operations and discovery health share the one `/webinar-operations` state (test asserts `calls` has length 3). `/webinar-operations` keeps its existing 10 s poll (guarded against overlap); the other two do not poll. No key -> no request.

## What could NOT be shown, and what it needs

- **Video size per past recording**: `GET /sessions` returns no size. `GET /sessions/:id` has `media.bytes`, but that is one request per row (N+1), not done. Needs: `media: { available, bytes }` (or `videoBytes`) on each `GET /sessions` list item. Shown as "Video size: unknown" (never 0). The formatter (`formatBytes`, KB/MB/GB with boundary tests, 0 B vs missing) is ready for it.
- **Duration**: no endpoint field in list or operations (operations have `startTime`/`endTime` for operations only, not used as duration). Omitted. Needs `durationSeconds` on the session list item.
- **Retention state**: no endpoint returns it (the retention planner is pure and unwired; thresholds are an undecided owner question). Not shown, not computed, no purge dates implied. The section note says so. Needs e.g. `GET /sessions` item field `retention: { state, eligibleAt? }` from a wired planner.
- **Scheduling decision / skip reason for an upcoming meeting**: `/calendar/upcoming` returns none. Not shown. Reasons ARE shown where the API gives them (`/webinar-operations` `reason`), mapped through the known vocabulary (all `SkipReason`s plus operation-only reasons, copied from apps/api brain.ts `WEBINAR_OPERATION_REASONS`); unknown or hostile values render "unrecognised reason", never the raw text. Needs an upcoming-item field `decision`/`skipReason` if wanted.
- **Live now**: built from operations with status `recording`/`processing` (an existing endpoint), so the section exists. No separate live-job endpoint was found.

## Truthful-wording rule as applied

The page never says the bot will (or will not) join a listed meeting, and never says join rules/opt-outs are applied. Upcoming note: "Appearing here is not a decision to record. Which meetings the bot joins depends on its settings and on other meetings; this page does not evaluate that." Reason labels are neutral ("opt-out recorded", "join rule recorded", "join rules not evaluated"). `JOIN_RULES_ENFORCED` is not imported by the page (no enforcement wording at all); the test imports it, asserts it is `false`, and scans rendered text AND every attribute (aria-label, title, alt, ...) for will/would/going-to + join/record, "will not", "enforced", "applied", "automatically joins". Flipping the flag therefore forces a review of this test and wording.

## States (each section independent)

Loading; empty; error (401 -> shared client signs out and the section says sign-in is required; 403 names the missing scope; 5xx/network generic text without the server message, plus "Retry <section>" button, one fetch per click even when double-clicked while in flight); stale data kept with a "may be stale" note on a failed poll; no-key; partial data (missing optional fields -> placeholders); wrong-shaped payload (`meetings: "x"`, `null`) -> error state, not a fake empty list. A failing section never blanks the others (tests 403 calendar, 503 sessions, network error on operations).

Hostile data: `<script>`/`<img onerror>` titles, `javascript:` URLs and ids, RTL/bidi overrides (removed), 5,000-character titles (bounded to 160 + ellipsis), null/number/array/object where strings expected, `__proto__`/`constructor` ids, `../` and `a/b` ids. Everything is text; links only through `sessionPath` (regex-validated id, reserved keys denied, `encodeURIComponent`) or the platform label via `safeHttpUrl`. Row cap: 25 per section with "Showing 25 of M".

## Files

New: `apps/web/src/pages/meeting-bot/{model.ts, useLoad.ts, SectionFrame.tsx, UpcomingSection.tsx, OperationsSections.tsx, PastSection.tsx, DiscoveryStatus.tsx, model.test.ts, MeetingBotSections.test.tsx}`. Edited: `MeetingBotPage.tsx` (56 -> 29 lines), `MeetingBotPage.test.tsx` (setup only). Not touched: apps/api, packages/*, client.ts, Calendar page, join-rules, contracts, TASKS.md, goal.json, enforcement paths.

Behaviour changes to the existing page: h1 is now "Meeting bot" (was "Webinar operations", which is now an h2 section); operation row titles are h3; operation `status`/`reason` go through label maps (known values render identically to before, unknown ones render a neutral label instead of the raw string).

## Existing assertions edited

None edited. `MeetingBotPage.test.tsx`: added `beforeEach` that spies `listUpcomingMeetings` and `listSessions` to resolve empty (the page now calls them, and unmocked they would error and add `role="alert"` elements that break the existing single-alert assertions), plus the `beforeEach` and `calendar` imports. All 6 original tests pass unchanged.

## Evidence

Commands run from `C:\Users\product\Desktop\KnowledgeBase-lanes\t046page\apps\web` with Node 24.19.0 prepended to PATH:

```
node node_modules/vitest/vitest.mjs run src/pages/MeetingBotPage.test.tsx src/pages/meeting-bot src/App.routes.test.tsx
 ✓ src/pages/meeting-bot/model.test.ts (12 tests)
 ✓ src/pages/MeetingBotPage.test.tsx (7 tests)
 ✓ src/pages/meeting-bot/MeetingBotSections.test.tsx (13 tests)
 ✓ src/App.routes.test.tsx (3 tests)
 Test Files  4 passed (4)
      Tests  35 passed (35)
node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json   -> no output (clean)
node scripts/lint-dirsize.mjs  -> lint-dirsize: OK (118 dir(s) within budget)
```
MeetingBotPage.tsx = 29 non-blank lines (limit 300).

## Mutations (lane-unique untracked harness, per-mutation byte backup, restore in `finally`, 150 s hard timeout, `git hash-object` == `git rev-parse HEAD:<file>` after each: true for all). Run set: MeetingBotPage.test.tsx + meeting-bot/.

| # | Mutation | Killed by |
|---|---|---|
| 1 | missing size rendered as "0 B" | formatBytes missing/invalid; formatBytes real zero; "past recordings: size is unknown (never 0)" |
| 2 | raw skip reason echoed | reasonLabel; "hostile data is inert"; "skip reasons come from data through the vocabulary" |
| 3 | join link used without safe-url | platformOf "unsafe or missing links are not known" |
| 4 | session link from unvalidated id | sessionPath "safe ids"; "hostile data is inert" |
| 5 | error in one section blanks all | "a 403 on one section ... leaves the others rendered"; "5xx on sessions" |
| 6 | row cap removed | "row cap is bounded"; "each list renders at most 25 rows" |
| 7 | duplicate fetch | "one request per endpoint per load"; "5xx on sessions ... one fetch per click" |
| 8 | "will join" string in an aria-label | "truthful wording" |
| 9 | retry in-flight guard removed | "5xx on sessions ... one fetch per click" |
| 10 | fetch without a key | "no API key means no request at all" |

## NOT done

- No live-browser validation (D-024). No check against real API payloads (no network); shapes taken from apps/api route code and types.
- No video size, duration or retention state (see above; needs API fields). No purge executor; no retention computation.
- T-046 stays open (retention policy half and live validation remain).
- No `qa/issues.t046page.jsonl` rows were filed.
