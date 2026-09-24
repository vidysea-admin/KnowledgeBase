# Manifest — u2-4-phase3-precision-regate: U2.4 phase-3 precision re-gate on the hand-labelled 240-block corpus

Fix cycle: 1 · Issues addressed: ISS-282 (critical), ISS-283 (high), ISS-284 (medium) · Executor: claude-opus subagent (maker build) · Goal task: U2.4
Branch / worktree: `wave/u2-4-phase3-fix` @ `D:/KnowledgeBase-lanes/u2-4-phase3-fix` (from master 4aa9d13)
Contract: `qa/contracts/speaker-resolution-llm.md` · Gate: `qa/gates/speaker-segment-identity.md` (answered A, phase-3 bars)
Cycle-0 verdict: `qa/verdicts/u2-4-phase3-precision-regate.md` (FAIL, imported from b1c9d01). The cycle-0 manifest text is in git at c527207.

## Status: ready-for-check (Fix cycle 1) — carries one explicit interpretation question for the checker: does bar 2 "citation link" mean the legacy `wrongPairs` counter (18) or the relational check (0) for relation evidence? See "Fix cycle 1b" §5. Flipped by the orchestrator 2026-09-25T02:10 IST: the builder finished code, tests, falsification and replay; the one open item is a contract reading, which is the checker's call, not the maker's.

Not `ready-for-check`: the brief for this rework allows that only when a valid measurement shows
>=1 addition, precision reported, and zero wrong links. The offline replay below shows 4 additions,
precision 1 (12/12) and 0 wrong identities. But the legacy `wrongEvidencePairs` counter reads 18.
That counter can only pass a self-naming turn (§5), so it flags every relation-evidence turn by
construction. Whether bar 2 means the legacy counter or the relational check is a checker call, not
a maker call. Nothing else is pending: the code, tests, falsification and replay are done.

The fix cycle 1 text below (the c1 code and the c1 live run) is kept unchanged as history. Section
"Fix cycle 1b" records that the c1 run **failed** the phase-3 bar, and why, and what changed.

## Fix cycle 1b (2026-09-25) — the c1 live run FAILED the bar; root cause; rework; offline re-score

### 1. The c1 live measurement: a FAILURE of the phase-3 bar

`05-score.mjs --tag c1` over the completed `run-results.c1.jsonl` (33/33 lines, 2340/2340 calls, no
call errors, `degraded: null` in every session and run), verbatim:
```
{"accepted":0,"correct":0,"precision":null,"wrongIdentities":0,"wrongPairs":0,"floorTurns":2,"floorCoveredTurns":42,"floorLabels":2,"contradicted":0,"stableAll":true,"additions":0,"ISS255":"4/4"}
```
**Result: FAIL.** 0 accepted and 0 additions. "Zero wrong links" was met only by accepting nothing,
and bars 1 and 5 do not hold (`bar1 holds:false`, `precision:null`). `resolved` was empty in every
(session, run).

### 2. Root cause (offline, no new LLM call): `09-rejection-histogram.mts`

The script replays every proposal in `raw-proposals.c1.jsonl` through the c1 acceptance path, read
from git at b40327f. It reports the FIRST gate that kills each one, counted per (session x
outer-run x label x name). `gold=T` means the label has at least one gold block with that person.
```
{"calls":2340,"unparseable":61,"proposalEntries":3145}
== c1 ==
   44  0 discourse-only name gold=F
   57  0 displayName is a spk:N label gold=F
   12  0 label not a positional label here gold=F
  138  0 shape (looksLikeAName) gold=F
    9  0 shape (looksLikeAName) gold=T
    3  1 <2-of-3 vote gold=F
    3  1 <2-of-3 vote gold=T
    3  2 only 'id:'-prefixed ids (lookup miss) gold=F
  102  3 no cited turn contains the name (model cited the block it SPOKE, not the naming turn) gold=F
   39  3 no cited turn contains the name (model cited the block it SPOKE, not the naming turn) gold=T
   99  4 own turn names the name but is not a self-identification (third-party address) gold=F
   22  4 own turn names the name but is not a self-identification (third-party address) gold=T
   15  5 other speaker's turn: not immediately before the label's block, or not a forward handover cue gold=F
    9  5 other speaker's turn: not immediately before the label's block, or not a forward handover cue gold=T
    3  6 C7 label names two people (contradiction) gold=F
    3  6 C7 label names two people (contradiction) gold=T
```
- The 61 unparseable calls are all truncated JSON (the model lists every turn id and hits
  `num_predict: 300`) or prose. None is a code fence, so `parseJsonLoose` rejects them live as well.
