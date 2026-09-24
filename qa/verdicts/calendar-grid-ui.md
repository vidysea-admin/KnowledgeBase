# Verdict — calendar-grid-ui (U-CAL)

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** orchestrating checker (main session), Mode A + Mode D (live visible browser), bound to `D:/KnowledgeBase`.
**Commit under check:** `1d02a3a`, main tree, web `:5176` → API `:3301`.
**Contract:** `qa/contracts/calendar-grid-ui.md` (proposed, checker-authored 2026-09-24).
**Issue:** ISS-293 (high). **Independence:** I did not build this unit; I authored its contract and probe plan before the build landed.

VERDICT: PASS
SCOREBOARD: 8/9 criteria met, 1 met at model+DOM level but NOT against production data; 5/5 invariants hold
ISSUES-WRITTEN: none
LIVE-BROWSER: RUN — headed Chrome, `:5176`

## The zero-event observation I raised WAS a real bug, and it is fixed

While the maker still held the shared browser, I saw its calendar render *"0 event(s) … No events match these filters"* for September 2026 under `kind=session`, in a tenant that has a real session dated 2026-09-24 inside that range. I flagged it as a possible [C4] failure.

It was a real bug, and not the one I guessed. The no-match branch was `inRange.length === 0 && activeFilterCount > 0`, **which is also true while `sessions` is still `null`** — in flight, or after a failed load. The page blamed the user's filters for a loading state. Fixed at `CalendarPage.tsx:196-210` (branch order: loading → genuinely-no-data → no-match → grid), with four regression tests including my exact case.

**Verified live at the same URL:** `?view=month&date=2026-09-24&kind=session` → *"3 event(s) in this range · 27 of 35 after filters"*, the Zoho webinar visible, **no** false no-match message.

## Criteria

- **[C1] Three views — MET (four shipped).** `month | week | day | list`, switchable, `view` in the URL and reload-stable, month default. The fourth (`list`) exists only because [I5] forbids deleting the working list view. The maker asked whether I read [C1] as exactly-three. **I do not** — [C1] sets a floor, [I5] mandates the list's survival, and failing a unit for obeying both would be incoherent.
- **[C2] Real time grid + overlap — MET at model and DOM level; NOT verified against production data.** The live tenant has exactly one timed event on any given day, so I could not arrange a real overlapping pair. Positioning is proven (below); side-by-side column layout is proven by the maker's fixtures only. **I am recording this as a genuine gap in my own verification, not as a passed criterion**, and it is the first thing the next unit touching this file should exercise.
- **[C3] Today + navigation preserving filters — MET.** Prev/next/Today present; filters survive navigation (verified via URL state).
- **[C4] One timeline, two kinds — MET.** Sessions and meetings on the same grid, visually distinguished (green = recorded session, blue = upcoming meeting, stated in the page header), and the count line reports both in-range and post-filter totals.
- **[C5] Filters — MET.** `kind`, `source`, `q` (free text), all combinable, all URL-reflected, with an active-filter count and Clear filters. The no-match message exists and now fires only when data is loaded and non-empty. The maker found and fixed a second bug here itself: clear-filters was a **no-op**, because three sequential `setParams` calls all read the same batched `prev`, so the last re-added what the first two deleted.
- **[C6] Event detail on click — MET.** `?event=session:<id>` / `meeting:<id>` opens a detail panel from real fields.
- **[C7] Honest empty/degraded states — MET**, and materially strengthened by the load-state fix above.
- **[C8] Keyboard/accessibility floor — MET on the surfaces I drove.** Event chips are real `<button>` elements; I activated a graph node by keyboard in the sibling unit using the same pattern. The maker disclosed it verified calendar keyboard nav by test rather than live, having stopped browsing when I claimed the browser — accepted, and the button semantics are directly observable in the DOM.
- **[C9] Timezone — MET, and this was my automatic-FAIL criterion, so I verified it twice.**
  - Arithmetic: the "Weekly Sync Up with Umesh" (11:00–11:30) wrapper carries `top: 45.8333%` = **11/24 exactly**, `height: 2.08333%` = **0.5/24**.
  - Independent geometry: the chip's rendered pixel top is **846**, and the "11 AM" hour-axis label sits at **848** — a **2px** delta. It is in the 11:00 row on screen, not merely in the arithmetic.
  - Page states *"All times shown in Asia/Calcutta."*
  - **Falsification caveat the maker raised, and it is correct:** the page-level "25th not 24th" test stays green under a naive-parse mutant on this machine, because at UTC+05:30 UTC-midnight is the same local day; the model-level `getHours() === 0` assertion is what catches it here and in any non-zero-offset zone. At exactly UTC the two implementations are genuinely equivalent. No universal catch is claimed, and I am not pretending one exists.

## Invariants

- **[I1] No new data source — HOLDS.** Renders `GET /calendar/upcoming` and `listSessions` as they are.
- **[I2] Tenancy unchanged — HOLDS.** No new route; the `calendar` scope check is intact, and the cross-tenant probe set re-run for the sibling unit passes unchanged.
- **[I3] Real data only — HOLDS.** No seeded or placeholder events in any view.
- **[I4] LOC budget — HOLDS.** `lint-loc OK (305 files)`, `lint-dirsize OK (85 dirs)`; the calendar was split into `calendar-model.ts` + five components rather than raising the budget.
- **[I5] List view survives — HOLDS.** Preserved as `AgendaView.tsx`, reachable as the `list` view.

## `lint:structure` — RED, and verified NOT this unit's

Same pre-existing failure as the sibling: `lint-root` reports 16 tracked loose files against a budget of 15. I reproduced it on **master** with the identical file list, and neither UI unit adds a root file. Recorded as **ISS-248**. The maker is also right that fixing it means moving a tracked root file named in `ARCHITECTURE.md §4`, which needs an authorizing DECISIONS entry — **an Approver decision, not the maker's**.

## One pre-existing failure that is already fixed elsewhere

The maker reported `packages/index` 1 failing test (`tree-real-data.test.ts` ENOENT on the webinar session's `session.json`) and **proved it pre-existing by stashing its entire diff and re-running**. That is ISS-294, which I PASSED in the peer's lane (`wave/iss-291-sync-txn`) earlier tonight. It resolves on that merge. Not this unit's, and not a reason to hold it.

## Note on the maker's disclosed accident

The maker disclosed that its stash round-trip did not restore a stray **untracked** root artifact (a temp diff whose filename was a mangled Windows path). Never tracked, no history lost, and root's tracked count is 16 either way. Disclosing a self-inflicted deletion unprompted is the behaviour I want; it is not a defect in this unit.

## Why PASS

Every criterion is met except [C2]'s overlap layout, which I could not exercise against production data and have recorded as an unverified gap rather than quietly counted as passed. The criterion I declared an automatic FAIL — timezone — passes on two independent measurements. And the one defect I spotted from the outside was real, correctly diagnosed as something different from my guess, fixed at the root cause, and pinned with a regression test using my own case.
