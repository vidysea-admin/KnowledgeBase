# Verdict — b2-admission-denied
Cycle checked: 0
Verdict: PASS
Checker: /checker Mode A, bound to D:/KnowledgeBase/.worktrees/b2-admission-denied (branch wave/b2-admission-denied)
Base: 85625836 (merge-base with docs/cloud-run-golive verified, equals the manifest's base) · Head checked: 95a22efd (code a2749fd8)
Policy-Version: proportional-verification/2026-11-22.19
TIER: M (dispatched M; floor recompute `tick.mjs --route 85625836..HEAD --root <worktree>` -> `{"floor":null,"dual":false}`; no L trigger in the changed non-test files, no raise). Single check; `Dual check: no` accepted.

## Check plan (step 0)
Signals from the diff: logic changed (Python join loop and classifier, TS gate and controller) -> affected tests plus the falsification floor. No UI, no prompt/LLM output, no data artifact, no security/auth/hook/config change, no persona walk (no spec user type touched; qa/adapter.json absent, default coding adapter). One independent check type only, so no sub-checkers.
SERIAL: no sub-checkers spawned; one test process at a time (about 3 GB free memory, other agents running). The five TS falsification copies ran in parallel after the serial green runs (no Chrome, no shared port).
Step 4c: I read the whole product diff (sb_join_detect.py, sb_join_loop.py, admission-gate.ts, record-commands.ts, the fixture) and the three test diffs.

## Criteria (every one evidenced by my own runs)
| id | Result | Evidence |
|---|---|---|
| B2-C1 | MET | `classify_meet_state` returns "refused" first (sb_join_detect.py:158-168): both apostrophes, wins over `in_call_dom=True`; 7 near-misses stay unknown/in-call. Falsified. |
| B2-C2 | MET | Real headless Chrome ran (120 passed, 0 skipped, so not NOT-MEASURED); the fixture classifies refused through BODY_TEXT_JS plus the Meet in-call script, in_call False. Falsified. |
| B2-C3 | MET | Fake clock, t0=0 and t0=20 (lobby then refusal): one `admission_denied`, `seconds` int within [t0, t0+10], no admitted or timeout, `closed` last; no stop file leaves at event + 45 s (+-3); stop file at +5 s leaves within 5 s. Read sb_join_loop.py:64-70: emit, hold_for_flush, break. Falsified. |
| B2-C4 | MET | Gate returns `admission_denied: ...`, state "failed"; after `admitted` returns undefined and state stays admitted. Falsified. |
| B2-C5 | MET | runRecord with the real 5000 ms poll rejects `^admission_denied`; test asserts wall under 30 s (about 7.1 s observed). Falsified. |
| B2-C6 | MET | Both fixtures present and non-vacuous: (a) zero-byte .webm removed, status failed; (b) non-empty partial byte-equal "partial-media", status failed. Falsified separately (size guard to -1 -> (a) red; guard dropped -> (b) red). |
| B2-C7 | MET | 120 s lobby then admit: one `admitted`, no denied; endless lobby: one `admission_timeout` at limit 300, no denied; zoom x2, teams, zoho: no denied. Four existing suites unchanged and green. Falsified (Meet-only rule dropped -> red). |
| B2-C8 | MET | admitted t=5, phrase from t=20 (with and without the in-call control): no denied, loop still running at t=60, one `closed`. Falsified (guard `not admission.admitted` removed -> red). |
| B2-I1 | MET | ADMISSION_TIMEOUT_S and sb_join_cli.py are not in the diff; default-timeout and CLI tests green. |
| B2-I2 | MET | Only change is a first branch gated on the refusal text; non-Meet branches of `classify_admission` unedited; all existing classification and fixture tests green. |
| B2-I3 | MET | Refusal branch ends in `break`; no click or reload after it; lobby reload suppression untouched; test_watchdog_reload_is_suppressed_in_lobby green. |
| B2-I4 | MET | `admission_timeout` branch, message and FLUSH_GRACE_S not in the diff; its tests green. |
| B2-I5 | MET | `settleDeniedCapture` is called only under `if (admissionDenied)` (record-commands.ts:205), removes only this session's output and only at size 0 (admission-gate.ts:91). Test shows a zero-byte file survives the `admission_timeout` path; falsified with `if (true)`. |

## Commands re-run by me
- `D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest <worktree>/packages/meeting-bot/py/test_sb_join_admission.py <...>/test_sb_join_admission_platforms.py -q` -> 120 passed in 9.79 s.
- `node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts` (cwd packages/meeting-bot) -> tests 43, pass 43, fail 0, skipped 0.
- `tsc --noEmit -p tsconfig.json` (cwd packages/meeting-bot) -> no output.
- Worktree `git status --short` was clean after all runs.

## Capability coverage (falsification in throwaway copies under the session scratchpad, outside the bound root)
Each row is a single-hunk edit to one file named in "What changed". Green-before on the named node in the copy, then red-after; the red came from the named assertion. Copies deleted after unlinking the node_modules and sibling-package junctions (link only); worktree node_modules verified intact.
- B2-C1 `classify_meet_state` refusal test gated on `not in_call_dom` -> 8 passed -> 4 failed (the `True-*` wins-over-control cases).
- B2-C2 fixture h1 "You can't join" -> "You can join" -> 1 passed -> 1 failed (phrase assertion, test_sb_join_admission.py:325).
- B2-C3 `break` removed in sb_join_loop.py -> 4 passed -> 4 failed.
- B2-C4 `if (admitted) return undefined;` removed in admission-gate.ts -> 6 passed -> 1 failed ("an admission_denied after admitted changes nothing").
- B2-C5 `captureFailure ??= gateFailure` removed for denied in record-commands.ts -> green -> red (the run then lasts to `--until` and the test times out).
- B2-C6a `size === 0` -> `=== -1` -> red ("zero-byte files left: [... size 0]"). B2-C6b size guard dropped -> red (files `[]`, the partial deleted).
- B2-C7 `classify_admission` returns refused for every platform -> 4 passed -> 4 failed.
- B2-C8 `not admission.admitted` guard removed -> 2 passed -> 2 failed.
- B2-I5 `if (admissionDenied)` -> `if (true)` -> green -> red (timeout path deletes the zero-byte file).
- B2-I1..I4: manifest records none (unchanged code or structural); accepted, the diff does not touch those lines.
Floor met: one falsification per changed criterion plus the second C6 fixture and I5. No extra mutants.

## Notes (non-blocking, no ledger rows)
- B2-C6a's "zero-byte .webm" is the file the real tab receiver creates before any chunk; the second fixture proves a non-empty partial survives, matching the contract's two-fixture rule.
- Operator steps and the B10 alert mail stay out of scope; go-live G08 cannot pass until B10 lands. Not a finding against this unit.
- The CORE-REQUEST on tab-browser.ts `stop()` (status `stopped` rewritten to `failed` by `settleDeniedCapture`) is a design suggestion, not a defect.
- full-suite trigger: none (no shared-signature change, no L trigger).

ISSUES-WRITTEN: none
PROPOSED-ISSUE: none
HUMAN_GATE-REQUEST: none
Metrics: start=2026-11-25T09:06:00Z end=2026-11-25T09:16:00Z wall_min=10 agent_min=10 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=600 mutants=0 defects_unit=0 defects_6c=0 slow: falsification-copies 6 (CRLF multi-line edits and sibling-package junction setup needed two retries; the C5 row runs to its test timeout)
