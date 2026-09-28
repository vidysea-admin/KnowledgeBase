# ARCHITECTURE gate — R2's detector cannot reach its notifier, and D-048 put it where it can't

**Opened:** 2026-09-28 by the maker, on the `u4b-heartbeat-collection` builder's disclosure.
**Owner:** Umesh (Approver). **Blocks:** R2 reaching 1/1. Detection is built, tested and merged-ready;
**alerting reaches `console.error`, not Telegram.**

## The contradiction

Two rules that are each correct collide:

- **D-048 requires the staleness detector to live in `apps/api/src/routes/health.ts`.** That was a
  deliberate choice and still the right one: a detector must run in a **different process from the
  writer** or it dies with it, and `health.ts` is an already separately-running server.
- **`.dependency-cruiser.cjs` forbids `apps/* -> packages/meeting-bot`.** `notifyWatchSilent` — the
  notifier U4b already shipped and whose four tests already pass — lives in meeting-bot.

So the detector is mandated into a place that structurally cannot import the notifier. Neither rule is
wrong; the decision simply did not notice they were incompatible, and the decision was the maker's.

The builder did not paper over it. It made the alert sink **fully injectable** — a structurally identical
signature, zero imports — so the wiring is a one-line change once this is answered, and it declined to
pick among the three ways out on its own. That restraint is right, but it has a cost worth stating: the
injectable seam makes R2 *look* nearly done while the actual alert still goes nowhere a human will see.
**R2 is 0.5/1.**

## Two further gaps on the same requirement, neither hidden

- **Nothing schedules the `/health` probe.** A detector nobody calls detects nothing. U6's Task Scheduler
  work is separately gated on live proof, so today the probe fires only when something happens to hit the
  endpoint.
- **The write leg is unproven at runtime.** No test connects to Mongo — production Mongo is read-only by
  construction and nothing was run against any database. The heartbeat *writer* is tested as pure logic
  and as a dry run; it has never actually written a row.

## The options

**(a) A notifier in a package `apps/*` is allowed to import.** A thin alert interface in an allowed
package (`packages/core` or `packages/db`-adjacent), which meeting-bot's `TelegramNotifier` implements.
Respects the dependency rule instead of bending it, and is the conventional fix for exactly this shape of
problem. Cost: new files, so it needs your say-so. **Maker recommends this.**

**(b) Loosen the depcruise rule** to permit `apps/api -> packages/meeting-bot`. One line, no new files —
but `.dependency-cruiser.cjs` is an enforcement path, so it needs a decision carrying `Approved-by`, and
it weakens a boundary that currently keeps the web tier independent of the capture stack. Cheap now,
and the kind of cheap that is paid for later.

**(c) Move the detector out of `health.ts` into a script.** Contradicts D-048 directly and reopens the
question D-048 settled — the detector would once again live next to the writer, which is the failure mode
R2 exists to catch. Not recommended, listed for completeness.

## Also needed, and nearly mechanical

`python schema/validate.py` is **red on `watch_heartbeat` only** — it wants
`schema/fixtures/watch_heartbeat/{valid,invalid}.json`, the **seventh and eighth** new files. The builder
stopped rather than create them, which was correct under D-048's cap. Their content is fully determined by
the schema you already approved (~10 lines each), and `qa/loop.md:25` requires that validator green for any
unit touching `schema/`. This is the unit's only red verification. Recorded separately at
`qa/gates/u4b-heartbeat-schema-fixtures.md`.

## Answer format

`u4b-r2: <a|b|c>` and `u4b-fixtures: <yes|no>`

**Answered:** `u4b-r2: a` and `u4b-fixtures: yes` -- Umesh, AskUserQuestion, 2026-09-28. A thin alert
interface in a package `apps/*` may already import, implemented by meeting-bot's Telegram notifier; the
detector stays in `health.ts` and `.dependency-cruiser.cjs` is NOT loosened. Both
`schema/fixtures/watch_heartbeat/{valid,invalid}.json` authorized. Authorized by **D-053**.

**Gate status:** ANSWERED 2026-09-28 (D-053). The alert-interface unit is unblocked. Two limits stay
open and are NOT charged to it: nothing schedules the `/health` probe (U6, separately gated on live
proof), and the heartbeat write leg has never written a row (no test connects to Mongo). R2 reaches 1/1
on alert delivery only
