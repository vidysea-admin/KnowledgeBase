# Contract — ledger-id-allocation

> **Authored by the CHECKER on 2026-09-24**, after a live cross-lane id-citation defect. Status:
> `proposed`. The maker never edits this file. Deliberately authored by the party that will NOT
> build the fix — the same separation D-015 requires between a fix and the artifact that judges it.

## Scope

How issue ids are allocated and cited across concurrent lanes writing `qa/issues.jsonl` and its
D-019 shards. Covers allocation, citation integrity and verdict stamping. Does **not** cover ledger
row schema, severity grading, or the D-014 class cap.

## The defect this exists to prevent, measured 2026-09-24

Two orchestrator sessions and five worktree lanes appended to the ledger in one evening. The ledger
itself survived — **zero duplicate ids, no row lost or altered** — but
`qa/verdicts/webinar-bot-live.md` carried `ISSUES-WRITTEN: ISS-289, ISS-290, ISS-291, ISS-292`, of
which **three resolve to other units' rows**: ISS-289 and ISS-290 to `speaker-resolution-llm`, and
ISS-292 to `brain-knowledge-graph`. Only ISS-291 was that unit's own.

**Root cause:** an id is chosen at READ time and written at APPEND time. Every collision and every
mis-citation lives in that window. Nothing detects it afterwards, because a verdict citing a wrong
id is still well-formed and still parses.

**Why it is worse than a miscount, stated once:** D-015 requires a fix to be measured against its
issue's OWN recorded reproductions. That rule is only as strong as the id resolving to the right
row. D-019 already put it exactly — *"an audit trail whose references silently repoint is worse
than an incomplete one, because it still looks correct."*

## Criteria (each machine-checkable)

1. **[C1] Allocation and append are ONE operation.** The max numeric id is computed over the union
   of `qa/issues.jsonl` and every `qa/issues.*.jsonl` (D-019) and the new rows are written in the
   same operation, with no tool call, model turn or file read between the two. A helper that reads,
   returns an id, and lets the caller write later does not satisfy this.
2. **[C2] Re-verification immediately before write.** The append re-reads the union tail and aborts
   rather than writing if the id it holds is now taken. Aborting and retrying is the required
   behaviour; overwriting is a FAIL.
3. **[C3] Citation integrity is checkable.** A script resolves every `ISS-NNN` cited in
   `qa/verdicts/**` and `qa/manifests/**` against the ledger union and reports any citation whose
   row's `feature` does not match the citing unit's feature. This runs as a gate (`tracker-audit`
   is the natural home — it already has G1/G4).
4. **[C4] Renumbering is forbidden.** No operation may change an existing row's id, for any reason,
   including merges. D-019: *"Lane ids are never renumbered on merge. That permanence is the point."*
   A fix that renumbers to remove a duplicate is a FAIL even if the result looks tidier.
5. **[C5] Duplicates are a hard failure, not a warning.** If the union ever contains two rows with
   one id, the checking script exits non-zero and names both rows with their files and line numbers.
6. **[C6] A correction is recorded, never silent.** When ids are re-allocated after a collision
   check, the verdict states the old→new mapping. A silently corrected citation is indistinguishable
   from one that was right all along, which defeats the audit trail this contract protects.

## Invariants

- **[I1] The ledger is append-only in practice, not just by convention.** Existing rows are never
  edited except for the status/`fixed_date` fields their own lifecycle requires.
- **[I2] A shard is a shard, not a private copy.** Every reader takes the union (D-019). A fix that
  makes allocation safe by making one lane read only its own file is a FAIL.
- **[I3] The detector must be able to fail.** [C3]'s script is proven against a deliberately
  mis-cited fixture. A citation checker that reports clean on a known-bad input is vacuous — this
  repo has filed three vacuous-fixture issues already (ISS-179 class).

## Verification

- Concurrency probe: two processes append N rows each to the union simultaneously; assert 2N rows,
  2N distinct ids, zero lost rows (C1, C2, C5).
- Mis-citation fixture: a verdict citing an id belonging to another feature must be REPORTED by
  C3's script (I3). Then the real tree is scanned and the true count reported.
- Renumber probe: an operation that would renumber is rejected (C4).

## Open, and NOT decided here

The verdict stamp form (`**Cycle checked:** N` on its own line vs the `·`-separated compound header
the delivery gate cannot read) is a real defect — it caused a false "1 check pending" on
2026-09-24 — but it belongs to `qa/contracts/delivery-gate.md` [C4], whose amendment is an
**Approver decision** currently open at `qa/gates/delivery-gate-c4-heading-form.md`. Both live
sessions have adopted own-line stamping as a working convention in the meantime. **That convention
is deliberately NOT written into a criterion here**, because amending a gated contract criterion
sideways through a new contract is exactly the unilateral move that gate was opened to stop.

**Links:** `qa/QUEUE.md` (checker note, 2026-09-24) · D-015 · D-019 ·
`qa/gates/ledger-id-collision.md` · `qa/gates/ledger-id-divergence.md` ·
`qa/gates/delivery-gate-c4-heading-form.md`
