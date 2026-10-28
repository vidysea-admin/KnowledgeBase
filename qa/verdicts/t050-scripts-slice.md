# Verdict: t050-scripts-slice (T-050 scripts slice)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: b1067a78b71037949c3c9652b087f2ab19dd6ac8
Base: a9fac545

Diff reviewed independently (git diff a9fac545 b1067a78): stage-process.mjs +2 lines, stage-process.test.mjs +12, graph-finalize.test.mjs 1 line, manifest.

1. Bounded retries / spoofing: the stderr mapping only yields the code `io-error`. Retry is bounded in the planner (packages/core/src/domain/pipeline-workflow.ts:150-154): failed + retryable code retries only while `attempt < maxAttempts`, else `retry-exhausted` terminal (media 2, transcript 3, index 3; `io-error` is retryable only for `media`; screen and capture treat it as non-retryable). A child that spoofs EBUSY text gets at most maxAttempts-1 extra tries. The new match sits after the 429/Mongo/timeout/5xx branches, so it cannot shadow them. Note: word-boundary stderr substring match is a heuristic, accepted as the issue's own fix_direction ("exit code or stderr class").
2. Leak: runNodeScript rejects with the constant message 'Pipeline stage failed' plus the code only; the diagnostic buffer is never attached. New real-child test asserts the marker 'private-marker' is absent from JSON.stringify(error). guard() in graph-finalize.mjs:43 stores only `{kind:'fail', code}`.
3. Mutation (own, per-mutation byte backup in lane qa/evidence/t050-scripts-slice-check, timeout, trap INT/TERM/ERR): deleting the stderr EBUSY line gave exit 1, 2 tests fail (the classification table and the real-child lock test), 3 pass. Restored; cmp with backup OK; `git hash-object` daed922f... equals HEAD blob.
4. ISS-W050-001 replay: the ledger row records no scripted attack list, only the transient network error / file lock scenario. Replayed as 1/1 via graph-retry.test.mjs (wired 503 retries only the failed stage {media 1, transcript 2, screen 1, index 1}) plus the new file-lock real-child test. All pass.
5. `--tenant fixture`: correct. At base run-pipeline.mjs:241-243 graphDeps.launch appends `--tenant <tenantId>` when absent, and the fixture tenant is 'fixture' (graph-finalize.test.mjs:55). run-pipeline.mjs is unchanged in the diff, so the old expectation was stale. I did not run the test at base to confirm the pre-fix failure; the maker's report is consistent with the code.

Commands (exit codes in qa/evidence/t050-scripts-slice-check/*.exit): stage-process.test.mjs 5/5 exit 0; graph-retry + graph-finalize 8/8 exit 0; mutation run exit 1 as expected. All with --test-force-exit under timeout.

Not verified: the maker's 15x repeat claim, the open handle in the run-pipeline import tree, ISS-W050-002 (core lane, still open), real providers/media.
ISSUES-WRITTEN: none
Ledger: ISS-W050-001 may be flipped to fixed (file-lock and transient classification at the script boundary). ISS-W050-002 stays open.
