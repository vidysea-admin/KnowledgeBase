# Manifest — u2-4-phase3-precision-regate: U2.4 phase-3 precision re-gate on the hand-labelled 240-block corpus

Fix cycle: 1 · Issues addressed: ISS-282 (critical), ISS-283 (high), ISS-284 (medium) · Executor: claude-opus subagent (maker build) · Goal task: U2.4
Branch / worktree: `wave/u2-4-phase3-fix` @ `D:/KnowledgeBase-lanes/u2-4-phase3-fix` (from master 4aa9d13)
Contract: `qa/contracts/speaker-resolution-llm.md` · Gate: `qa/gates/speaker-segment-identity.md` (answered A, phase-3 bars)
Cycle-0 verdict: `qa/verdicts/u2-4-phase3-precision-regate.md` (FAIL, imported from b1c9d01). The cycle-0 manifest text is in git at c527207.

## Status: building — experiment running

The code fix is complete and tested. The 3-outer-run re-measurement is running detached (below).
**This manifest makes NO precision, stability or addition claim** (ISS-283). Those bars are decided
only by `05-score.mjs --tag c1` over the completed `run-results.c1.jsonl`. Its output gets appended
here verbatim when the run finishes. Until then every phase-3 bar is **unmeasured**, not passed.

## Root cause (confirmed on master's code, 4aa9d13)

1. `speakers-llm.ts` `extractSpeakers`, evidence loop (was L265-276). The only per-turn check was
   `citesNameAsAnIntroduction(t.text, name)`, which asks whether the turn's TEXT names someone. It
   never related the turn's speaker to the claimed label. So a third party named or addressed in a
   turn passed as the label's identity. All 8 cycle-0 wrong links are this:
   - t007 "Thank you, Sonal" (own turn, spk:0)
   - t022 "Let me first introduce Shithij" (own turn, spk:1)
   - t094 "Thank you, Kshitij. Thanks, Anisha" (spk:2)
   - t042 "Thank you, Bhavya" (spk:4)
   - t088 "Hi, Jubin" (spoken by spk:1, credited to spk:1 AND spk:3)
   - t267, spoken by the named speaker `Priyanka`, credited to spk:0 (the next turn is spk:1)
2. Block scoping (was L298-300) re-ran the deterministic floor and looked up
   `floor.resolved.find(same label && same name)?.blocks ?? []`. The floor only knows "my name is".
   So every LLM-only identity got `[]` and was scored label-wide (e.g. 17 blocks for spk:1).

Verified by the 8 regression tests below failing on the unmodified code (before-run pasted).

## What changed

Code (commit 6497719, edited in place; nothing deleted or renamed):
- `packages/index/src/pipeline/speaker-name-rules.ts` — added two predicates:
  - `citesNameAsSelfIdentification`: the occurrence has a naming cue AND the cue's subject is the
    speaker. Accepted forms: "my name is X", "I'm X", "I am X", "call me X", "this side X",
    "X here", "X speaking" (the idiom), and multi-token "This is X Y".
  - `citesNameAsHandover`: forward cues only. Accepted forms: over to, introduce, please welcome,
    joined by, next presenter is, the handover markers, and "X, please go ahead" / "X, over to you".
    Thanks and greetings are deliberately NOT handover cues, because they look backward.
- `packages/index/src/pipeline/speakers-llm.ts` `extractSpeakers`:
  - A cited turn binds (label, name) only if it is (a) the label's OWN turn and self-identifies,
    or (b) another speaker's handover turn whose NEXT turn starts one of the label's blocks.
  - Each evidence row carries the block it binds. The accepted identity's `blocks` are those
    blocks, never a label-wide `[]`.
  - A turn cited as evidence by two labels refuses both.
  - The floor re-run for scoping is gone.
- Tests: `speakers-windows.test.ts` gains 11 tests:
  - the 8 ISS-282 ledger reproductions, replayed verbatim against the real transcripts;
  - own-turn block scoping;
  - handover-then-block, plus a check that a thank-you is not a handover;
  - one turn cited by two labels.
- Superseded test expectations (the same pattern ISS-255 used for its handover rows):
  - `speakers-llm.test.ts`: the two ISS-094 rows "Good morning Prasanti, please go ahead." and
    "Prasanti, what do you think about this?" are spoken BY spk:0 and claim spk:0. They moved to an
    ISS-282 supersession block that asserts refusal. The greeting-handover form still ships for
    the FOLLOWING label (new windows test).
  - `speaker-name-rules.test.ts`: "Mumbai" is removed from the ISS-093 gazetteer-residue set
    because it is now refused. That test is designed to fail when a residue closes.
  - `speaker-name-rules.test.ts`: the ISS-098 fall-through test now asserts the cue predicate
    directly, plus the ISS-282 refusal.

