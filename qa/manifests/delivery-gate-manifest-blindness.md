# Manifest — delivery-gate-manifest-blindness

**Contract:** none governs the machine-wide hook layer. Checker: `qa/contracts/write-guard.md`
(status `proposed`) covers the sibling guard; judge whether this belongs under it or needs its own.
**Goal task:** none (tier 2 — open high issue).
**Date:** 2026-09-09
**Fix cycle:** 0 of max 3 (reset 2026-09-28 per D-041 ruling 5 — see "Cycle reset" below)
**Dual check:** no
**Issues addressed:** **ISS-176** (high) + **ISS-184**, **ISS-185**, **ISS-186**, **ISS-187**. Gates **ISS-183**. Cycle 3: **ISS-192**, **ISS-193**, **ISS-194**, **ISS-195**, **ISS-186**. Corrects the record on **ISS-177**.
**Status:** reset-awaiting-rebuild (was STALLED at cycle 3 of max 3; reset 2026-09-28 per D-041 ruling 5)

## Why

`delivery-gate-stop.ps1` is the Stop hook that blocks a session when a maker-checker project has
pending state and no `ScheduleWakeup` was made — the machine form of THE CONTINUATION RULE, added
because the loop once died every turn while believing it was self-continuing.

**It could not see the handshake it exists to guard.** Its manifest predicate is
`Status:\s*ready-for-check`, which **cannot match `**Status:** ready-for-check`** — after the colon
comes `**`, and `\s*` will not consume it. That is the form **15** of this repo's manifests use.

Measured against the live tree: the gate reported **1** pending check while **2** manifests sat
genuinely unchecked, one of them a **cycle-3-of-3** unit whose FAIL would STALL it.

## A second defect in the same nine lines

`Cycle checked:\s*(\d+)` with `-match` returns the **first** match. A verdict file accumulates one
section per cycle, so a verdict carrying cycles 1, 2 and 3 reports **1 — forever**. Any unit past
cycle 1 therefore reads as still-pending even after its verdict lands. Found while reading the
block for the first defect, not reported by anyone.

## The fixtures encoded the same blind spot

`hook-fixtures.ps1:102` — and every other maker fixture — writes the **unbolded**
`## Status: ready-for-check`, which is the one form the old regex could see. **The suite was green
because the tests shared the bug.** That is why a gate this repo depends on shipped blind: it was
never tested against the shape its own project actually writes.

## What changed

| File | Change |
|---|---|
| `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:117-135` | strip `**` then anchor to line start; take the **highest** `Cycle checked`, not the first. |
| `D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` | +2 fixtures: the bolded form, and a 3-cycle verdict. |

Stripping emphasis *and then* anchoring to line start is deliberate: stripping alone would make the
gate match prose that merely **quotes** `Status: ready-for-check` — which close-out sections in this
repo do — turning a blind gate into a noisy one.

## How to verify

- `powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` → `ALL PASS`, including
  `ISS-176 BOLDED '**Status:**' manifest is seen as pending` and
  `ISS-176 highest Cycle checked wins (not the first)`.
- Run the old and new scanning logic over the real `D:/KnowledgeBase/qa/manifests` (113 files).

## Actual outputs

```
OLD logic : pend=1 unclosed=0        <- blind to both bolded manifests
NEW logic : pend=2 unclosed=1
```

The new numbers are explicable item by item, which is the actual evidence:

| manifest | form | manifest cycle | verdict max | counted as |
|---|---|---|---|---|
| `write-guard-enforcement-gaps` | **bolded** | 3 | 2 | pending ✓ |
| `hybrid-arms-binding` | unbolded | 2 | 1 | pending ✓ |
| `speaker-verbatim-token-boundary` | **bolded** | 3 | 3 | unclosed ✓ |

`unclosed=1` independently reproduces the Mode B sweep's fourth consecutive ruling on
`speaker-verbatim-token-boundary` — a fix gap, not a dispatch gap.

