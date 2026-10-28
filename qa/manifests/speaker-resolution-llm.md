# Manifest — speaker-resolution-llm

**Contract:** extends `qa/contracts/speaker-resolution-deterministic.md`. Its **C2** (verbatim rule)
is the criterion this unit must uphold across a new and far more dangerous input source. Checker:
please author `qa/contracts/speaker-resolution-llm.md` or amend the existing one — your call.
**Goal task:** U2.4 / catalogue **B3** + **B10**. Roadmap tier per `.claude/CLAUDE.md` "Backlog
priority override" (D-013 as amended by D-014).
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none — new feature work.
**Status:** checked-PASS (cycle 1 — `qa/verdicts/speaker-resolution-llm.md`, commit `5af0106`)
**Branch:** `lane/a-speakers`

## Why

`speakers.ts` resolves **78/494 positional turns (15.8%)** from explicit self-naming alone — the
measured ceiling of deterministic matching. This is the path to the other ~84%.

It is also the dangerous path. A model will happily produce a plausible, well-formed human name
that was never spoken — the **Juben/Jubin defect arriving by a different route**. The generated
summary for `2026-08-24-uniaccess-leeds-arts-university` says "Juben Thakur"; the transcript says
"Jubin Thakkar". A model reading the same corpus can reach the same wrong spelling honestly. So
this module is mostly refusal machinery.

## What changed

| File | Change |
|---|---|
| `packages/index/src/pipeline/speakers-llm.ts` | **new** — `extractSpeakers()`, the LLM half. |
| `packages/index/src/pipeline/speakers-llm.test.ts` | **new** — 11 tests, written before the implementation. |
| `packages/index/src/index.ts` | +1 line re-export, matching the sibling lines. |
| `config/ai-routing.yaml` | +1 line: `speakers: [gemini, claude-code]`, same chain shape as `claims`. |

`packages/index/src/pipeline/speakers.ts` is **byte-identical** to its PASSed version — this unit
adds a path, it does not alter one that already carries a verdict.

Inherits `claims.ts`'s posture wholesale (citable transcript, ids copied from `[id:...]` prefixes,
output never trusted, `degraded` distinguishing "unknown" from "none"). **One guard has no
counterpart in `claims.ts`:** a claim is prose the model composes, so it can only be checked for
*provenance*; a speaker name must actually have been **spoken**, so it is checked for *identity* —
every `displayName` must appear verbatim in every turn cited as its evidence.

## Proposed criteria

- **C1** A speaker whose name is verbatim in a real cited turn is kept, with `personId` derived, evidence deduped and ordered.
- **C2** A `displayName` **not** verbatim in a cited turn is **dropped** — the model's spelling never overrides the transcript's.
- **C3** A fabricated `turnId` is dropped; a speaker left with zero surviving evidence does not ship.
- **C4** Partial survival works: real cited ids kept, invented ones discarded, speaker retained.
- **C5** A turn already carrying a real name is never renamed — only `spk:N` is in scope.
- **C6** A `speakerRef` absent from the transcript is dropped.
- **C7** A label the model names two different ways is left **unresolved**, not coin-flipped.
- **C8** A provider failure **degrades to the deterministic pass** and says so — never a silent empty result (the ISS-056 failure mode).
- **C9** An unparseable response degrades rather than throwing.
- **C10** The job is sent with `kind: "speakers"` and a citable transcript carrying `[id:...]` and `[spk:N]`.
- **C11** Empty input never calls the provider.
- **I1** Never throws into the caller.
- **I2** `speakers.ts` is unmodified.
- **I3** Nothing is persisted; no provider is called at import time.
- **I4** Pre-existing tests still pass.

## Evidence

```
$ pnpm --filter '@lkb/index' test
 tests 82   pass 82   fail 0        (71 before + 11 new)

$ pnpm -r typecheck          ... apps/api typecheck: Done      (exit 0)

$ pnpm lint:structure
 lint-root OK - lint-dupes OK (262 exports) - lint-migrations OK
 snapshot --check OK (113 lines) - tracker-audit OK (G1)
 depcruise: no violations (271 modules, 821 dependencies)
```

**Mutation proof — every guard pinned, with a no-op control:**

| mutation | result |
|---|---|
| baseline | 82 pass / 0 fail |
| remove the verbatim rule | **81 / 1** |
| **no-op control** (dead statement) | **82 / 0** — the suite is not failing on any edit |
| remove the contradiction guard | **81 / 1** |
| allow unknown/already-named `speakerRef` | **80 / 2** |

