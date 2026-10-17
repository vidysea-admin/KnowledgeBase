# parallel-answer-policy maker evidence, cycle 0

Candidate base HEAD 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd; lane hashes in qa/packets/parallel-answer-policy.md. No provider, MongoDB, browser or deployment actions.

## Focused affected stage and downstream

Command (root cwd):
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/ask/src/answer-policy.test.ts apps/api/src/answer-policy/routes.test.ts`

Exit 0, duration_ms 10040.3576, 14 tests/pass14/fail0. Captured Node summary: tests14, suites0, pass14, fail0, cancelled0, skipped0, todo0. Real localhost HTTP tests used actual Ask graph with fake provider dependencies and mounted createServer; no remote provider/Mongo calls. Tenant binding, auth/scope refusal, forged submitted-result rejection, draft/query validation, bounded refusal, immutable version and evidence-only simulation tests passed. Immediate downstream uses existing answer() output without an extra provider call and actual authenticated HTTP response.

The null-body negative fixture generated Express's expected default body-parser SyntaxError before route entry, returned HTTP400 and performed zero retrieval. This diagnostic is not a failing test.

## Actual React and client

Command (root cwd):
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register-react.mjs qa/evidence/parallel-answer-policy/actual-react.test.mjs`

Final exit0, commandwall2.6237027s, duration_ms2245.193, tests3/pass3/fail0. Real ReactDOM/JSDOM, AuthProvider, MemoryRouter, AnswerPolicySimulator and actual shared apiFetch/client; mocked transport only. Checks trimmed fresh authenticated request, transient version increments and prior-result clearing, separate policy/candidate/source display, safe URL inertness, coverage/web-used honesty, API-error display and blank-submit refusal.

Initial adapted probe exit1, commandwall2.3667996s, 2/3 passed: the probe incorrectly read the case-sensitive object property Authorization while existing apiFetch uses authorization. The test-only probe was corrected to Headers.get('authorization'); product files did not change. Final rerun passed3/3. Standing Vitest tests remain present but were not executed due worker/subprocess restrictions; this adapted check is separately attributed. React Router emitted existing future-flag warnings.

## Type checks

- `node node_modules/typescript/bin/tsc --noEmit -p packages/ask/tsconfig.json`: exit0, wall2.6988387s.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`: exit0, observed approximately10s; explicit web-used sentence was added afterward and is exercised by actual React probe.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`: exit1, wall9.0326659s. Diagnostics only unrelated concurrent gws-calendar.ts overload/acquisition and youtube-calendar.test.ts unknown types; no answers-file diagnostics. Whole API typecheck not claimed green.

Reused independent checker current frozen-contract validation: `python contracts/verify_contracts.py`, exit0, wall0.3452815s, completed2026-10-14T09:08:26Z. Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This command is checker-owned and independently attributed; maker did not duplicate it. No independent checker verdict yet. Real interactive browser proof remains blocked by shared-worker policy. These scoped tests do not close YAML/persistent policy builder, conflicts, review queue or umbrella T-056.