**Mutation table** (D-020: timeout, restore in a `finally`, SHA256-asserted, live file verified
restored):

| mutation | result |
|---|---|
| revert the emphasis strip (back to the blind regex) | **killed** |
| take the first `Cycle checked` again, not the highest | **killed** |
| **no-op control** | **clean** |

## Correcting the record on ISS-177 — my own false measurement

The previous tick's `qa/.last-tick` entry states: *"the last ACTUAL ScheduleWakeup before this one
was 2026-09-08T10:56Z — 16h38m and ~20 ticks earlier."* **That is false**, and it was cited as the
evidence for an enforcement-path change (`8fd5625`).

Counted independently over every main-chain transcript in
`C:/Users/Lenovo/.claude/projects/d--KnowledgeBase/`, in that exact window:

```
main-chain ScheduleWakeup calls : 53      (not ~0)
first / last                    : 2026-09-08T10:56:13Z / 2026-09-09T04:09:10Z
largest unarmed gap             : 4h53m   (09-08 20:00Z -> 09-09 00:54Z)
```

The Mode B sweep independently refuted the same claim with different numbers (26 calls, 6h19m).
**Both refute it; neither reproduces the other**, and I have not reconciled the discrepancy — most
likely transcript-file scope. I am reporting my own count and the disagreement rather than adopting
the sweep's figure, because taking a number I did not derive is how the false one got written.

**The underlying defect is real and separately verified** — the pre-`8fd5625` predicate asked
"EVER?" where the rule is "THIS TURN?" — so the fix stands on its own logic. What does not stand is
the measurement quoted to justify it. Same shape as D-015, in the record of the change rather than
in the change.

## Known gaps

1. **The 53-vs-26 discrepancy is unreconciled.** Two independent counts of the same window disagree
   by 2×. Whoever is right, the "16h38m" claim is dead — but an unreconciled measurement is a weak
   place to stop, and I am flagging it rather than picking the number I like.
2. **`qa/.last-tick` cannot be corrected in place** — it is an append-only prose log, so the false
   sentence stays in it and this manifest is the correction. A reader of the stamp alone still sees
   the wrong figure.
3. **No fixture pins the gate against a *real* manifest corpus.** The two new fixtures use synthetic
   files. The old/new comparison over the 113 real manifests was run by hand and is not in the suite.
4. **`delivery-gate-stop.ps1` has other predicates I did not audit** — review, learning-file, and
   config. This unit touched only the maker/manifest block; the same markdown-fragility class may
   exist in the others.

## Note to the checker

Gap 4 is where I would push. I fixed the predicate that was pointed at and did not check whether its
siblings share the defect class — which is precisely the mistake that made ISS-165 take three cycles
(fixing named paths instead of the class). If you find the same fragility in another predicate, that
is a FAIL and I would rather have it now.

---

# Fix cycle 2 — five findings, and the worst one is that I repeated the exact mistake I was fixing

FAILed 4/9. Every finding is real. Two are the same defect class I have now been caught by four
times, and one of them I caught myself, mid-cycle, in my own new test.

## ISS-185 — a fix measured against a corpus its own author chose. Again.

My cycle-1 fixtures used only stamp forms **the new regex was written to satisfy**. That is D-015's
rule broken in the test rather than in the measurement, for the fourth time in this project.

The remedy is not "add more cases" — it is to stop choosing them. I took a **census of the 114 real
verdicts**:

```
60x  **Cycle checked:** N          41x  **Cycle checked: N**       26x  Cycle checked: N
 2x  <slug> · **Cycle checked: N**  1x  - **Cycle checked: N**
 1x  **Status: PASS** (Cycle checked: N)
```

The last three are precisely what an `^\s*`-anchored pattern cannot reach — and they are the forms I
would never have invented, because I write the first three.

## ISS-184 — the fix was still fragile at its own site

Confirmed by measurement, not reading: the cycle-1 pattern **misread 7 of 114 verdicts**, including
`write-guard-enforcement-gaps` (saw cycles 1 and 2; the actual maximum is 3).

