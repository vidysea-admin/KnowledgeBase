# u24-model-judged-speaker-attribution

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap U2.4 speaker naming). Class: identity attribution that is written into the KB (the precision-critical path): FULL ceremony.
Lane: lane/u24smart. Authority: D-132 (pending append), owner decision "make it intelligent instead of rule based". Gate bars 1 (100% accepted-identity precision) and 2 (0 wrong links) are UNCHANGED. No model API call was made in this unit. config/ai-routing.yaml, qa/contracts/, docs/DECISIONS.md untouched.

## What was wrong
In `speakers-llm.ts` proposals passed the 2-of-3 vote and the name-shape checks, then died at `if (evidence.length === 0) continue`, because only a clean self-naming turn counted as evidence and the handover/thanks routes are OFF. Gold has 144 named blocks, 2 of them self-naming.

## Design
- `packages/index/src/pipeline/speakers-grounded.ts` (new). Model sees the WHOLE session (one call per agreement run, 3 runs) and returns `{label, name, evidenceQuote, evidenceKind}`, kind in self-intro / called-on / address / handover / thanks / role-continuity.
- GROUNDING gate (pure `groundSpeakerProposals`, so recorded proposals replay with no provider): positional label; name-shaped, not discourse-only, whole name spoken somewhere in the transcript; quote found verbatim (whitespace, case, apostrophes normalised) inside ONE turn, >= 3 words, contains the name or a name token no other proposed name shares; occurrence not quoted/reported speech; the quote turn sits where its kind can bind (self-intro: the label's own clean self-identification, i.e. the existing rule; handover and called-on: turn right BEFORE a block of the label; thanks: right AFTER; address: either; role-continuity: inside or adjacent), and that block becomes the identity scope (never label-wide); each (label, name, quote turn) grounded in >= 2 of 3 runs; unless a self-intro, >= 2 distinct quote turns (corroboration, abstain over guess); name must not contradict the deterministic floor (`resolveSpeakers`); a label with two names stays unnamed; one quote turn binds one label.
- Provenance (`ResolvedSpeaker.provenance`: turnId, evidenceQuote, evidenceKind) stored on every model-judged identity. `evidence` and `blocks` keep their existing shape, so `speaker-docs` is unaffected.
- `extractSpeakers` is now the grounded extractor (same signature, same degradation to the floor). The old rule-gated function is kept as `extractSpeakersRuleBased` (baseline); its seven test files import it under the old name and are otherwise unchanged. `buildSpeakerWindows` untouched.

## Evidence
```
speakers-grounded.test.ts   tests 30 pass 30 fail 0   (6 kinds accepted, fabricated quote, floor contradiction + control, vote failure, 2-turn quote, wrong-direction kind, reported speech, ambiguous first name, shared quote turn, legacy format abstains, whole-session prompt)
legacy speaker tests        name-rules 110, relation-ledger 8, relation-rules 10, selfid-allowlist 6, selfid-ledger 8, twointro 8, differential 5, speakers-llm 50, windows 29, docs 13, speakers 16, tile-fusion 18: all pass
tsc --noEmit -p packages/index   clean
```
Rejection tests pair each defective quote with a good second quote so that corroboration is met exactly when the defect wrongly grounds.

## Offline scoring (qa/evidence/u24-smart-offline-2026-10-12/, scorer = 05-score.mjs, byte-identical but the OUT path; corpus 11 gold sessions x 3 outer runs)
Recorded D-131 proposals (commit 2bdf5445) have NO evidenceQuote, so:
- strict replay (entries as recorded): 0 accepted for both models (deepseek-v4-pro and gpt-oss:120b). Bar 1 undefined (0 accepted), bar 2 0 wrong, bar 3 contradicted 0, floor presence 1 of 2 as in D-131, bar 4 stable, bar 5 0. This is the abstain direction, not a pass.
- synthetic-quote STRESS (`09-replay-grounded.mts --mode synthetic`: attaches the nearest naming sentence to each recorded proposal; NOT a model measurement): deepseek-v4-pro 0 accepted; gpt-oss:120b 5 accepted, 5 correct (bar 1 = 1.0), 0 wrong identities, 0 relational wrong links, contradicted 0, 1 correct addition (visa Ruby spk:0), bar 4 NOT stable (leeds-arts: accepted set differs in outer run 1), ISS-255 3/4 (case 4 is the non-independent cue check, ISS-289). Before the corroboration and per-quote-vote rules the same stress gave 10 accepted, precision 0.6 / 0.7 (wrong: Shweta, Anisha, Kshitij called-on cases where the call-on binds a neighbour block), which is why those two rules exist.

## Re-gate plan (separate step, needs the owner to start the model calls)
1. Run `04-regate-eval.mts`-style harness with `extractSpeakers` (new) for both models, `--runs 1,2,3`, 11 sessions, num_predict raised for the session-long output; 3 whole-session calls per session-run (about 100 calls per model, not the 2340 window calls). Record raw proposals including quote and kind.
2. Score with `05-score.mjs`; report bars 1-5 per model and per evidenceKind (accepted, correct).
3. Replay the recorded raw output through `groundSpeakerProposals` offline to tune nothing: the gate is frozen before the run.
4. Pass criteria unchanged: bar 1 = 100%, bar 2 = 0, bar 5 >= 1.

## Not delivered / not verified
No live model run; the new prompt is unmeasured. Sessions over 600k characters degrade to the floor. Bar 3 floor presence unchanged from D-131 (Ruby in visa-blueprint still comes only from the floor). The corroboration rule trades recall for precision and is a candidate for the Approver to revisit once live numbers exist.
