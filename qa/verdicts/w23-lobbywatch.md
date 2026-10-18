# Verdict: w23-lobbywatch (ISS-LOBBYWATCH-001)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 82451aa5d2e49b8c0ffc8a6d02e0ccb6998099a3
Base SHA: 3c99337f
Cycle 0 reviewed SHA: 6c8196398c1e9acdf58e870840824e0a2ea3c217 (PASS, superseded below)

## Cycle 1 (re-check of F1 and F2)
- F2 verified: sb_join_loop.py:64 `blocked=state == "lobby" or bool(ended) or is_blocked_text(body)`. `ended` is the END_PHRASES match computed earlier in the same pass, so it is sticky through `blocked_seen`. New platforms test passes.
- F1 verified in the diff: admission-gate.ts `admission` getter (`{assumed, reason}`); telegram-alerts.ts `notifyJoined(..., {assumed})` prints "Joined (assumed: no lobby signal)"; record-finalize.ts writes `source.json` `admission` plus `captureDegraded = assumed && silent`, and the silent error carries "[degraded: admission was only assumed ...]". record-commands.ts passes `gate.admission` into both the native and the ordinary finalize call. Audible assumed audio still succeeds with `captureDegraded: false`.
- pytest, fake driver, `-k "not dom_fixtures"`, timeout 600: 68 passed, 22 deselected, exit 0.
- TS, timeout 600: node --test admission-gate, telegram-alerts and record-commands tests: 64 pass, 0 fail, exit 0. `tsc --noEmit -p tsconfig.json`: exit 0.
- Mutations (per-mutation byte backup, trap, timeout 600, restored; `git -c core.autocrlf=true hash-object` == HEAD blob 17060e9e for record-commands.ts):
  - M1 drop `{assumed}` from `notifyJoined` in record-commands.ts: record-commands and admission-gate tests 32 pass, 0 fail. SURVIVES.
  - M2 drop `gate.admission` from the ordinary finalize call: record-commands tests 22 pass, 0 fail. SURVIVES.
- Lane tree clean after mutations.

### Cycle 1 findings (low, not blocking)
L1: no test covers the `notifyJoined` assumed wiring in record-commands.ts:123 (M1 survives). The notifier text itself and the gate getter are unit-tested.
L2: no runRecord-level test covers `gate.admission` reaching finalize (M2 survives). The finalize side (degraded flag, source.json) and the gate getter are each tested. Suggested test: a runRecord test that injects an `admitted assumed:true` event and asserts the injected `inject.finalize` receives the admission as its 12th argument.
F1 and F2 from cycle 0: resolved.

ISSUES-WRITTEN: none. Ledger: ISS-LOBBYWATCH-001 may flip to verified.

## Superseded history: cycle 0 (PASS at 6c819639, now superseded by cycle 1)

Cycle 0 result: PASS
Cycle 0 cycle: 0
Cycle 0 SHA: 6c8196398c1e9acdf58e870840824e0a2ea3c217
Base SHA: 3c99337f
Cycle 0 status: PASS (Python admission behaviour). Downstream `assumed` handling is a recorded finding, not blocking.

## Verified independently
1. Sticky flag: `AdmissionState.blocked_seen` is set on any blocked tick and never cleared (sb_join_detect.py). The loop calls tick every pass with `blocked = state == "lobby" or is_blocked_text(body)`. Own mutation (non-sticky: `blocked_seen = bool(blocked)`) -> 4 failed, 61 passed: lobby-once x2 (zoho, cloudonair), denied-once, lenient unit. Restored; cmp OK; `git -c core.autocrlf=true hash-object` == HEAD blob for sb_join_detect.py (ebe3f7b0...) and sb_join_loop.py (059654e2...). Backup + trap (EXIT/INT/TERM/ERR) + timeout 600, per mutation.
2. Ended/denied after admission: once admitted, tick returns None, so no regression. `ended` event is still emitted every pass and record-commands.ts:124 records endedAt. Unchanged by this diff. No dedicated assumed-then-ended test (note only).
3. Meet: strict by default (`lenient=platform != "meet"`); the `blocked` kwarg only records; events identical. admission-gate.ts is comment only. `test_meet_stays_strict_without_a_signal` passes.
4. D-015: the ledger records no numbered corpus; the one recorded scenario (Zoom silent lobby, reload suppressed, strict timeout) passes.
5. pytest, fake driver, no browser, `-k "not dom_fixtures"`, timeout 600, venv KnowledgeBase/.venv (system python has no pytest): 65 passed, 22 deselected (sb_browser Chrome tests), exit 0. Maker said 64/23; the one-test difference was not investigated and is not a failure.
6. w21-integrate `git status --porcelain`: empty (clean). Lane tree clean.

## Findings (nothing blocks PASS)
F1 (medium, D-167 follow-up): `assumed` is not consumed downstream except capture-slot-readiness.ts:107, which correctly refuses to count assumed as admitted. admission-gate.ts:25-28 sets admitted=true / state "admitted" and starts the watchdog, ignoring `assumed`. record-commands.ts:123 sends Telegram "joined" on any `admitted`. So an assumed capture with no audio is shown as admitted/joined and is only distinguishable via the silence watchdog alert and the readiness receipt. Fix: store `assumed` in the gate (`gate.assumed`), pass it to `notifyJoined` ("joined (unconfirmed)"), and carry it into capture metadata. TS not run; not verified.
F2 (low): `is_blocked_text` uses DENIED_PHRASES only, not END_PHRASES. "webinar has ended" / "thank you for attending" seen during the wait does not make the timeout strict, so an ended webinar can be assumed admitted. Fix: `or any(p in body for p in END_PHRASES)` in the loop's blocked argument.

## Not verified
Headless Chrome DOM fixtures, live Zoom/Teams/OnAir selectors, TS tests, lint-loc.

## Ledger
ISS-LOBBYWATCH-001 may flip to verified for the abort-on-timeout defect. F1 and F2 should be filed as follow-ups.
ISSUES-WRITTEN: none (F1/F2 left for the orchestrator).
