# Manifest — speaker-resolution-whitespace-guard

**Contract:** `qa/contracts/speaker-resolution-deterministic.md` — this unit adds regression
coverage for that contract's **C2** (verbatim rule). No new criteria proposed; the behaviour is
unchanged and already correct.
**Goal task:** U2.4 / catalogue B3 — follow-up to `speaker-resolution-deterministic`.
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none — no issue was filed. This closes a **coverage** gap the cycle-1
checker found by mutation testing and recorded in EXPLANATION rather than the ledger.
**Status:** checked-PASS (cycle 1 — `qa/verdicts/speaker-resolution-whitespace-guard.md`, commit `4098fa9`)
**Branch:** `lane/a-speakers`

## Why

The cycle-1 checker mutation-tested `speaker-resolution-deterministic` and reported that deleting
the `(t.text ?? "").includes(name)` guard in `speakers.ts` **reddened nothing** — the suite did not
pin the module's single most important rule.

It also overturned the maker's stated assumption. I had asked whether that line was redundant
belt-and-braces already guaranteed by the regex. **It is not — it is the belt.** `SELF_NAMING`
separates its two capture groups with `\s+` (any whitespace run) while the name is reassembled with
`join(" ")`, a single space. So a self-introduction whose name tokens are split by a newline, tab
or double space would produce a `displayName` **absent verbatim from the very turn cited as its
evidence** — a direct C2 violation, and entirely plausible in real diarization output where a turn
wraps across lines.

Independently re-verified before acting on it:

| input | resolved | name verbatim in cited turn |
|---|---|---|
| `My name is Jubin Thakkar.` | 1 | true |
| `My name is Jubin␣␣Thakkar.` | **0** | correctly refused |
| newline separator | **0** | correctly refused |
| tab separator | **0** | correctly refused |

Refusing to resolve is the right outcome — §10's "leave low-confidence speakers unresolved rather
than guessing".

## What changed

| File | Change |
|---|---|
| `packages/index/src/pipeline/speakers.test.ts` | **+4 tests.** Three parameterised cases (double space / newline / tab) asserting the label stays unresolved, plus one asserting every emitted name is verbatim in **every** turn it cites across mixed whitespace input. |

**No production code changed.** `packages/index/src/pipeline/speakers.ts` is byte-identical to the
PASSed cycle-1 version — deliberately, so this unit cannot alter behaviour that already has a
verdict.

## Evidence

```
$ pnpm --filter '@lkb/index' test
 ℹ tests 71   ℹ pass 71   ℹ fail 0      (67 before this unit + 4 new)
```

**Mutation proof — the point of the unit.** With the guard removed from `speakers.ts`:

```
 ℹ tests 71   ℹ pass 67   ℹ fail 4
```

Exactly the four new tests redden, and nothing else. Restored from a byte backup;
`git diff --stat packages/index/src/pipeline/speakers.ts` empty, suite back to 71/71.

## Known gaps

1. **English-only, as before.** A Hindi/Hinglish self-introduction is still unmatched. Unchanged by
   this unit and not exercised by the current corpus.
2. **Does not fix the underlying asymmetry.** The regex still splits on `\s+` while `join(" ")`
   reassembles with one space; the guard catches the mismatch rather than removing it. A future
   unit could capture the raw matched span instead, which would let a whitespace-split name resolve
   correctly rather than be refused. That is a behaviour change and belongs in its own unit with its
   own verdict — the current conservative refusal is safe.
3. **Corpus yield unchanged** — still 78/494 (15.8%), 2 speakers. This unit adds no resolution.

## Note to the checker

`ISSUES-WRITTEN: none` is creditable per the backlog override. Please re-run the mutation yourself
rather than trusting the block above: delete the guard, confirm **exactly** 4 failures, restore, and
confirm `git diff` is empty. If any test other than the four reddens, that is a real finding.


## Close-out (2026-09-08)

**PASS, cycle 1** — 10/10 criteria, 4/4 invariants, `ISSUES-WRITTEN: none`. No contract amendment:
C2 was correct as written; what was missing was a test, not a rule.

The checker re-derived every claim rather than accepting the block above. It ran its own mutation
(`sed -i '85d'`), got exactly the four new tests failing and nothing else, and restored
byte-identically with a clean `git status` before its final run. It also verified — rather than
trusted — the no-production-change claim: `git show --stat 6a3f715` touches only
`speakers.test.ts` (+44) and this manifest (+82), and `git diff 1983c82 6a3f715 --
packages/index/src/pipeline/speakers.ts` is empty. That byte-identity is what let it carry C1–C10
and I1/I4 forward by diff instead of re-litigating the whole module.

Two observations worth keeping:

1. **All 67 pre-existing tests stayed green under the mutation.** That is the sharper statement
   than "4 failed": it proves the new tests discriminate on something no prior test could see.
2. **The fourth test is not tautological.** It recomputes verbatim-ness against the input turns
   rather than the module's own output, and its closing `deepEqual` on `["spk:0", "spk:2"]`
   prevents a vacuous pass on an empty `resolved`. The checker said that had it only looped, that
   would have been a real finding — a fair catch to have avoided.

### Carried forward to the future raw-span unit (known-gap #2)

The checker agreed deferring is right and said it would have **rejected** doing it here: capturing
the raw matched span is a behaviour change (currently-refused whitespace-split names would start
resolving), the contract deliberately ranks C2 above recall so the refusal is the wanted outcome,
and folding it in would have destroyed the byte-identity that made this unit cheap to certify.

Its forward note, recorded here so the next unit does not rediscover it: the proposed fix would
emit a `displayName` containing a **literal newline or tab** — verbatim per C2 as written, but it
would put raw whitespace into a `person:` slug and into every rendered speaker name. That needs
pinning in that unit's contract up front, not after.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
