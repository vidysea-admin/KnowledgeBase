# Manifest — calendar-grid-ui (U-CAL)

**Contract:** qa/contracts/calendar-grid-ui.md
**Goal task:** none registered (Umesh live request, 2026-09-24 — not a `.goal/goal.json` roadmap row)
**Date:** 2026-09-25 (built 2026-09-24 evening, landed past midnight)
**Fix cycle:** 0 of max 3
**Dual check:** no (no matching `.goal` task, so no `criticality: critical` derivation; FULL ceremony
below regardless, because it rewrites a user-facing surface)
**Issues addressed:** ISS-293
**Executor:** claude-opus-subagent (this maker subagent)
**Executor rationale:** multi-file UI build with a timezone criterion that is an automatic FAIL if
wrong — not an Ollama-lane candidate.
**Queue tier:** 5 — "Umesh live requests, 2026-09-24 — product UI epic", item 5.
**Severity gate:** FULL — it replaces a working user-facing surface.

**Status:** checked-PASS — cycle 0 PASS by /checker (a264c49, live visible browser + pre-unit negative control); closed out by maker 2026-09-25

---

## What changed

`/calendar` was a vertical stack of cards: `groupByMonth()` for past sessions plus a separate
stacked list of upcoming meetings, with no grid, no hour axis, no overlap handling and no filters.
It is now a real calendar over the SAME two APIs ([I1] — no new data source).

### New, all under `apps/web/src/pages/calendar/`

- `calendar-model.ts` (252 lines) — the pure model. `parseLocalDate` ([C9]), `toCalendarEvents`
  (one timeline, two kinds), `layoutDayColumn` (overlap columns, [C2]), `filterEvents` +
  `sourceOptions` ([C5]), `rangeFor`/`shiftRange`/`monthMatrix` ([C1]/[C3]), `localTimeZoneName`.
- `CalendarToolbar.tsx` (96) — view switch, prev/Today/next, the three filters, active-filter count,
  clear, and the stated timezone line. Everything writes to the URL, never to component state.
- `MonthGrid.tsx` (82) — 7-column grid of whole weeks, today marked, `+N more` opening the day view.
- `TimeGrid.tsx` (118) — week and day: 24 labelled hour rows, events positioned by real start/end,
  side-by-side columns for overlaps, a separate all-day lane for date-only sessions.
- `EventChip.tsx` (56) — one event as a real `<button>` with an accessible name ([C8]).
- `EventDetail.tsx` (71) — the detail panel; every row renders only when the API returned that field.
- `AgendaView.tsx` (108) — **the original list, preserved verbatim in behaviour** ([I5]).

### Rewritten in place

- `apps/web/src/pages/CalendarPage.tsx` (175 → 245 lines) — orchestrator: the two fetches (unchanged),
  URL-backed view/date/filter/selection state, range computation, and the Gmail "Needs review" queue
  kept reachable from every view rather than only from the list.

### Tests

- `apps/web/src/pages/calendar/calendar-model.test.ts` (NEW, 24 tests) — written first; red on a
  missing module, then green.
- `apps/web/src/pages/CalendarPage.test.tsx` (rewritten, 27 tests) — every fixture time is built from
  a LOCAL wall-clock `Date` via a `localIso` helper, so a green run means the same thing in
  Asia/Calcutta and in America/Los_Angeles.

### The defect the CHECKER found mid-build, and the fix

While I was building, the checker saw `/calendar?view=month&date=2026-09-25&kind=session` render
**"0 event(s) in this range · 0 of 0 after filters"** and **"No events match these filters"** for a
month that really does contain sessions.

Root cause, and it is a genuine honesty bug, not a filter bug: the no-match branch was
`inRange.length === 0 && activeFilterCount > 0`, which is also true while `sessions` is still
`null` — in flight, or after a failed load. The page therefore **blamed the user's filter for a
load state**. `0 of 0` was the tell: `allEvents` was empty, so nothing had arrived yet.

Fixed at `CalendarPage.tsx:196-210` — the branch order is now loading → genuinely-no-data →
no-match → grid, and the no-match note requires data to be loaded AND non-empty. Four regression
tests pin it, including the checker's exact case (a 2026-09-24 session rendering under
`kind=session` in the September 2026 month view).

---

## How to verify (commands + expected)

