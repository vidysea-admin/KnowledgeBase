# Manifest — speaker-resolution-deterministic

**Contract:** none yet — first unit for U2.4. `qa/contracts/` is checker-owned; please author
`qa/contracts/speaker-resolution-deterministic.md` from the criteria below, or amend them.
**Goal task:** U2.4 / catalogue **B3** (speaker identity resolution) + **B10** (speaker profiles).
Pulled from the **roadmap tier** per `.claude/CLAUDE.md` "Backlog priority override" (D-013, as
amended by D-014).
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none — new feature work.
**Status:** checked-PASS (cycle 1 — `qa/verdicts/speaker-resolution-deterministic.md`, commit `207bd03`)
**Branch:** `lane/a-speakers` (separate git worktree, per the concurrency gate)

## Why this unit exists

The north star's Phase 1 exit requires "**speaker**+timestamp-cited internal answers". Measured
over the real corpus: **494 of 1,950 TOC turns (25.3%) carry positional `spk:N` refs**, across
**11 of 23 sessions**, two of which are 100% unresolved. A quarter of the corpus physically cannot
produce a speaker-cited answer, so the exit criterion is not merely unmet — it is unmeetable.

## What this unit does NOT claim

It resolves **78 of 494 (15.8%)**, identifying **2 speakers**. That is the honest ceiling of a
deterministic pass, and it was measured before the code was written, not discovered after:

| approach | measured yield |
|---|---|
| explicit self-naming (`my name is X`) | **78/494 turns (15.8%)**, 2 speakers |
| broadening to `I'm X` / `I am X` / `this is X` | **no additional genuine matches** |
| direct-address handover (`over to you, X`) | 5 candidates, **4 of them junk** (Plus, Like, Yeah, But) |

The remaining ~84% needs the LLM `extractFn` seam, which §10 budgets a full cycle for. This module
is deliberately shaped as that extractor's **degradation fallback** — same return type, same
evidence shape, so the LLM path can layer on top and be filtered by the same verbatim rule.

## The finding that shaped the design

The obvious shortcut is to seed identities from `session_page.json`, whose summary names speakers.
Tested against the verbatim rule first:

