# Spec — u4-watch-dashboard

**Status:** DRAFT awaiting approval (`qa/gates/plan-approved-u4-watch-dashboard.md`, spec line).
**Derived from:** `intent.md` + Umesh's three answers of 2026-09-27 (push-alert-first · visible-only ·
two user types). **Audience:** `internal-tool`.

## What the answers changed

The plan row called this a dashboard. Answer (b) makes it **an alert with a landing page**, so the
requirements below are ordered alert-first, and the screen is specified as the place you arrive
*after* being interrupted — not the place you remember to visit.

## The gap the alert has to fill (checked, not assumed)

`packages/meeting-bot/src/capture/telegram-alerts.ts:61-69` defines `TelegramNotifier` with
`notifyJoined` · `notifyDisconnected` · `notifyRecovered` · `notifySilence` · `notifyFinished`.
Every one of those fires **during or after a recording that started**. There is no notification for:

- **a watch poll that failed** — though `watch_state` already records it
  (`packages/core/src/generated/watch_state.ts`: `status: "failed"`, `failedAt`, `failureReason`);
- **a poll that stopped happening at all** — the silent case, which is what actually bit us: no row
  is written, so there is nothing to react to;
- **a recording about to start.**

So the Ashoka failure was not unmonitored by accident. The notifier covers the whole life of a
recording that begins, and nothing upstream of it. That is the hole.

## Requirements

**[R1] Alert on a failed poll.** When a watch run writes `status: "failed"`, one notification goes
out naming the source, the time, and `failureReason` verbatim. Throttled per
`(tenantId, sourceType, sourceId)` so a source failing every 5 minutes does not produce a stream —
one alert, then silence until it changes state.

**[R2] Alert on a watcher that went quiet — the load-bearing one.** If no watch run has completed
within a configured interval, alert. **This cannot be driven by `watch_state` rows**, because the
failure mode is the *absence* of rows; it needs a heartbeat written on every completed run and a
separate check that reads it. Without R2 the feature does not address the incident it exists for:
a watcher that dies writes nothing, alerts nothing, and looks identical to a quiet week.

**[R3] Alert before a recording starts**, naming the meeting and why it was selected.

**[R4] The landing screen** at `/watch`, reachable from the nav and from a deep link in every alert.
Covers **both source families**, not just `watched_sources` — amended 2026-09-28 by D-047, after
ISS-358 found R1's alert fires off `watch_state`/`watch_heartbeat` while the page as built (U4c)
read only `watched_sources`/`meeting-candidates`, genuinely disjoint collections with zero code
overlap: the alert's deep link landed on a page with no visibility into the failure that triggered
it. Per watched source: last poll time as **both** an absolute timestamp and a relative age,
outcome, and the failure reason when failed. Per Drive/Gmail/Calendar watcher (`watch_state`/
`watch_heartbeat`, U4d): the same failed-poll detail plus per-source-type heartbeat liveness, using
the exact staleness predicate R2's alert uses, so the page can never show a watcher as healthy that
the alert already fired on as silent. A source or watcher past its expected interval renders as
*visibly wrong* (its own state, not a timestamp the reader must compute) — restating R2 in the UI,
because "stale" that requires arithmetic is the same silence as before.

**[R5] Next up, read-only.** Upcoming auto-records with the reason each was selected. No cancel, no
force — answer (3) was visible-only, so there are no writes to scheduler state in this unit.

**[R6] Poll now.** A button calling the existing `POST /watched-sources/run`
(`apps/api/src/routes/watched-sources.ts:100`), with its result reflected on the page. This is the
unit's only write, and it pre-exists.

**[R7] Plain language, every state.** Each state carries a sentence saying what it means and what to
do. This is `vidysea-staff`'s requirement and it is not cosmetic: a colleague who reads
`failureReason: "401"` and does not know it means the Google token needs re-consent will do nothing,
which is the same outcome as no alert.

**[R8] Tenancy.** Every read is tenant-scoped, asserted by test. Security class under D-014, so
**never round-capped** — ISS-078 in this repo was a cross-tenant read disclosure found at round 5 of
a seam that had already PASSed four times.

## Navigation per user type

| user type | path to the goal | steps | must understand unaided |
|---|---|---|---|
| `umesh-operator` | Telegram alert → tap deep link → `/watch` → read the red row → `poll now`, or go fix the credential | 3 | which source failed, and whether it is transient |
| `vidysea-staff` | nav → `/watch` → read the red row and its plain-language line → escalate or `poll now` | 2 | what a failed poll *means*, with no prior knowledge of the pipeline |

**Negative paths, all required:** API unreachable (page must say so, not render an empty healthy
state — an empty list that looks green is the worst possible failure here); zero watched sources
configured (distinguish "none configured" from "all healthy"); `poll now` fails (surface the error,
re-enable the button); a source with no successful poll ever (no `lastPollAt` at all).

## Out of scope

Cancel/force (answer 3) · scheduler-state writes · the dead duplicate `/ask` route (ISS-335) ·
`SourcesPage` test debt (ISS-336) · anything touching `apps/web/src/pages/sessions/` or
`CalendarPage`, which already work.
