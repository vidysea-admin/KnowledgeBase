# Verdict: w27-qahash (ISS-REVALIDATE-001)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: b92fdae19002ba2b5af6d08614502002b701b737
Base: 4264418c7488d95e76bc0d86e3920efb0e0ccd72
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-qahash (branch lane/w27-qahash), tree clean at candidate before checks.
ISSUES-WRITTEN: none

## Diff reviewed (independent)
`git diff 4264418c b92fdae1`: new scripts/webinar/validate/turn-integrity.mjs (18 lines), validate-session.mjs (always runs it when turns.length>0), transcript-qa.ts (two constants now `export`), 3 new tests, manifest. No behaviour change to the TS module.

## Key risk: new overlap rule (tStart < prev.tEnd - 1e-6) on REAL data
Ran turnIntegrityReasons read-only over all 29 committed data/toc-migrated/*/turns.json (the 30th committed turns.json is a synthetic checker fixture under qa/evidence). Duration = max(tEnd)+1 so past-end is not triggered.
- 17 pass, 12 fail on turn integrity.
- Overlap only (6): creative-futures (max overlap 28 s), in-focus-3 (10 s), india-test-series-part2 (5 s), pathways-in-psychology (26 s), uniaccess-japan (30 s), 2026-09-24-in-focus (17 s).
- Overlap + non-monotonic (2): visa-blueprint-part2 (26 s), global-test-prep-pathways (317 s).
- Non-monotonic only (2): dual-enrollment-pathway, ucas-what-changed.
- Repeated-turn run only (2): in-focus-2, uniaccess-leeds-arts.
Overlaps are 5-317 s (not sub-second cross-talk), consistent with timestamp drift rather than diarization interruptions.

Regression test: full `validateSession` (dryRun) on all 29 at the candidate. ALL 29 already fail for reasons independent of the new rule: 25 "turns.json does not match its canonical transcript identity" (legacy migrated files, not written by the transcription pipeline), 4 (visa, dual-enrollment, ucas, zoho) fail invalid turn timing / privacy evidence. So no previously-valid committed session is turned from pass to fail by the overlap rule: NOT a blocking regression by the brief's definition. No committed fresh-pipeline session exists to test against.

Residual risk (non-blocking, EXPLANATION only): default plan chunking is overlap 0 and the QA writer never checked inter-turn overlap, so a fresh pipeline session whose model timestamps drift by more than 1e-6 s now fails validation with no override (even --accept-partial). That is the recorded issue (swapped/overlapping turns must not pass), and the 8 s test reproduction would not survive a larger tolerance, so the rule is kept as is. If operations hit this on fresh sessions, the fix is a deliberate, separately-recorded allowance (e.g. an explicit `--accept-overlap` evidence field), not a silent tolerance.

## Missing QA / callers
Callers of validate-session: packages/meeting-bot/src/capture/record-finalize.ts:262, scripts/watch/lib/ingest-chain.mjs:253, scripts/webinar/graph/graph-finalize.mjs:61 (plus docs and CLI). qaEvidence is unchanged: a missing transcript-qa.json is still only a refusal when LKB_TRANSCRIPT_QA=1 or trusted privacy applies. The change adds turns.json-derived ordering/overlap/repeat checks that work with no QA file. No caller relies on absence of those checks beyond the overlap point above.

## D-015: five ISS-REVALIDATE-001 reproductions, verbatim replay (all covered and passing)
(a) stale same-count QA: test line 179, /generation hash mismatch/ PASS
(b) clampedCount=20 / dropped=5 / overshootSec=400: same test, lines 187-193 PASS
(c) overlapping + swapped turns with no QA: test line 389 PASS
(d) 75 identical-text turns, no QA file, flag unset: test line 389 PASS
(e) survivors nonMonotonic>0, durationValid!==true, assertTurnTimings: tests lines 406 and 418 PASS
Count: 5/5 reproductions covered, none left open.

## Commands (independent)
- node --test --test-force-exit --import tsx validate-session.test.mjs transcript-qa-binding.test.mjs: exit 0, tests 35, pass 35, fail 0.
- tsc --noEmit -p packages/ai: exit 0, no output.
- node scripts/lint-loc.mjs --all, run alone: exit 1. Stages loc/dirsize/root/dupes/migrations/codex-hooks/snapshot/dependencies exit 0; lint-tests and tracker were SIGTERM "unavailable" at the harness's 120 s per-stage cap (scripts/lint-loc.mjs:44). Environment load, not a finding: I ran both stages directly with a 550 s cap, `node --test scripts/lint.test.mjs` exit 0 (18/18) and `tracker-audit.mjs --gate g1,g4,g5` exit 0. Composite lint-loc --all therefore not green as a single command; each stage is green.
- Mutation (D-020, per-mutation backup, timeout 300, trap on INT/TERM/ERR): replaced the overlap predicate in turn-integrity.mjs with `false`; the "swapped, overlapping..." test FAILED (killed), pass 0 / fail 1. Restored by backup; `git hash-object` equals HEAD blob e6154e2094d5408e49827d8f095434795b3ae59a and cmp ok; git status clean.

Evidence copies (scratchpad): C:\Users\product\AppData\Local\Temp\claude\C--Users-product-Desktop-KnowledgeBase\f9384bb3-0372-48e6-a6e1-76e2f748d07c\scratchpad\w27-evidence (realdata.out, full.out, tests.out, tsc.out, loc.out, mut1.out, exit files).

## Limits
Not verified: fresh pipeline output on real audio (none committed); other callers' end-to-end runs; browsers/network not used. Checker token/time usage not measured by host.

## Ledger
ISS-REVALIDATE-001 (qa/issues.revalidate.jsonl): rows may be flipped open -> verified (all five reproductions covered by passing tests and a killed mutation).
Maker manifest fix cycle 1 may be closed out as checked-PASS.
