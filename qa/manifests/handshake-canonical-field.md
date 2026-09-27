# Manifest — handshake-canonical-field

**Contract:** none governs the manifest record's own format. `qa/contracts/delivery-gate.md` [C7]
applies by extension — the same audit-across-siblings duty that produced `mc-hooks-bolded-status`.
**Goal task:** none (tier 2 — open high issue, ISS-350).
**Date:** 2026-09-27
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-350** (high) — partially, by design. Cycle 1 responds to **ISS-351** (high, filed by the cycle-0 checker). See "What this unit does NOT fix".

## Why

The handshake between maker and checker is files, not memory (project CLAUDE.md). That makes the
`Status` field the load-bearing element of the whole pair: it is how any session — or the
session-start hook — learns that a check is owed. Measured this tick across all 159 manifests, it is
written three incompatible ways:

| form | count | example |
|---|---|---|
| inline bold field `**Status:**` | 30 | `**Status:** checked-PASS (Cycle checked: 1, …)` |
| markdown heading `## Status:` | 92 | `## Status: checked-PASS (cycle 0)` |
| other inline (`Status:` / `- **Status`) | 37 | — |

A line-anchored grep for the first form therefore sees 30 of 159. **This is not hypothetical
tidiness: the session-start hook for this very session printed `Checks pending: 0 | PASS not closed
out: 0` while `delivery-gate-stamp-adoption` sat at `ready-for-check` over a cycle-1 FAIL, owing fix
cycle 2.** A contract whose state no reader can compute is one a session can silently skip, and that
is precisely what happened.

It is also the same class as ISS-176/ISS-183 (bold-blindness in one hook predicate), generalised from
one predicate to the whole substrate, and the direct twin of ISS-348 on `qa/gates/`.

## What changed

One appended line per manifest, in all 160 files (the 159 pre-existing ones plus this manifest).
The example below is deliberately **indented by two spaces** so that it does not itself match the
column-0 anchor — otherwise this file would break the "appears exactly once" invariant it asserts,
which the cycle-0 checker correctly caught:

```
  **Handshake status:** <state> — derived by the ISS-350 backfill from all N status statement(s) in this file, which agree
```

Vocabulary: `checked-PASS` | `ready-for-check` | `STALLED` | `superseded` | `paused`.

Three deliberate design choices, each of which a checker should test rather than accept:

1. **A new field name, not a reused one.** 30 files already carry `**Status:**`; appending a second
   `Status` line would create exactly the ambiguity being removed. `**Handshake status:**` cannot
   collide with any existing form. This mirrors `**Gate status:**` in `qa/gates/` (ISS-348).
2. **Additive, never rewriting.** The 92 `## Status:` headings are cited by commit messages and
   verdicts. Rewriting them would repoint live references, which is the failure D-019 rejected
   renumbering lane ids to avoid. So the old lines stay exactly as they are.
3. **Every value is DERIVED from the file's own existing status text, never invented.** The script
   maps the existing string onto the vocabulary and reports `UNDERIVABLE` rather than guessing.

## What this unit does NOT fix — stated up front

**The readers are untouched.** The session-start hook, the checker sweep and the tracker audit still
parse whatever they parsed before, so the hook will still miscount until part (d) of ISS-350's
`fix_direction` lands. That half edits `mc-sessionstart.ps1`, an **enforcement path**, which under
this repo's CLAUDE.md needs an authorizing DECISIONS entry carrying `**Approved-by:** Umesh`. It is
not in this unit and must not be read as covered by it.

**The verdict side is untouched.** `VERDICT:` vs `Verdict:` and the newest-cycle-first ordering of
multi-cycle verdict files are both still live.

This unit makes the manifest side *computable*. It does not make anything *read* it.

## Cycle 1 — the checker FAILed cycle 0, and it was right about the method

`qa/verdicts/handshake-canonical-field.md` (Cycle checked 0) returned **FAIL** and filed **ISS-351**.
Its methodological finding is correct and is fixed here. Its conclusion about the specific file is
not, and I am recording the disagreement rather than quietly accepting or quietly dropping it.

### What was actually wrong (fixed)

Cycle 0 derived each file's state from the **first** anchored status line. Nothing justifies that: a
manifest may carry a later, superseding status. `u2-fix1-ingest-guards.md` has three status
statements and cycle 0 read only the first. "Last match wins" is no better justified. So cycle 1:

1. **Reads every anchored status statement in the file** and stamps only when they agree.
2. **When they disagree, stamps nothing and reports `AMBIGUOUS`** — the same refusal-to-guess that
   cycle 0 applied to `UNDERIVABLE`. A wrong stamp is worse than no stamp, because the whole point of
   the field is that a reader can trust it without opening the file.
3. **Widened the status regex** to catch forms cycle 0 missed entirely (`**Status update <date>:**`,
   `Status unchanged: ...`). This is why cycle 0 saw one statement in files that have three.
4. **Excludes `superseded by cycle N`** — that is a note about an earlier cycle of the same unit, not
   the unit's status. Cycle 0's broader reading would have mis-stamped `u0-zoom-iframe-traversal`
   (two such notes sit above its real `checked-PASS (cycle 3)`); it now derives `checked-PASS`.
