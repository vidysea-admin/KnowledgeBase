# PLAN gate — u4-watch-dashboard (feature scope)

**Opened:** 2026-09-27 by the maker on a human-invoked tick. **Owner:** Umesh (Approver).
**Blocks:** plan unit 11 (`u4-watch-dashboard`) and, behind it, unit U6 (`scripts/watch/install-tasks.ps1`).
Per maker SKILL.md, a feature that adds a screen or a navigation path is not buildable until
`docs/features/<slug>/{intent,spec,plan}.md` exist and are approved. This file is that record.

## What is being asked

`docs/features/u4-watch-dashboard/intent.md` is drafted and carries a **3-question mini-grill**.
Nothing is built until question 2 in particular is answered, because (a) and (b) produce different
screens and (b) may make the screen the smaller half of the feature.

The draft also reports that **the plan row for unit 11 is stale**: `/sessions`, `/sessions/:id` and
the approve/reject flow on `/calendar` already exist, so the real gap is that
`GET|POST /watched-sources` and `POST /watched-sources/run` have **no UI consumer whatsoever**
(`apps/api/src/routes/watched-sources.ts:67,100,107` vs no `apps/web/src/api/watched-sources.ts`).
Approving the intent also means accepting that narrowed scope.

## Answer format

`u4-intent: 1=<who> 2=<a|b> 3=<visible|actionable>`

Then, after the maker writes them from those answers, one line each for spec and plan.

**Answered: intent —** 2026-09-27 — `1=umesh-operator + a Vidysea colleague` · `2=(b) push alert
first, page second` · `3=visible only` — Umesh in chat (AskUserQuestion, this session). Recorded
before `spec.md` was written, per the PLAN gate.

Consequences the maker is taking from those three answers, so the spec can be checked against them:
- **(b) reframes the unit.** The alert is the feature; the page is where you land afterwards. The
  U3 notify channel already exists (`packages/meeting-bot/src/capture/telegram-alerts.ts` →
  `Notifier`), so the alerting half is wiring, not new transport. The screen shrinks accordingly.
- **Two user types** → `audience: internal-tool`, `personas: [umesh-operator, vidysea-staff]`, and
  **two persona walks**. The second one is the load-bearing change: a colleague who did not build
  this system must be able to read a failed poll and know what to do, so every state on the screen
  needs a plain-language line, not a status code.
- **Visible only** → no writes to scheduler state, `criticality: medium` holds, and the unit stays
  read-only apart from the pre-existing `POST /watched-sources/run`.
**Answered: spec —** 2026-09-28 — APPROVED AS WRITTEN, all of R1-R8. Umesh in chat (AskUserQuestion, this session). The alternatives offered and declined were dropping R3 (the before-a-recording-starts alert) and building the page with no alerts at all; the second would have reversed his earlier alert-first answer and would not have caught the Ashoka failure, since a page you must remember to visit is the same silence. R2 is approved knowing it is the load-bearing requirement and cannot be driven by `watch_state` rows, because the failure mode is the absence of rows.
**Answered: plan —** 2026-09-28 — APPROVED, all three units (U4a, U4b, U4c) and all three new files. Umesh in chat (AskUserQuestion, this session). This approval carries three specific things the plan asked for by name:
  1. **New-file permission for exactly three files** — `apps/web/src/pages/WatchPage.tsx`, `apps/web/src/pages/WatchPage.test.tsx`, `apps/web/src/api/watched-sources.ts`. Nothing else; the anti-drift rule still forbids any other new file, and `App.tsx` is edited in place for the route and nav entry.
  2. **U4b's heartbeat schema shape is decided: a NEW tiny collection**, `watch_heartbeat`, one row per (tenant, source), overwritten on each completed run — NOT a field on `watch_state`. The reason recorded with the choice: liveness must not share a lifecycle with per-poll history, because a retention or pruning policy on `watch_state` could then disable the silent-failure detector without anyone noticing, and that detector is the one thing in this feature that must not fail quietly.
  3. **Dispatch order confirmed** — U4a and U4c as one parallel wave (different files, no shared surface), U4b `after: U4a` because both touch `telegram-alerts.ts`. That is the only dependency edge.
  Approval is not a PASS: each unit still owes its own manifest, fresh checker and verdict, and U4c owes a Mode D live browser walk for both personas.

**Gate status:** ANSWERED — 2026-09-28; intent 2026-09-27, spec and plan both approved 2026-09-28. U4a/U4b/U4c are buildable. Note U6, which sits behind this gate, is separately blocked from its `-Apply` install by `qa/gates/live-recording-proof-method.md` until the next real webinar provides live proof
