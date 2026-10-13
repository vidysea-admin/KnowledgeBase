# Verdict: t050-wire-pipeline-graph

VERDICT: PASS
Cycle checked: 0
Commit checked: b49d96ff (lane/w050)

EXPLANATION:
- Flag off: graphEnabled is true only for LKB_PIPELINE_GRAPH === '1'. The else branch in run-pipeline.mjs is the original execute(finalize) statement verbatim; test asserts exact args, graph runner never called, no pipeline-graph dir. Mutation "flag always on" and "branch always graph" both killed. Graph-finalize is imported but runs nothing at import.
- Flag on: tenant is passed to submit and claim (mutations wrong-tenant on each killed); heartbeat/complete take the lease carrying the tenant; tenant-isolation test passes. Completed stages are skipped within a generation (planner property tests). A resubmit after D-139 dead job is a new generation and re-runs transcript and screen (visible in the real-queue test); this is D-139 semantics, but costly. Handlers are idempotent in effect (same commands, fingerprints from outputs).
- Retry mapping: WEBINAR_PIPELINE defines retryable codes per stage and D-139 says terminal only after retries exhausted; mapping everything to stage-failed makes that unreachable. Not permanent (next tick resubmits) but wasteful. Filed ISS-W050-001 (medium).
- Heartbeat: code is correct by inspection, but the test does not prove the timer (mutation survived). ISS-W050-002 (medium).
- Evidence: session-run 6/6 x5; graph-finalize 5/5 x5; run-pipeline 22/22; core suite 391 tests, 388 pass, 2 fail (file-job-queue.pid-reuse, known, main-red).
- Mutations: 8 applied, 5 killed (flag on, claim tenant, submit tenant, failure swallowed, graph branch forced), 3 survived (foreign-run check, heartbeat timer, index marker write). Per-mutation byte backup, restore in finally, git hash-object == HEAD blob for all touched files, working tree clean.
- Owner question (LangGraph vs minimal executor) is flagged in the manifest and not a checker defect.

ISSUES-WRITTEN: ISS-W050-001 (medium), ISS-W050-002 (medium), ISS-W050-003 (low), in qa/issues.w050.jsonl
