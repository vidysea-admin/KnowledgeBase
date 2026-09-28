# Plan — u4-watch-dashboard

**Status:** DRAFT awaiting approval (`qa/gates/plan-approved-u4-watch-dashboard.md`, plan line).
**Derived from:** `spec.md`. Three units, in this order. The alert units come first because answer
(b) made the alert the feature; if only one unit ever ships, it must be U4a.

| # | unit | files it touches (edit in place) | schema | how it is tested | criticality | persona walk |
|---|---|---|---|---|---|---|
| U4a | `u4a-watch-failure-alerts` | `packages/meeting-bot/src/capture/telegram-alerts.ts` (add `notifyPollFailed`, `notifyUpcomingRecording` to `TelegramNotifier`, ~line 61-69), `notify-channels.ts` routing, `scripts/watch/run-watch.mjs` call site | no | fake-transport unit tests per R1/R3, incl. the throttle key; assert no alert on a healthy run | medium | skip (no screen) |
| U4b | `u4b-watch-heartbeat-alert` | `scripts/watch/run-watch.mjs` (write a completed-run heartbeat), a new check in the same file's job path, `packages/db/src/collections/watch-state.ts` if the heartbeat lands there | **yes** — a heartbeat record. Needs its own approval line before build | fake-clock test: no run for > interval ⇒ exactly one alert; a resumed run clears it | **high** — it is the silent-failure detector; if it is wrong we are back to trusting silence | skip (no screen) |
| U4c | `u4c-watch-page` | **new** `apps/web/src/api/watched-sources.ts` (client; no consumer exists today), **new** `apps/web/src/pages/WatchPage.tsx` + `WatchPage.test.tsx`, `apps/web/src/App.tsx` (one route + nav entry) | no (reads existing) | Mode D checker: real browser walk per R4-R7, console-error count per page, and every interaction asserted by its state change — `poll now` must be asserted by the state change, not by rendering | medium | **required (umesh-operator, vidysea-staff)** |
| U4d | `u4d-watch-page-state-visibility` | Added 2026-09-28 by D-047 (ISS-358: R1's alert and R4's page watched genuinely disjoint collections). `packages/db/src/collections/watch-state.ts` (add `listWatchState`), `apps/api/src/routes/health.ts` (export `isStale`/extract `heartbeatStatuses`, no behavior change), `apps/api/src/routes/watched-sources.ts` (add `GET /watch-state`, edited in place rather than a new route file — both `apps/api/src` and `apps/api/src/routes/` are at/over their `lint-dirsize` budget), `apps/api/src/production.ts` (wire the real Mongo deps), **new** `apps/web/src/api/watch-state.ts` (client; web side has no dirsize pressure), `apps/web/src/pages/WatchPage.tsx` + `WatchPage.test.tsx` (edited in place — a third section, not a new page) | no (reads `watch_state` + `watch_heartbeat`, both already schema'd) | server-side unit tests for the new route (501-unwired, 403-scope, staleness computed via R2's own `heartbeatStatuses`, two-tenant isolation) + `WatchPage.test.tsx` cases for the new section | high — tenancy-adjacent (R8) | required (umesh-operator, vidysea-staff — same personas as U4c, now with the alert's actual subject visible) |

## Ordering and why

U4a and U4b are independent of U4c (different files, no shared surface), so **U4a and U4c can run as
one parallel wave**. U4b is `after: U4a` — it reuses the notifier surface U4a adds, so they would
collide in `telegram-alerts.ts`. That is the only dependency edge; stated per the parallel-waves rule
so nothing else is serialized by default.

## Two things that need Umesh before the unit that needs them, not at build time

1. **U4b's heartbeat is a schema addition.** `schema: yes` units need their own approval in this repo.
   The choice is a field on an existing collection versus a new tiny collection, and it is the kind of
   thing that is cheap now and annoying later.
2. **U4c needs new files** — `WatchPage.tsx` and `watched-sources.ts` do not exist, and the anti-drift
   rule reserves new files for Umesh explicitly. Approving this plan is that permission for exactly
   those three files (page, test, api client) and nothing else. Naming them here so approval is
   specific rather than blanket.

## What "done" means

Not "the page renders". Done is: a poll failure produces exactly one alert with the reason in it; a
watcher that stops produces an alert within the interval; the page distinguishes *unreachable*,
*none configured* and *all healthy* from each other; and both personas complete their walk. U4b's
done condition is the only one that requires simulating an absence, which is why it is the high-
criticality row.

## Deliberately not in this plan

The gated items stay gated: the live-recording proof method
(`qa/gates/live-recording-proof-method.md`), U6's Task Scheduler install — which should not ship
before that proof, since its entire purpose is to run unattended a path no human has watched succeed
— and `iss-322-multifile-shape`. U4 does not depend on any of them.
