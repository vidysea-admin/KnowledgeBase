# Contract — lane-data-isolation

> **Authored by the CHECKER on 2026-09-25**, encoding Umesh's answer (option **D**) on the gate
> `qa/gates/lane-writes-shared-database.md`. Status: `proposed`. The maker never edits this file.

## Scope

What a unit built in a git worktree lane may do to **shared data** (the `lkb` Mongo database, and
any store every lane reaches through the same `.env`) before a checker has PASSed it. Covers
disclosure and a narrow block. Does **not** cover tenancy (that is each unit's own security
invariant) or whether a unit may write at all in principle.

## The measured problem this encodes

A worktree isolates **code**, not **data**. Every lane reads the same `MONGODB_URL` and writes the
same `lkb`. On 2026-09-24 `webinar-bot-live` cycle 2 sat at `ready-for-check` with **no passing
verdict** while its indexing had already run against shared data:

| collection | before | after |
|---|---|---|
| `topics` | 15 | **158** |
| `orgs` | 6 | **8** |
| `chunks` | 1452 | **1517** |
| `tree_index(toc)` mentions the 2026-09-24 session | false | **true** |

Two consequences the maker-checker handshake had no step for:

1. **The write does not roll back with the branch.** A FAIL discards the code and leaves the data.
2. **It contaminated another unit's acceptance test.** U-BRAIN's `[C6]` used "the session appears on
   /brain" as its freshness proof; `/graph` builds from `tree_index`; the other lane's indexing put
   it there. The unit could have passed its own criterion **on another lane's work**. Caught by
   accident, not by any rule — which is the whole reason this contract exists.

## Criteria (each machine-checkable)

1. **[C1] Disclosure is mandatory.** Any manifest whose unit performs a write to shared data
   carries a `## Shared-data disclosure` section stating: which collections were written, the
   before/after counts, that the writes are **live regardless of verdict and do not roll back with
   the branch**, and that no pre-state is re-measurable afterwards.
2. **[C2] Side effects are traced, not just counted.** A count that moved by more than the unit's
   own rows is explained to its source in code (`file:line`). The `topics 15→158` jump was traced
   to `promoteAndPersistEntities` receiving the full tenant `rootDoc` — that is the standard.
3. **[C3] Targeted block.** A live write is **blocked before a PASS** when it touches a collection
   that another in-flight unit is currently being judged against. "In-flight" = a manifest at
   `ready-for-check` with no matching-cycle verdict, or a unit whose contract names that collection
   in a criterion. Otherwise the write is permitted with [C1] disclosure.
4. **[C4] A contaminated acceptance test is rewritten to discriminate on SOURCE, not presence.**
   When a unit's criterion could be satisfied by another lane's write, the probe must require
   something only this unit can produce, **and carry a negative control that FAILS on the pre-unit
   build**. The U-BRAIN amendment is the worked example: it demands a node kind
   `flatten-graph.ts` cannot emit, a `graph_edges` edge type, and a resolving `evidence[].turnId`.
5. **[C5] The rewrite is recorded, never silent.** A probe changed after the fact states what it
   was, why it was contaminated, and what it now discriminates on. A quietly strengthened probe is
   indistinguishable from one that was always sound.

## Invariants

- **[I1] Disclosure is not a substitute for [C3].** Stating that a write happened does not make it
  safe for a collection another unit is being judged against. The gate answer was D, not B.
- **[I2] Production Mongo stays read-only by construction.** Nothing here widens that.
- **[I3] A checker may not accept its own contaminated probe.** If a probe cannot fail on the
  pre-unit build, it is not evidence, and the verdict says so rather than counting the criterion.

## Verification

- Grep every manifest whose diff touches a write path for the `Shared-data disclosure` heading (C1).
- For each disclosure, confirm at least one traced `file:line` explanation where a count moved
  beyond the unit's own rows (C2).
- For any probe amended mid-flight, confirm the negative control exists and fails on the pre-unit
  build (C4, C5) — run it, do not take the claim.

**Links:** `qa/gates/lane-writes-shared-database.md` (Answered 2026-09-25, option D) · ISS-296 ·
`qa/contracts/brain-knowledge-graph.md` [C6] · `qa/evidence/ui-epic-2026-09-24/checker-probes.md`
(AMENDED C6 PROBE) · D-019 · D-020 · ISS-083
