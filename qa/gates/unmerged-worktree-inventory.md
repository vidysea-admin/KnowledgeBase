# HUMAN_GATE — 23 commits of work sit in worktrees that master has never seen

**Raised:** 2026-09-28 · by the maker, during post-merge worktree hygiene
**Status:** OPEN — needs the Approver (Umesh). Nothing has been merged, deleted or retired.
**Found by:** measuring `git log master..<branch>` for every registered worktree, not by a sweep.

## The measurement

26 registered worktree branches. **21 are fully contained in master** (retirable clutter).
**5 carry commits master has never seen:**

| branch | commits ahead of master | what it is |
|---|---|---|
| `wave/u2-4-phase3-fix` | **13** | the U2.4 phase-3 precision re-gate — the unit behind **ISS-282, a tier-2 CRITICAL open row**, currently paused at `qa/.paused.u2-4-phase3-regate` |
| `worktree-agent-a3d4ea73632cda74e` | 4 | unidentified; an agent worktree, no `wave/` or `lane/` name |
| `worktree-agent-a779f0b3b445697af` | 2 | unidentified; an agent worktree |
| `wave/vector-gap-durability` | 2 | a named wave unit |
| `lane/a-speakers` | 2 | the speaker lane — the lane whose per-lane ledger D-019 was written for |

## Why this is a gate and not a chore

**Every gate, count and sweep in this project reads master.** `lint-loc`, `lint-dirsize`,
`snapshot --check`, the tracker audit, the session-start open-issue count, and every Mode B sweep
range are computed against the main tree. So 23 commits of work are **structurally invisible to the
entire verification apparatus** — they cannot fail a gate, cannot appear in a sweep range, and
cannot be counted as done.

That is the same shape as the defect this pair exists to kill: *if it did not land on disk where the
readers look, it did not happen.* Here it did land on disk — just not where anything reads.

Two specific consequences worth naming:

- **`wave/u2-4-phase3-fix` at 13 commits is the largest single body of unreviewed work in the repo,
  and its issue (ISS-282) is critical and open.** The unit is paused, which is legitimate — a
  deliberate `/maker pause` beats every auto rule. But a pause records "stop working on it", not
  "discard 13 commits". Nobody has decided which of those two is true.
- **Two of the five have no descriptive name at all** (`worktree-agent-a3d4…`, `worktree-agent-a779…`).
  Their content is unknown without reading them. An agent worktree that outlived its agent and kept
  commits is exactly the artefact that gets swept away by a cleanup that looks routine.

## Why the maker is not acting

Merging unreviewed commits into master is an **irreversible, outward-facing change to the trunk**,
and none of these 5 branches has a PASSed manifest/verdict pair that master can see. Deleting them
destroys work. Both directions are the Approver's call, and the choice is likely different per
branch — which is why this is an inventory, not a proposal.

## Options, per branch rather than in bulk

1. **Audit-then-decide** — dispatch one read-only agent per unmerged branch to report what it
   contains, whether it has a manifest/verdict, and whether it duplicates work already in master.
   Costs 5 agent runs; decides nothing prematurely. Recommended for the two unnamed ones especially.
2. **Resume through the normal pair** — for a branch whose work is wanted, unpause (where paused),
   rebase onto master, and put it through manifest → `/checker` → close-out like any other unit.
   This is the only path that ends with the work verified.
3. **Retire explicitly** — `git branch -D` with the reason recorded in the decisions log, so the
   discard is a decision with a date rather than an absence.
4. **Leave as-is and register the debt** — keep the branches, add the inventory to the sweep so the
   number is reported every tick instead of discovered by accident.

## Separately, and not gated: 21 retirable worktrees

21 branches are fully merged into master, so their worktrees are pure clutter — disk plus the
confusion of a 26-row `git worktree list`. Retiring a fully-merged worktree destroys nothing.
Noting rather than doing it, because a bulk `worktree remove` across other loops' directories while
another loop is live is the kind of sweep that collides.

**Known mechanical caveat:** `git worktree remove` fails on this machine with
`Directory not empty` even for a clean merged worktree (reproduced again this tick on
`agent-a0d1591a24bce109e`). The git registry entry and branch delete fine; the **directory is left
on disk as an orphan**. So any retirement plan needs a separate directory-removal step, and the
count of orphaned directories will exceed the count of registered worktrees.