- summary for `2026-08-24-uniaccess-leeds-arts-university` says **"Juben Thakur"**
- the transcript says **"Jubin Thakkar"** (`grep`-verified: neither "Juben" nor "Thakur" occurs
  anywhere in that session's 51,411 characters of turn text)

The summarizer silently normalised a real person's name. That shortcut would have written a wrong
human name into the knowledge base and cited it as evidence. The module therefore never reads
summaries; candidates come from turn text, where verbatim is guaranteed by construction.

## What changed

| File | Change |
|---|---|
| `packages/index/src/pipeline/speakers.ts` | **new** — `resolveSpeakers()`, pure + synchronous, no provider call. Sibling of `claims.ts` and follows its provenance discipline. |
| `packages/index/src/pipeline/speakers.test.ts` | **new** — 8 tests, written before the implementation. |
| `packages/index/src/index.ts` | +1 line: re-export, matching the existing `extractClaims` line. |

Nothing else is touched. No data file is rewritten, no Mongo write happens, no turn's `speakerRef`
is mutated — this unit produces identities and evidence; **applying** them is a separate unit.

## Proposed criteria

- **C1** A positional `spk:N` label that explicitly self-declares a name is bound to that name.
- **C2** Every returned `displayName` appears **verbatim** in the text of every turn it cites (§10's binding rule).
- **C3** Evidence cites real `turnId`s from the input, with the session id, deduped, in transcript order.
- **C4** `personId` is a stable derived id, never a bare display name (`speakers.schema.json` H4).
- **C5** `I'm going to…` / `I am excited…` / `This is our campus` produce **no** speaker.
- **C6** A third-party mention (`"Prasanti, what do you think?"`) never resolves a speaker.
- **C7** A label self-declaring two different names is left **unresolved**, not arbitrarily picked.
- **C8** Turns already carrying a real name are untouched; only `spk:N` is in scope.
- **I1** Pure and synchronous — no network, no provider, no filesystem, so it cannot partially fail or fabricate.
- **I2** Nothing outside `packages/index/src/` is modified.
- **I3** Pre-existing tests still pass.

## Evidence

```
$ pnpm --filter '@lkb/index' test
 ℹ pass 67          (59 before this unit + 8 new)
 ℹ fail 0

$ pnpm -r typecheck
 ... apps/api typecheck: Done          (10 projects, exit 0)

$ pnpm lint:structure
 lint-root: OK · lint-dupes: OK (259 exports) · lint-migrations: OK
 snapshot --check: OK (113 lines) · tracker-audit: OK (gate G1)
 depcruise: no dependency violations (269 modules, 811 dependencies)
```

Against the **real** corpus (not fixtures), via `resolveSpeakers` itself:

```
2026-04-21-visa-blueprint-part2-italy-france-nz    41/196  turns  unresolved-labels=2
2026-08-24-uniaccess-leeds-arts-university         37/102  turns  unresolved-labels=3

resolved 78/494 positional turns (15.8%)
speakers identified: 2
   Ruby           (spk:2, 1 evidence turn)
   Jubin Thakkar  (spk:0, 1 evidence turn)
```

The module reproduces the pre-build measurement exactly, and resolves the **spoken** spelling
"Jubin Thakkar" rather than the summary's "Juben Thakur".

## Known gaps — stated, not hidden

1. **84% remains unresolved and this unit does not pretend otherwise.** `unresolved` is returned
   explicitly so a caller cannot mistake silence for success.
2. **Nothing is persisted.** No `speakers` doc is written and no `turns.speakerRef` is updated, so
   catalogue B3/B10 do **not** flip on this unit alone — the `speakers` collection stays empty. A
   follow-up unit does the write, and should be checked separately because it mutates real data.
3. **"Ruby" is a single first name** with one evidence turn. It is verbatim and self-declared, so
   it passes the rule, but it is weaker identity evidence than "Jubin Thakkar". No `confidence`
   value is emitted yet — the schema allows one and a later unit should populate it.
4. **`org` and `role` are not extracted.** B10 (speaker profiles) needs them; out of scope here.
5. **Corpus-specific risk:** the self-naming pattern is English-only and would miss a Hindi/Hinglish
   introduction. Not exercised by the current TOC corpus; worth a test when such a session lands.

## Note to the checker

Per `.claude/CLAUDE.md` "Backlog priority override": `ISSUES-WRITTEN: none` is a complete and
creditable verdict. Please judge **C2 and C7 hardest** — C2 is the rule that caught the
Juben/Jubin defect, and C7 is the one preventing a coin-flip identity. Mutation-testing suggestion:
delete the `byName.size !== 1` guard and confirm C7's test reddens; delete the
`(t.text ?? "").includes(name)` check and confirm C2's test still holds (it may not — the regex
already guarantees it, so that line is belt-and-braces; say so if you find it redundant).


## Close-out (2026-09-08)

**PASS, cycle 1** — 10/10 criteria, 4/4 invariants, `ISSUES-WRITTEN: none`. The checker authored
`qa/contracts/speaker-resolution-deterministic.md`, adopting C1–C8 / I1–I3 and **tightening** with
three additions it verified as already met: **C9** (unresolved labels reported explicitly),
**C10** (the stated yield must be reproducible by re-running the module), **I4** (this unit
persists nothing). Its rationale is fair: the manifest made those three commitments in prose while
its own proposed criteria let anyone fail them silently.

Both factual claims were independently re-derived from the data, not taken on trust: the
Juben/Jubin discrepancy, and 78/494 (15.8%) with exactly 2 speakers across 11 sessions.

### The maker was wrong, and this is the useful part

I asked the checker whether `(t.text ?? "").includes(name)` was redundant belt-and-braces already
guaranteed by the regex. **It is not — it is the belt.** `SELF_NAMING` separates its two capture
groups with `\s+` (any whitespace run) while the name is reassembled with `join(" ")`, a single
space. So a self-introduction whose name tokens are split by a newline, tab or double space yields
a `displayName` that is **absent verbatim from the very turn cited as its evidence** — a direct C2
violation, and entirely plausible in real diarization output where a turn wraps across lines.

Re-verified independently before accepting it:

| input | resolved | name verbatim in cited turn |
|---|---|---|
| `My name is Jubin Thakkar.` | 1 | true |
| `My name is Jubin␣␣Thakkar.` | **0** | — (correctly refused) |
| newline separator | **0** | — (correctly refused) |
| tab separator | **0** | — (correctly refused) |

Had I removed that line as "redundant", the module's single most important guarantee would have
broken on whitespace alone.

**The real gap:** mutation (b) — deleting that guard — reddens **nothing**. The suite does not pin
the module's most important rule. Not filed as an issue (no criterion is unmet; the code as
committed is correct), and deliberately **not** patched into this unit: editing an artifact after
its PASS is the live-edit race that already cost a re-check earlier today. It lands as its own
follow-up unit, `speaker-resolution-whitespace-guard`.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
