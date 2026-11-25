# Manifest — b2-admission-denied
**Contract:** qa/contracts/meeting-bot-admission-denied.md at 856258361d20903655360a3c8272eb41c3ad67b3 (criteria and invariants on the Criteria line below); decision D-232
**Goal task:** none
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
dual-note: no dual-trigger applies. `tick.mjs --route 85625836..a2749fd8` -> `{"floor":null,"dual":false,"rules_fired":[]}`. No auth, tenancy, production-data write or secret path is touched; the only deletion is this session's own zero-byte recording file on the refusal path.
**Persona walk:** skip (no screen, flow or user type changed; bot event plumbing only)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** a small, fully specified unit with a precise D-232 and contract; no external executor was worthy.

## What changed
Branch `wave/b2-admission-denied` off `856258361d20903655360a3c8272eb41c3ad67b3`; code and tests at `a2749fd8` (one commit); this manifest is the second commit.
- packages/meeting-bot/py/sb_join_detect.py:134-138 — new `REFUSED_PHRASES` ("you can't join this video call", straight and U+2019 apostrophe). `classify_meet_state` (:158-168) returns `"refused"` first, before lobby and in-call. `classify_admission` is unchanged: only its Meet branch reaches `classify_meet_state`, so Zoom, Teams and other URLs never see the new state. Docstrings updated.
- packages/meeting-bot/py/sb_join_loop.py:60-66 — after `classify_admission`, `state == "refused" and not admission.admitted` emits ONE `admission_denied` with `seconds=int(now - started)`, sets `hold_for_flush`, and `break`s. The loop then takes the existing flush-grace path (<= `FLUSH_GRACE_S` 45 s, or until the stop file) and emits `closed`. No click and no reload follows (the lobby reload suppression is untouched). After `admitted` the phrase is ignored (B2-C8).
- packages/meeting-bot/src/capture/admission-gate.ts — `admission_denied` case in `decide` returns `admission_denied: Google Meet refused the bot (...); no recording made`, sets a `denied` flag (state "failed"), and is a no-op once `admitted`. New exported `settleDeniedCapture(output, failure)`: removes THIS session's recording file only when it is zero bytes, then re-marks the session's `.status.json` as `failed` through the existing `writeOwnedTabStatus`, identity read from the file's own identity keys (best effort, silent). Placed here, not in record-commands.ts, because record-commands.ts is at the 300-line LOC budget (300 of 300 non-blank).
- packages/meeting-bot/src/capture/record-commands.ts:128-129,193 — `onEvent` sets `admissionDenied` and `captureFailure` on a gate failure for `admission_denied`; the stop `try/catch` gained `finally { if (admissionDenied) settleDeniedCapture(...) }`. Net 0 added non-blank lines of structure; file stays 300/300.
- packages/meeting-bot/py/fixtures/meet_refused.html (new, the one fixture D-232 allows) — the refusal text, no call controls (D-225).
- packages/meeting-bot/py/test_sb_join_admission.py, src/capture/admission-gate.test.ts, src/capture/admission-status.test.ts — new tests (names below). The fake join script in admission-gate.test.ts gained `denied`, `denied-empty` and `timeout-empty` scenarios and a longer give-up for `denied*`; existing scenarios and tests are byte-for-byte unchanged in behaviour.
- falsified (unchanged): none. All falsifications ran in a throwaway detached worktree (`b2-admission-denied-mut`, since removed); each mutated file was restored from a per-mutation byte backup and its `git hash-object` equals `git rev-parse HEAD:<file>` (checked).
- Interpretation (C6a): the "zero-byte .webm" is the file the real tab receiver creates at startup (`openSync(output, "wx")`) before any chunk arrives; the fake bot posts no chunk. The cleanup removes only the session's own output file, never other files in the record directory (B2-I5, D-232).

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: M (multi-file behaviour: Python join loop plus the TS gate and controller; no L trigger, route floor null)
Round: 8 files (4 code, 3 test, 1 fixture), 13 criteria and invariants checkable here, est 45 min
slow-plan: each refusal end-to-end run uses runRecord's real 5000 ms poll (7-8 s) and the falsifications run the real tab receiver; one builder, one test process at a time because another agent was running a large suite on the same laptop
Criteria: `B2-C1`, `B2-C2`, `B2-C3`, `B2-C4`, `B2-C5`, `B2-C6`, `B2-C7`, `B2-C8`, `B2-I1`, `B2-I2`, `B2-I3`, `B2-I4`, `B2-I5`
Owners: python-join (py/sb_join_detect.py, py/sb_join_loop.py, fixture, test_sb_join_admission.py), ts-gate (admission-gate.ts, record-commands.ts, the two TS test files)
Fan-out: one builder for both groups; SERIAL: ts-gate waits on nothing but one builder owns both and the laptop was running another agent's large suite, so one test process at a time.
Base / checked state: base 85625836; head a2749fd8 (code); worktree clean apart from this manifest.
Gate answers: none; consent is out of scope (D-210); no production write, no push, no deploy, no network service, no real meeting, no browser session against Google.
Affected tests / full-suite trigger: the four suites the contract names. No shared type or export changed except one new export (`settleDeniedCapture`) and an extra literal in a `classify_meet_state` return. The builder ran no full suite.
Tests[B2-C1]: packages/meeting-bot/py/test_sb_join_admission.py::test_b2_c1_refusal_text_classifies_refused_and_wins_over_in_call_control — pure string cases that cover the new classifier state (8 cases: both apostrophes, with and without an in-call control, embedded in other text), test_b2_c1_near_miss_is_not_refused (7 near-misses incl. "you can join this video call" and the phrase without "video call"), test_b2_c1_refusal_never_classifies_refused_on_other_platforms
Tests[B2-C2]: packages/meeting-bot/py/test_sb_join_admission.py::test_b2_c2_saved_refusal_page_classifies_refused_in_chrome, test_dom_fixtures_lobby_vs_in_call[meet_refused.html-refused] — they run the new fixture through the real body-text and in-call scripts (headless Chrome, module-scoped, local fixture server, no network; a missing Chrome would fail the module fixture, which the checker reads as NOT-MEASURED)
Tests[B2-C3]: packages/meeting-bot/py/test_sb_join_admission.py::test_b2_c3_refusal_emits_one_admission_denied_with_seconds_and_closes[0|20], test_b2_c3_stop_file_five_seconds_after_the_event_ends_the_loop_within_five_seconds[0|20] — they drive the changed join loop on the fake clock (refusal from t=0; lobby 20 s then refusal; one event, `seconds` int, within 10 s of first sight, `closed` last, flush grace held, stop file 5 s after leaves within 5 s)
Tests[B2-C4]: src/capture/admission-gate.test.ts::"gate: admission_denied is a typed, readable failure (B2-C4)"; src/capture/admission-status.test.ts::"gate (B2-C4): admission_denied is a typed failure before admission and sets state failed", "gate (B2-C4): an admission_denied after admitted changes nothing" — they drive the new gate case directly, before and after admission
Tests[B2-C5]: src/capture/admission-gate.test.ts::"runRecord: admission_denied fails the capture with a typed message in under 30 s (B2-C5)" — it drives the changed controller path end to end (real tab receiver, fake join script, runRecord's own 5000 ms poll, wall time asserted < 30000 ms; observed about 7 s)
Tests[B2-C6]: src/capture/admission-gate.test.ts::"runRecord: refusal with a ZERO-byte recording leaves no zero-byte .webm; status failed (B2-C6a)" and "runRecord: refusal with a NON-EMPTY partial keeps it byte-equal; status failed (B2-C6b)" — they cover the new cleanup helper on both fixtures (the partial is compared to the exact posted bytes "partial-media"; status file state is `failed` in both)
Tests[B2-C7]: packages/meeting-bot/py/test_sb_join_admission.py::test_b2_c7_lobby_of_120s_then_admitted_emits_admitted_once_and_no_denied, test_b2_c7_endless_lobby_emits_exactly_one_timeout_at_the_limit_and_no_denied, test_b2_c7_refusal_text_on_a_non_meet_url_does_not_emit_admission_denied[zoom x2|teams|zoho] — they cover the loop's lobby, admit and timeout paths and the Meet-only rule; and the four existing suites unchanged (all green, see Pre-check)
Tests[B2-C8]: packages/meeting-bot/py/test_sb_join_admission.py::test_b2_c8_refusal_phrase_after_admission_never_ends_a_live_capture[True|False] (admitted t=5, phrase from t=20 with the in-call control still visible, and with it gone; loop still running at t=60, one `closed` at the end, no `admission_denied`); plus the gate no-op test under B2-C4 — they cover the one guard that keeps a live capture alive
Tests[B2-I1]: packages/meeting-bot/py/test_sb_join_admission.py::test_default_timeout_is_15_minutes, test_cli_flag_default_and_override — existing, unchanged, green; they pin the 900 s default and the CLI override, which this diff does not touch
Tests[B2-I2]: packages/meeting-bot/py/test_sb_join_admission.py and packages/meeting-bot/py/test_sb_join_admission_platforms.py existing lobby/in-call/zoom/teams/other classification and fixture tests — they pin every non-refusal classification (all green, unchanged); the diff adds one branch that fires only on the refusal text; `classify_admission` is unedited
Tests[B2-I3]: packages/meeting-bot/py/test_sb_join_admission.py::test_watchdog_reload_is_suppressed_in_lobby — existing, still green; structural otherwise: the refusal branch emits and `break`s, so no click or reload follows, and the lobby reload suppression lines are unedited
Tests[B2-I4]: packages/meeting-bot/py/test_sb_join_admission.py::test_admission_timeout_emits_typed_event_and_exits_cleanly, test_admission_timeout_holds_browser_until_stop_file_so_the_recorder_can_flush, src/capture/admission-gate.test.ts::"gate: admission_timeout is a typed, readable failure", "runRecord: admission_timeout fails ..." — existing, unchanged, green, they pin the timeout event, message and flush grace; the `admission_timeout` branch, message and `FLUSH_GRACE_S` are not edited
Tests[B2-I5]: src/capture/admission-gate.test.ts::"runRecord: a zero-byte recording is NOT removed on the admission_timeout path (B2-I5)" — new; it shows the cleanup is limited to the refusal path; B2-C6b shows a non-empty partial survives it byte-equal; `settleDeniedCapture` is called only under `if (admissionDenied)`
Sibling: packages/meeting-bot/src/capture/record-finalize.ts and workspace/finalize-workspace-recording.ts import `admission-gate.js` — not affected: only an added export; their typecheck is clean (`tsc --noEmit -p packages/meeting-bot/tsconfig.json`, no output).
Pre-check[B2-C1]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-C2]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-C3]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-C4]: a2749fd8 node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts -> 43 passed, 0 failed (cwd packages/meeting-bot) t=60 blobs=src/capture/admission-gate.test.ts:659066c,src/capture/admission-status.test.ts:2ba21e3
Pre-check[B2-C5]: a2749fd8 node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts -> 43 passed, 0 failed (cwd packages/meeting-bot) t=60 blobs=src/capture/admission-gate.test.ts:659066c
Pre-check[B2-C6]: a2749fd8 node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts -> 43 passed, 0 failed (cwd packages/meeting-bot) t=60 blobs=src/capture/admission-gate.test.ts:659066c
Pre-check[B2-C7]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-C8]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-I1]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-I2]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-I3]: a2749fd8 D:/KnowledgeBase/.venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py -q -> 120 passed, 0 failed (cwd worktree root) t=8 blobs=packages/meeting-bot/py/test_sb_join_admission.py:53626b6
Pre-check[B2-I4]: a2749fd8 node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts -> 43 passed, 0 failed (cwd packages/meeting-bot) t=60 blobs=src/capture/admission-gate.test.ts:659066c
Pre-check[B2-I5]: a2749fd8 node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts -> 43 passed, 0 failed (cwd packages/meeting-bot) t=60 blobs=src/capture/admission-gate.test.ts:659066c
Falsification[B2-C1]: copy-mutant `classify_meet_state` refused check made `not in_call_dom and ...` (in-call control wins) -> 5 failed: test_b2_c1_..._wins_over_in_call_control[True-*] x4 and test_b2_c2 (green before 120/0, restored, hash equals HEAD)
Falsification[B2-C2]: copy-mutant fixture text "You can't join" -> "You can join this video call" -> 2 failed: test_b2_c2_saved_refusal_page_classifies_refused_in_chrome and test_dom_fixtures_lobby_vs_in_call[meet_refused.html-refused]
Falsification[B2-C3]: copy-mutant removed the `break` after the emit -> 4 failed: test_b2_c3_refusal_emits_one_admission_denied_with_seconds_and_closes[0|20], test_b2_c3_stop_file_five_seconds_after_the_event_ends_the_loop_within_five_seconds[0|20] (events repeat every tick)
Falsification[B2-C4]: copy-mutant removed the `if (admitted) return undefined;` guard in the gate -> 1 failed: "gate (B2-C4): an admission_denied after admitted changes nothing" (pass 20 / fail 1 of 21)
Falsification[B2-C5]: copy-mutant removed `captureFailure ??= gateFailure` for `admission_denied` in record-commands.ts (the run then lasts to `--until`) -> "runRecord: admission_denied fails the capture with a typed message in under 30 s (B2-C5)" red (60 s test timeout; run with `--test-timeout=25000 --test-name-pattern=B2-C5`)
Falsification[B2-C6]: two copy-mutants. (a) `size === 0` -> `size === -1` (zero-byte never removed) -> 1 failed: B2-C6a. (b) the size guard dropped, so every refusal file is deleted -> 1 failed: B2-C6b (a non-empty partial deleted). A third, status written as "stopped" instead of "failed" -> 2 failed: B2-C6a and B2-C6b.
Falsification[B2-C7]: copy-mutant `classify_admission` returns "refused" on the refusal text for every platform (Meet-only rule dropped) -> 5 failed: test_b2_c1_refusal_never_classifies_refused_on_other_platforms and test_b2_c7_refusal_text_on_a_non_meet_url_does_not_emit_admission_denied[zoom x2|teams|zoho]
Falsification[B2-C8]: copy-mutant `if state == "refused":` (the `not admission.admitted` guard removed) -> 2 failed: test_b2_c8_refusal_phrase_after_admission_never_ends_a_live_capture[True|False]
Falsification[B2-I5]: copy-mutant `if (admissionDenied)` -> `if (true)` before `settleDeniedCapture` -> 1 failed: "runRecord: a zero-byte recording is NOT removed on the admission_timeout path (B2-I5)"
Falsification[B2-I1]: none — invariant of unchanged code (`ADMISSION_TIMEOUT_S`, `sb_join_cli.py` are not in the diff; `git diff 85625836 HEAD --stat` lists neither)
Falsification[B2-I2]: none — invariant of a branch that fires only on the refusal text; the existing classification tests are the discriminator and stay green
Falsification[B2-I3]: none — structural: the refusal branch ends with `break`; no click or reload code follows on that path
Falsification[B2-I4]: none — the `admission_timeout` branch, its message and `FLUSH_GRACE_S` are not in the diff
CORE-REQUEST: packages/meeting-bot/src/capture/tab-browser.ts — `stop()` (:278) writes the status file as `stopped` whenever the recorder itself reported a clean stop, so a controller-detected failure (`admission_denied`, and today `admission_timeout`) is shown as `stopped` until `settleDeniedCapture` rewrites it. A cleaner fix is a way for the controller to hand `stop()` a failure reason. Not needed for this unit: B2-C6 is met inside the authorized files by rewriting the status after `stop()`. Raise only if the checker prefers the backend to own it.
CORE-REQUEST: scripts/webinar/run-pipeline-deps.mjs and scripts/webinar/scheduler/lifecycle-alerts.mjs — unit B10 (the `admission_denied` alert mail, REASONS set :11-14). Out of this unit by instruction; go-live row G08 ("one alert mail") cannot pass until B10 lands.
mutant-cap-raise: the falsification floor is one named mutant per changed criterion (8 criteria) plus the second C6 fixture, the C6 status check and the I5 path limit; each mutant is one line and runs in seconds
Metrics: start=2026-11-25T08:00:00Z end=2026-11-25T09:05:00Z wall_min=65 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=1 mutations=11 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=11 defects_unit=0 defects_6c=0

