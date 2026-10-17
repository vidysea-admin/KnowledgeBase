# Verdict: lobbyzt

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- platform_of(): zoom.us.evil.com, evilzoom.us, teams.microsoft.com.attacker.net, zoom.us@evil.com, evil.com/?u=zoom.us, meet.google.com.evil, empty, garbage and malformed URLs all return "other". x.zoom.us, zoom.us:443 and teams.microsoft.com return zoom/zoom/teams.
- classify_admission(): unknown/webex platform with no positive control returns "unknown"; "other" with host-will-let-you-in text returns "lobby"; denied/ended text returns "unknown" even with a leave control. The loop emits "admitted" only on state == "in-call"; the timeout path emits admission_timeout and breaks. Nothing is assumed admitted.
- Meet: classify_admission delegates to the unchanged classify_meet_state; Meet in-call script is the unchanged IN_CALL_JS.
- pytest packages/meeting-bot/py -k "not native_same_host": 363 passed, 7 deselected (255s), one headless Chrome via the fixture tests. No real meeting, no kb-automation-chrome, no port 9333.
- Mutations on sb_join_detect.py (sha1 verified changed, restored, HEAD blob ff0d342b confirmed): host substring match, endswith without dot, denied check removed, lobby no longer beats DOM, "other" assumed in-call, "other" lobby list emptied. Killed 6/6.
- Notes (not filed): selectors/phrases unverified against live Zoom/Teams (manifest says so); trailing-dot hosts such as ZOOM.US. fail safe to "other".

ISSUES-WRITTEN: none
