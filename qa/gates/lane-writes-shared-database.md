# HUMAN_GATE — may a worktree lane write to the shared database before its verdict?

**Opened:** 2026-09-24 by the checker, at the peer maker session's request
**Approver:** Umesh
**Blocks:** nothing today. Both sessions have agreed a voluntary hold, so this does not stall work —
but the hold is a convention between two agents, and conventions are what this gate exists to
replace with a rule.

## The question, in one line

A git worktree isolates **code**. It does not isolate **data** — every lane reads the same
`MONGODB_URL` from the same `.env` and connects to the same `lkb`. Should a lane unit that performs
real data writes (a) write to a separate database, (b) keep writing to shared `lkb` but **disclose**
it in the manifest, or (c) be blocked from writing at all until a checker has PASSed it?

## What happened, measured

`webinar-bot-live` cycle 2 was built in lane `D:/KnowledgeBase-lanes/iss-291-sync-txn` and set to
`ready-for-check`. **No checker had passed it.** Its indexing had nonetheless already run against the
shared database. Measured from the MAIN tree, which shares that database:

| collection | before (this session, ~22:30) | after (~23:40) |
|---|---|---|
| `topics` | 15 | **158** |
| `orgs` | 6 | **8** |
| `chunks` | 1452 | **1517** |
| `tree_index` mentions the 2026-09-24 session | false | **true** |

The writes themselves are correct and were needed — ISS-296 required them, and they are properly
tenant-scoped. This gate is not about their correctness.

## Why it needs a ruling

1. **A write landed before any verdict, and it does not roll back with the branch.** If cycle 2
   FAILs, `git` discards the code and the data stays mutated. That is a different risk class from a
   code change parked in a lane, and the maker-checker handshake has no step that covers it.
2. **It contaminated another unit's acceptance test — mine.** U-BRAIN [C6] used "the 2026-09-24
   session appears on /brain" as its freshness proof. `/graph` builds from `tree_index`; the other
   lane's indexing put the session there; so **my unit could have passed its own criterion on
   someone else's work**, without building the `graph_edges` union [C1] requires. Caught and the
   probe rewritten to discriminate on source (a node kind `flatten-graph.ts` cannot emit), with a
   negative control. It was caught by accident, not by any rule.
3. **No pre-state is re-measurable.** Any "before" number either session quotes from the shared
   database after ~23:40 is post-indexing.
4. **The same hazard class is already filed.** ISS-083 was a mutation found applied to production
   source, and D-020 exists because a mutation harness left a mutant on disk. This is that shape,
   one layer down: an unverified change left applied to shared *data*.

## Options

- **A — separate database per lane** (`MONGODB_DB=lkb_<lane>`): true isolation, and it makes a
  lane's "before/after" honest. Costs a seeding step per lane and diverges lane data from real data,
  which is precisely what made this webinar unit valuable to check against real rows.
- **B — keep shared `lkb`, but require a "Shared-data disclosure" section** in any manifest whose
  unit writes: what was written, which collections moved and by how much, that the writes are live
  regardless of verdict, and that no pre-state is re-measurable. Cheapest; makes the risk visible
  without changing behaviour. **The peer session has already adopted this voluntarily for cycle 2.**
- **C — no live data writes from a lane before a PASS.** Safest, and it would have prevented both
  problems above — but it blocks exactly the units whose whole point is proving a real write path,
  and `webinar-bot-live` could not have demonstrated ISS-296 at all under it.
- **D — B plus a narrow carve-out:** disclosure always, and C's block applied only to units writing
  to collections another in-flight unit is being judged against. Targets the contamination without
  blocking real-write units.

## Recommendation

**D**, falling back to **B**. The disclosure in B is cheap and should happen regardless. The
contamination in (2) is the part that a disclosure alone does not fix — it was caught by luck, and
the next one may flatter a unit into a PASS instead.

## Interim state, so nothing is blocked while this waits

The peer session has voluntarily agreed to run no further live data writes from lanes before a
verdict, except re-runs of this same session, and to add the disclosure section to cycle 2's
manifest. That is a convention between two agents with no enforcement, which is why it is written
here rather than relied on.

## Answer format

Say A, B, C or D. On B or D the checker writes the disclosure requirement into a contract criterion.
On A or C it becomes a normal unit for whoever next touches the lane tooling.

**Links:** ISS-296 · `qa/contracts/brain-knowledge-graph.md` [C6] ·
`qa/evidence/ui-epic-2026-09-24/checker-probes.md` (AMENDED C6 PROBE) · D-019 · D-020 · ISS-083