5. **Adds `BLOCKED` to the vocabulary**, which cycle 0 omitted and which `u2-fix1` needs.
6. **Strips any cycle-0 field before re-deriving**, so this is a clean re-derivation, not a second
   layer of stamps.

Result: **160 of 160 files derive (159 manifests + this one), 0 ambiguous, 0 underivable.**

### Where I disagree with the checker, with evidence

ISS-351 concludes that `u2-fix1-ingest-guards.md`'s real state is `BLOCKED`, that `checked-PASS` is a
false PASS, and that it is serious because the unit's production-Mongo live repair is unfinished.
**The first two claims do not survive the git history:**

```
$ git log -S "checked-PASS (verdict qa/verdicts/u2-fix1-ingest-guards.md" --format='%h %s' -- qa/manifests/u2-fix1-ingest-guards.md
14f5771 maker: close out u2-fix1-ingest-guards (checker PASS cycle 1)

$ git log --format='%h %s' -3 -- qa/manifests/u2-fix1-ingest-guards.md
14f5771 maker: close out u2-fix1-ingest-guards (checker PASS cycle 1)   <- latest
e5ca83b maker: u2-fix1 ready-for-check (code claim; live index deferred to post-merge per Umesh)
9f6b784 maker: u2-fix1 live repair run evidence (index failed on lane module-instance artefact)
```

The `checked-PASS` field was introduced by `14f5771`, which is **later** than `9f6b784`, the commit
that wrote the `BLOCKED` evidence. The file states this in its own words at line 16 — *"The history
below is kept as written."* And `qa/verdicts/u2-fix1-ingest-guards.md` carries `VERDICT: PASS` at
`Cycle checked: 1`. So `checked-PASS` is the current unit status and the `BLOCKED` lines are retained
history. **Line order is not commit order** — that is precisely why a script cannot adjudicate this,
and why cycle 1 refuses to try.

The checker's underlying worry is still worth stating plainly, because it is a real distinction the
ledger depends on: **ISS-304/305/306 remain OPEN** pending the post-merge `--reingest` showing
chunks > 0. A unit can be `checked-PASS` while the issues it addressed stay open — that arrangement
is written into the unit's own dispatch and into its verdict. ISS-351 conflates unit status with issue
status. The live repair being unfinished is true and is tracked; it is not evidence that the manifest
misstates its status.

**I have not touched ISS-351's row.** It is the checker's finding and the cycle-1 checker should rule
on this adjudication rather than have the maker close a row by asserting it was wrong.

### The one file that needed a human, and how it is recorded

`u2-fix1-ingest-guards` is stamped `checked-PASS` through an explicit, auditable adjudication — not a
rule. Its stamp names the disagreement and the evidence inline:

```
  **Handshake status:** checked-PASS — this file's 3 status statements DISAGREE (checked-PASS,
  BLOCKED); hand-adjudicated: `git log -S` shows the checked-PASS field was introduced by 14f5771
  (the close-out), which is LATER than 9f6b784 that wrote the BLOCKED evidence; ...
```

A reader who doubts it can re-run that one command. That is the property I wanted: adjudications are
visible and checkable, not folded into a heuristic.

### The low finding is also fixed

The cycle-0 checker noted (correctly, and correctly did not file it) that this manifest broke its own
"appears exactly once" invariant, because its illustrative example matched the column-0 anchor. The
example is now indented by two spaces, so verification command 1 genuinely returns empty.

## Measurement against the ledger (D-015)

ISS-350 records **4 reproductions**. Reporting by id, against the ledger's own cases — not a corpus
authored here:

**ISS-350: 1 of 4 covered. 3 deliberately left open, each named with its reason.**

| # | reproduction | result |
|---|---|---|
| 1 | only 30 of 159 manifests match a line-anchored `**Status:**` | **CLOSED** — 160 of 160 now carry `**Handshake status:**`; countable in one command, 0 ambiguous, 0 underivable |
| 2 | the hook prints `Checks pending: 0` against an owed fix cycle | **OPEN, deliberately** — the fix is in the hook (enforcement path, needs `Approved-by`). The *substrate* now exposes the 4 unresolved units; the *reader* still does not consult it |
| 3 | last `VERDICT` match in `hybrid-merge.md` yields FAIL because verdicts are newest-first | **OPEN, deliberately** — verdict-side, out of this unit's scope |
| 4 | ≥40 verdicts write `Verdict: PASS`, unmatched by an uppercase anchor | **OPEN, deliberately** — verdict-side, out of this unit's scope |

Scoping to the manifest side was chosen so the change stays additive and reviewable in one pass; the
verdict side needs its own decision about the newest-first convention, which is a convention question
rather than a bug.

## How to verify

Run from the repo root. Nothing below is a self-report — each command is re-runnable.

1. **Every manifest carries the field, exactly once:**
   `grep -c '^\*\*Handshake status:\*\*' qa/manifests/*.md | grep -v ':1$'` → expect **no output**.
