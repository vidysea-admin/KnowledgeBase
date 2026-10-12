# u24-model-judged-speaker-attribution

**Handshake status:** checked-PASS
Fix cycle: 2
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

## Cycle 1 (fix of ISS-U24SMART-001 high, ISS-U24SMART-002 medium; cycle-0 sections above kept)
- 001: the gate now binds a quote to its referent. A quote containing thank/thanks names the PREVIOUS speaker: it can only bind via `thanks` (block ending right before the quote) or `address` read backward; called-on, handover and role-continuity quotes with a thank cue are refused. `thanks` requires the cue; called-on, handover, forward address and role-continuity require a forward cue (over to, welcome, hello, please, what/how/can you, will take, our moderator). Corroboration needs INDEPENDENT quotes (different quote-turn speaker or different kind; one host repeating one pattern is one piece of evidence). A name is refused when another label holds it in the floor or has a grounded claim for it (abstain on both). Role-continuity no longer binds the block after the quote.
- 002: `scripts/lib/audit-closed-class.mjs` probes the grounded extractor with the new `{label,name,evidenceQuote,evidenceKind}` shape and also the legacy extractor with the legacy shape; a control (a genuine self-intro must ship) aborts the audit if the probe is blind; `--self-test` seeds one bypass and requires it to be caught.
- D-015 replay of the recorded ISS-U24SMART-001 reproductions (the checker fixture, host spk:0 "Thanks Rashi, that was clear..." / "Thank you Rashi, great point..." before spk:2, real Rashi spk:1), kinds address and called-on as recorded plus handover/thanks/role-continuity: refused 5/5 kinds (test "a thank-you naming the previous speaker never names the NEXT block"). Controls: thanks AFTER Rashi's block ships spk:1 with independent quotes; the same two quotes from one host do not. Rival-label and floor-held collisions abstain.
- ISS-U24SMART-002: audit AFTER 0/409 live bypasses with a passing non-vacuity control; `--self-test` prints "seeded bypass CAUGHT". (`--base <ref>` fails at HEAD because the scratch copy cannot resolve speaker-name-data.js: pre-existing, only usable for refs before that split; not touched.)
- Tests: speakers-grounded 33/33 (3 new); all 12 legacy speaker suites pass; tsc clean. Offline replay re-run: strict 0 accepted both models; synthetic stress deepseek-v4-pro 0 accepted, gpt-oss:120b 3 accepted, 3 correct (bar 1 = 1.0), 0 wrong identities, 0 wrong evidence pairs. No model calls.

## Cycle 2 (structural redesign; fix of ISS-U24SMART-003 high, ISS-U24SMART-004 medium; earlier sections kept, where they describe kind/position/direction regexes they are SUPERSEDED here)
Why: cycle 1 still shipped wrong names (a second name in the quote, a one-turn backchannel, host + cohost as "independent"), and an offline replay of the live re-gate showed the hand-written kind/position rules were what killed recall (96 correct deepseek proposals refused on kind/position, 26 on corroboration, ~250 proposals per model with bare-name or "[Name]" labels). D-132 asks for judgement, not more regex.
- Deterministic grounding kept: verbatim single-turn quote, >= 3 words, contains the name (or an unambiguous token), whole name spoken in the transcript, not quoted/reported speech, floor not contradicted. NEW hard abstain: the quote mentions a second distinct person (vocative, mid-sentence capitalised, or known name); a self-intro is exempt. A quote spoken by the label itself only counts as the existing clean self-introduction. Adjacency is the immediate turn (MAX_DISTANCE = 1), so a backchannel breaks the binding.
- The kind/position/thank-direction/forward-cue regexes are REMOVED. In their place `speakers-verifier.ts`: an injectable `SpeakerVerifier` sees a window (4 turns before the label's block, its 2-turn opening, the quote turn) and answers "does this evidence show speaker <label> IS <name>? yes/no/unsure". Three differently FRAMED calls per piece (no temperature dependence); ship only on >= 2 yes and no "no". No verifier -> non-self-intro identities abstain. `llmVerifier(complete)` is the production verifier; unparseable or failing = unsure.
- Vote keyed on (label, name) over the 3 proposer runs (>= 2), not on the quote turn. Labels `[spk:N]`, `Speaker N` normalised; a bare-name or "[Name]" label maps to the quote turn's diarized label only for a self-intro in a positional turn (for a call-on or thanks the quote's speaker is the CALLER, so that mapping would be wrong).
- Corroboration (chosen: `independent-pair`): a self-intro alone, or two verified pieces from different quote speakers on OPPOSITE sides of the block (a host and a cohost on the same side are one handover). `single-verified` (one piece + verifier yes) is kept as a config switch and NOT the default; see numbers below.
- ISS-U24SMART-004: `audit-closed-class.mjs` control now calls `shipsAsPerson` itself (genuine "My name is Priya Nair"); reply shape is switchable; `--self-test` runs (1) a seeded bypass that is planted only for the new reply shape (CAUGHT) and (2) the probe mutated to the legacy shape (DETECTED as blind); `--self-test --mutate-probe` and `--mutate-probe` exit 1.

Evidence (no model call):
```
speakers-grounded.test.ts  tests 42 pass 42 (all six kinds; cycle-0 Rashi fixture x5 kinds; cycle-1 attacks (a) second name, (b) welcome+second name, (c) backchannel+host/cohost, each with an always-"yes" verifier -> nothing ships; verifier no / unsure / mixed / throwing; vote on (label,name); label normalisation; second-name unit tests)
12 legacy speaker suites pass (name-rules 110, relation-ledger 8, relation-rules 10, selfid-allowlist 6, selfid-ledger 8, twointro 8, differential 5, speakers-llm 50, windows 29, docs 13, speakers 16, tile-fusion 18); tsc --noEmit -p packages/index clean
audit-closed-class.mjs: 0/409 live bypasses; --self-test rc 0 (both halves); --self-test --mutate-probe rc 1; --mutate-probe rc 1
```
Offline replay of the LIVE recorded proposals (qa/evidence/u24-smart-cycle2-2026-10-12/, 13-replay-cycle2.mts, scorer 05-score.mjs; 11 sessions x 3 outer runs). Oracle = verifier answering from gold (upper bound), pessimist = always yes (worst case):
| model / corroboration | oracle accepted/correct/wrong | pessimist accepted/correct/wrong |
|---|---|---|
| deepseek-v4-pro independent-pair | 3 / 3 / 0 (0 additions) | 3 / 3 / 0 |
| deepseek-v4-pro single-verified | 15 / 15 / 0 (4 additions) | 16 / 12 / 4 (Bidya x3, Kshitij) |
| gpt-oss:120b independent-pair | 3 / 3 / 0 (1 addition, Rashi; bar 4 unstable) | 3 / 3 / 0 |
| gpt-oss:120b single-verified | 4 / 4 / 0 | 4 / 3 / 1 (Alka) |
Choice: `independent-pair`, because it is the only option with 0 wrong at the pessimist worst case on both models; `single-verified` needs a verifier that is itself 100% precise, which is unmeasured. Cost: recall. With a perfect verifier the single-piece rule would reach 4 additions on deepseek; independent-pair reaches 0-1. The live verifier's real precision is the next measurement; if it is 100% on the ledger corpus the Approver can switch the default.
Not verified: the verifier prompts have never run against a live model; bar 4 (stability) for gpt-oss independent-pair is unstable in one session; ISS-U24SMART-003's fix is shown on the checker's three fixtures and the replay, not on a live run.
