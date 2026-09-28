# AUTHORIZATION gate — `schema/validate.py` needs two fixture files D-048 did not authorize

**Opened:** 2026-09-28 by the `u4b-heartbeat-collection` builder. **Owner:** Umesh (Approver).
**Blocks:** nothing in the unit's behaviour. It blocks one verification command from going green:
`python schema/validate.py`, which `qa/loop.md:25` requires to exit 0 for any unit that touches
`schema/`. Everything else in the unit is built and green.

## What happened

D-048 authorized six new files, item 1 being `schema/watch_heartbeat.schema.json`. That file is written
and `pnpm gen:types --check` is clean against it. But `schema/validate.py` does not only read the
schemas — for **every** collection it requires a fixture pair:

```
schema/fixtures/<collection>/valid.json     must validate
schema/fixtures/<collection>/invalid.json   must FAIL validation
```

All 26 pre-existing collections have that pair (`schema/fixtures/watch_state/`,
`schema/fixtures/watch_reports/`, …). `watch_heartbeat` has none, so the validator prints:

```
FAIL: watch_heartbeat - missing fixture(s)
FAIL: one or more collections did not behave as expected.
```

Every other line of that run is `OK`, which is also the proof this is the unit's only regression there:
the failure is scoped to exactly the collection this unit added.

## Why the builder did not just create them

They are the **seventh and eighth new files**. D-048's grant is explicit — six files, named, "this widens
D-046's new-file cap for these files only; the cap otherwise stands." U4b's builder stopped at the same
kind of boundary rather than routing around it, its checker ruled that blocker real, and D-048 exists
because of that. Creating two unlisted files here would undo the reason this unit has a clean
authorization.

It is also a **new subdirectory** (`schema/fixtures/watch_heartbeat/`), taking `schema/fixtures/` from 26
entries to 27 against a 30 dirsize budget — within budget, but still a structural addition.

## What is actually needed

Two files, roughly ten lines in total, following `schema/fixtures/watch_state/` exactly:

- `schema/fixtures/watch_heartbeat/valid.json` — one line, e.g.
  `{"_id":"toc:drive","tenantId":"toc","sourceType":"drive","lastHeartbeatAt":"2026-09-28T12:00:00Z"}`
- `schema/fixtures/watch_heartbeat/invalid.json` — the same row with one deliberate violation, matching
  how `watch_state`'s invalid fixture does it (an out-of-enum `sourceType`, e.g. `"carrier-pigeon"`).

## The decision asked for

Authorize those two files (plus the directory), so `python schema/validate.py` returns to exit 0. There is
no design choice inside this — the shapes are fully determined by the schema D-048 already approved.

**Options if the answer is no:** the validator stays red on this one collection until someone authorizes
the pair; nothing else in the unit changes, and no runtime behaviour depends on a fixture.

**Answered:** `u4b-fixtures: yes` -- Umesh, AskUserQuestion, 2026-09-28. Both
`schema/fixtures/watch_heartbeat/valid.json` and `invalid.json` authorized. Authorized by **D-053**.
**Gate status:** ANSWERED 2026-09-28 (D-053). `python schema/validate.py` was this unit's only red
verification; the fixtures are the fix and are now buildable.