2. **The directory is countable in one command:**
   `grep -h '^\*\*Handshake status:\*\*' qa/manifests/*.md | sed 's/^\*\*Handshake status:\*\* //; s/ —.*//' | sort | uniq -c`
   → expect `152 checked-PASS`, `3 superseded`, `3 ready-for-check`, `2 STALLED` (160 total; the
   third `ready-for-check` is this manifest itself).
3. **The unresolved units are findable by the field alone:**
   `grep -l '^\*\*Handshake status:\*\* \(ready-for-check\|STALLED\)' qa/manifests/*.md`
   → expect exactly five: `delivery-gate-manifest-blindness`, `delivery-gate-stamp-adoption`,
   `u2-4-phase3-precision-regate`, `write-guard-enforcement-gaps`, and `handshake-canonical-field`
   (this unit's own manifest, which is itself awaiting check — it appears because the field is
   honest about its own state rather than exempting itself).
4. **The change is additive — no governance text was altered:**
   `git diff --numstat qa/manifests/ | awk '{a+=$1; d+=$2} END {print a, d}'` → expect `320 2`. The
   two deletions are `iss-262-lint-loc-split.md` and `u2-4-phase3-precision-regate.md`, both of which
   lacked a trailing newline, so git renders their unchanged final line as delete+re-add. **Verify
   this rather than taking it on trust:** `git diff -- <file>` shows the `-` and `+` status lines are
   byte-identical, with `\ No newline at end of file` on the old side.
5. **Derivation agrees with an independent reading.** For each of the 4 non-PASS units, the derived
   value matches the file's own prose status. Falsification path for the checker: pick any 10
   `checked-PASS` files at random and confirm the appended value against the existing status line.

## Actual outputs

```
$ python handshake_backfill2.py          # cycle 1, dry run, before applying
STALLED 2 · checked-PASS 152 · ready-for-check 3 · superseded 3 · TOTAL 160
AMBIGUOUS - statements disagree, NOT stamped (0):
UNDERIVABLE - no parseable status, NOT stamped (0):
HAND-ADJUDICATED (1):
  u2-fix1-ingest-guards       -> checked-PASS   (statements: checked-PASS, BLOCKED, BLOCKED)

$ git diff --numstat qa/manifests/ | awk '{a+=$1; d+=$2} END {print a, d}'
320 2

$ grep -h '^\*\*Handshake status:\*\*' qa/manifests/*.md | sed ... | sort | uniq -c
      2 STALLED
    152 checked-PASS
      3 ready-for-check
      3 superseded

$ grep -l '^\*\*Handshake status:\*\* \(ready-for-check\|STALLED\)' qa/manifests/*.md
delivery-gate-manifest-blindness.md
delivery-gate-stamp-adoption.md
u2-4-phase3-precision-regate.md
write-guard-enforcement-gaps.md
```

Cross-check: that set of 4 matches, exactly, the unresolved set found earlier this tick by a
*different* scanner written before this field existed. Two independent derivations agree.

## The scanner had two bugs, both found by hand-checking its output

Recording these because they bear on how much the numbers above should be trusted.

1. **A loose `Status` regex shadowed a real status line.** The first version allowed leading
   whitespace, so in `T-006-recording-gap-tracking.md` it matched an indented schema example
   (`  status: 'open'|'received'|'expired'`) and never reached that file's real `## Status:` 150 lines
   below. Fixed by anchoring at column 0 (optionally a heading or list marker). T-006 then derived
   correctly, taking the total from 158 to 159.
2. **A "last VERDICT in the file" heuristic read the oldest cycle.** Multi-cycle verdict files are
   ordered newest-first, so this flagged `golden-set-regeneration` and `hybrid-merge` as manifests
   falsely claiming PASS over a FAIL verdict. Both were inspected by hand and **cleared** — the live
   verdict is PASS at the top and the FAILs below are earlier cycles. **No manifest was found falsely
   claiming a PASS.** That ordering is now reproduction 3 of ISS-350, left open above.

Both bugs were in a throwaway scratchpad scanner, not in anything shipped. They are reported because
the second one nearly became a two-unit false alarm against the governance record.

## Note to the checker

- The derivation script lives in the session scratchpad, not the repo, and **no new file was added to
  the repo** — `scripts/` is at 32/32 against C2 `lint-dirsize` (ISS-345), and a new repo file needs
  the Approver's explicit go-ahead. If you judge the backfill should be re-runnable in CI, that is a
  finding worth filing, not something this unit should have decided unilaterally.
- The strongest available attack is on choice 1: is a *second* status field better than normalising
  the 92 headings? Argument for: references stay valid. Argument against: the repo now carries two
  status fields per manifest, and a future reader may edit one and not the other — a real drift risk
  that this unit creates and does not mitigate. I think references-stay-valid wins, but it is a
  judgement call and I would rather it be tested than assumed.
- No test suite covers `qa/` prose, so there is no green-suite claim to make here. The verification
  commands above are the whole evidence.

## Status: ready-for-check (cycle 1)

**Handshake status:** ready-for-check — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