- **Root cause, in c1's `speakers-llm.ts` `extractSpeakers` evidence loop (b40327f L272-286):**
  - c1 accepted a cited turn only if **that turn itself** self-identified the label, or was a
    handover right before the label's block.
  - The model does not cite the naming turn. It cites the turns the person **spoke**.
  - Example: `spk:0 -> Rashi` cites spk:0's own block t142-t144, and none of those turns says
    "Rashi". The naming is in the neighbours: t141 `[spk:1] "Rashi, I'll pass it on back to you."`
    and t145 `[Shagun] "Thank you so much, Rashi, for inviting me"`.
  - 30 of 30 gold-correct adjacent bindings in the c1 proposals were **uncited**, so the verbatim
    gate refused them all. That is bucket 3.
- Second cause: the label-level **[C7]** contradiction rule (L302). The 6 pairs that did survive
  the evidence loop were all refused because their label had a second surviving name. Three of
  those 6 were wrong (`spk:0 -> Ankit`, from "I do see Ankit here", which c1's "X here" branch took
  as a self-identification). So c1 was also one C7 coincidence away from shipping a wrong identity.
- Minor cause: the model copies the prompt's `[id:...]` prefix into `turnIds` (43 of 2340 calls),
  and c1 treated those ids as fabricated.

### 3. What changed (commits 9098546 + review round 03e46dd, 8ad7258; all edited in place)

