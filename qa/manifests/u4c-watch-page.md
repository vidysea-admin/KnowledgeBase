# Manifest — u4c-watch-page

**Contract:** no `qa/contracts/` entry covers this UI unit (the three `watched-sources*.md`
contracts there are A13's backend feature — create/list/run — not this page). Ground truth is
`docs/features/u4-watch-dashboard/spec.md` (R4-R8 are this unit's) + `plan.md` (U4c row), approved
by **D-046** (`docs/DECISIONS.md:771`) and the gate at `qa/gates/plan-approved-u4-watch-dashboard.md`
("Gate status: ANSWERED").
**Feature:** u4-watch-dashboard, unit U4c (of U4a/U4b/U4c; U4a/U4b are separate units, out of scope here).
**Fix cycle:** 0 of max 3
**Persona walk:** **required (umesh-operator, vidysea-staff) — OWED, NOT PERFORMED.** Per plan.md's
U4c row and D-046's Result section, this unit owes a Mode D live browser walk for both personas
with every interaction asserted by its state change. **A maker self-attesting a persona walk is
invalid; only a fresh `/checker` performs it.** This manifest claims automated-test evidence only.
**Criticality:** medium (per plan.md; tenancy (R8) is security class under D-014 regardless of
this unit's own criticality, and is never round-capped).
**Executor:** claude-opus-subagent (maker build subagent, this worktree)
**Date:** 2026-09-28

**Status:** checked-PASS (cycle 0)

---

## Worktree note (read before the evidence below)

This worktree's branch (`worktree-agent-a7bfb796d6769286b`) was created from an older point in
`master` (`a99140f`) than the tip the dispatching maker was working from — `docs/features/u4-
watch-dashboard/{intent,spec,plan}.md`, the answered gate, and D-046 did not exist on this branch
when the unit started. Verified `a99140f` is a clean ancestor of `master`
(`git merge-base --is-ancestor a99140f master` → yes) and fast-forwarded this worktree onto
`master` (`git merge --ff-only master`, no conflicts, 235 files, all additive/unrelated-lane
changes) before reading spec/plan/gate/D-046. No manual edits were made to any of those three
governance files; they arrived via the fast-forward and were only read.

## What changed

`/watch` — a new operator page answering "is the watching alive / what's about to happen / can I
act right now" without reading a log, over the two existing endpoints A13 built and nothing had
ever called from the UI (`GET /watched-sources`, `POST /watched-sources/run`,
`apps/api/src/routes/watched-sources.ts:67,100,107`) plus the existing `GET /meeting-candidates`
CalendarPage already uses.

### New files (exactly the three D-046 names, no others)

- **`apps/web/src/api/watched-sources.ts`** (57 lines) — `listWatchedSources(apiKey)` and
  `runWatchedSources(apiKey)`. Types (`WatchedSource`, `WatchedSourceLastFetch`,
  `WatchedSourceRunFailure`, `WatchedSourcesRunSummary`) are declared **in this file**, not added
  to `apps/web/src/api/types.ts` — that file is not in D-046's three-file grant, so the shapes stay
  local rather than touching a fourth file. Neither function takes a tenant id; both take only
  `apiKey`, matching every sibling client (`sessions.ts`, `calendar.ts`, `meeting-candidates.ts`) —
  the only way tenancy reaches the server is the `Authorization: Bearer` header `apiFetch` attaches
  (R8).
- **`apps/web/src/pages/WatchPage.tsx`** (196 lines) — the page. See "Requirements" below for what
  each part does.
- **`apps/web/src/pages/WatchPage.test.tsx`** (243 lines) — 14 tests, all passing, covering R4-R8
  and all four required negative paths. Every interaction test asserts a state change (summary
  text, row content, button disabled/enabled, error text), never just that a control rendered.

### Edited in place

- **`apps/web/src/App.tsx`** (+2 lines) — import + `<Route path="/watch" element={<WatchPage />} />`,
  next to `/calendar`. The pre-existing duplicate `/ask` route registration at (now) line 36
  (ISS-335) was seen and **left untouched** — out of scope per the brief, and fixing it would put
  an unrelated change in this unit.
- **`apps/web/src/layout/NavSidebar.tsx`** (+2 lines, 1 changed) — **deviation from the file list,
  flagged rather than silently done:** the brief said "`App.tsx` — one route and one nav entry",
  but nav items are not in `App.tsx` — they are `NAV_ITEMS` in `NavSidebar.tsx`. Spec R4 explicitly
  requires the page be "reachable from the nav"; without this edit that requirement is unmet. Added
  one `NAV_ITEMS` row (`{ to: "/watch", label: "Watch", icon: <GapIcon /> }`) reusing `GapIcon`,
  which was already exported by `components/icons.tsx` but unused in the sidebar — no new icon,
  no new file, no other line touched in that file.

No `apps/api` change, no schema change, no write path other than the pre-existing
`POST /watched-sources/run` — matching spec.md's constraints and D-046 item 1.

## Two real gaps found against the currently-served API (documented, not silently worked around)

Both are called out in `WatchPage.tsx`'s header comment too.

1. **[R4] No persisted failure state exists on `watched_sources`.** `WatchedSource`
   (`schema/watched_sources.schema.json` / `packages/core/src/generated/watched_sources.ts`) only
   carries `lastFetch: {fetchedAt, hash, diffFrom}` — written on a **successful** check.
   `packages/ingest/src/watched/run.ts`'s catch branch (`runWatchedSources`, lines ~92-99) never
   calls `recordFetch` on failure; it only appends to the run's own transient `failed[]` array. So
   `failureReason` can only ever be shown for a run **this page itself just triggered** via "Poll
   now" — a scheduled/external run that failed before this page was opened leaves no visible trace
   at all. The page is honest about this (rows compute `stale`/`never`/`healthy` from real
   `lastFetch` + `checkIntervalHours`; a failure reason only appears after a manual poll, keyed to
   that source, via `poll-now-summary`'s `failed[]`) but this is a real product gap, not a display
   choice — closing it needs the run to persist failure state on the source (an `apps/api` +
   schema change, outside this unit's authorization).
2. **[R5] No API exposes "why an auto-record was selected."** The real decision is
   `selectAutoRecordItems` (`packages/meeting-bot/src/calendar/auto-join.ts`), composed by
   `packages/meeting-bot/src/calendar/schedule-tick.ts` (the `cli schedule-tick` command) — not
   `scripts/watch/run-watch.mjs`, which is U2's Drive/Gmail digest watcher and does no selection or
   trust filtering at all. The chosen items' dedup state lands in `schedule-state.json`
   (`packages/meeting-bot/src/calendar/schedule-state.ts`, whose own header calls it "a local JSON
   file... single-poller-instance data"). All of this is CLI-only; no `apps/api` route serves
   `selectAutoRecordItems`'s output or `schedule-state.json`. "Next up" therefore
   lists real `GET /meeting-candidates` rows with status `approved`/`auto_approved` (a genuinely
   real "this will be auto-recorded" signal CalendarPage already relies on) with their **real
   status** as the plain-language reason — not the richer selection reason spec.md's prose
   describes, which nothing currently exposes. Recommend a follow-up unit adding a read-only
   `apps/api` endpoint over `schedule-state.json` if the richer reason is wanted; not built here
   because it needs a new `apps/api` file this unit's D-046 grant does not authorize.

## Requirements — evidence

**[R4] Is the watching alive.** Each row (`data-testid="watch-row"`) shows the absolute
(`toLocaleString()`) and relative age (`relativeAge()`, `WatchPage.tsx:32-40`) of `lastFetch`, and
`data-status` is its own computed field (`healthy`/`stale`/`never`) — never a bare timestamp the
reader must compute. `statusOf()` (`WatchPage.tsx:47-51`) compares real elapsed time against the
source's own real `checkIntervalHours`.
Evidence: `WatchPage.test.tsx` — "a healthy source shows an absolute AND relative last-poll time…"
and "a source past its own interval renders as visibly wrong in its own right…", both green (see
run below).

**[R5] Next up, read-only.** "Next up (read-only)" section lists `approved`/`auto_approved`
candidates only, each with its real status as the reason; no cancel/force control exists anywhere
on the page.
Evidence: `WatchPage.test.tsx` — "only approved / auto_approved candidates are listed…" and "there
is no cancel or force control anywhere on the page…", both green.

**[R6] Poll now.** One button calls the pre-existing `POST /watched-sources/run`
(`runWatchedSources`), disables while in flight, and on completion shows the REAL summary
(`checked`/`changed`/`skipped`/`failed.length`/`remaining`) and re-fetches the list.
Evidence: `WatchPage.test.tsx` — "clicking Poll now disables the button, then reflects the REAL
summary and re-fetches the list" asserts the disabled state via a held (unresolved) promise, then
the exact summary string, then re-enabled, then `listWatchedSources` called twice and
`runWatchedSources` once — a state-change assertion, not a rendering one.

**[R7] Plain language, every state.** `PLAIN_LANGUAGE` (`WatchPage.tsx:53-57`) gives
`healthy`/`stale`/`never` each a real sentence (rendered at `data-testid="watch-row-plain-
language"`); the unreachable and zero-configured states each carry their own sentence too.
Evidence: `WatchPage.test.tsx` — per-status plain-language assertions inside the R4 tests, plus the
dedicated "[R7] plain language on every state" test for unreachable/zero-configured.

**[R8] Tenancy.** Neither client function accepts a tenant id; both take only `apiKey`
(`watched-sources.ts:51-57`). Server-side, `watched-sources.ts`'s route derives
`req.auth!.tenantId` from the auth middleware (never the body/query) and
`packages/db/src/lib/tenantScope.ts`'s `scopedCollection` makes a tenant-less Mongo call a **TS
compile error** — this unit adds no server code, so that guarantee is unchanged; this unit's own
job is not to add a client-side path around it.
Evidence: `WatchPage.test.tsx` — "listWatchedSources and runWatchedSources are called with exactly
the apiKey, never a tenant override" asserts every recorded call's arguments equal `["test-key"]`
verbatim (not just "was called"), and "the page renders no tenant-selection input of any kind"
queries for one and asserts none exists. This is unit-level (client-shape) evidence; the
tenant-isolation guarantee itself is `scopedCollection`'s, already covered by A13's own tests
(`watched-sources.test.ts`), not re-proven here.

## Negative paths — evidence

- **API unreachable:** `listWatchedSources` rejects with `ApiError(0, ...)` → `watch-unreachable`
  renders, `watch-none-configured` and any `watch-row` do NOT. Test: "an unreachable API shows the
  unreachable message, never the zero-configured or a row."
- **Zero watched sources:** resolves `{ sources: [] }` → `watch-none-configured` renders with text
  distinguishing it from "all healthy"; no row renders. Test: "zero sources renders its own
  message, not an empty row list that looks green."
- **Poll now fails:** `runWatchedSources` rejects → `poll-now-error` shows the real message AND the
  button is re-enabled (asserted via a held-then-rejected promise, not immediate resolution). Test:
  "poll now failing surfaces the error and RE-ENABLES the button."
- **Never successfully polled:** a source with no `lastFetch` renders "Never checked successfully",
  `data-status="never"`, and its own plain-language sentence — no crash on the missing field. Test:
  "a source with no successful poll ever renders honestly, without a crash or an invented timestamp."

## Commands run, real output

```
$ pnpm exec vitest run src/pages/WatchPage.test.tsx   (in apps/web)
 Test Files  1 passed (1)
      Tests  14 passed (14)

$ pnpm exec vitest run   (in apps/web, full suite — no regressions)
 Test Files  17 passed (17)
      Tests  148 passed (148)

$ pnpm exec tsc -b --noEmit   (in apps/web)
(no output — clean)

$ node scripts/lint-loc.mjs   (repo root)
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
```
All 4 are the known pre-existing violations named in the brief; none of this unit's three new
`.tsx` files are checked by this script at all (`structure.config.json`'s `loc.extensions` is
`[".ts", ".py", ".mjs"]` — `.tsx` is not in it), and the one new `.ts` file
(`watched-sources.ts`, 57 lines) is far under budget. **No fifth violation was added.**

```
$ pnpm run lint:structure   (repo root — composite; NOT green, but not because of this unit)
```
This composite fails at its first step (the same 4 pre-existing `lint-loc` violations above,
unrelated to any file this unit touches) and never reaches the later steps under `&&`. Ran each
remaining step individually instead, to confirm this unit adds nothing new:

```
$ node scripts/lint-dirsize.mjs        → OK (88 dir(s) within budget)
$ node scripts/lint-root.mjs           → FAIL — 1 violation (16 loose root files vs budget 15);
                                          pre-existing — none of the 16 named files were touched by
                                          this unit, and the count doesn't include any apps/web file
$ node scripts/lint-dupes.mjs          → OK (453 unique export(s), 26 unique schema $id(s))
$ node scripts/lint-migrations.mjs     → OK (1366 file(s) scanned)
$ node scripts/snapshot.mjs --check    → FAIL — docs/SNAPSHOT.md stale, 93 line(s) differ; entirely
                                          about `docs/features/` and `qa/briefs/` dir-tree entries
                                          that arrived via the master fast-forward merge (see
                                          "Worktree note"), not from this unit's files
$ node scripts/tracker-audit.mjs --gate g1,g4
                                        → 5 findings, all "ambiguous issue ref" in
                                          t-031-audio-watchdog.md / t-033-bot-tests.md /
                                          u3-notify-channels.md / t-047-controller.md — none are
                                          files this unit touched or created
$ pnpm exec depcruise --config .dependency-cruiser.cjs packages apps workers
                                        → "no dependency violations found (373 modules, 1170
                                          dependencies cruised)" — clean, confirms the new client
                                          respects the apps/web-imports-zero-packages boundary
```
None of the `lint:structure` failures are caused by, or touch, any file this unit created or
edited. Flagging this plainly rather than claiming a green `lint:structure` that isn't real.

## What this unit does NOT do

- Does not touch `SourcesPage.tsx`, `apps/api/*`, any schema, or `watch_state`/`watch_heartbeat`
  (U4b's collection) — read-only apart from the pre-existing `POST /watched-sources/run`.
- Does not fix the duplicate `/ask` route (ISS-335) or `SourcesPage` test debt (ISS-336) — both
  explicitly out of scope per spec.md and the brief.
- Does not add cancel/force for "next up" — visible-only per D-046/answer 3.
- Does not perform the Mode D live browser walk for either persona (`umesh-operator`,
  `vidysea-staff`). That is owed and is the checker's job, not the maker's — this manifest does not
  claim it happened.
- Does not close the two documented API-shape gaps (persisted failure state; auto-record selection
  reason) — both need new `apps/api` surface outside this unit's file grant, and are named above
  for a follow-up decision rather than worked around.
- Does not resolve the pre-existing `lint:structure` failures (lint-loc's 4, lint-root's 1,
  snapshot staleness, tracker-audit's 5 ambiguous refs) — none belong to this unit; fixing them
  here would be exactly the kind of unrelated-change scope creep the brief warns against.

**Handshake status:** checked-PASS — closed out 2026-09-28 against verdict cycle 0 (VERDICT: PASS, commit 18d00c3). ISS-358 (high) and ISS-359 remain OPEN; per D-042 unit-status and issue-status are separate axes, and ISS-358 is a spec-level premise spanning all three U4 units, not a defect in this one.