## How to verify (commands + expected)
- `python -m pytest test_sb_join_admission.py test_sb_join_admission_platforms.py -q` (cwd `packages/meeting-bot/py`, `D:/KnowledgeBase/.venv/Scripts/python.exe`) -> expected: 120 passed
- `node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts` (cwd `packages/meeting-bot`) -> expected: 43 pass, 0 fail (the refusal runs take about 7-8 s each: runRecord's real 5000 ms poll)
- `tsc --noEmit -p tsconfig.json` (cwd `packages/meeting-bot`) -> expected: no output

## Actual outputs (from maker's own run)
On a2749fd8:
```
pytest (2 files)                       : 120 passed in 12.31s
node --test (3 files)                  : ℹ tests 43  ℹ pass 43  ℹ fail 0
tsc --noEmit -p packages/meeting-bot   : no output
```
Red before the code (test-first): with only the tests written, `pytest -k b2` gave 13 failed (C1 x8, C2, C3 x4), 16 passed (the C7 and C8 guards, which must stay green); the TS gate tests failed on `actual: ''` (no message) and the C6 tests failed on the zero-byte file and `stopped` status.

## Capability coverage (each new claim -> its isolating falsification)
See the `Falsification[<id>]` lines above. Baselines before the edits: pytest 120 passed; TS gate+status 21 pass / 0 fail. Every restore verified: `git hash-object` equals `git rev-parse HEAD:<file>` for each mutated file, and the throwaway worktree showed no diff afterwards.

## Live browser evidence
Not UI-touching. No browser session against Google and no real meeting was run; the headless Chrome in B2-C2 serves a local static fixture only.

## Flags for the coordinator and checker
- **The 5000 ms controller poll is the dominant latency.** From the Python event to the thrown failure is at most one poll (about 5 s) plus the stop. The measured end-to-end wall time in B2-C5 is about 7 s, well inside 30 s. The Python side leaves within 45 s of the event unless the controller writes the stop file sooner, which it does in `joiner.stop`.
- **Refusal wins over a visible in-call control, before admission only.** B2-C1 asks the classifier to say `refused` whenever the text is there; B2-C8 is enforced in the loop (`not admission.admitted`), not in the pure classifier.
- **Not measured here (operator steps, contract "Out of scope"):** a host really refusing the bot on the hosted recorder, the bucket holding no zero-byte file for that session, and the alert mail (B10).
- **The U+2019 spelling is unverified live.** The saved fixture uses the straight apostrophe; the pure tests cover both. Whichever Meet renders, both match.

## Status: ready-for-check
