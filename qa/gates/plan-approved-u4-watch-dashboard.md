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
**Answered: spec —** (pending)
**Answered: plan —** (pending)

**Gate status:** PARTIAL — intent answered 2026-09-27; the spec and plan lines are still pending