Measurement harness (evidence dir, committed after 6497719):
- `04-regate-eval.mts`:
  - The corpus is PINNED to the `gold-labels.json` session list (ISS-284). A 2026-09-24 Zoho
    ingest had grown directory discovery to 12 sessions.
  - `--runs 1,2,3` runs the outer runs in sequence in one process.
  - Resumable: a (run, session) already in the results file is skipped.
  - Per-call `AbortSignal.timeout`, default 180 s. A hung call fails its window, not the run.
  - `--tag c1` writes `run-results.c1.jsonl` / `raw-proposals.c1.jsonl` and leaves the cycle-0
    files untouched.
- `05-score.mjs`: `--tag c1` reads the tagged files and writes `measurement-summary.c1.json`.

ISS-284 evidence-completeness:
- Files in the evidence dir from before this cycle that cycle 0 did not list: `07-per-block.mjs`
  and `per-block-results.json` (the cycle-0 per-block breakdown helper and its output).
- New this cycle: `run-results.c1.jsonl`, `raw-proposals.c1.jsonl`, `eval-c1.stdout.log`,
  `eval-c1.stderr.log`, and (at completion) `measurement-summary.c1.json`.
- `measurement-summary.json` was regenerated in place by the cycle-0 checker's re-run of `05-score.mjs`.

Known limitation (an open question from the review, not reproduced): `citesNameAsHandover` accepts
a handover marker anywhere in the 40 chars before the name, not anchored to it. It is only ever
applied to a turn immediately before the claimed label's block, and the run will measure it.

## Experiment (running, detached)

- Command (PowerShell, worktree root):
  `Start-Process node_modules\.bin\tsx.cmd -ArgumentList "qa/evidence/u2-4-phase3-precision-regate-2026-09-22/04-regate-eval.mts","--runs","1,2,3","--tag","c1","--timeout-ms","180000" -WindowStyle Hidden -RedirectStandardOutput <evidence>\eval-c1.stdout.log -RedirectStandardError <evidence>\eval-c1.stderr.log`
  with `OLLAMA_BASE_URL=http://127.0.0.1:11434`, model `qwen3:8b` digest `500a1f067a9f` (verified via `/api/tags`).
- PIDs: 40276 (cmd wrapper) → 35812 (node) → 38476 (node, eval). Started 2026-09-24T22:18:13+05:30.
  A first launch at 22:17:34 (PID 32396) died on a harness syntax error before any provider call.
  It was fixed and relaunched.
- Rate from the first calls: 27 calls in 90 s (~3.3 s/call). The run makes 2,340 calls in total
  (260 windows × 3 agreement runs × 3 outer runs).
- **ETA: about 2.2 h, around 2026-09-25 00:30 +05:30.**
- Resume if killed: rerun the same command. Chunks already flushed for a (run, session) are skipped.
- Progress:
  - `wc -l qa/evidence/u2-4-phase3-precision-regate-2026-09-22/raw-proposals.c1.jsonl` counts calls, out of 2,340.
  - `run-results.c1.jsonl` gets one line per finished (run, session), 33 at completion.
- **Scoring command (run only after 33 lines):**
  `node_modules/.bin/tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/05-score.mjs --tag c1`

## How to verify (exact commands)

From `D:/KnowledgeBase-lanes/u2-4-phase3-fix`:
1. `pnpm -C packages/index test` → `tests 226 / pass 226 / fail 0`
2. `pnpm -C packages/index typecheck` → exit 0
3. `node scripts/lint-loc.mjs` → `lint-loc: OK (291 file(s) within budget)`
4. `cd packages/index && node --test --test-reporter=spec --import tsx src/pipeline/speakers-windows.test.ts` → 11 ISS-282 tests ✔
5. `node_modules/.bin/tsx qa/probes/iss104-rederive.mts` → `--- refused 17/20`
6. After the run completes: the scoring command above.

## Actual outputs

### Regression tests BEFORE the fix (tests added first, source unmodified — `c527207` code)

