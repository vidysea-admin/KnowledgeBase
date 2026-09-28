# AUTHORIZATION gate — the `watch_heartbeat` collection needs four files D-046 did not authorize

**Opened:** 2026-09-28 by the maker, on the u4b builder's disclosure. **Owner:** Umesh (Approver).
**Blocks:** R2 — the only requirement in the U4 spec that detects a watcher which has **stopped running
entirely**, which is the Ashoka failure mode. U4b is at `ready-for-check` with the verifiable parts built
and R2 itself unmet.

## The collision

D-046 did two things that turn out to conflict:

1. It settled the heartbeat's shape as a **new `watch_heartbeat` collection**, rejecting a field on
   `watch_state` (correctly — R2's failure mode is the *absence* of `watch_state` rows, so a field on the
   rows that stop being written cannot detect it).
2. It granted new-file permission for **exactly three** files, all of them U4c's, and said in terms:
   *"No other new file is authorized."*

This repo's frozen `ARCHITECTURE.md` requires every collection to carry four things — a schema file, a
generated type, a tenant-scoped accessor in `packages/db/src/collections/`, and a migration entry. The
precedent is `migrations/20260925090000-source-watcher.cjs`, which created `watch_state` and
`watch_reports` exactly that way. **None of those four files is among D-046's three.** So the decision
that chose a new collection did not authorize the files a new collection requires in this repo.

The builder stopped at that boundary and raised this gate instead of routing around it. It named the three
workarounds it rejected, and the reasons are right: a local JSON file reverses D-046's own choice; reusing
`watch_reports` reintroduces the lifecycle coupling D-046 rejected for `watch_state`; and hand-rolling raw
untyped `db.collection()` calls would ship the R8 tenancy guarantee without the scoped-accessor machinery
every other collection has — an ISS-078-class risk, in the one requirement class this repo never
round-caps. Stopping was the correct call.

## What U4b shipped anyway

Everything that does not touch the missing collection, all in already-authorized files:

- `scripts/watch/run-watch.mjs` — five pure, exported, I/O-free functions: `watchHeartbeatIntervalMs`,
  `isHeartbeatStale`, `findStaleHeartbeats`, `watchHeartbeatId`, `buildHeartbeatDoc`.
- `packages/meeting-bot/src/capture/telegram-alerts.ts` — `notifyWatchSilent`, same idiom as U4a's
  `notifyPollFailed`, throttled per `(tenantId, sourceType)`, and its message distinguishes *"no run has
  ever completed"* from a stale timestamp and says plainly that **polling stopped** rather than that a poll
  failed (R7).
- Four committed tests for `notifyWatchSilent`.

A checker is running against it now. **Note what is missing and is not being hidden:** there is no
committed test file for the five `run-watch.mjs` functions, because that too would be a new file — the same
restriction that produced ISS-357 on U4a. They were verified with a throwaway script. Two units in a row
have now been unable to test new logic because test files are new files.

## The four decisions

**1 — Authorize the four `watch_heartbeat` files?** The proposed row shape is
`{_id: "<tenantId>:<sourceType>", tenantId, sourceType, lastHeartbeatAt}`. Note the deliberately two-part
key, against `watch_state`'s three-part one: a heartbeat is per polling *phase*, not per watched item,
which is what makes it able to detect total silence. **Maker recommends yes** — R2 is the requirement the
whole wave exists for, and the alternative is shipping a watch dashboard that cannot tell you the watcher
is dead.

**2 — Where does the detector live?** A staleness detector must run in a **different process from the
writer**, or it dies with it. `run-watch.mjs` is a one-shot script with no daemon wrapper, and U6's Task
Scheduler work is itself gated. The builder proposes extending `apps/api/src/routes/health.ts` in place —
already a separately-running server with its own db-ping logic. **Maker recommends that**, as an in-place
edit to an existing file rather than another new one.

**3 — The interval.** The builder used **2 hours** and labelled it `[ASSUMPTION]`, correctly: no interval
appears anywhere in the spec, the plan or D-046. It needs a real number, and the right one depends on how
often the watchers actually poll.

**4 — Lower priority, but it recurs.** Extract the five pure functions into
`scripts/watch/lib/heartbeat.mjs` + a `lib/heartbeat.test.mjs`, matching that directory's existing
`lib/*.mjs` + `lib/*.test.mjs` pattern. This relieves `run-watch.mjs`, which is one of the repo's four
standing `lint-loc` violators and grew 522→572 this unit, **and** it gives the five functions a committed
test. Two new files, both conventional.

## Answer format

`u4b: 1=<yes|no> 2=<health-route|other:...> 3=<interval, e.g. 30m|1h|2h> 4=<yes|no>`

**Answered:** `u4b: 1=yes 2=health-route 3=1h 4=yes` -- Umesh, AskUserQuestion, 2026-09-28. All four
`watch_heartbeat` collection files authorized; detector extends `apps/api/src/routes/health.ts` in place;
interval **1 hour**, replacing U4b's `[ASSUMPTION]` 2h; and the five pure functions move to
`scripts/watch/lib/heartbeat.mjs` with their first committed test. Authorized by **D-048**, which widens
D-046's new-file cap for these six files only.
**Gate status:** ANSWERED 2026-09-28 (D-048). R2 stays unmet until the authorized unit is built and PASSed
fall on their own merits and R2 stays unmet until this is answered
