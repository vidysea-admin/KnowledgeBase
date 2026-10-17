# Verdict: T-056 API slice (answer policies, cited answers, review queue) - cycle 1

VERDICT: PASS
Status: PASS (scoped to apps/api/src/answer-policy stale-citation refusal tests + mutation evidence; NOT the full parent)
Cycle checked: 1
Reviewed SHA: d4c5054a4a53f98a08016db91b1657a02e3ee3e3
Base SHA: a9fac545 (diff = 3 test/evidence files + manifest; no product source changed, verified by git diff --stat)
Checker: independent (Sonnet 5.5), 2026-10-16
Parent T-056: remains in_progress / NOT closed. Per qa/contracts/goal-t056.md "Verdict and remaining gates" a scoped PASS cannot close the parent; C1, C2, C3 (UI), C9, C10, C12 and live/browser/human gates remain open (HOLD at parent level).

## Independent evidence (lane apps/api, node from codex runtime; raw outputs in qa/evidence/t056-checker-c1/)
- stale-citation-refusal + answer-workflow (green.out, exit 0): tests 21, pass 21, fail 0.
- answer-persistence (persist.out, exit 0): tests 6, pass 6. Base a9fac545 already contains the exact `answer records refuse database "<name>"` assertion (answer-persistence.test.ts:56), so "47/48 already repaired at base" is TRUE. Maker's 74/74 nine-file run was not reproduced; only the above three files were run by me.
- Maker harness qa/evidence/t056-answer-policy-mutation/run-mutations.mjs re-run (mut.exit 0): 13/13 applied and killed, each by named failing tests (M1-M13); fidelity: answer-evidence.ts a399498c... == HEAD, answer-workflow.ts 4629efac... == HEAD; git status of apps/ clean afterwards.
- Own mutations (own-mut.sh; per-mutation byte backup, `trap` restoring that mutation's backup on INT/TERM/ERR, timeout 300, cmp after each, HEAD hash-object at end, own.summary): (a) bypass readEffectiveTurns overlay (use rawTurn), (b) drop q.nodeId !== source.node_id, (c) drop sliceSHA256 check. All 3 applied, all killed by named test "current committed effective transcript..." / "canonical source verifier checks ..." (existing answer-persistence tests, not the new ones); all restored, answer-evidence.ts == HEAD blob.

## Judgement items
1. New tests assert real behaviour: yes. They call createMongoEvidenceVerifier against a fake Db with a green baseline (true), then withdraw/delete turn, session, source, move session tenant, re-edit text, forge fingerprint, empty/blank/quoteless/foreign-session bindings, web verifier withdrawn, WhatsApp eligibility missing/withdrawn, and assert `false`; the workflow test asserts state "stale", blank answer, empty sources and a rejected approval with /Source evidence changed/ (not status codes). M1-M10 and M12/M13 kill attribution confirms they bite.
2. Harness: per-mutation backup (in-memory bytes per mutation), restore in `finally`, SIGINT/SIGTERM/uncaught handlers, 300 s spawnSync timeout, post-restore sha check, and HEAD-fidelity via git hash-object vs rev-parse HEAD:<file>. Acceptable to commit (precedent: other qa/evidence/*.mjs are tracked; no secrets/absolute paths in the result JSON). Low-severity notes (not issues): backup is in memory, so a SIGKILL of the harness would leave a mutant; spawnSync blocks the signal handlers during a child run; it does not assert pre-run state == HEAD. The fidelity check mitigates.
3. Citation paths: verifier requires non-empty bindings, fingerprint == digest(source), same-tenant session and source, per-turn tenant+session lookup via the effective (review-overlay) reader, exact text/hash/byte/tuple/origin, and is invoked on publication (snapshotFreshness -> stale blanking), queue, approval, conflict report/resolve and conflict listing. Stored candidate/evidence digest recheck is now tested. No bypass found within API scope. Residual (note, composition-owned, not a violation here): for non-WhatsApp sources the eligibleTurn visibility callback is optional in createMongoEvidenceVerifier, so a later quarantine/withdrawal of a recording-derived claim relies on root passing the callback at composition; web proof is mandatory-by-default (refused without verifier, tested).
4. Contract mapping (API slice): C4 stale/withdrawn/cross-tenant/edited evidence refusal = stale-citation-refusal.test.ts + answer-persistence overlay test (verified); C6/C8 stale candidate cannot be approved or published = answer-workflow.test.ts new digest test + existing stale test (M11-M13); C11 mutation byte-restore/timeout and HEAD fidelity = harness + my run; C5/C7 only via existing tests (not re-run by me). Not covered: C1, C2, C3, C9, C10, C12, restart/real Mongo, typecheck, UI, provider.

## Findings
None blocking. ISSUES-WRITTEN: none. Ledger rows: no rows to flip; qa/issues.T056CONFLICTS rows are unrelated to this unit.

## Notes
- Maker commit trailer used "Claude Sonnet 5.5" (noted, not failed).
- The dirty tree (qa/verdicts/root-dockerfile-devops.md etc.) is in the main checkout, not this lane; the lane had no uncommitted source changes.
- Checker active time ~9 min wall (mutation harness dominated); token total not measured by host (unknown).
