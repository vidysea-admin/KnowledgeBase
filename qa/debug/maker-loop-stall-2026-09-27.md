# Agent debug report — maker loop stall (ISS-054 recurrence)

**Dispatched by:** `/maker` step 0, on the session-start hook line `STALL UNDIAGNOSED: ADVANCED`.
**Date:** 2026-09-27 · **Scope:** Phases 1-2 only, read-only toward code. One report per stall.
**Subject:** the maker's own continuation loop in `D:\KnowledgeBase`, not a work unit.

## Phase 1 — Failure capture

- **Session / task:** the self-driving maker loop must end every tick with an actual `ScheduleWakeup`
  (THE CONTINUATION RULE) so the pair keeps running without a human hand-crank.
- **Goal in progress at failure:** in both stalls, the tick had just hit a blocker (a classifier
  refusal; an awaiting-approval state with a build still running) and was supposed to arm a heartbeat.
- **Error:** no exception. **Silent death** — the loop simply stops producing ticks.
- **Last successful step before each stall:** a normal `ADVANCED`/`HUMAN_GATE` tick line written to
  `qa/.last-tick`.
- **Repeated pattern seen:** measured over all 95 tick lines, two silence windows, both ended by a
  *human* action rather than a wakeup:

  | Gap | From → to | Preceding tick's ending | MISSED_WAKEUP lines in window | How it actually resumed |
  |---|---|---|---|---|
  | **33.27 h** | line 62 `2026-09-25T13:46:31` → line 63 `2026-09-26T23:02:34` | `live repair REFUSED by classifier (Modify Shared Resources) — not re-routed` … `heartbeat 1800 ×8` | **0** | line 63: *"user asked parallel"* — Umesh started it |
  | **7.37 h** | line 72 `2026-09-27T00:05:54` → line 73 `2026-09-27T07:27:55` | `awaiting Umesh approval of spec+plan · mc-hooks build running` — **no heartbeat declared at all** | **0** | line 73: *"plan-approved COMPLETE"* — Umesh approved |

- **The control case that proves the mechanism works when invoked:** the gate at line 45
  (`2026-09-25T07:44:55`, also `heartbeat 1800 ×8`) produced **4 `MISSED_WAKEUP` lines** (46-49) at
  ~35 min spacing and woke itself at line 50. Same declaration, same repo, opposite outcome.
- **Environment assumptions verified:** `qa/.paused` absent (only `qa/.paused.lifted-2026-09-24`);
  backlog non-empty throughout both windows; work was reachable (line 63 itself dispatched 2 units
  it could have dispatched 33 h earlier).

## Phase 2 — Root-cause diagnosis

**Diagnosis-table row:** *"Subagent claims to have done X but the artifact is unchanged"* — the agent
**hallucinated its own continuation**. `qa/.last-tick` records `heartbeat 1800 ×8` as a plan; nothing
on disk shows the `ScheduleWakeup` call ever happened. Per the AIOS rule *"Naming a primitive is not
invoking one"*, writing `heartbeat 1800 ×8` into a tick line starts nothing.

**Classification: LOOP DESIGN, not execution / tool / environment.** The defect is *ordering*:

1. The continuation is called **last** in a tick — after the work, the dispatches, and the tick-line
   write. Any turn-ending event that occurs before that point kills the loop permanently.
2. Both stalls were preceded by exactly such an event:
   - **Gap 1: a classifier refusal.** A refused tool call ends the turn. `ScheduleWakeup` had not yet
     been called, so no continuation existed. The tick line was already on disk claiming one.
   - **Gap 2: a turn ended waiting on background work** (`mc-hooks build running`, `awaiting
     approval`) with **no heartbeat declared** — the precise pattern the delegation contract forbids
     ("Never end a turn with 'waiting for background agents'").
3. **The tick line is written independently of the call it describes**, so `qa/.last-tick` cannot be
   used to tell a scheduled heartbeat from an imagined one. This is why the sweep's signal was the
   *absence* of `MISSED_WAKEUP` lines: **zero MISSED_WAKEUP lines is the signature of a wakeup that
   was never armed**, not of one firing late.

**Deterministic or transient:** deterministic. It reproduces whenever a tick ends on a refusal or on
a wait, and it has now recurred at least twice in 48 h (ISS-054's original instance plus these two).

**Not the cause (ruled out by evidence):** RAM (gap 1 began at 0.4 GB free but line 63 worked fine at
the same 0.4 GB); `qa/.paused` (absent); an empty backlog (line 63 immediately found 2 tier-2 units);
the heartbeat mechanism itself (control case at line 45 fired 4 times).

**The current stall is the same fault, live.** Line 95 (`2026-09-27T12:46:53`) is a bare `correction:`
line with no heartbeat declaration, and the hook measured the last tick at 34 min old while ISS-323 /
ISS-324 are diagnosed and unblocked.

**Distinct from ISS-054's filed text.** ISS-054 is recorded as *"`qa/.last-tick` is 3 days stale"* — a
staleness symptom. The mechanism above is the cause, and it is narrower and testable: *a tick that
ends before its `ScheduleWakeup` leaves a tick line claiming a heartbeat that does not exist.*

## Phase 3 — smallest contained recovery (queued for the maker; NOT applied here)

- **Arm the continuation FIRST.** Call `ScheduleWakeup` at the *top* of the tick, before any dispatch
  and before any classifier-risky action, then re-arm at the end. A turn that dies mid-way then still
  has a live wakeup. This is the whole fix for both gaps and is fully reversible.
- **Never let the tick line claim an unmade call.** Write the heartbeat clause only after the
  `ScheduleWakeup` call returns; otherwise write `NO_CONTINUATION_ARMED` so the next reader sees the
  truth. This restores `qa/.last-tick` as evidence.
- **A refusal is a routing event, not a turn end.** On a classifier refusal, re-route (`git -C`,
  absolute paths, human gate) inside the same turn — line 62's own text admits `not re-routed`.

*Why safe:* all three are ordering/logging changes to the maker's tick procedure; worst case is one
redundant wakeup.
*Evidence the fix worked:* every future silence window contains `MISSED_WAKEUP` lines, or a tick line
that says `NO_CONTINUATION_ARMED`. Silence with neither = this bug again.

## Phase 4 — Report

- **Failure:** maker loop died silently twice (33.3 h and 7.4 h), both times resumed by Umesh, not by itself.
- **Root cause:** the continuation is armed last, so a turn ending early (classifier refusal; waiting
  on a background build) leaves no wakeup — while the tick line already claims `heartbeat 1800 ×8`.
- **Result:** **diagnosed** (Phases 1-2 complete). Recovery queued for the maker, nothing applied.
- **Burn risk:** low to diagnose; the *cost already paid* is ~40 h of idle loop with reachable work,
  and one concrete product loss — the Ashoka 2026-09-27 webinar went unrecorded inside the second window's aftermath.
- **Follow-up:** append the mechanism to ISS-054 rather than minting a new id (same defect, sharper
  cause); the fix belongs in `~/.claude/skills/maker/SKILL.md` THE CONTINUATION RULE, which is a
  shared-AIOS surface → needs Umesh's approval before editing.
- **Preventive change to encode:** make ordering explicit in the maker skill — *arm the wakeup before
  the work, and never write a heartbeat clause you did not call* — and have the checker sweep test
  the falsifiable predicate *"a >2 h tick gap with zero MISSED_WAKEUP lines and no `qa/.paused`"*,
  which would have caught both stalls the morning after.