| # | Command | Expected |
|---|---|---|
| 1 | `pnpm -C apps/web exec vitest run src/pages/calendar/calendar-model.test.ts` | 24 pass, 0 fail |
| 2 | `pnpm -C apps/web exec vitest run src/pages/CalendarPage.test.tsx` | 27 pass, 0 fail |
| 3 | `pnpm -r test` | see below — one PRE-EXISTING failure in `packages/index`, everything else green |
| 4 | `pnpm -r typecheck` | all 9 workspaces Done |
| 5 | `pnpm lint:structure` (FULL, not `--filter`) | `lint-root` FAILS on a PRE-EXISTING breach; every other step green |
| 6 | `node scripts/lint-loc.mjs` ([I4]) | OK |

## Actual outputs (from the maker's own runs)

**1 + 2 — the unit's own suites**
```
✓ [C9] timezone correctness > a bare YYYY-MM-DD becomes that LOCAL calendar day, never a UTC-shifted one
✓ [C9] timezone correctness > a meeting at 11:00 local renders in the 11:00 row
✓ [C9] timezone correctness > a session lands on its own date, and isSameLocalDay agrees
✓ [C2] overlap layout > two events sharing an hour get side-by-side columns, neither occluded
✓ [C2] overlap layout > position is proportional to the time of day
✓ [C5] filters > filters combine, and an impossible combination yields zero rather than everything
✓ [C1]/[C3] ranges and navigation > month-end arithmetic does not overflow into the wrong month
      Tests  24 passed (24)

✓ [C1] three views, in the URL > month is the default and renders a real 7-column grid of whole weeks
✓ [C1] three views, in the URL > switching to week renders the hour axis and puts the view in the URL
✓ [C9] timezone — an automatic FAIL if a row shifts > a meeting whose data says 11:00 renders in the 11:00 row
✓ [C9] timezone — an automatic FAIL if a row shifts > a session dated 2026-09-25 appears on the 25th, not the 24th
✓ [C2] overlap — two events at the same hour are both visible > they get side-by-side columns, neither occluding the other
✓ [C3] today and navigation > next/prev move the range and NEVER drop the active filters
✓ [C5] filters > an impossible combination says 'no events match these filters', never a blank grid
✓ [C6] event detail — real fields only > a meeting the API gave no organiser for renders NO organiser row — no invented field
✓ [C4]/[C7] an empty grid must never blame the filters > while sessions are still loading, the page says Loading — not 'no events match'
✓ [C4]/[C7] an empty grid must never blame the filters > a session inside the visible month IS rendered under kind=session — the checker's case
✓ [C8] keyboard floor > an event is reachable and openable without a mouse
✓ [I5] the working list view is not deleted > the list view still renders the original Upcoming + Past lists
      Tests  27 passed (27)
```

**3 — `pnpm -r test`, whole workspace** (exit 1, from the pre-existing failure in gap 2)
```
packages/core test: ℹ pass 7    ℹ fail 0
apps/web  test:     Test Files  16 passed (16)      Tests  133 passed (133)
packages/db test:   ℹ pass 14   ℹ fail 0
packages/ai test:   ℹ pass 74   ℹ fail 0
packages/ask test:  ℹ pass 50   ℹ fail 0
packages/index test: ℹ pass 227 ℹ fail 1
  ✖ real T-002 data: 23 session leaves, cross-session topic, schema-valid shape
    Error: ENOENT: no such file or directory, open
      'D:\KnowledgeBase\data\toc-migrated\2026-09-24-zoho-next-european-study-destinations\session.json'
apps/api (node --test "apps/api/src/**/*.test.ts"): ℹ tests 175  ℹ pass 175  ℹ fail 0
```

**4 — `pnpm -r typecheck`**
```
packages/core: Done   apps/web: Done   packages/ai: Done   packages/db: Done
packages/ingest: Done packages/ask: Done packages/index: Done packages/meeting-bot: Done
apps/api: Done
```