- `packages/index/src/pipeline/speakers-llm.ts`:
  - `extractSpeakers` evidence loop: a real cited turn (with an `id:` prefix normalised) now only
    **locates** a block of the label: its own block, or the block it sits right before or after.
  - New `namingTurns()` derives the evidence for that block:
    - (a) a self-identification inside the block;
    - (b) the turn just **before** the block, by another speaker, with a forward cue: handover,
      greeting or called-on;
    - (c) the turn just **after** the block, by another speaker, that opens with a thank-you to
      the name.
  - A block that itself mentions the name in the third person (atlas t006 "I think Sonal is not
    having any questions") is talking **about** that person, so only (a) can bind it.
  - Evidence ships in transcript order.
  - C7 is unchanged: a label with two surviving names stays unresolved.
- `packages/index/src/pipeline/speaker-name-rules.ts`:
  - `citesNameAsSelfIdentification`: "X here / X speaking / X this side" now binds only when X opens
    a clause (new `opensClause`). This kills "I do see Ankit here".
  - `citesNameAsHandover`: adds a greeting ("Hi, Nikhil.") and a called-on address ("Nupur, what do
    you think", "Rashi, I'll pass it on back to you"). Both count **only in the turn's closing 200
    characters**. Mid-turn, the same shapes are quoted or rhetorical: leeds t035 `everybody ask me,
    "Jubin, what is a good portfolio?"`.
  - New `citesNameAsThanks`: "Thank you, X" within the turn's first 120 characters, and only when
    the turn thanks **one** name. "Thank you, Kshitij. Thanks, Anisha" does not say who spoke last.
  - Header comments were condensed to stay within the 300-line budget. No rule was removed.
- **Review round (commits 03e46dd, 8ad7258).**
  - The fresh-context senior-software-engineer review of 9098546 returned **Block**, with two
    working PoCs. The closing-stretch and turn-opening windows were enforced only by turn length:
    - in a short turn, `Everybody keeps asking me, "Priya, what do you think?"` bound the next label
      to Priya;
    - `Thank you, Kshitij, said the intern` bound the previous label to Kshitij.
  - Fix: new `reported()`, applied to both `citesNameAsHandover` and `citesNameAsThanks`. An
    occurrence binds nobody when it sits inside an open quote, follows "asks/told me|us, said,
    says", or precedes "said/asked/told/replied/wrote".
  - The two-name thanks guard now also catches "thanks a ton / a bunch / again / also (to) X".
- Tests (`speakers-windows.test.ts`, +7):
  - a **real corpus true positive that c1 refused**: visa `spk:0 -> Rashi`, with the recorded
    proposal verbatim;
  - the `id:` prefix;
  - the Ankit refusal (recorded 6x, gold Jubin Thakkar);
  - the third-person-block refusal (atlas Sonal);
  - the mid-turn quoted call and the two-name thanks;
  - the reviewer's two PoCs as SHORT turns, plus "thanks a ton, X";
  - the real leeds t006 case: an unquoted "Shweta, any more takers" at offset 7266 of 11500 chars.
    This pins `CLOSING` on its own.

  `speaker-name-rules.test.ts`: the ISS-093 gazetteer residue "India" ("This is India speaking")
  now closes, the same supersession pattern c1 used for "Mumbai".

### 4. Falsification (D-020: `mutate.mjs` apply/restore, `timeout 240`, trap on EXIT/INT/TERM/ERR, `cmp` against a byte backup)

| Run | Mutant | c1b tests failing | Restore |
|---|---|---|---|
| A | the c1 source (b40327f) for both files | Rashi true positive, `id:` prefix, Ankit, thanks/quoted (4 failed, 20 passed) | cmp OK x2 |
| B | third-person-block guard removed | third-person (Sonal) test | cmp OK x2 |
| C | `CLOSING = 1e9` | leeds "Shweta, any more takers" test | cmp OK x2 |
| D | two-name-thanks guard removed | two-thanks test + "thanks a ton" | cmp OK x2 |
| E | `opensClause` always true | Ankit test | cmp OK x2 |
| F | `reported()` dropped from both predicates | reviewer-PoC short-turn test | cmp OK x2 |

These results are from the final run at 8ad7258. The first run, at 9098546, used an earlier mutant C
that reddened the quoted-call test. After `reported()` landed, that test is caught by the quote rule
instead, so the Shweta test was added to isolate `CLOSING`.

After the runs, `mutate.mjs assert-clean` printed `MUTATIONS CLEAN: none outstanding`, and the
tree matched HEAD.
The real true positive (`spk:0 -> Rashi`) **fails on c1 code and passes after**.
The 8 ISS-282 reproductions pass on both versions, because both refuse them.

### 5. Measurement: OFFLINE REPLAY of the c1 proposals (label: "offline replay of c1 proposals")

**Why the replay is valid.**
- `08-replay.mts` feeds each recorded window response back to the **real** `extractSpeakers`, in
  call order.
- `buildSpeakerWindows` is untouched this cycle. So call `i` of the replay gets exactly the
  proposal that call `i` got live, and the script checks this: the call count must equal 3 x
  windows and the live `providerCalls`, or it throws.
- Everything downstream of the provider is deterministic.
- There is one lossy spot. The recorder stored proposals after `JSON.parse`, and stored only a
  120-char snippet for unparseable text. All 61 of those were non-fenced truncations or prose that
  `parseJsonLoose` also rejects, so the replay reproduces their live outcome.

Commands (worktree root):
`tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/08-replay.mts --from c1 --tag c1-replay`
then `tsx .../05-score.mjs --tag c1-replay --raw-tag c1`.

Output, verbatim:
```
{
  "accepted": 12,
  "correct": 12,
  "precision": 1,
  "wrongIdentities": 0,
  "wrongPairs": 18,
  "wrongPairsRelational": 0,
  "floorTurns": 2,
  "floorCoveredTurns": 42,
  "floorLabels": 2,
  "contradicted": 0,
  "stableAll": true,
  "additions": 4,
  "ISS255": "3/4"
}
```
This output was re-derived after the review round, at 03e46dd/8ad7258, and is byte-identical in its
counts.

New evidence files this cycle (ISS-284 completeness):
- `08-replay.mts`, `09-rejection-histogram.mts`, `10-exhaustive-relations.mts`;
- `run-results.c1-replay.jsonl`, `measurement-summary.c1-replay.json`;
- `05-score.mjs`: `--raw-tag`, plus the additive `wrongPairsRelational`.

Their `*.log` outputs are gitignored. The scripts re-derive them, and the outputs are pasted here.

The accepted set is identical in all 3 outer runs:

| Label | Name | Evidence (turn and relation) | Block | Gold |
|---|---|---|---|---|
| visa `spk:0` | Rashi | t141 handover-before, t145 thanks-after | {141..143} | Rashi |
| creative-futures `spk:1` | Sumit | t260 handover-before | {260} | Sumit Saurabh |
| in-focus-3 `spk:1` | Nikhil | t015 "Hi, Nikhil.", t029 | {15},{29} | Nikhil |
| leeds `spk:2` | Nupur | t019 called-on | {19} | Nupur |

Pair-level histogram under c1b (same script):
- 12 accepted, all gold=T.
- 15 gold=T pairs are still refused by label-level **C7**. These are recurring labels: visa
  `spk:1` is gold Kshitij, Shagun and Rashi in different blocks.
- 0 gold=F pairs survive the evidence stage.

**Bar-by-bar, stated plainly (ISS-283):**
- Bar 1: precision 1.0 (12/12).
- Bar 5: 4 additions.
- Bar 4: stable across all 3 outer runs.
- Bar 3: 0 floor contradictions. The LLM path still does not re-accept the two floor identities
  (Ruby, Jubin Thakkar). That is unchanged from cycles 0 and 1.
- **Bar 2: 0 wrong identities.** The legacy counter `wrongPairs` reads **18**. That is the 6
  evidence turns in the table above, x3 runs. Legacy `evChecks` accept an evidence turn only if it
  lies inside a gold block of the named person, which only a self-naming turn can do. A greeting,
  handover or thanks is spoken by **someone else**, so it fails that check by construction, and the
  cycle-0 counter was never exercised by relation evidence.
- `05-score.mjs` gains an **additive** field, `wrongPairsRelational`, and the legacy field is
  unchanged. It asks the gold's own question (`gold-labels.json` `_meta.provenance_kinds`:
  address-adjacent, handover-next, called-on): is the evidence turn inside, or immediately next to,
  a claimed block whose gold person is the accepted name, and spoken by a different speaker when
  adjacent? That check reads **0**.
- **The checker decides which reading bar 2 means.** If it means the legacy counter, no
  relation-evidence path can pass bar 2 on this corpus. Gold has 3 self-naming blocks, and 2 of
  them are already floor identities, so bars 2 and 5 could not both hold.
- ISS255 reads 3/4 because case 4 checks evidence against the **old** cue predicate
  `citesNameAsAnIntroduction`, and 12 of the 18 pairs use forms that predicate never admitted
  ("Rashi, I'll pass it on back to you", "Hi, Nikhil."). Cases 1-3 pass.

### 6. Model-free stress check (`10-exhaustive-relations.mts`): every name-shaped span next to all 240 gold blocks

This runs the c1b relations over **every** candidate, whatever the model proposed. Candidate spans
are crude regex output, so fillers like "Uh", "I'm" or "Bye-bye" appear; a real proposal must also
pass the vote, shape and discourse gates. Real-person results:
- **after-thanks:** 6 correct, 1 real hazard. It was 7 before the review round. The wider
  two-name guard now also refuses in-focus-3 blk14 Nikhil, a recall cost that does not show in the
  replay. creative-futures blk12 `spk:0 -> Emily`, gold
  Priyanka. t079 continues Emily Lee's own sentence ("they can. / experience...") and t080 thanks
  Emily. I read this as a probable **gold labelling error**, but I did not edit it; it is flagged
  for the checker. The model did not propose it in c1.
- **before-forward:** 7 correct, 0 real wrong. The 3 "wrong" rows are the non-names "Share" and
  "Uh".
- **own self-id:** 2 correct, 0 real wrong. The rows are "I'm"/"She's"/"Ruby. I" artefacts, and
  Ankit no longer appears.
- **Third-person guard:** it refused 5 bindings. One was correct (visa Ruby blk6, lost recall) and
  4 were wrong, including atlas Sonal twice.

### 7. Contract notes for the checker (`qa/contracts/speaker-resolution-llm.md`, not edited)

- **[C1]/[C2]** say evidence is "verbatim in a real cited turn".
  - Under c1b every shipped evidence turn contains the name verbatim, as a whole word, in a
    directional cue.
  - But it is a turn the code **derives** from the model's cited turn (the neighbour of the block
    the model cited), not necessarily a turn the model cited. The model-cited block turns that lack
    the name are dropped, as C2 requires.
  - This is the one real change in reading. Without it, measured recall is 0.
