# Gate — obs-windows.ts is at the C1 LOC budget; the ISS-324 fix needs a file split

**Opened:** 2026-09-27 (maker, unit `live-record-repair`)

**Situation.** The ISS-323/ISS-324 fix is **complete and tested** (250 meeting-bot tests, 3 new
launcher tests, 35 pytest, typecheck clean — see `qa/manifests/live-record-repair.md`). It cannot land
green because of the structure lint, not because of the code:

- `packages/meeting-bot/src/capture/obs-windows.ts` on master is **exactly 300** non-blank lines,
  which is the C1 `lint-loc` budget. Any addition to that file trips the gate.
- The fix takes it to **352**. Trimming comments cannot recover 52 lines, so this is structural.
- `pnpm lint:structure` is **already red on master** with 3 pre-existing violations
  (`speakers-llm.ts:313`, `sb_join.py:415`, `run-watch.mjs:447`). `sb_join.py` also grows 415 → 437
  from this unit's progress-heartbeat thread.

**Why this is a gate and not a maker decision.** The user CLAUDE.md anti-drift rule is explicit: *do
NOT create a new file to add or fix behavior unless Umesh explicitly says "create a new file"; if a
new module is genuinely needed, STOP and propose the target existing file first.* C1 leaves no
in-place room, so the two requirements are in direct conflict and Umesh owns the call.

**Options**

**(a) Extract the bot-child launch + startup handshake into a sibling module** — recommended.
Move `launch()`'s child spawn, the event/progress plumbing, the output ring buffer and the
stall/cap budget into `packages/meeting-bot/src/capture/bot-child.ts` (~90 lines out of
obs-windows.ts), leaving OBS scene/record concerns behind. `obs-windows.ts` lands well under 300,
the handshake gets its own test surface, and the seam matches the file's own docstring split
("Join = spawn py/sb_join.py" vs "Record = OBS over obs-websocket"). Cost: one new file; the diff
stops being purely edit-in-place.

**(b) Raise the C1 budget** for this file or repo-wide. Cheapest now, weakens a frozen-ish structural
contract for every file, and needs its own DECISIONS entry. Not recommended.

**(c) Land over budget and file the LOC violation as debt.** Defensible only because the gate is
already red with 3 violations, but it makes a red gate redder and normalises that — and C1 stops
meaning anything the moment it is routinely bypassed.

**Blocks:** merging `wave/live-record-repair` to master with a green `lint:structure`. Does NOT block
the live proof run — the fix works as it stands in the lane.

**Answer format:** reply `obs-windows-loc-split: a` (or b / c) → the maker appends
`Answered: <ISO> - <choice> - <where>` here. In this Lab repo the choice also needs a DECISIONS entry
via `scripts/append_decision.ps1` before the split lands.