Candidates evaluated against the whole corpus rather than argued about:

| pattern | misread-LOW (looks pending, verdict landed) | misread-HIGH (**looks closed when it is not**) |
|---|---|---|
| cycle-1, `^\s*Cycle checked:` | 7 | 0 |
| unanchored, anywhere | 0 | 0 |
| **field-boundary (`^`, `·`, `—`, `(`) + markers** | **0** | **0** |

Unanchored also scores 0/0 today, and I rejected it: it matches `Cycle checked` mid-sentence, so
future prose in a verdict could make a **pending unit look closed** — the one direction that
silences the gate. Proven rather than asserted:

```
prose probe "...take the first Cycle checked: 9 again..."
  field-boundary -> no match (correct)     unanchored -> 9  (would silently close the unit)
```

`Fix cycle:` and `Status:` got the same marker treatment. The shipped PowerShell regex was then run
over all 114 real verdicts: **0 misreads**.

## ISS-186 — the old gate saw ZERO real handshakes, not one

My cycle-1 evidence said `OLD logic : pend=1`, implying it saw `hybrid-arms-binding`. The checker
found that single hit was a **false positive** — it matched *prose* at manifest lines 35/47, not any
Status line. The old gate's true score was **0 of 3**, and my table made it look partly working. The
direction of my error flattered my own before/after.

The checker also found `delivery-gate-stop.ps1` never tests for `VERDICT: PASS` before printing
"*N PASS not closed out*", while its sibling does. Today every such item is a FAIL, so the block
message names the wrong action. **Not fixed in this cycle** — it is a message-accuracy defect in a
predicate this unit did not otherwise touch, and I would rather leave it filed than widen scope past
the failures I was given.

## ISS-187 / Gap 1 — the reconciliation I refused took one query

I reported 53 `ScheduleWakeup` calls and declined to reconcile the sweep's 26, calling it "most
likely transcript-file scope". The checker did it in one query: **the sweep counted one of the two
transcript files** (`38fdc7ba` = 27, `d3f69058` = 26); I counted both. My 53 is also 2 high — two
tool-use ids double-counted across a fork/resume pair. **The reconciled figure is 51 unique calls.**

Declining to adopt a number I had not derived was right. Declining to spend one query reconciling it,
in a manifest whose subject is a false measurement, was not.

## ISS-183 — the class IS alive, and it is not mine to fix

I invited a FAIL on Gap 4 and it landed. The checker cleared the other predicates in
`delivery-gate-stop.ps1` — they parse transcript JSONL, not markdown, so *"checked, not affected"* —
but found the class alive in the two sibling hooks:

- `mc-sessionstart.ps1:15` and `mc-precommit.ps1:43` still use the bare `Status: ready-for-check`
- `mc-sessionstart.ps1:19` still ends in `Select-Object -First 1`

**Live effect, measured this session:** the SessionStart directive reported
`Checks pending: 1 [hybrid-arms-binding]` while the manifests actually pending were
`delivery-gate-manifest-blindness` and `speaker-verbatim-token-boundary`. It named a unit that was
not pending and missed both that were — and `mc-precommit.ps1` is the **commit guard**, so a guard
that cannot see a pending handshake cannot refuse a commit that leaves one dangling.

Both files are **Lab enforcement paths** requiring `Approved-by: Umesh`. Raised as
`qa/gates/mc-hooks-manifest-blindness.md` with the exact change and an honest option B. I verified
`mc-sessionstart.ps1:17` is *unaffected* (`[:*\s]+` already tolerates the bolding) rather than
listing it for symmetry.

## I caught one vacuous test myself, mid-cycle

My first ISS-185 fixture asserted `-notmatch '1 check(s) pending'` — which passes whether `Fix cycle`
reads 6 **or** 0. It survived mutation, which is how I found it. That is the same class as ISS-179's
`[].every()` being `true`: written by me, in the cycle whose subject is tests that share their
subject's blind spot.

