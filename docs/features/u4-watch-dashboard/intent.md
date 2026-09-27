# Intent — u4-watch-dashboard

**Status:** DRAFT, awaiting Umesh's mini-grill answers. Not approved. No code may be written
against it until `qa/gates/plan-approved-u4-watch-dashboard.md` carries its three `Answered:` lines.
**Drafted:** 2026-09-27 by the maker, on a human-invoked tick (PLAN check, maker SKILL.md init 2b).
**Feature of:** plan unit 11 · vivid-donut capture wave U4.

## Problem

On 2026-09-27 the Ashoka Educator Dialogues webinar was not recorded. Two defects caused it
(ISS-323 launcher exit-0 mask, ISS-324 page-open budget) and both are now fixed, PASSed and merged.
But the reason **nobody noticed until after the session** is a third thing, which no unit has
touched: there is no surface anywhere that answers *"is the watching alive, and what is it about to
do?"* The failure was silent in the only place a human was looking — nowhere.

Umesh's words for the goal of this wave are *"don't remind me"*: the system should watch, decide and
record without being asked. A system that acts unattended must be **inspectable**, or its silence is
indistinguishable from its success. That is what this feature is for.

## What already exists (checked in the tree, not assumed)

This matters because the plan row for unit 11 says *"new `apps/web` Sessions page + `apps/api` routes
over unit 7's collections"*, and *that row is stale* — most of it was built by other units:

- `apps/web/src/pages/sessions/SessionsListPage.tsx` + `SessionDetailPage.tsx` exist, routed at
  `/sessions` and `/sessions/:id` (`apps/web/src/App.tsx:25-26`).
- `apps/web/src/pages/CalendarPage.tsx:20` already consumes `/meeting-candidates` **including
  approve and reject**, so the human-in-the-loop decision surface exists.
- `apps/api/src/routes/meeting-candidates.ts` and `watched-sources.ts` both exist and are tested.

**The actual gap is narrower and sharper than the plan row:**

1. **`/watched-sources` has no consumer at all.** The API serves `GET /watched-sources`,
   `POST /watched-sources` and `POST /watched-sources/run`
   (`apps/api/src/routes/watched-sources.ts:67,100,107`), and `apps/web/src/api/` contains no
   `watched-sources.ts`. `SourcesPage.tsx:3` imports `listSources` — the static source list, not the
   watch state. So the operator can see *what sources exist* and never *whether they are being
   watched, when they were last polled, or whether the last poll failed*.
2. **There is no way to trigger a poll from the UI**, though `POST /watched-sources/run` is sitting
   there — the exact action a human wants the moment they suspect the watcher is asleep.
3. **No surface shows what is about to be recorded.** `packages/meeting-bot/src/calendar/
   schedule-state.ts` holds it; nothing renders it.

## Proposed outcome

One operator screen that answers three questions in under five seconds, without reading a log:

- **Is the watching alive?** Per watched source: last poll time, outcome, and the error if the last
  poll failed. A source not polled within its expected interval must be visibly wrong, not merely
  old — a stale timestamp the eye has to compute is the same silence as before.
- **What is it about to do?** The next scheduled auto-records, and for each, *why* it was selected.
- **Can I intervene right now?** A manual "poll now" (`POST /watched-sources/run`), and a reachable
  path to approve or reject a candidate (CalendarPage already does the deciding — this links to it
  rather than duplicating it).

## Affected users and systems

**User types.** This is `internal-tool` audience: one confirmed user type, **`umesh-operator`**, the
person who needs to trust an unattended system. Other Vidysea user types (student, counsellor,
institution) never see this screen, so per the maker's audience rule they get no walk. That is a
claim about this product, not a default — it is grill question 1 below.

**Systems:** `apps/web` (new page + `apps/web/src/api/watched-sources.ts` client),
`apps/api/src/routes/watched-sources.ts` (read-only if the served shape is already sufficient),
`watch_state` and `meeting_candidates` collections (read-only — no schema change).

## Constraints

- **No schema change, no writes to `watch_state`.** The one write is the existing
  `POST /watched-sources/run`.
- `criticality: medium`, `Persona walk: required (umesh-operator)` — it is a new screen, so D-024's
  live browser rule and a Mode D checker walk both apply, and rendering is not validation: the
  filters and the "poll now" button must be asserted by their state change.
- Multi-tenant: every read is tenant-scoped. **ISS-078 in this repo was a cross-tenant read
  disclosure found at round 5 of a seam with four prior PASSes**, so tenancy here is security class
  under D-014 and never round-capped.
- The dead duplicate route at `App.tsx:35` (`/ask` registered twice, the second unreachable) is
  adjacent but **not** in this feature's scope; filed separately.

## Open questions — the mini-grill (3 of 3; Umesh answers, the maker does not guess)

1. **Is `umesh-operator` the only user type for this screen?** If a Vidysea colleague will ever run
   the capture (or if this later ships to an institution's own staff), the navigation and the amount
   of teaching on the screen both change, and the spec's flow table needs a second row.
2. **What is the trust signal you actually want?** Two shapes, and they lead to different screens:
   **(a) a health page you visit** — you open it when you wonder; simplest, but it only helps if you
   remember to wonder, which is the failure that already happened; or **(b) the screen is secondary
   and the real signal is a push** (the U3 notify channel already exists — Telegram) — the screen
   becomes the place you go *after* an alert, and the alert is the feature. I lean (b), because the
   Ashoka failure was not a missing page, it was a missing interruption.
3. **Does "about to record" need to be actionable from this screen, or only visible?** Actionable
   means a cancel/force path, which is a write to scheduler state and pushes criticality up to high
   with an outward-facing risk (it can stop a real recording). Visible-only keeps this unit medium
   and read-only. I recommend visible-only for this unit.

**Answer format:** reply `u4-intent: 1=<...> 2=<a|b> 3=<visible|actionable>`. The maker appends
`Answered: <ISO> — <choices> — <where>` to `qa/gates/plan-approved-u4-watch-dashboard.md` before
writing `spec.md`, per the PLAN gate.