Restored from a byte backup; `git diff --stat` on the module empty.

**Real-corpus degradation check** (no provider called — `complete` forced to throw, all 23 sessions):

```
sessions with positional labels: 11
degraded (provider down, honestly reported): 11/11
still resolved via the regex fallback: 78/494 (15.8%)
```

A provider outage never silently loses what is already knowable, and never reports "no speakers".

## Known gaps — stated, not hidden

1. **Never run against a real provider.** Every test injects a fake `complete` — the same unit
   boundary `claims.ts` uses. The *real* yield above 15.8% is therefore **unmeasured**: this unit
   claims a correct and safe path, not a number. Measuring it costs real tokens and belongs in its
   own unit, which should report the number even if it disappoints.
2. **The prompt is untested as a prompt.** C10 asserts the job shape, not that the wording elicits
   good extractions. That is an eval problem (U2.2's extraction-quality harness), not a unit test.
3. **Still persists nothing.** No `speakers` doc, no mutated `speakerRef` — **B3/B10 do not flip**
   on this unit either. The apply step mutates real data and gets its own verdict.
4. **`org`, `role`, `confidence` are not extracted.** B10 needs them; the schema allows them.
5. **A verbatim name can still be the wrong person.** If two people share a first name in one
   session, "Ruby" is verbatim for both. C7 catches only the case where the model *says* two names
   for one label, not where one name legitimately belongs to two speakers.

## Note to the checker

`ISSUES-WRITTEN: none` is creditable. Judge **C2 and C8 hardest** — C2 is the anti-fabrication rule,
C8 is what stops an outage looking like an empty session. Re-run the mutation table yourself
**including the no-op control**; if the control ever reddens, the whole table is worthless. Gap 5 is
the one I am least sure about — if same-first-name collision is in scope for this unit rather than a
later one, say so and FAIL it.


## Close-out (2026-09-08)

**PASS, cycle 1** — 13/13 criteria, 4/4 invariants, `ISSUES-WRITTEN: none`.

The checker authored `qa/contracts/speaker-resolution-llm.md` as a **separate** contract rather
than amending the deterministic one, and its reason is load-bearing: deterministic **C6** says a
third-party mention never resolves a speaker, but this path's prompt *deliberately* invites
greeting/handover evidence — that is precisely how it gets past 15.8%. A merged contract would have
contradicted itself. It added **C12** (the verbatim rule must stay mutation-pinned) and **C13**
(corpus figures must be re-derivable), both verified as already met.

It reproduced the mutation table with its own driver (control held at 82/0), verified `speakers.ts`
byte-untouched across `942cf73 → 76009f8`, and re-derived the degradation figures independently:
11/11 degraded, 78/494, same two speakers.

**C8 came out stronger than claimed.** Beyond the single test, it probed a non-`Error` throw, a
resolved-`undefined`, an empty body, an object-not-array and a junk array — all five degrade with a
non-null reason *and* the deterministic result intact.

### Two attacks got through C2, and they are being fixed rather than filed

| attack | result |
|---|---|
| `"Ruby"` against `"My name is Rubykumar Shah."` | ships as `person:ruby` |
| `"Good morning"` | ships as `person:good-morning` |

The verbatim check is a bare substring test with no token boundaries and no name-shape constraint.
The checker did not FAIL the unit for this and I agree with its reasoning: C2 as written says
*substring*, the module does exactly that, and the unit claims nothing more — inventing a criterion
mid-verdict to fail an artifact that met the stated rule is the mirror image of softening one. It
placed both as **blocking criteria on the apply/persist unit**.

I am not deferring them that far. They are a real weakness in the anti-fabrication rule and the fix
is cheap, so the next unit — `speaker-verbatim-token-boundary` — tightens C2 itself. Note the
vulnerability is **LLM-path-specific**: in `speakers.ts` the regex captures `Rubykumar`, not `Ruby`,
and `[A-Z][a-z]+` cannot produce `"Good morning"`, so `speakers.ts` stays untouched and I2 holds.

**Gap 5 — the checker's plain answer was "no, not in scope, not a FAIL".** It reproduced the
collision (two labels both named "Ruby" share `personId: person:ruby`) but placed it correctly: it
originates in `personIdFor` inside the already-PASSed `speakers.ts`, which this unit's own I2
forbids touching, and the deterministic path collides identically. It becomes blocking the moment
something writes it down.

**U2.4 deliberately left open.** This unit persists nothing and does not flip B3/B10 by its own
statement, so closing the goal task on this PASS would overclaim.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