Replaced with a case whose output differs between the two readings — manifest cycle 6 (list-marker
form) against a verdict whose highest stamp is 3: the correct reading is **pending**, while
misreading `Fix cycle` as 0 makes it *unclosed* and the check fails.

## Evidence

```
$ powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1    ALL PASS
$ shipped PS regex over qa/verdicts/*.md                             114 checked, 0 misreads
```

| mutation | result |
|---|---|
| revert the emphasis strip | **killed** |
| `Cycle checked:` back to line-anchored only | **killed** |
| `Fix cycle:` back to line-anchored only | **killed** (survived until I replaced the vacuous assertion) |
| `Status:` back to line-anchored only | **killed** |
| take the first `Cycle checked` again | **killed** |
| **no-op control** | **clean** |

## Known gaps

1. **ISS-186's message-accuracy half is filed, not fixed** — deliberately out of scope, stated above.
2. **The `(` and backtick boundaries admit a quoted stamp.** A verdict containing
   `` (`Cycle checked: 9`) `` inside prose would match. Zero occurrences across 114 verdicts, and the
   alternative — dropping `(` — misreads two real files. But it is a real residual, and it fails in
   the *silencing* direction.
3. **ISS-183's half is gated, not fixed**, so the SessionStart directive stays wrong until the
   Approver rules.
4. **The corpus census is a snapshot.** A seventh stamp form invented tomorrow is unpinned. [C7] of
   the new contract is the durable answer; a census is not.

## Note to the checker

Gap 2 is the one I would push on. I chose the pattern that fails *noisily* over one that scored
identically today, on the argument that a silenced gate is worse than a nagging one. If you think
0/0 across the real corpus should have settled it and the extra boundary characters are unjustified
complexity, say so — I would rather be wrong about the reasoning than have it go unexamined.

---

# Fix cycle 3 — I chose my own oracle, and it silenced the gate on this very unit

FAILed 4/9. The headline finding is the sharpest one this seam has produced, and it is mine.

## ISS-192 — choosing your own oracle is the same defect as choosing your own corpus

Cycle 2 fixed ISS-185 by censusing the real verdicts instead of inventing forms. Then it scored the
new field-boundary pattern **against the unanchored pattern it was rejecting**. Both share the
prose-match error, so the one place the shipped regex silences the gate scored as *agreement*, and
my "0 misreads" was 0 disagreements-with-a-broken-referee.

**The live consequence, in this unit's own verdict.** The `·` boundary matched a stamp quoted inside
a table cell whose backtick span wrapped a newline — my stripper only handled single-line spans — so
the file read **max cycle 3** when its only real stamp is 1, and the gate reported `pend=0`. It was
blind to the handshake it was written to see, in the file about it being blind to handshakes.

Cycle 2's Gap 2 said "zero occurrences across 114 verdicts". There were two, in the one file that
mattered.

## The fix: a property, because this corpus has no oracle I do not author

There is no ground truth for "is this markdown a stamp or prose" that I can write without writing
the answer. So cycle 3 does not chase accuracy. It establishes a **direction**:

> The reader may never return a cycle **higher** than a stamp present in the file.

Missing a stamp biases the unit to **pending** — the gate nags. Inventing one biases it to
**closed** — the gate goes silent. Only one of those is survivable, and it is checkable without an
oracle.

Three changes deliver it:

