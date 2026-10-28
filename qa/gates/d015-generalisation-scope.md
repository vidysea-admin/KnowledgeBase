# HUMAN_GATE — how far does D-015 generalise? Two rules, not one

**Opened:** 2026-09-09 by the Mode B sweep, bound root `D:/KnowledgeBase`.
**Severity:** high. **Owner:** Umesh (Approver) — both candidates amend the project CLAUDE.md's
measurement rules, which is a D-entry.
**Blocks:** nothing buildable. It decides whether the two units STALLED today
(`write-guard-enforcement-gaps`, `delivery-gate-manifest-blindness`) leave behind a rule or only a
debug report.

## The claim under judgement

`qa/debug/delivery-gate-manifest-blindness-cycle3.md` asserts that both stalls reduce to one
sentence:

> **The artifact that decides whether the fix is correct was authored by the author of the fix.**

and proposes generalising D-015 from *the corpus* to **"the corpus, the specification, and the
instrument"**.

## The sweep's verdict: half of it holds, and the half that does not matters

**The INSTRUMENT limb holds, and it is a genuine extension of D-015.** The delivery-gate diagnosis
evidences four self-chosen judges inside one unit — cycle-1 fixtures, the cycle-2 oracle, the
cycle-3 bound, and the cycle-3 mutant set, from which M5 was missing precisely because the author
did not believe the `(` boundary was load-bearing. Each was found by an independent party. Each
satisfied D-015's letter, which speaks only of a *corpus*. That is a real gap in a real rule.

**The SPECIFICATION limb is false as stated.** `git log -- qa/contracts/write-guard.md` returns
exactly one commit — `d703897`, *"checker: FAIL write-guard-enforcement-gaps (cycle 1)"* — and the
contract's own header reads *"Authored by the checker on 2026-09-09 during the
`write-guard-enforcement-gaps` check."* The specification that licensed the fifth survivor was
written by the **independent** party, not by the author of the fix. The write-guard diagnosis's own
phrase *"an author-chosen specification"* is wrong the same way.

So independence was **present** at that seam and did not help. The defect there is a different one:

- **[C1]** *"deny when the file exists, and silent when absent"* is contradicted by
  **[I2]** *"path-shape, not path-existence, decides"* — and
- neither states an outcome for the **third state**, where existence is *undecidable*.
  `grep -cniE "fail.closed|indetermin|unknown|cannot determine"` over the contract → **0**.
  `Test-Path` returned `False` for the `\\?\` spelling, so the guard took C1's blessed allow branch.

**Why this distinction is not pedantry.** Filing the specification defect under the self-judgement
heading aims the remedy — *more independence* — at the one seam that already had it, and leaves the
actual hole (a two-state criterion with an undecidable third state on a security path) unnamed.

## The question, in one line

Approve **(A)**, **(B)**, both, or neither?

**(A) Generalise D-015 from the corpus to every artifact used to JUDGE a fix** — the corpus, the
oracle, the bound, and the mutant set. Two checkable preventives ride with it:
- a regression test for a *discrimination* must contain **both sides** of it — one input that must
  fire and one that must not, differing only in the property under test;
- **mutants are derived from the diff, not from the design.** A surviving mutant is a failed test;
  a mutant never written is not a passing one. (Cycle 3 reported "6/6 killed" with M5 absent.)

**(B) A separate specification-completeness rule**, owned by the checker as sole writer of
`qa/contracts/`: a criterion carrying an escape clause (*"… and silent when X"*) must state the
outcome when **X is undecidable**, and on a security path that outcome is **fail-closed**. A
guard's specification needs three states, not two.

## What follows from each answer

- **A only** — the delivery-gate lesson lands; `qa/contracts/write-guard.md` stays self-contradictory
  and ISS-180 stays blocked behind its own contract.
- **B only** — the write-guard seam unblocks (C1 is amendable, the contract is still `proposed` and
  unratified, so this is the moment); the instrument lesson stays a debug report.
- **Both** — one D-entry, two subsections under "Maker-checker discipline", alongside D-015.
- **Neither** — record the reasoning; both diagnoses stay as history and the sweep stops re-raising it.

On approval the maker drafts the entry and you run
`powershell -File scripts/append_decision.ps1 -EntryFile <entry.md>`, since only you can supply
`**Approved-by:** Umesh`.

**Links:** ISS-220 (this finding); ISS-180, ISS-205; D-015; `qa/debug/write-guard-enforcement-gaps-cycle3.md`;
`qa/debug/delivery-gate-manifest-blindness-cycle3.md`; `qa/contracts/write-guard.md` [C1] and [I2].

## Answered

_(unanswered — append `Answered: <ISO date> — <choice> — <where>` before acting)_

**Gate status:** OPEN — awaiting the Approver; see the Answer format section in this file
