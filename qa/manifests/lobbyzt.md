# lobbyzt

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Issue: ISS-LOBBYWATCH-001 (high). Lane lane/lobbyzt, code commit 93b4c65c.

## Change (Python only, packages/meeting-bot/py; TS untouched)
- sb_join_detect.py: `platform_of(url)` (meet|zoom|teams|other, exact host match, lookalike hosts -> other) and pure `classify_admission(platform, in_call_dom, body)`; Zoom and Teams lobby/denied phrases and in-call DOM signals (visible controls); lobby text beats a leave control.
- sb_join_scripts.py: per-platform in-call DOM probes. sb_join_loop.py: same admitted / admission_timeout / reload-suppressed flow as Meet for Zoom and Teams. Unknown platforms are no longer assumed admitted (the `assumed:true` first-tick path is removed).
- Fixtures: zoom_lobby/incall/incall_hidden/denied/ended_with_controls, teams_lobby/incall/denied, other_incall/nosignal.
- Selectors/phrases UNVERIFIED against live Zoom/Teams (static fixtures only).

## Reproductions (D-015, ISS-LOBBYWATCH-001 records one reproduction, no numbered corpus)
- ISS-LOBBYWATCH-001: 1/1. The Zoom waiting-room text "Please wait, the host will let you in soon" now classifies as lobby (no admitted event, reload suppressed); previously admitted on first tick.
- Teams lobby fixture: lobby, not admitted. 1/1 (added).

## Evidence
```
pytest py/test_sb_join_admission_platforms.py py/test_sb_join_admission.py   70 passed
pytest packages/meeting-bot/py -k "not native_same_host"                     363 passed, 7 deselected
```
Fixture tests run static HTML in one headless Chrome (same as the Meet cycle); no real meeting joined.
TS admission-gate.test.ts could not run in this lane: "Cannot find package 'tsx'" (environment gap, junction missing); no TS file changed vs the Meet commit.
Mutation run: not performed this cycle.

## Limits
Webex not covered (unknown -> never assumed admitted, times out). Native Zoom client path not covered.