```
ℹ tests 17
ℹ pass 6
ℹ fail 11
✖ ISS-282 #1/8: 2026-05-23-uniaccess-atlas-skilltech spk:0 -> "Sonal" via t007 is refused
✖ ISS-282 #2/8: 2026-07-15-creative-futures spk:0 -> "Priyanka Roy" via t267 is refused
✖ ISS-282 #3/8: 2026-07-30-in-focus-3 spk:1 -> "Shithij" via t022 is refused
✖ ISS-282 #4/8: 2026-07-30-in-focus-3 spk:2 -> "Anisha" via t094 is refused
✖ ISS-282 #5/8: 2026-08-03-uk-beyond-offer-letters spk:4 -> "Bhavya" via t042 is refused
✖ ISS-282 #6/8: 2026-08-24-uniaccess-leeds-arts-university spk:1 -> "Jubin" via t088 is refused
✖ ISS-282 #7/8: 2026-08-24-uniaccess-leeds-arts-university spk:3 -> "Jubin" via t088 is refused
✖ ISS-282 #8/8: 2026-05-23-uniaccess-atlas-skilltech spk:0 -> "Sonal" via t007 is refused
✖ ISS-282: a handover by ANOTHER speaker binds the label whose block immediately FOLLOWS it
✖ ISS-282: one evidence turn never binds two labels
✖ ISS-282: the label's OWN self-identifying turn binds, scoped to that ONE block (never label-wide)
```
No mutant was used: the "before" is the genuine pre-fix source.

### AFTER the fix (6497719)

```
✔ ISS-282 #1/8 … #8/8 (all 8 refused)
✔ ISS-282: a handover by ANOTHER speaker binds the label whose block immediately FOLLOWS it
✔ ISS-282: one evidence turn never binds two labels
✔ ISS-282: the label's OWN self-identifying turn binds, scoped to that ONE block (never label-wide)
ℹ tests 17 / pass 17 / fail 0          (speakers-windows.test.ts)
ℹ tests 226 / pass 226 / fail 0        (whole @lkb/index suite; 215/215 before this cycle)
TYPECHECK_OK
lint-loc: OK (291 file(s) within budget)
--- refused 17/20                      (qa/probes/iss104-rederive.mts, unchanged)
```

Fresh-context review (senior-software-engineer agent, read-only): **Approve**. It re-ran 226/226
and typecheck clean. Its one open question is the unanchored handover marker (see Known limitation).

### Scoring (pending)

The score JSON is appended here verbatim when the run completes. No bar is claimed before then.

## D-015 measurement (by issue id)

- **ISS-282: 8/8 refused.** The ledger evidence records 8 wrong identities
  (`measurement-summary.json` `wrongLinkList`: 7 distinct plus the run-2 repeat of Sonal/t007).
  Each is replayed verbatim (real transcript, same label/name/turn, 3/3 votes), and all 8 are
  refused. The live precision and addition bars are NOT claimed until the c1 run is scored.
- **ISS-283:** handled in process. There is no stability or precision narrative; the score JSON
  will be pasted verbatim.
- **ISS-284:** the corpus is pinned to the 11 gold session ids, and the previously unlisted files
  are listed above.
- **ISS-104: 17/20 refused.** The probe result is unchanged, because the probe checks the cue
  predicate, not the new relation.

## Capability coverage

| # | Claim | Isolating falsification | Result |
|---|---|---|---|
| 1 | Own-turn third-party address/intro no longer binds the speaking label | 8 ISS-282 reproductions on pre-fix source | FAIL before (8/8 shipped) → PASS after (8/8 refused) |
| 2 | A handover before a block binds the FOLLOWING label; thanks do not | handover test on pre-fix source | FAIL before → PASS after |
| 3 | Accepted blocks derive from evidence, not label-wide | own-block test with an LLM-only cue ("Ruby here") on pre-fix source | FAIL before (blocks `[]`) → PASS after (`[{2,3}]`) |
| 4 | One evidence turn never binds two labels | dual-claim test on pre-fix source | FAIL before → PASS after |
| 5 | Existing guards (verbatim, shape, discourse, ISS-255 handover inversion, 2-of-3) intact | full suite | 226/226 |
| 6 | Phase-3 bars (precision, zero wrong links, floor, stability, ≥1 addition) | c1 run + `05-score.mjs --tag c1` | **unmeasured — run in progress** |

## Contract note for the checker

`qa/contracts/speaker-resolution-llm.md` ("Why this is a separate contract") says this path admits
greeting and handover evidence, and [I4] says pre-existing tests keep passing. ISS-282 narrows the
admitted class: only a handover that comes right before the label's block counts, and an address
no longer identifies the speaker who makes it. That supersedes two ISS-094 rows and one ISS-093
residue row, as listed above.
- [I2] holds: `speakers.ts` is byte-unmodified.
- [I3] holds: nothing is persisted.

## Live browser evidence

Not UI-touching — no surface changed (`packages/index/src/pipeline/**` + qa evidence only).
