# Verdict: veto003 (ISS-T037VETO-003, ruling 2)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 5146fb2550f5f57935f68c246976f3bd324878b6
Base: 9e55b642 (lane lane/w17-veto003)
ISSUES-WRITTEN: none

## Independently verified
1. Fail-closed unchanged: `applyJoinRules` still returns `rules-unevaluable` skips for every item (join-rules-select.ts veto()); logging only added after the loop. D-166 last-valid path (`boundedRules`, `loadLastValidJoinRules`) untouched in the diff.
2. Flag default OFF: `parseJoinRulesEnforce` unchanged; the new test asserts undefined/null/""/off/true/1/garbage parse to off, selection returned by reference, store never loaded, no events.
3. Throw safety: the log call sits in its own inner try/catch inside the outer try (select.ts ~L132-134), after the veto loop, so a throwing sink cannot change `kept`/`removed`. `degraded()` wraps `onDegraded` in try/catch (enforce.ts ~L128-132). New `else await degraded(...)` is therefore also safe in fail-closed/fail-open (readOnly and absent onDegraded skip it).
4. Sanitisation: control chars stripped, Windows and POSIX paths replaced by `<path>`, capped at 300 chars. Message content comes from JoinRuleSetValidationError (field paths, unknown field names, rule ids, platform list) - no raw rule bodies. Note: user-chosen rule ids and unknown-field names are echoed (capped); no secret-pattern redaction beyond paths.
5. Once per tick: schedule-tick.ts calls `enforceJoinRules` once per tick, which calls `applyJoinRules` once; log is guarded by a single `invalid` flag, asserted by tests (1 log for 2 items). scheduled-dispatch.ts calls enforce per dispatched item with `readOnly:true` and a constant log string, so neither a message nor an alert is emitted there.
6. D-015: ISS-T037VETO-003 recorded reproductions (rule sets {version:2,..}, null, {}, [], "str"; states null, {}) replayed verbatim in the new test: 7/7 remove all items, 1 log each. No recorded reproduction left open.
7. Runs (from packages/meeting-bot, node --test --test-force-exit --import tsx, timeout 600; exit codes in lane .checker-tmp/*.exit): veto003 7/7 exit 0; select 11/11 exit 0; enforce 18/18 exit 0; last-valid-enforce 9/9 exit 0; schedule-tick-rules-integration 4/4 exit 0; tsc --noEmit exit 0.
8. D-020 mutations (script .checker-tmp/mut.sh: per-mutation byte backup, trap EXIT/INT/TERM/ERR, timeout 300, pre- and post- `git hash-object` == `git rev-parse HEAD:<file>` e3e386b8..., cmp ok):
   - M1 remove the log call: KILLED (4 failed: reproductions, sanitised line, enforce fail-closed, enforce last-valid).
   - M2 catch around log returns unfiltered selection: KILLED (1 failed: "a throwing log sink never widens access").
   Final HEAD fidelity of join-rules-select.ts and join-rules-enforce.ts confirmed.

## Findings (non-blocking)
- join-rules-enforce.ts was committed with CRLF line endings; base blob is LF. `git diff` shows 457 lines changed, the real change is 3 lines (`git diff -w`). Fix before or at merge: convert the file back to LF (e.g. `sed -i 's/\r$//'`) and amend/recommit so blame and cross-lane merges on this file stay clean. Not a behavioural defect.
- No test covers a throwing `onDegraded` directly in enforce; covered by code reading (`degraded()` try/catch) and the pre-existing enforce tests only.
- Evaluator-throw (valid rules, evaluator throws) raises the alert and enforce's own warn but emits no validation-message log; acceptable since there is no validation error to report.

## Ledger
ISS-T037VETO-003 may be flipped open -> verified (ruling 2 satisfied; flag stays OFF). Evidence not covered: no live-tenant run, no full suites (per rules).
