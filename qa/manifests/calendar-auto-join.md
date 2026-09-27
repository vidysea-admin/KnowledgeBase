# Manifest — calendar-auto-join (T-025)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/calendar-auto-join.md`
Contract: `qa/contracts/calendar-auto-join.md`

## Disclosed scope-down (read this first)
No Google Calendar OAuth credentials exist (`.env` has none) — that is a human/ops setup step,
not resolvable by this unit. This builds the `CalendarClient` interface + the pure
`selectEventsToAutoJoin` decision function only; no real Google Calendar implementation, no live
wiring into T-024's `capture()`, no scheduler.

## What changed

1. **`packages/meeting-bot/src/calendar/calendar-client.ts`** (new) — `CalendarEvent` type +
   `CalendarClient` interface (`listUpcomingEvents(windowMinutes)`), no implementation.
2. **`packages/meeting-bot/src/calendar/auto-join.ts`** (new) — `selectEventsToAutoJoin(events,
   now, leadMinutes)`: excludes events with no `meetingUrl`, excludes events starting more than
   `leadMinutes` out, excludes already-ended events, includes in-progress events, sorts matches
   by `startTime` ascending. Doc comment documents (not builds) the composition with T-024's
   `capture()`.
3. **`docs/adr/0005-calendar-auto-join.md`** (new, 38 lines, under the 60-line budget) —
   `leadMinutes = 2` default + justification, honest credential-status disclosure.
4. **`packages/meeting-bot/src/index.ts`** — exports the new `calendar/` module.
5. **`docs/SNAPSHOT.md`** — no change needed (already fresh — confirmed via `pnpm lint:structure`).

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/meeting-bot test
tests 27 / pass 27 / fail 0   (20 pre-existing + 7 new: auto-join.test.ts)

$ pnpm -r test
core 7 / index 19 / ai 23 / ingest 34 / ask 30 / meeting-bot 27 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (138 file(s) within budget)
lint-dirsize: OK (62 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (194 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (713 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (148 modules, 416 dependencies cruised)
```

## Files touched
- `packages/meeting-bot/src/calendar/calendar-client.ts` (new)
- `packages/meeting-bot/src/calendar/auto-join.ts` (new)
- `packages/meeting-bot/src/calendar/auto-join.test.ts` (new)
- `packages/meeting-bot/src/index.ts` (export)
- `docs/adr/0005-calendar-auto-join.md` (new)
- `qa/contracts/calendar-auto-join.md` (new contract, maker-drafted)

## Follow-up (not this unit, disclosed in contract Non-goals)
Once Google Calendar OAuth credentials exist: a real `CalendarClient` implementation (small,
isolated, same shape as T-019's provider adapters), a scheduler tying `listUpcomingEvents` →
`selectEventsToAutoJoin` → `capture()` together, and a per-meeting opt-in UI.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
