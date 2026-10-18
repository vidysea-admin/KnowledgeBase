# w23-lobbywatch

Status: ready-for-check
Fix cycle: 0
Issue: ISS-LOBBYWATCH-001 (high). Lane lane/w23-lobbywatch, base 3c99337f.

## Finding
The Zoom/Teams lobby half of ISS-LOBBYWATCH-001 was already fixed by lobbyzt (93b4c65c, checked-PASS). The remaining defect: on every non-Meet platform (Zoom web, Teams, OnAir/cloudonair, Zoho, Webex) a join with no positive in-call DOM signal ended in `admission_timeout` after 900 s, which aborts the join and marks the capture failed ("no recording made") even if the bot was in the call (live Zoom webinar run 2026-10-13 hit this). Per D-167 a false "not admitted" must not abort a successful join.

## Change (Python plus one comment; packages/meeting-bot only)
- sb_join_detect.py: `AdmissionState(lenient=)` and `tick(..., blocked=)`; new `is_blocked_text`. In lenient mode a timeout with no lobby/denied text ever seen yields "assumed" (admitted, not abort). Any blocked tick keeps the timeout strict.
- sb_join_loop.py: lenient for every platform except Meet; emits `admitted` with assumed=True, reason=no-lobby-signal.
- admission-gate.ts: comment only. Meet behaviour unchanged (strict). No contract or policy file touched.
- Tests: test_sb_join_admission.py (1 rewritten), test_sb_join_admission_platforms.py (+8 cases incl. OnAir URL).

## Policy note for Umesh
Non-Meet "no lobby text seen for the whole wait, no in-call signal" is now treated as in-call (D-167 bias). Revert by passing lenient=False.

## Reproductions (D-015)
ISS-LOBBYWATCH-001: 1/1 (Zoom "Please wait, the host will let you in soon": lobby, never admitted, reload suppressed, strict timeout; test_silent_lobby_suppresses_watchdog_reload_and_times_out). Ledger records no numbered corpus. Left open: live selector verification of Zoom/Teams/OnAir/Webex (static fixtures only).

## Evidence
- pytest (fake-driver + pure tests, no browser): 64 passed, 23 deselected. The 23 deselected launch headless Chrome (dom_fixtures, holds_browser) and were NOT run.
- node scripts/lint-loc.mjs --all: OK (10 stages, 0 failed).
- Mutations (D-020, per-mutation backup/trap, restored, hash == post-fix blob): M1 lenient=False: 5 failed; M2 ignore blocked_seen: 10 failed.
- TS not run (comment-only change).
