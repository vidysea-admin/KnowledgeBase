# Manifest — rank-probe-relocation

**Contract:** none. Judge against ISS-212 and ISS-213's recorded fix directions.
**Goal task:** none — follow-on to `vacuous-evidence-probes` (PASS), same artifact.
**Date:** 2026-09-09
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** **ISS-212**, **ISS-213** (both medium, both filed against my own previous unit).

## CYCLE 2 — the FAIL was right, and three claims of mine were wrong

**[V3] / ISS-222 — `lint:structure` was RED and I reported it green.** Creating `qa/probes/` made
`docs/SNAPSHOT.md` stale by one line, and `snapshot --check` is part of `lint:structure`. I ran the
command twice and **grepped its output both times** — once for `lint-loc|lint-dirsize|lint-root|FAIL`
and once with `tail -3` — and the snapshot failure fell outside both windows. A filtered view of a
gate is not the gate. Regenerated; the diff is one line (`qa/probes/`), and it is now genuinely
green, verified on the unfiltered output.

**ISS-223 — a stale present-tense claim, the exact class this chain exists to close.** The probe's
own comment said *"this probe reports 6 / 0 / 2 under an ISS-084-shaped mutation"*. That was the
**previous** probe's measurement written in the present tense about this one, and it is false by
code reading alone: the new guard `continue`s before `badPair` is computed, so this probe can only
emit 6 / **INCONCLUSIVE** / 2. Corrected in place, along with the checker's own note that
`distinctSessions >= 2` is **necessary, not sufficient** — a 5+5 split reports 8 mismatches where a
9+1 split reports 2, and both print `2`.

**The manifest cited the wrong commit, and the reason matters more than the citation.** I wrote
`633161c`; that commit contains only this manifest. The code landed in **`6ec03cb`**, a *concurrent
session's* commit, bundled with their `qa/debug/` report — because I ran `git add` early, wrote the
manifest, and committed later. In that gap another session's commit swept up my staged files. The
coordination rule says never end a turn with a dirty tree you own; the sharper form is **stage and
commit atomically, or do not stage at all**. Nothing was lost, but the provenance of two files now
reads as someone else's work.

**One thing I got wrong in my own favour, corrected against myself:** I described the restore+header
approach as a *deviation* from ISS-213's recorded direction. The checker points out it is **branch 2
of that direction, verbatim** — "restore the 09-08 file … with a `// VOID` header". I claimed
independent judgement I had not exercised. The only real deviation is the path (`qa/probes/` rather
than a dated 09-09 file), which the checker ruled an improvement on both branches.

## ISS-213 — I rewrote a dated evidence artifact in place, and that was wrong

`qa/evidence/live-rank-probe-2026-09-08.mjs` is cited by **two checker-owned verdicts**
(`search-store-rank-assertion.md`, `vacuous-evidence-probes.md`). Rewriting its body repointed both
citations at code their authors never saw — the reference-repointing harm D-019 names, committed by
me one day after I quoted D-019 approvingly.

**The obvious fix is the wrong one.** Renaming the file to drop the false date would leave those two
verdicts pointing at nothing, and I may not edit verdicts to follow the rename. ISS-213's own
`fix_direction` offers exactly this as its second branch, and that is the branch taken:

| | action |
|---|---|
| `qa/evidence/live-rank-probe-2026-09-08.mjs` | **restored byte-identical** to its pre-rewrite content, under a header marking it **VOID AS EVIDENCE** and naming its replacement. Both verdict citations resolve again to the code their authors read. |
| `qa/probes/rank-probe.mjs` | **new** — the corrected, re-runnable instrument. |

The header is the one deviation from byte-identical, and it is deliberate: restoring the file
silently would put an un-annotated check-that-cannot-fail back on disk with no warning to its next
reader. Annotating a record is not the same as changing what it recorded.

**Why a new directory.** The checker's root-cause was the naming: this is a **re-runnable
instrument**, not a dated result, and `qa/evidence/` means results. `scripts/` is at its override
cap (32/32) and D-018 rules that a third budget raise must **consolidate, not widen** — so adding
there was closed off. `qa/probes/` follows the same shape the repo already uses for
`qa/{manifests,verdicts,gates,debug}`. `lint-dirsize` and `lint-root` stay green.

## ISS-212 — the probe printed an uninformative zero and only the manifest said so

A pairing defect is observable only when the hits span more than one session; mis-pairing rows that
all share a `sessionId` produces an identical result. Under an ISS-084-shaped mutation the
**previous** probe reported **6 / 0 / 2** across its three queries — and that middle `0` was exactly
the single-session query, not a clean bill of health. (Past tense deliberately: this probe cannot
emit that middle `0` at all, because the guard returns INCONCLUSIVE first. Stating the predecessor's
number in the present tense about this one is ISS-223, and it appeared twice.)

I disclosed that in the previous manifest. **The reader of the probe's output never sees a
manifest.** The probe already refuses on `hits=0`; it now owes the same refusal here:

```
q="visa student university funding" hits=10 distinctSessions=6 mismatchedPairs=0 ... mismatchedJoins=0
q="2026 intake"                     hits=10 distinctSessions=1 -> INCONCLUSIVE for pairing:
                                    all hits share one session, so a mis-pairing is unobservable
q="counselling"                     hits=2  distinctSessions=2 mismatchedPairs=0 ... mismatchedJoins=0
```

`distinctSessions` is now printed on every line, so the reader can see the probe's power rather than
take it on trust, and `anyChecked` no longer counts an inconclusive query — three inconclusive
queries now print `UNVERIFIED`, not silence.

## How to verify

- `npx tsx --env-file=.env qa/probes/rank-probe.mjs` → the three lines above, live against Mongo
- `git show 2873df4^:qa/evidence/live-rank-probe-2026-09-08.mjs` diffed against the file today →
  **only the added header**
- `pnpm lint:structure` → green **(cycle 1 claimed this falsely — see the correction below)**

## Not done

- **The `{6,0,2}` mutation is not re-run in this unit.** It was measured in
  `vacuous-evidence-probes` and nothing in this unit touches `search-store.ts`; re-running it would
  re-report someone else's measurement as this unit's. The checker is welcome to re-derive it.
- **Citations in checker-owned verdicts are untouched**, by rule. They now resolve to the restored
  original, which is the correct target for them.

## Live browser evidence

`Not UI-touching — no surface changed.` Changed paths: `qa/probes/rank-probe.mjs`,
`qa/evidence/live-rank-probe-2026-09-08.mjs`, `qa/manifests/*`. `qa/**` is listed under
`genuinely_not_user_facing` in `qa/ui-surfaces.json`.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
