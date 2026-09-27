# Gate — speaker seam has hit a hard ceiling; three ways forward, all need Umesh

**Opened:** 2026-09-28 · **Unit blocked:** the next cycle of ISS-104 (critical, open)
**Authority context:** D-041 ruling 4 (Approved-by: Umesh) — *"SPEAKER SEAM: keep working until it
is clean"*, deliberately overriding the D-014 round cap for this seam. So the Approver has already
said to continue. This gate is not asking whether to continue; it is asking **by which mechanism**,
because every available mechanism is blocked by a different standing rule.

## Where the seam actually stands (measured on master today, not asserted)

- `packages/index/src/pipeline/speaker-name-rules.ts` holds the `NEVER_A_PERSON` denylist, now 409
  audited closed-class/role words. The committed audit re-derives on master: **0 / 409 live
  bypasses**.
- That file is at **exactly 300 non-blank lines — the `loc.max` ceiling, zero headroom.** Verified
  independently by the cycle-1 checker. **One more word does not fit.**
- ISS-104 nonetheless stays **open / critical**, and its own row says why: the residue is **not**
  word-list-shaped. Three cases (India, Mumbai, Google) are *"genuinely gazetteer-bound"* — each has
  **a person-valid twin of identical syntax** (`"This is Rahul speaking on the panel."` vs the same
  shape naming a place). No syntactic gate can separate them; the row records that the gate which
  closed a fourth such case **introduced a recall regression**.

## Why this needs a decision rather than another autonomous cycle

The only mechanisms left each collide with a rule I must not decide alone:

1. **Extract `NEVER_A_PERSON` into a data module** (the obvious engineering move, and what unblocks
   the ceiling). Blocked by the user-global **edit-in-place discipline**: *"Do NOT create a new file
   … unless Umesh explicitly says 'create a new file.' If you think a new module is genuinely
   needed, STOP and propose the target existing file first."* This is that stop.
2. **Raise `loc.max` for this file.** Changes a structural lint budget — a project-wide standard,
   not a unit-local choice.
3. **Accept the three gazetteer-bound residues as an honest limit** and close ISS-104 at
   0/409-on-closed-class. This directly contradicts ruling 4's *"until it is clean"*, so only the
   Approver can take it.

A fourth path — a gazetteer or context signal to disambiguate place-vs-person — is real engineering
rather than a rule conflict, but it is a new capability with its own cost and failure modes, not a
continuation of this seam.

## The question, plainly

Which of 1 / 2 / 3 / 4 should the seam take? Option 1 is the smallest and most reversible, and it
only moves existing lines into a new data file with no behavior change — but the rule correctly
requires your explicit say-so before any new file.

## Status

**Answered:** _(pending)_

**Not gated on this:** other backlog tiers remain unblocked and the loop continues on them. This
gate blocks the speaker seam only.
