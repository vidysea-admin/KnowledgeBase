# Verdict: t050-pipeline-graph

VERDICT: PASS
Cycle checked: 0
Commit checked: e51a8f2a (lane/t050graph)

EXPLANATION:
- Stage order: nodes are built from WEBINAR_PIPELINE (capture, media, transcript, screen[optional], index); nothing re-declared. Real code (record-finalize.ts:246-262) runs process-video (screen) then index, and a screen failure throws and skips index, which matches the graph: a failed screen is failed-terminal and index never runs. Optional means skip-by-config only, not failure-tolerant. TASKS.md T-050 ("capture -> transcribe -> extract -> index") is looser prose; no contradiction.
- Mismatch noted (not blocking, unwired): the graph can skip screen and still index; record-commands.ts:90 rejects "--index requires --process-video". Filed ISS-T050GRAPH-001 (medium).
- Resume/idempotency: planner-driven. Test proves finished stages run once, the interrupted node re-runs with cause lease-expired, downstream inputs equal an uncrashed run; a re-run of a finished job runs no handler (queue refuses lease, outcome error/terminal). Crash after side effect but before succeed means at-least-once re-execution; only implied in docs: ISS-T050GRAPH-002 (low, note).
- Failure stops downstream: non-retryable, retry-exhausted, thrown handler all end failed-terminal with no later handler called. Optional screen failure blocks index (intended, matches real code).
- Tenant/lease: handler ctx tenant comes from lease; two-tenant same-run-key test and forged-lease test run no handler; superseded lease refused before any node runs. Runner errors stop the loop.
- Evidence: new test 13/13, 15 consecutive runs 15/15; tsc exit 0; pipeline-runner 22/22; all job-queue (87) and run-state-store (76) test files pass.
- Mutations (own harness, per-mutation backup, restore in finally, deleted after): 6 applied, 6 killed (failed-terminal ignored, tenant hardcoded, node list reversed, complete path re-runs, skip loop disabled, step error swallowed); 1 mutation did not apply (text mismatch, not counted). Final git hash-object of pipeline-graph.ts = HEAD blob adfdd15b.

ISSUES-WRITTEN: ISS-T050GRAPH-001 (medium), ISS-T050GRAPH-002 (low), in qa/issues.t050graph.jsonl
