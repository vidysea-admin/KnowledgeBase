# HUMAN_GATE — should the delivery gate keep reading the heading stamp form?

**Opened:** 2026-09-09
**Blocks:** closing `delivery-gate-manifest-blindness` (STALLED at cycle 3). Three of that unit's
five failures collapse into this one decision.

## The question, in one line

Contract `qa/contracts/delivery-gate.md` **[C4]** names the form
`# Verdict — <slug> · **Cycle checked: N**` verbatim, and 4 live verdicts use it. Cycle 3 made that
form **unreadable**. Keep C4 and re-read the form, or amend C4 to drop it?

## Why it needs you, and what I got wrong

I made this trade **unilaterally** and described it in a manifest as *"the property working as
designed, not a residual defect."*

Invariant **[I2]** of that contract says: *"a change that trades C1 for C2 is a FAIL, not a
tradeoff."* That is precisely what I did. Under the criticality gate, amending a contract criterion
is an **Approver decision, not a maker decision** — I should have raised this before shipping cycle
3, not asserted it inside one. The checker was right to fail it, and the contract remains `proposed`
and unamended.

## The tradeoff, stated honestly

The heading form separates the stamp from the label with a **middle dot** (`·`) or an **em dash**.
Reading it requires a non-ASCII boundary in the pattern — and that is what made the gate's answer
depend on how PowerShell decodes the file. Two independent measurements disagreed about *which*
reader mangles it: the checker measured that the default `Get-Content` destroys the em dash; my own
probe measured the opposite, that `-Encoding UTF8` does. Neither of us is obviously wrong, which is
the point.

- **Reading the form** buys correctness on 4 real verdicts, and costs a decision that varies with an
  encoding nobody has pinned.
- **Not reading it** costs those 4 verdicts reading as *pending* — the gate nags rather than goes
  silent — and buys an answer no decode can change (verified: 232 files × 3 decoders, **0** decision
  changes).

Today the cost is zero: all 4 of those manifests are closed, so none is live. The risk is a *future*
unit using that form while open, which would then read as pending until someone noticed.

## Options

- **A — amend C4 to drop the heading form** (what cycle 3 assumed): a DECISIONS entry with
  `**Approved-by:** Umesh`, and the checker amends C4. Simplest, and keeps the encoding-independence.
  The honest follow-on is to standardise verdicts on a line-start stamp so the form stops appearing.
- **B — keep C4 and re-read the form**: the pattern regains a non-ASCII boundary, and the encoding
  question must then actually be settled — pin the reader explicitly (`-Encoding UTF8` or a
  byte-level read) and fixture it, rather than leaving two contradictory measurements standing.
- **C — keep C4 but satisfy it differently**: read the heading form via an ASCII-only route, e.g.
  match `# Verdict` headings structurally and take the trailing digits, so no separator character is
  load-bearing. More code, no encoding dependency, and it does not require amending the contract.

## Answer format

Say A, B or C here. On A the maker prepares the DECISIONS entry and you run
`powershell -File scripts/append_decision.ps1 -EntryFile <entry.md>`, since only you can supply
`Approved-by`. On B or C it becomes a normal unit for whoever next touches the block, alongside
ISS-205.

**Links:** ISS-205, ISS-206, ISS-207; `qa/contracts/delivery-gate.md` [C4] and [I2];
`qa/manifests/delivery-gate-manifest-blindness.md`

---

**Answered:** 2026-09-25 — **A** — amend C4 to drop the heading form. Answered by Umesh in session (AskUserQuestion, 2026-09-25). Verdicts standardise on an own-line `**Cycle checked:** N`; both live sessions already do this. Next: DECISIONS entry carrying Approved-by: Umesh, then the checker amends C4.
