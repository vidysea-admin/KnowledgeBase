"""ISS-LOBBYWATCH-001: Zoom-web / Teams-web / unknown-platform admission. Pure + fake-driver loop tests
(no browser); the DOM-fixture cases live in test_sb_join_admission.py next to the Meet ones (one Chrome).
Selectors and phrases are UNVERIFIED against live Zoom/Teams.
Run: .venv python -m pytest packages/meeting-bot/py/test_sb_join_admission_platforms.py
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from sb_join import classify_admission, classify_meet_state, platform_of  # noqa: E402
from test_sb_join_admission import _names, _run  # noqa: E402

ZOOM = "https://us02web.zoom.us/wc/join/123456"
TEAMS = "https://teams.microsoft.com/v2/?meetingjoin=true"
OTHER = "https://events.zoho.com/webinar/1"


def test_platform_of():
    assert platform_of("https://meet.google.com/abc-defg-hij") == "meet"
    assert platform_of(ZOOM) == "zoom" and platform_of("https://zoom.us/j/1") == "zoom"
    assert platform_of(TEAMS) == "teams" and platform_of("https://teams.live.com/meet/1") == "teams"
    for bad in ("https://zoom.us.evil.example/j/1", "https://notzoom.us/j/1", "https://meet.google.com.evil.example/x",
                "https://teams.microsoft.com.evil.example/", OTHER, "", None, "http://[bad"):
        assert platform_of(bad) == "other", bad


@pytest.mark.parametrize("platform,body", [
    ("zoom", "please wait, the meeting host will let you in soon."),
    ("zoom", "please wait, the host will let you in soon"),
    ("zoom", "waiting room"),
    ("teams", "someone in the meeting should let you in soon"),
    ("teams", "when the meeting starts, we'll let people know you're waiting"),
    ("other", "please wait, the host will let you in soon"),
    ("other", "someone in the meeting should let you in soon"),
])
def test_lobby_text_wins_even_if_a_leave_control_renders(platform, body):
    assert classify_admission(platform, True, body) == "lobby"
    assert classify_admission(platform, False, body) == "lobby"


@pytest.mark.parametrize("platform", ["zoom", "teams", "other"])
def test_in_call_needs_a_positive_control_and_no_lobby_or_denied_text(platform):
    assert classify_admission(platform, True, "3 participants") == "in-call"
    assert classify_admission(platform, False, "3 participants") == "unknown"
    assert classify_admission(platform, False, "") == "unknown"
    assert classify_admission(platform, False, None) == "unknown"


@pytest.mark.parametrize("platform", ["zoom", "teams", "other"])
@pytest.mark.parametrize("body", [
    "you have been removed from this meeting", "the host has ended this meeting", "this meeting has ended",
    "your request to join was declined", "you can't join this meeting", "you left the meeting",
])
def test_denied_removed_or_ended_is_never_admitted_even_with_controls(platform, body):
    assert classify_admission(platform, True, body) == "unknown"
    assert classify_admission(platform, False, body) == "unknown"


def test_meet_is_still_delegated_unchanged():
    for dom, body in [(True, "2 participants"), (False, "connecting"), (True, "asking to join"), (False, "ask to join")]:
        assert classify_admission("meet", dom, body) == classify_meet_state(dom, body)


# ---- run_session ------------------------------------------------------------

def _lobby_text(url):
    return "please wait, the meeting host will let you in soon" if "zoom" in url else \
        "someone in the meeting should let you in soon"


@pytest.mark.parametrize("url", [ZOOM, TEAMS])
def test_lobby_then_admitted_emits_admitted_once_with_platform(tmp_path, url):
    def scenario(now):
        return (True, "3 participants") if now - 1000 >= 60 else (False, _lobby_text(url))
    events, _, _, _ = _run(tmp_path, url, scenario, timeout=900, seconds=120)
    names = _names(events)
    assert names.count("admitted") == 1 and "admission_timeout" not in names
    ev = dict(events)["admitted"]
    assert ev["platform"] == platform_of(url) and ev["assumed"] is False


@pytest.mark.parametrize("url", [ZOOM, TEAMS])
def test_silent_lobby_suppresses_watchdog_reload_and_times_out(tmp_path, url):
    events, sb, reload_file, _ = _run(tmp_path, url, lambda now: (False, _lobby_text(url)), timeout=900, seconds=130, reload_at=20)
    names = _names(events)
    assert sb.reloads == 0 and "watchdog-reload" not in names and "watchdog-reload-suppressed" in names
    assert "admitted" not in names and not reload_file.exists()
    (tmp_path / "b").mkdir()
    events, _, _, clock = _run(tmp_path / "b", url, lambda now: (False, _lobby_text(url)), timeout=300, seconds=100000)
    names = _names(events)
    assert clock.now - 1000 < 310 and "admitted" not in names
    assert names.count("admission_timeout") == 1 and names[-1] == "closed"


@pytest.mark.parametrize("url,body", [
    (ZOOM, "you have been removed from this meeting"), (ZOOM, "this meeting has ended"),
    (TEAMS, "your request to join was declined"), (TEAMS, "you were removed from the meeting"),
])
def test_denied_page_is_never_admitted_even_with_a_stale_leave_control(tmp_path, url, body):
    events, _, _, _ = _run(tmp_path, url, lambda now: (True, body), timeout=300, seconds=100000)
    names = _names(events)
    assert "admitted" not in names and names.count("admission_timeout") == 1


def test_unknown_platform_without_a_signal_is_not_admitted_and_times_out(tmp_path):
    events, _, _, clock = _run(tmp_path, OTHER, lambda now: (False, "welcome to the webinar"), timeout=300, seconds=100000)
    names = _names(events)
    assert "admitted" not in names and names.count("admission_timeout") == 1
    assert clock.now - 1000 < 310 and names[-1] == "closed"


def test_unknown_platform_admits_only_on_a_positive_in_call_signal(tmp_path):
    def scenario(now):
        return (True, "welcome") if now - 1000 >= 40 else (False, "welcome")
    events, sb, _, _ = _run(tmp_path, OTHER, scenario, timeout=900, seconds=90)
    names = _names(events)
    assert names.count("admitted") == 1 and dict(events)["admitted"]["platform"] == "other"
    assert dict(events)["admitted"]["assumed"] is False


def test_watchdog_reload_runs_after_zoom_admission(tmp_path):
    events, sb, _, _ = _run(tmp_path, ZOOM, lambda now: (True, "3 participants"), timeout=900, seconds=60, reload_at=20)
    assert sb.reloads >= 1 and "watchdog-reload" in _names(events)