- **[C7]** stays label-level, as written. The gate's answer A (segment-scoped identity) implies a
  block-level contradiction rule instead. That would admit the 15 gold=T pairs C7 now refuses, but
  it would contradict C7 as written and the ISS-255 case-3 "one accepted name per label" check. I
  left that for a contract decision rather than changing it here.
- [I2] holds: `speakers.ts` is byte-unmodified. [I3] holds: nothing is persisted.

### 8. Gates run (fix cycle 1b)

- `pnpm -r --no-bail test`: all green. core 7/7, db 14/14, ai 74/74, ask 50/50, ingest 97/97,
  **index 233/233**, meeting-bot 40/40, api 173/173, web 55/55. EXIT=0. This was re-run at 8ad7258. (ISS-294 does not reproduce
  here: this worktree has no webinar-bot data dir.)
- `pnpm -r typecheck`: EXIT=0.
- `pnpm lint:structure`: stops at `lint-root: FAIL — root has 16 loose files (budget 15)`, which is
  the pre-existing ISS-248 (`AGENTS.md`); this cycle added no root file. The remaining steps, run
  one by one, all pass: lint-loc OK (291), lint-dirsize OK, lint-dupes OK, lint-migrations OK,
  snapshot --check OK, lint.test 14/14, tracker-audit g1,g4 OK, depcruise no violations.
