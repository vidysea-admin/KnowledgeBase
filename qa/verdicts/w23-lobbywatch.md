# Verdict: w23-lobbywatch (ISS-LOBBYWATCH-001)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 6c8196398c1e9acdf58e870840824e0a2ea3c217
Base SHA: 3c99337f
Status: PASS (Python admission behaviour). Downstream `assumed` handling is a recorded finding, not blocking.

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
