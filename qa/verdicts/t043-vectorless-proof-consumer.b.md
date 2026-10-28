# Verdict B — t043-vectorless-proof-consumer (second blind coordinator)
Date: 2026-10-26 · Bound: D:/KnowledgeBase · Cycle checked: 0 · Policy: proportional-verification/2026-10-19.17 · Dual check: coordinator B
Contract: qa/contracts/t043-index-proof-v3-consumer.md (C1-C9 judged; C8/C9 are the 2026-10-26 v4 amendment)

## Check plan (step 0)
Logic change in a tenancy consumer, tier L. Instruments: re-run the 9-case consumer suite plus the 4-case standing identity suite on current bytes; one falsification per changed criterion (C8, C9) plus one extra (downgrade) in isolated copies; own direct probes; step-4c read of the changed files. No UI, no live, no LLM, no persona walk.
Base 5c4cbade is not in this clone: current tree bytes judged. LF-normalized sha256 of consumer .ts, consumer test, fixture and scripts/webinar/index-proof.mjs match the manifest pins. scripts/webinar/sync-session.mjs does NOT match the manifest pin (LF sha a9a680b8... vs 95F970F5...); history shows ISS-LEGACYSEED edits. The fixture executes the current block (baseProof -> v4 stamp); it is green on current bytes.

## Evidence (all run by me)
- Own run, cwd packages/meeting-bot, node v24.13.1: `node --test --import tsx src/workspace/index-proof-consumer.test.mjs` -> 9/9 pass, 0 fail/skip, 1188 ms. Bundled runtime path in the manifest does not exist here; system node used.
- Copy (outside repo) run of consumer + index-proof-identity.test.mjs -> 13/13 green before every mutant.
- C8 falsification m1: drop `semanticSupport !== 'not-required'` from the v4 branch -> RED (v4 attack table, `semanticSupport: passed/undefined`).
- C9 falsification m2: `version === 3 || version === 4` -> `version === 3` (v4 skips source/db/session/row/gate binding) -> RED in 5 tests (v4 table, stale validation, hostile rows, gates, testData staging).
- Downgrade m3: v3 no longer requires semanticSupport passed -> RED (v3 table `version:4`, v4 table `version:3`).
- m4 (extra probe): remove the v2 turnCount check -> 13/13 STAY GREEN. See P1.
- Own probes (copy, 3/3 pass): v4 db matrix (lkb, undefined, '', other, traversal refused; testData stays lkb_staging only; agreed other db refused; testData + lkb_other caller accepted only with matching source hash), type/case variants (`Vectorless`, array mode, `Done`, `provenance:true`, `'not-required '`, version `'4'`/4.0001, missing/foreign inputArtifact) refused, missing session.json/video-stage.json refused, real v2 turnCount/generation (1, ' ') refused through the finalizer with the legacy producer.
- 4c read: consumer.ts 61 lines, no `any`, unknown-guarded, fixed file names, literal artifact allowlist, `readRetentionBytes` (lstat/fstat/nlink/mtime) for every read, final re-read loop at lines 54-56 covers every snapshot including v4 session/gate. The v4 branch (lines 24-27) is a single ternary: version 4 requires exactly vectorless/done/passed/not-required, every other version requires semanticSupport passed; no absent-mode fallback. Line 34 puts v4 through the full v3 binding.

## Criteria
- C1 met (actual producer->finalizer, 9/9; legacy v3 fixture unrelabelled). C2 met (v4 db/source/session matrix, probes). C3 met. C4 met: identity suite's default fixture is now v4, so hostile rows/gates run against v4 (green, m2 red). C5 met. C6 met on behaviour (P1) but see P1 below. C7 met: no independent handshake gap beyond the sync-session pin drift. C8 met. C9 met.
- Limits stated honestly in the manifest: v2 lacks v3/v4 guarantees; a forger rewriting all legacy fields is out of scope (contract C6). A v4 proof rewritten to version 2 with semanticSupport `passed` is accepted as legacy v2 by design; a version-only rewrite is refused.

## Proposed issues (dual check: none written to the ledger)
PROPOSED-ISSUE: {"sev":"medium","type":"test-coverage","file":"packages/meeting-bot/src/workspace/index-proof-identity.test.mjs:50","summary":"Test 'legacy v2 still refuses count mismatch and non-string generation' uses the default producedProofFixture, which this unit flipped to vectorless v4. Stripped v4 fields keep semanticSupport 'not-required', so v2 is refused by the semantic check before turnCount/generation. Mutant m4 (v2 turnCount check removed) leaves 13/13 green. Real v2 behaviour is correct (probe P1).","fix_direction":"Pass mode 'legacy' (third arg) in that test, as the consumer suite does; add a v2 count-mismatch negative to the consumer suite."}
PROPOSED-ISSUE: {"sev":"low","type":"process","file":"qa/manifests/t043-vectorless-proof-consumer.md","summary":"Manifest pins scripts/webinar/sync-session.mjs at 95F970F5; current LF hash is a9a680b8. The fixture executes the live block, which is green, but the frozen-dependency claim is stale.","fix_direction":"Re-pin dependency hashes or note the ISS-LEGACYSEED delta."}

VERDICT: PASS
SCOREBOARD: 9/9 criteria met (C1-C9), 0/0 invariants
TIER: L (tenancy: packages/meeting-bot/src/workspace/index-proof-consumer.ts:34-37 source/database/session binding)
FAILURES: none (P1 is a non-blocking medium proposal; the product behaviour is correct and independently probed)
CAPABILITY-COVERAGE: C8, C9 falsified 2/2 red-after, green-before in isolated copies (m1, m2); extra m3 red; m4 survived (test-coverage finding P1)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (dual coordinator; see PROPOSED-ISSUE lines)
EXECUTOR: claude-sonnet-subagent
EXPLANATION: The v4 branch accepts only the exact vectorless/lexical/provenance/not-required readiness, cannot be reached by a version-only rewrite of v2/v3, and shares every v3 tenant, source, database, session, row, gate and unchanged-bytes check. Nothing here proves live Mongo persistence, media accuracy or proof authenticity, as the contract says. The one finding is a vacuous legacy-v2 regression test, which does not make the code wrong.
Metrics: start=2026-10-26T16:29:00Z end=2026-10-26T16:36:00Z wall_min=7 agent_min=7 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=420 mutants=2 defects_unit=0 defects_6c=0
