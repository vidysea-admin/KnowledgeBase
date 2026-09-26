# Brief — speakers-degraded-scope (fixes ISS-269 + ISS-270, severity high)

Work ONLY inside this worktree. Do not run git. Do not dispatch any checker. ADD what is asked; never delete or rename existing code, tests or config this brief does not name.

File: `packages/index/src/pipeline/speakers-llm.ts` (extractSpeakers). Tests: `packages/index/src/pipeline/speakers-windows.test.ts`, `packages/index/src/pipeline/speakers-llm.test.ts`.

## ISS-269 (verbatim evidence)
speakers-llm.ts:310-311 template `${windowFailures.length} of ${windows.length} speaker window(s) failed` — windowFailures accumulates one entry per failed call across all 3 agreement runs while windows.length is per-run. A window failing in all 3 runs prints '3 of 2 speaker window(s) failed', and one window failing thrice is indistinguishable from three windows failing once. Existing test only pins the 1-failure case ('1 of 2').

Required: degraded.reason must report DISTINCT failed windows over total windows (numerator never exceeds denominator), and separately the number of failed calls over total calls, e.g. `2 of 2 speaker window(s) failed (5 of 6 calls across 3 runs)`. Keep the existing wording for the single-failure case as close as possible; if the '1 of 2' test string must change, update that assertion and say why in a code comment-free way (just adjust the test).
Tests to add: one window failing in all 3 runs → numerator 1, never > windows.length; three different windows failing once each → numerator 3 (needs ≥3 windows).

## ISS-270 (verbatim evidence)
speakers-llm.ts:220-222 all-junk fallback fires only when EVERY window in EVERY run is non-array; :246 non-array entries are skipped in the claims loop with no windowFailures push. So partial-junk runs leave `degraded` null and the label merely unresolved; a caller cannot tell unparseable provider output from a legitimate "no speaker". The header contract at speakers-llm.ts:19-22 ('fails or returns junk -> falls back to the deterministic pass') is honoured only in the all-junk case.

Required: a window whose provider response is non-array junk must be recorded as a failure (same accounting as a thrown call, distinguishable in the reason, e.g. counted as `junk`), so `degraded` is non-null whenever any window returned junk. Legitimate empty-array responses must NOT count as failures. The all-junk fallback behaviour stays as it is.
Tests to add: partial junk (one window returns a non-array object, others valid) → degraded non-null and reason mentions the junk window; empty array response → degraded stays null.

All existing tests must still pass.

## Verify (must exit 0)
node --test --import tsx packages/index/src/pipeline/speakers-llm.test.ts packages/index/src/pipeline/speakers-windows.test.ts
