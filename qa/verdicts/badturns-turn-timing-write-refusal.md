# Verdict - badturns-turn-timing-write-refusal

**Cycle checked:** 0
**Commit under check:** 0e66f25f (write side 6200dcac, /ask exclusion 0e66f25f), lane/badturns
**Date:** 2026-10-13

## VERDICT: FAIL

## EXPLANATION

The design is sound and the security-critical ordering holds, but the lane breaks five existing tests, so it cannot PASS.

1. **Scope vs timing (security).** `assertInScope` runs first on every row, before `rowProblem`. 7 probes with a poisoned db all refused the whole request: a foreign-tenant or foreign-session row that ALSO has tEnd<tStart, NaN, negative tStart, empty id, non-string text, or an id shared with an excluded row. Scope wins. One gap at chunk level: ISS-BADTURNS-002 (a foreign-tenant chunk that references an excluded turn is dropped before validateChunk, not refused). No leak, but the "always refuse" rule is not fully met.
2. **Warning visibility.** Recorded as an `auditLog` entry `ask.source_rows_excluded` with structured `excludedTurns` and a readable step. `routes/ask/ask.ts` returns the whole askV2 result on 200, so API callers see it. It is NOT written to the jobs ledger, the web UI renders only the web-fallback audit step, and `routes/compete.ts` does not return auditLog. Owner note: this meets "recorded in a warning" for API consumers only; decide whether a ledger job or a UI notice is wanted.
3. **Frozen baseline.** `ask-graph.baseline.json` is unmodified (blob 9c9fb691, same as base). `excludedTurns` is added only when non-empty. packages/ask 122/122, including the baseline equality test.
4. **Write side.** FAIL: `scripts/lib/transcript-provenance.test.mjs` copies a fixed file list to a temp dir and lacks `lib/turn-timing.mjs`: 5 of 15 fail (ERR_MODULE_NOT_FOUND); main tree 15/15 (ISS-BADTURNS-001, high). The legacy-unbound change is legitimate: visa-blueprint-part2 and ucas are exactly the two real bad sessions, now asserted to be refused with session and turn named; the substitute session (funding-dreams) passes.
5. **Merge note, scripts/lib/transcript-provenance.mjs.** Only two added lines: line 6 `import { assertTurnTimings } from "./turn-timing.mjs";` and line 59 `assertTurnTimings(turns, sessionId);` (inside artifactGeneration, after the identity check). Nothing near requireScriptDatabase, so a textual conflict with dbguard2 is unlikely (adjacent import block only). Also scripts/webinar/session-rows.mjs +2 lines, ingest-store.ts about +6.
6. **Mutations (10; untracked lane-unique harness, per-mutation byte backup restored in finally, every file hash equal to its HEAD blob, harness deleted).** Killed 8: foreign-tenant row excluded, excluded turn cited, empty success on all-invalid, write refusal skipped, NaN tEnd (api writer), ingest writes before validating, warning dropped, chunks of excluded turns kept. Survived 2: NaN tStart in the scripts writer, negative tStart exclusion in /ask (ISS-BADTURNS-003; test gaps, code correct).
7. **Suites.** packages/ask tsc clean, 122/122. apps/api tsc clean and ask + turn-timing-write + ingest tests 127/127, BUT only after repointing the lane's `apps/api/node_modules/@lkb/ask` junction at the lane's own package (restored afterwards). With the shared junction apps/api resolves @lkb/ask from the MAIN tree, so tsc fails and the new tests cannot see the change. Owner note: merge packages/ask and apps/api together. Scripts: turn-timing, legacy-unbound, session-rows pass; transcript-provenance 10/15 (above). Also low: raw NUL bytes make source-context.ts binary in git (ISS-BADTURNS-004).

Fix list for cycle 1: add `lib/turn-timing.mjs` to the copy list (re-run the file to 15/15), validate chunks before dropping, add the two test cases.

## ISSUES-WRITTEN
ISS-BADTURNS-001 (high), ISS-BADTURNS-002 (medium), ISS-BADTURNS-003 (medium), ISS-BADTURNS-004 (low), in qa/issues.badturns.jsonl
