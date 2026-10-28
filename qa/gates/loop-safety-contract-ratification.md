# HUMAN_GATE — ratify (or demote) two criteria a checker wrote itself

**Opened:** 2026-09-08T08:10:00Z
**Raised by:** the Mode B sweep, as **ISS-087 (medium)** — not by the maker
**Blocks:** nothing. Recorded because it is an authority question, and those do not expire quietly.

## The question, in one line

`qa/contracts/loop-safety.md` was authored by a unit checker on the stated grounds that it derives
wholly from **D-014** (`Approved-by: Umesh`). **Two of its eight criteria do not.** Do you ratify
them, or should they be demoted out of the scored criteria block?

## What is actually in dispute

C1–C6 trace cleanly to D-014 — the arm/restore/assert-clean discipline to its Why, the hook's deny
branch to its What almost verbatim. Not in dispute.

| | Criterion | Problem |
|---|---|---|
| **C7** | *Per-unit close-out, not tree-wide.* A checker that mutates source must assert the files **it armed** match HEAD before writing its verdict. | Imposes a **new procedural obligation on every future checker**. D-014 authorizes a hook branch and a CLAUDE.md paragraph; it says nothing about how checkers must close out. |
| **C8** | *A recorded decision must be effective where the loop reads it.* When a DECISIONS entry's `Result` claims a file was changed, that change must exist. | A **general Lab-Protocol rule binding every future DECISIONS entry**, written under an approval scoped to one hook branch and one paragraph. |

## Why this is worth your thirty seconds rather than a silent fix

**Both rules are good.** That is exactly what makes this worth catching. C8 was generalised from a
real miss found in that same cycle — I wrote D-014 saying `.claude/CLAUDE.md` was updated and then
did not update it (ISS-086), so a decision sat in the log reading as done while the loop obeyed the
old rule. A rule preventing that recurrence is obviously correct.

But it was adopted by the component whose job is to *check* compliance, under an approval that did
not cover it, and it now binds every future checker and every future decision. Good policy arriving
through the wrong door is still the wrong door — and a checker that can widen its own mandate by
writing a contract is a self-certification path, which is the one thing this whole maker-checker
pair exists to prevent.

The file also **contradicts itself on its face**: its gate note says "derived wholly from D-014",
while its own amendment log says "C7/C8 and I1–I3 record judgments the checker made." The sweep did
not wave that through, which is the system working.

## Options

1. **Ratify both** (recommended if you agree with the rules). I append a DECISIONS entry carrying
   `Approved-by: Umesh` that adopts C7 and C8 as project-wide policy in their own right, and the
   contract's provenance note is corrected to cite it. They become properly authorized rather than
   inherited.
2. **Ratify C7 only.** C7 is narrow (how a checker closes out a mutation) and sits naturally within
   loop safety. C8 is the broader one — it governs the DECISIONS protocol itself, which is arguably
   Lab-Protocol territory needing its own entry.
3. **Demote both** out of the scored criteria block into a "recommended practice" section, so they
   guide without binding until separately approved.
4. **Something else** — including deleting them, though the sweep explicitly recommends against
   deletion and I agree: the behaviour they describe is worth keeping either way.

Deletion is the one option nobody is arguing for. The question is only which door they come
through.

## Live evidence for C7, observed while writing this gate

At **2026-09-08T08:12Z**, checking the state of the tree, I found
`scripts/lib/tracker-audit.mjs:47` reverted to the old `T-[0-9]+[a-z]?` pattern — a checker
running the mutation test its dispatch asked for. Correct behaviour.

But `node scripts/lib/mutate.mjs list` reported **"no outstanding mutations"** and
`qa/.mutations-active` was **absent**. The mutation was applied **without being armed**, so:

- the commit guard would **not** have denied a commit touching that file;
- had I committed `scripts/lib/tracker-audit.mjs` in that window, I would have shipped a regex
  that silently empties the roadmap backlog — the exact defect this session just fixed.

I did not commit it; I committed only `qa/gates/` with a narrow pathspec, and left the file to its
owner to restore.

**This is not a complaint about that checker.** It is the honest limit I disclosed in the guard's
own manifest — *"it does not enforce use; a maker that mutates without calling `apply` is
unguarded"* — demonstrating itself **within an hour of shipping**, unprompted, in the wild.

And it is the strongest argument available for **C7**, the disputed criterion: the hole is not
closed by the code, it is closed by the *procedure* of asserting the files you armed match HEAD
before writing your verdict. The sweep is right that C7 arrived through the wrong door; this
observation is why it should come through the right one rather than be dropped.

It does not bear either way on **C8**, which remains a separate question about DECISIONS scope.

## How to answer

Reply with the option number, or just say which of C7/C8 you accept. I will append the
`Answered:` line here **before** acting on it, then write the authorizing DECISIONS entry.

**Answered:** SUPERSEDED by the line below — this stale `_(pending)_` predates the real answer and is corrected here by the Mode B sweep of 2026-09-09 (ISS-161 recurrence). The gate is ANSWERED: see the 2026-09-09 Option 1 line immediately following.

**Answered:** 2026-09-09 — **Option 1: ratify both C7 and C8** — Umesh, in session: *"go with
whatever is best"*, in direct reply to a message naming this gate and my recommendation (option 1).

Recorded honestly: a general authorization, not a clause-by-clause ruling. I am acting on it
because option 1 was the stated recommendation and the sweep, the checker and I all agree the two
rules are *good* — the objection was never their content, only the door they came through. Ratifying
puts them through the right door.

**What I will do, and what I deliberately will not:** I append the DECISIONS entry carrying
`Approved-by: Umesh` that adopts C7 and C8 as policy in their own right. I will **not** edit
`qa/contracts/loop-safety.md` to correct its self-contradictory provenance note — contracts are
checker-owned and read-only to the maker, and this gate exists precisely because a component
widened its own mandate by editing a contract. Fixing that by having the *maker* edit a contract
would repeat the error in mirror image. The correction is dispatched to a checker.

**Gate status:** ANSWERED — recorded inline: SUPERSEDED by the line below — this stale `_(pending)_` predates the real answer and is corrected here by the 
