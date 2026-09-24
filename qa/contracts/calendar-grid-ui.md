# Contract — calendar-grid-ui (U-CAL)

> **Authored by the CHECKER on 2026-09-24**, from Umesh's live instruction: *"ui overall product ka
> aur improve krna hai like this calendar should and must look like google calendar along with
> filters and all."* Status: `proposed`. The maker never edits this file.

## Why this exists — measured in a visible browser, 2026-09-24

`/calendar` today is **a vertical list of cards**, not a calendar. `apps/web/src/pages/
CalendarPage.tsx` (191 LOC) groups sessions by month with `groupByMonth()` and renders `UPCOMING`
as stacked rows ("Weekly Sync Up with Umesh · Fri, Sep 25 · 11:00 AM-11:30 AM · Join"). There is no
month grid, no week or day view, no time axis, no filter control, and no way to see two events that
overlap in time. Past sessions and upcoming meetings are two separate stacked lists rather than one
timeline.

The data behind it is real: `GET /calendar/upcoming` (scope `calendar`) returns connected-calendar
meetings, and `listSessions` returns real past sessions.

## Scope

Replace the list with a real calendar surface over the SAME data. Google Calendar is the stated
reference for **layout and interaction**, not for branding: month/week/day grids, a time axis,
events positioned by time, overlap handling, navigation, and filters. Building a calendar *backend*,
event creation, or two-way sync is **out of scope** unless a criterion below names it.

## Criteria (each machine-checkable)

1. **[C1] Three views: month, week, day**, switchable, with the active view reflected in the URL so
   a view is shareable and survives reload. Month is the default.
2. **[C2] A real time grid.** Week and day views render an hour axis and position each event by its
   start/end time, with proportional height. Two events at the same hour are laid out side by side,
   not stacked so one hides the other.
3. **[C3] Today, and navigation.** The current day is visually marked; previous / next / "Today"
   controls move the range. Navigating never loses the active filters.
4. **[C4] One timeline, two kinds.** Past LKB sessions and upcoming connected-calendar meetings
   appear on the same grid, visually distinguishable, each labelled by kind. A past session opens
   its session page; an upcoming meeting keeps its working `Join` link.
5. **[C5] Filters, as asked.** At minimum: by kind (session / meeting), by org or source, and by
   free-text search on title. Filters are combinable, reflected in the URL, and show an active-filter
   count with a one-click clear. **An empty result after filtering says "no events match these
   filters", never a blank grid.**
6. **[C6] Event detail on click.** Clicking any event opens a detail panel with its real fields —
   title, time, organiser/participants where present, and a link onward (session page, or Join).
   No detail panel may invent a field the data does not carry.
7. **[C7] Honest empty and degraded states.** With no connected calendar, the upcoming lane says so
   explicitly — the current page's honesty ("real upcoming meetings from your connected calendar")
   must not regress into a grid that looks broken when empty.
8. **[C8] Keyboard and accessibility floor.** Views and navigation are reachable by keyboard; each
   event is a focusable element with an accessible name. A calendar that only works with a mouse
   does not PASS.
9. **[C9] Timezone is explicit and correct.** Events render in one stated timezone; a meeting at
   11:00 AM in the data renders at 11:00 AM in the grid. **A dated off-by-one or a UTC-shifted row
   is an automatic FAIL** — this is the single most common calendar defect.

## Invariants

- **[I1] No new data source.** This unit renders `GET /calendar/upcoming` and `listSessions` as they
  are. If a field is needed that the API does not return, that is a separate unit and must be raised,
  not invented client-side.
- **[I2] Tenancy unchanged.** No new route may widen tenant scope; the `calendar` scope check stays.
- **[I3] Real data only.** No seeded or placeholder events, in any view, at any time — including
  "example" events used to make an empty grid look populated.
- **[I4] LOC budget.** `scripts/lint-loc.mjs` must stay green (300-line file budget). A calendar grid
  will not fit in one file; split it deliberately rather than raising the budget.
- **[I5] The list view is not deleted until the grid passes.** Regression of a working surface into a
  half-built one is worse than the list.

## Verification (the checker re-runs these, in a VISIBLE browser)

- Screenshot each of month, week and day views with real data.
- Overlap probe: two events sharing an hour are both visible and do not occlude each other (C2).
- Filter probe: apply each filter, assert the rendered event count changes and the URL carries it,
  and assert the empty-filter message appears rather than a blank grid (C5).
- Timezone probe: an event whose data says 11:00-11:30 renders in the 11:00 row (C9).
- Keyboard probe: tab to an event and open it without a mouse (C8).
- `node scripts/lint-loc.mjs` green (I4).

**Links:** `apps/web/src/pages/CalendarPage.tsx` · `apps/api/src/routes/calendar.ts` ·
`qa/contracts/web-sessions-calendar-brain-richness.md` (predecessor, list-era) ·
`qa/contracts/calendar-auto-join.md`

**Links:** ISS-293 (this contract's issue)
