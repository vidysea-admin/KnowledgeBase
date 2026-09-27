# HUMAN_GATE — two sessions allocate ledger IDs from one counter, and a merge ate ten findings

**Opened:** 2026-09-08T14:00:00Z
**Severity of what already happened:** ten real findings were silently replaced. **Recovered.**
**Blocks:** nothing today. Recorded because the cause is structural and will recur on the next merge.

## What happened

`qa/issues.jsonl` allocates IDs by taking `max(existing) + 1`. Two sessions ran concurrently — the
arrangement you approved (*"dono code push by commits karenge"*) — and both allocated from the same
counter without seeing each other's uncommitted or unmerged rows.

**`ISS-091` through `ISS-100` were each issued twice**, to entirely different findings:

| id | this session's lane | `lane/a-speakers` |
|---|---|---|
| ISS-091 | golden-set provenance is FALSE | a capitalised English word ships as a fabricated person |
| ISS-095 | the file split dropped an import; paid path throws | `"Not"` missing from `NEVER_A_PERSON` |
| ISS-098 | `buildChunks` emits duplicate chunks | the `speaking` gate over-refuses 10 self-introductions |
| … | (all ten collide) | |

The merge `c1efa10` resolved the file **by line position**, keeping one row per id. So:

- their tip: 100 rows · my tip: 100 rows · **merged: 101 rows**
- ten findings vanished **while the ledger looked perfect** — 101 rows, 101 unique ids, no gaps.

**That is the dangerous part.** A missing row is visible. A row that still exists under its id, now
describing a *different finding*, is not. Every integrity gate we have — duplicate-id scan, parse
check, count — passed on a ledger that had just lost ten findings.

## What I did (already done, committed)

Recovered all ten from `ed01bbf` and re-appended them as **ISS-102 … ISS-111**, each carrying an
`id_collision` field naming its original id, the lane, and the commit. Statuses were preserved
exactly — 4 open, 4 fixed, 2 verified — so nothing already-closed was reopened.

**I did NOT renumber the other session's manifests or verdicts.** They still cite ISS-091…100, and
those citations now point at *my* rows. The `id_collision` field is the bridge. Renumbering another
session's committed evidence felt worse than documenting the seam — but it is a real rough edge and
you may disagree.

## Why the existing arrangement did not prevent it

Your ruling was that both loops run and **coordinate through commits**. That works for *files* —
each session commits its own paths, and the mutation guard stops one clobbering the other's
uncommitted work.

**It does not work for a shared monotonic counter.** Nothing about committing tells session A that
session B has already taken 098 on an unmerged branch. This is not a failure of the ruling; it is a
case the ruling never covered.

## The question

How should IDs be allocated so this cannot recur?

1. **Per-lane prefix** — `ISS-A-012`, `ISS-B-007`. Collision becomes impossible by construction.
   Cost: the flat `ISS-###` convention appears in ~100 committed manifests and verdicts, and a
   sweep would need to understand both forms.
2. **Allocate against all refs, not the working tree** — compute `max` across
   `git log --all -- qa/issues.jsonl`. Much narrower race (still open between two live sessions),
   no convention change, small edit to the checker's filing step.
3. **Content-addressed ids** — `ISS-<date>-<hash>`. Collision-proof and no counter at all, but
   unreadable in conversation and a bigger break with everything written so far.
4. **Add a detector instead of preventing it** — extend `tracker-audit` with a gate that compares
   HEAD's ledger against merged-in ancestors and fails when an id's *content* changed. Catches the
   class rather than preventing it; would have caught this one at the next `lint:structure`.

**My recommendation: 2 + 4.** Option 2 is a few lines and removes almost all of the window; option 4
makes the residue loud instead of silent, which is the property that failed here. Option 1 is the
only true guarantee, but it costs a convention change across a hundred files for a race that 2+4
reduces to "two sessions filing within the same few seconds".

## How to answer

Reply with the option number(s). I will append `Answered:` here before acting, then build it as a
normal unit.

## One recovered finding is CRITICAL, and it was invisible while erased

**ISS-104** (originally `lane/a-speakers`' ISS-093) is **critical and open**: a naming cue adjacent
to any capitalised non-name still ships a fabricated person — *"Welcome Everyone to the session."*
→ `person:everyone`, with **20/20 checker attacks resolving**. Fabricated people entering speaker
attribution is exactly the class `goal.md` treats as unrecoverable ("who said it, when").

For the window between the merge and this recovery it **did not exist** — its id described a
golden-set provenance bug instead. The speaker lane's own loop could not have pulled it, because
its tier-2 scan reads this ledger.

**I have not touched it.** It is that lane's file (`packages/index/src/pipeline/speaker-name-rules.ts`),
their loop is actively cycling on it, and grabbing it is the collision this gate exists to describe.
The recovery is enough to re-arm them: with the row open and critical again, their next tick's
tier-2 priority pulls it ahead of everything else.

**Answered:** 2026-09-08 — **per-lane ledgers with namespaced ids** (the "no collisions by
construction" option) — recorded as **D-019** in `docs/DECISIONS.md`, `status: ACTIVE`,
`**Approved-by:** Umesh`, committed `05b93cc`. A lane working in a git worktree writes to
`qa/issues.<lane>.jsonl` and allocates `ISS-<LANE>-NNN`; `qa/issues.jsonl` keeps its meaning and
numbering for the main tree; every reader treats the union as the ledger; lane ids are never
renumbered on merge.

_Scribed onto this gate by the Mode B sweep of 2026-09-08T17:46Z, not by the answering session._
The decision was taken off-disk and D-019's `Links` field names this file, but no `Answered:` line
was ever written here — the D-006 failure mode (approval in chat, gate still reading pending, sweep
re-flagging, maker re-asking). Filed as **ISS-131**. Two follow-ons are NOT closed by this line and
are tracked separately: **ISS-129** (no reader actually globs the shards, so D-019's union is
declared but not implemented) and **ISS-130** (only 1 of 3 lanes has adopted a shard, so the
collision this gate describes is still possible in `a-speakers` and `b-golden-set`).

**Gate status:** ANSWERED — recorded inline: 2026-09-08 — **per-lane ledgers with namespaced ids** (the "no collisions by