- `tsx qa/probes/iss104-rederive.mts` → `--- refused 17/20` (unchanged).
- ISS-282 8/8 ledger reproductions: still refused (D-015).

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

### Scoring (c1 run completed — FAILED; see "Fix cycle 1b" §1)

`{"accepted":0,"correct":0,"precision":null,"wrongIdentities":0,"wrongPairs":0,"floorTurns":2,"floorCoveredTurns":42,"floorLabels":2,"contradicted":0,"stableAll":true,"additions":0,"ISS255":"4/4"}`

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
| 6 | Phase-3 bars (precision, zero wrong links, floor, stability, ≥1 addition) | c1 run + `05-score.mjs --tag c1` | **FAIL on c1** (0 accepted, 0 additions) |
| 7 | c1b: a real uncited adjacent naming binds the right block | visa `spk:0 -> Rashi` test on c1 source (mutant A) | FAIL before → PASS after |
| 8 | c1b guards (clause-start self-id, third-person block, closing-stretch address, single-name thanks) | mutants B-E | each reddens its test; restore cmp OK |
| 9 | c1b bars on recorded c1 proposals | `08-replay.mts` + `05-score.mjs --tag c1-replay --raw-tag c1` | precision 1 (12/12), 0 wrong identities, 4 additions, stable; legacy wrongPairs 18 / relational 0 — **bar-2 reading pending checker** |

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