1. **Strip fenced blocks and inline code spans, newlines allowed.** The cycle-2 stripper used
   `` `[^`\n]*` ``; the table cell that defeated it spans a line.
2. **ASCII-only boundaries** (`^` and `(` plus markers). The `·`/`—` heading form becomes
   unreachable — deliberately. It is 4 files, all closed, so the cost is zero live noise.
3. This also makes the **encoding dispute moot rather than settled.** The checker measured that
   PS 5.1's default reader destroys the em dash; my probe measured the opposite, that
   `-Encoding UTF8` does. A boundary whose behaviour depends on which of us is right is fragile by
   construction, so cycle 3 depends on neither.

### Measured, in both runtimes, over all 114 real verdicts

```
                              higher (SILENCES)   equal   lower (noisy)
  python                              0            110          4
  the shipped PowerShell block        0            110          4
```

`higher = 0` is the property. The 4 lower are `calendar-auto-join`, `evaluator-calibration`,
`write-guard-enforcement-gaps`, and this unit's own verdict — **none of them live**, because none of
their manifests is at `ready-for-check`.

## ISS-186 — fixed, and the checker was right that deferring it was convenient

Only a `VERDICT: PASS` can be "not closed out". The checker's argument stands: the line sits **five
lines below the one cycle 2 edited, in the same block**, and the sibling `mc-sessionstart.ps1:22`
already tests it. "Out of scope" was a boundary I drew where it happened to spare me work.

## The seventh census form, and what it costs

`**PASS** — Cycle checked: 1` (`evaluator-calibration.md`) was absent from my census — the checker
found it, and the heading form is 4x not 2x. Under cycle 3 it reads as *no stamp* → pending. That is
the property working as designed, not a residual defect.

## Two of my own fixtures were broken, and I found both

- The ISS-185 fixture asserted `-notmatch`, passing whether `Fix cycle` read 6 **or** 0 — ISS-179's
  `[].every()` class. Caught by mutation, replaced with a discriminating case.
- The ISS-192 fixture wrote literal backticks inside a PowerShell **double-quoted** string, where
  the backtick is the **escape character** — so the fixture contained no backticks at all and
  **never reproduced the defect it asserted**. It passed for the wrong reason. Rebuilt with
  `[char]0x60`; it now dies when the stripping is removed.

The second is the more embarrassing: a test that cannot fail is worse than no test, and I wrote one
in the cycle whose subject is tests that share their subject's blind spot.

## Evidence

```
$ powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1     ALL PASS
$ safety property over qa/verdicts/*.md, shipped PS block             higher=0 equal=110 lower=4
```

| mutation | result |
|---|---|
| drop inline code-span stripping (prose becomes a stamp) | **killed** |
| re-add the non-ASCII boundaries (encoding-dependent again) | **killed** |
| `Status` back to line-anchored only | **killed** |
| `Fix cycle` back to line-anchored only | **killed** |
| take the first `Cycle checked` again | **killed** |
| ISS-186: count any verdict as PASS-not-closed-out | **killed** |
| **no-op control** | **clean** |

D-020: timeout, restore in a `finally`, every restore SHA256-asserted, live file verified.

## Known gaps

1. **The safety property is measured against a reference that is itself a regex** (the unanchored
   scan, used only as an upper bound). It cannot manufacture a stamp that is not in the file, so it
   is sound as a *bound* — but it is not an oracle, and I am not claiming it is one.
2. **The `·`/`—` heading form is now unreadable.** 4 files today, none live. If a future verdict
   uses it while its manifest is open, that unit reads as pending forever until someone notices.
3. **ISS-183 is still gated**, so `mc-sessionstart.ps1` and `mc-precommit.ps1` stay blind until the
   Approver rules — and `mc-precommit` is the commit guard.
4. **`Strip-Code` is not itself fixture-pinned against a fenced block**, only against inline spans.
   The fence branch is exercised by no test.

## Note to the checker

Gap 1 is the honest one. I have replaced "measured against an oracle I chose" with "measured
against a bound I chose", which is better but not the same as sound. If you think the property is
circular in a way I have not seen, that is a FAIL and it is worth more than a PASS here — this is
the third mechanism I have proposed for the same nine lines.

---

# STALLED at cycle 3 — I asked for the property to be attacked, and it broke

Verdict `qa/verdicts/delivery-gate-manifest-blindness.md` (`Cycle checked: 3`, commit `d171d0c`):
**FAIL, 5/9.** Max cycles reached. The checker's own disposition: **do not open a cycle 4.**

## ISS-205 (high) — the safety property is FALSE, and cycle 3 built the hole

I reproduced the counterexample in the hook's own runtime:

```
input   "# Verdict" / "Cycle checked: `1`" / "3 files were affected"
after Strip-Code   ->   "Cycle checked: "  then  "3 files were affected"
shipped reader returns : 3
that stamp exists in the file? False
```

**The stripper I added in cycle 3 manufactures the stamp.** It erases the value inside the inline
span, leaving a bare label, and `\s*` crosses the newline to adopt the next line's leading digit.

And the deeper point, which is worse than the counterexample: **my reference bound counts prose
occurrences.** So cycle 2's exact defect — a cycle read out of prose — scores `equal`, never
`higher`. The property was structurally blind to the failure it was written to guard. My Gap 1 said
"a bound, not an oracle"; it was not even a sound bound.

Fix, for whatever unit next touches this block: require the digits on the **same line**
(`[^\S\r\n]*` rather than `\s*`), and reject a label whose value was erased by stripping. Small, and
not worth a fourth cycle here.

## I2 (high) — I made an Approver's decision and called it a design choice

Contract [C4] names the `# Verdict — <slug> · **Cycle checked: N**` heading form verbatim, and 4
live verdicts use it. Cycle 3 made it unreadable and I wrote that this was *"the property working as
designed, not a residual defect."*

Invariant [I2] says: **"a change that trades C1 for C2 is a FAIL, not a tradeoff."** That is exactly
what I did, and under the criticality gate it is an **Approver amendment, not a maker decision**. I
did not raise it as a gate; I asserted it in a manifest and moved on. Raised now as
`qa/gates/delivery-gate-c4-heading-form.md`.

## ISS-207 — a third vacuous fixture, in the third consecutive cycle

Mutant M5 (drop the `(` boundary) **survived the full suite**: it kills a real census form and every
check still passes, because the "census forms" fixture asserts only a pending count. The dispatch
asked the checker to hunt a third after I found two myself; it found one.

Three cycles, three fixtures that could not fail. That is no longer an accident — it is how I write
tests when I already believe the code is right.

## What genuinely landed, verified by the checker rather than claimed by me

- **Cycle 2's headline defect is dead.** The live gate now reads `pend=1` and names this handshake.
- **ISS-193 is genuinely moot**, not hand-waved: 232 files × 3 decoders, **0** decision changes, and
  no decode can create an ASCII boundary in principle.
- **ISS-186 fixed**, sibling `mc-sessionstart.ps1:22` confirmed.
- **Both fixtures I found myself now genuinely die** under their mutations (M1, M4).
- `higher=0 equal=110 lower=5` reproduced independently — the numbers were right; what they *mean*
  was not.

## Why this stalls rather than opening cycle 4

Three of the five findings are one decision — whether the contract keeps C4 — which is the
Approver's under the criticality gate, and the class-based round cap (D-014) sends a **non-security**
seam past two rounds to a HUMAN_GATE rather than round N+1. ISS-205 is the single real code defect
and is a small regex change for the next unit that touches this block.

## Still unmet, honestly

**[C1]** — `mc-sessionstart.ps1` and `mc-precommit.ps1` remain blind, gated on
`qa/gates/mc-hooks-manifest-blindness.md`. The commit guard cannot see a pending handshake until the
Approver rules.

**Handshake status:** STALLED — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

## Cycle reset — 2026-09-28 (D-041 ruling 5)

Counter reset per **D-041 ruling 5** (Approved-by: Umesh) — the Approver chose fresh attempts
over closing these as not-pursued, so the max-cycle cap no longer holds this unit shut.

**But a cycle 4 is NOT the recovery, and the reset does not make it one.** This unit's own stall
diagnosis `qa/debug/delivery-gate-manifest-blindness-cycle3.md:106-110` names the smallest
recovery as **ISS-205, the only real code defect** (require the digits on the same line —
the same-line whitespace class instead of `\s*` — and reject a label whose value was erased by stripping), and says
verbatim that it *"belongs to whatever unit next touches the block, **not** a cycle 4."*
So: pullable again, but the path is a fold-in, not a re-run of the same unit.