**5 — `pnpm lint:structure`, the FULL command**
```
> node scripts/lint-loc.mjs && node scripts/lint-dirsize.mjs && node scripts/lint-root.mjs && node
  scripts/lint-dupes.mjs && node scripts/lint-migrations.mjs && node scripts/snapshot.mjs --check &&
  node --test scripts/lint.test.mjs && node scripts/tracker-audit.mjs --gate g1,g4 && depcruise ...

lint-loc: OK (305 file(s) within budget)
lint-dirsize: OK (85 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example .gitignore
  .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml Living-Knowledge-Base-Architecture.html
  migrate-mongo-config.cjs package.json pnpm-lock.yaml pnpm-workspace.yaml structure.config.json
  TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
The `&&` chain stops there, so every later step was run individually — all green:
```
lint-dupes: OK (330 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (3531 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)
node --test scripts/lint.test.mjs → ℹ tests 14  ℹ pass 14  ℹ fail 0
tracker-audit: OK (gate G1,G4)
depcruise → ✔ no dependency violations found (328 modules, 1010 dependencies cruised)
```
**All 16 of those root files are tracked at HEAD; this unit added none of them.** See gap 1.

---

## Capability coverage (each new claim → its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| A date-only session lands on its own LOCAL day ([C9]) | `calendar-model.test.ts` "a bare YYYY-MM-DD becomes that LOCAL calendar day" | `calendar-model.ts:47` — `return new Date(ymd)` (the naive UTC-midnight parse) | before `✓ [C9] timezone correctness > a bare YYYY-MM-DD becomes that LOCAL calendar day, never a UTC-shifted one` · after `× …` / `AssertionError: expected 5 to be +0` (IST +5:30 — the exact shift) |
| Two events in the same hour get side-by-side columns ([C2]) | `calendar-model.test.ts` + `CalendarPage.test.tsx` overlap tests | `calendar-model.ts:140` — force every event into column 0 | before both `✓` · after `× [C2] overlap layout > two events sharing an hour get side-by-side columns, neither occluded` AND `× [C2] overlap … they get side-by-side columns, neither occluding the other` / `AssertionError: expected false to be true` |
| The kind filter actually narrows the grid ([C5]) | `calendar-model.test.ts` "by kind" + `CalendarPage.test.tsx` "a kind filter changes the rendered event count" | `calendar-model.ts:194` — delete the kind predicate | before both `✓` · after `× [C5] filters > by kind` / `AssertionError: expected [ { id: 'meeting:m1', …(7) } ] to have a length of +0 but got 1`, and `× a kind filter changes the rendered event count and lands in the URL` |
| No field is invented in the detail panel ([C6]/[I1]) | `CalendarPage.test.tsx` "a meeting the API gave no organiser for renders NO organiser row" | `EventDetail.tsx:38` — render `Organiser: {event.organizer ?? "TBD"}` unconditionally | before `✓ …renders NO organiser row — no invented field` · after `AssertionError: expected <div class="row-meta" …(1)></div> to be null` |
| An empty grid never blames the filters for a load state ([C4]/[C7]) | `CalendarPage.test.tsx` "while sessions are still loading, the page says Loading" | `CalendarPage.tsx:201` — `{false ? (` , removing the load-state guard | before `✓ [C4]/[C7] an empty grid must never blame the filters > while sessions are still loading, the page says Loading — not 'no events match'` · after `× …(1126ms)` |

**One honest caveat on the [C9] falsification.** The page-level test *"a session dated 2026-09-25
appears on the 25th, not the 24th"* stayed **green** under the naive-parse mutant, and that is
correct behaviour, not a weak test: this machine is at UTC+05:30, where UTC midnight is still the
same local calendar day. The model-level assertion (`getHours() === 0`) is what catches it here, and
in any zone with a non-zero offset. In a zone at exactly UTC the two implementations are genuinely
equivalent and nothing can distinguish them. Stating this rather than claiming a universal catch.

Mutation-run safety (D-020): every edit above went through a harness that takes a byte backup,
applies the edit, runs the suite under `timeout 300`, and restores in a `trap … EXIT INT TERM ERR`
verified with `cmp`. Each printed `RESTORED-OK <file>`; a post-run `grep -rn "MUTANT" apps packages`
returns nothing.

---

## Live browser evidence

`qa/evidence/calendar-grid-ui-2026-09-24/` — **maker SMOKE CHECK only, and now CLOSED.** Partway
through, the checker told me we are sharing ONE browser instance and my navigations were pulling its
tab off `:5175`. I stopped all `browser_*` calls at that point and did not resume; everything after
that is tests, typecheck and the full lint. The evidence below is what had already been captured.

- **Pages, 0 application console errors on each:** `/calendar?view=month&date=2026-09-25`,
  `?view=week`, `?view=day`, `?view=month&kind=session&q=zzzznothing`, `?view=list`.
- **[C9], the load-bearing one:** the real *"Weekly Sync Up with Umesh"* rendered with
  `aria-label "meeting: Weekly Sync Up with Umesh, 11:00 AM–11:30 AM"` at `top: 45.8333%`
  — exactly 11/24 — and `height: 2.08333%` = 0.5/24. No shift. Page states *"All times shown in
  Asia/Calcutta."*
- **[C1]/[C3]:** month grid 35 cells, `35 % 7 === 0`, exactly one `data-today="true"`; week view 7
  day-columns with hour labels.
- **[C6]:** detail panel showed only real fields — *"Fri, Sep 25, 2026 · 11:00 AM–11:30 AM ·
  Organiser: manish.k@vidysea.com · Join"*, join href `https://meet.google.com/ovg-uuov-qve`, no
  session link (correct, it is a meeting).
- **[C5]:** impossible combination → *"No events match these filters."* with no grid rendered;
  `kind=session` alone → *"3 event(s) in this range · 27 of 35 after filters"*.
- **[I5]:** list view intact — Upcoming + Past sections, 8 working Join links, 27 session links, and
  the Gmail review queue still present.
- Screenshots: `c01-month-view.png`, `c02-week-view-hour-axis.png`, `c03-day-view-detail-panel.png`,
  `c04-list-view-preserved.png`.

**This is NOT the validation.** The live visible-browser verdict is the checker's, run against the
bar it wrote before this build landed (`qa/evidence/ui-epic-2026-09-24/checker-probes.md`).

### For the checker — where this is served and what to exercise

- **Web:** `http://127.0.0.1:5176` (vite `--strictPort`, left RUNNING as asked).
- **API:** `http://127.0.0.1:3301` — a FRESH dev server on this branch's code. The pre-existing
  `:3300` instance is on stale pre-unit code; do not verify against it.
- **The key the page needs** is in `localStorage.lkbApiKey` for the `:5176` origin. If a tab shows
  `0 of 0` with an error, that is a missing/invalid key for that origin, not an empty tenant.
- **Full `/calendar` query-param set:**

  | param | values | default |
  |---|---|---|
  | `view` | `month` \| `week` \| `day` \| `list` | `month` |
  | `date` | `YYYY-MM-DD` (the anchor date of the range) | today |
  | `kind` | `` (both) \| `session` \| `meeting` | both |
  | `source` | any org (`TOC`, `Vidysea`, …) or organiser email present in the data | all |
  | `q` | free text, matched case-insensitively against the event title | none |
  | `event` | `session:<sessionId>` or `meeting:<calendarEventId>` — opens the detail panel | none |

- `/brain` (unit 1) takes `kinds` (comma-separated node kinds), `session` (a `session:<id>` node id),
  `q`, `node` (selected node id) and `r` (refresh token).

---

## Known gaps (disclosed)

1. **`pnpm lint:structure` FAILS on `lint-root`, PRE-EXISTING.** 16 tracked root files against a
   budget of 15; this unit added none. Moving one needs an authorizing `docs/DECISIONS.md` entry —
   the Approver's call, not the maker's. Same gap as unit 1; it blocks any fully-green claim in this
   repo until someone decides.
2. **A pre-existing test failure, unrelated:** `packages/index/src/tree/tree-real-data.test.ts`
   ENOENTs on `data/toc-migrated/2026-09-24-zoho-…/session.json`. Verified pre-existing during unit 1
   by stashing the whole diff and re-running (`ℹ pass 0 · ℹ fail 1`, same error).
3. **[C2] overlap was never seen with REAL data.** The live calendar has exactly one timed event on
   2026-09-25, so no natural overlap exists to screenshot. Overlap is proven at the model level and
   at the DOM level (two `positioned-event` nodes, `data-columns="2"`, different `left`), both with
   synthetic fixtures. The checker's probe will need to arrange an overlapping pair.
4. **The maker's browser pass is incomplete by instruction.** A fifth screenshot (filtered month
   view) timed out twice in the screenshot tool, and I stopped browsing entirely when the checker
   claimed the shared browser. `[C3]` navigation, `[C8]` keyboard and `[C5]` clear-filters were
   verified by test, not in the live browser, by me.
5. **[C1] says "three views"; I shipped four.** `list` is the fourth, and it exists only because
   [I5] forbids deleting the working list before the grid passes. If the checker reads [C1] as
   exactly-three, this is the place to push back — I would rather over-disclose than quietly widen a
   criterion.
6. **Month view does not render an hour axis**, by design: [C2] scopes the time grid to week and day.
   Month shows chips, and `+N more` / a date click opens that day.
7. **`source` filters on exact equality** of a session's `org` or a meeting's `organizer`. A session
   whose `org` is a `·`-joined multi-org string (the webinar sync writes those) is matched as that
   whole string, not per-org. Disclosed rather than guessed at — splitting it is a data-shape
   decision, and [I1] forbids inventing one client-side.
8. **No timezone PICKER.** [C9] requires "one stated timezone"; that is the viewer's own, named on
   screen. Choosing a different one would be a new feature, not this contract.
9. **`CalendarPage.tsx` is 245 lines** and `calendar-model.ts` is 252 — both under the 300 budget,
   but `.tsx` is not covered by `lint-loc` at all (`structure.config.json` `loc.extensions` is
   `.ts/.py/.mjs`). The split here was deliberate rather than lint-forced; flagging that the budget
   would not have caught a monolith.
