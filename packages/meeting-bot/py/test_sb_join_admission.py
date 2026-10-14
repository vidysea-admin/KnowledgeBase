"""ISS-CAPTUREFIX-001: Meet admission signal. Pure state-machine and fake-driver loop tests (no browser),
plus ONE headless Chrome (module-scoped) running IN_CALL_JS over static HTML fixtures.
Run: .venv python -m pytest packages/meeting-bot/py/test_sb_join_admission.py
"""
import http.server
import os
import sys
import threading
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import sb_join  # noqa: E402,F401
from sb_join import (  # noqa: E402
    ADMISSION_TIMEOUT_S, AdmissionState, IN_CALL_JS, IN_CALL_JS_BY_PLATFORM, BODY_TEXT_JS, CLICK_JS, classify_admission,
    classify_meet_state, is_meet_url, platform_of)
from sb_join_detect import FLUSH_GRACE_S  # noqa: E402
from sb_join_loop import run_session  # noqa: E402

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
MEET = "https://meet.google.com/abc-defg-hij"


# ---- pure ----------------------------------------------------------------

def test_default_timeout_is_15_minutes():
    assert ADMISSION_TIMEOUT_S == 900


def test_is_meet_url():
    assert is_meet_url(MEET)
    assert not is_meet_url("https://zoom.us/j/123")
    assert not is_meet_url("https://meet.google.com.evil.example/x")
    assert not is_meet_url(None)


@pytest.mark.parametrize("body", [
    "asking to join... someone in the call will let you in soon",
    "ready to join? ask to join",
    "waiting for someone to let you in",
])
def test_lobby_text_wins_even_if_leave_control_renders(body):
    assert classify_meet_state(True, body) == "lobby"
    assert classify_meet_state(False, body) == "lobby"


def test_in_call_needs_the_controls_bar():
    assert classify_meet_state(True, "2 participants") == "in-call"
    assert classify_meet_state(False, "connecting") == "unknown"


def test_admission_state_emits_once_and_times_out_once():
    s = AdmissionState(started=0, timeout_s=100)
    assert s.tick(False, 50) is None
    assert s.tick(False, 100) is None  # not strictly past
    assert s.tick(False, 101) == "timeout"
    assert s.tick(False, 500) is None
    s = AdmissionState(started=0, timeout_s=100)
    assert s.tick(True, 10) == "admitted"
    assert s.tick(True, 11) is None
    assert s.tick(False, 9999) is None  # admitted stays admitted, never times out


def test_zero_timeout_never_times_out():
    s = AdmissionState(started=0, timeout_s=0)
    assert s.tick(False, 10**9) is None


# ---- run_session with a fake driver ---------------------------------------

class _Clock:
    def __init__(self, on_sleep=None):
        self.now = 1000.0
        self.on_sleep = on_sleep

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s
        if self.on_sleep:
            self.on_sleep(self)


class _Driver:
    window_handles = ["w"]
    current_window_handle = "w"


class _SB:
    def __init__(self, url, scenario):
        self.driver = _Driver()
        self.url = url
        self.scenario = scenario  # fn(now) -> (in_call_dom, body)
        self.clock = None
        self.reloads = 0

    def execute_script(self, script, *args):
        if any(script is j for j in IN_CALL_JS_BY_PLATFORM.values()):
            return self.scenario(self.clock.now)[0]
        if script is BODY_TEXT_JS:
            return self.scenario(self.clock.now)[1]
        if script is CLICK_JS:
            return None
        if "navigator.onLine" in script:
            return True
        if script.startswith("return document.title"):
            return "LKB"
        return None

    def get_current_url(self):
        return self.url

    def uc_open_with_reconnect(self, url, n):
        self.reloads += 1


def _run(tmp_path, url, scenario, *, timeout, seconds, reload_at=None):
    stop = tmp_path / "stop"
    reload_file = tmp_path / "reload"
    a = SimpleNamespace(url=url, title="LKB", stop_file=str(stop), reload_file=str(reload_file),
                        no_click=True, admission_timeout=timeout)
    events = []
    dropped = []

    def on_sleep(clock):
        if reload_at is not None and not dropped and clock.now - 1000 >= reload_at:
            dropped.append(1)  # the Node watchdog drops the sentinel once
            reload_file.write_text("x")
        if clock.now - 1000 >= seconds:
            stop.write_text("x")

    clock = _Clock(on_sleep)
    sb = _SB(url, scenario)
    sb.clock = clock
    run_session(sb, a, os=os, time=clock, emit=lambda e, **kw: events.append((e, kw)))
    return events, sb, reload_file, clock


def _names(events):
    return [e for e, _ in events]


def _lobby(now):
    return (False, "asking to join... someone will let you in")


def test_lobby_then_admitted_emits_admitted_once(tmp_path):
    def scenario(now):
        return (True, "2 participants") if now - 1000 >= 60 else (False, "asking to join...")
    events, _, _, _clock = _run(tmp_path, MEET, scenario, timeout=900, seconds=120)
    names = _names(events)
    assert names.count("admitted") == 1
    assert "admission_timeout" not in names
    assert names[-1] == "closed"


def test_admission_timeout_emits_typed_event_and_exits_cleanly(tmp_path):
    events, _, _, clock = _run(tmp_path, MEET, _lobby, timeout=300, seconds=100000)
    assert clock.now - 1000 < 310 + FLUSH_GRACE_S, "loop must exit at the timeout (plus the bounded flush grace), not keep holding the lobby"
    assert clock.now - 1000 >= 300 + FLUSH_GRACE_S - 3, "browser must stay open for the controller's flush grace"
    names = _names(events)
    assert "admitted" not in names
    assert names.count("admission_timeout") == 1
    assert dict(events)["admission_timeout"]["limit"] == 300
    assert names[-1] == "closed"  # clean exit path, not a fatal


def test_watchdog_reload_is_suppressed_in_lobby(tmp_path):
    events, sb, reload_file, _clock = _run(tmp_path, MEET, _lobby, timeout=900, seconds=130, reload_at=20)
    names = _names(events)
    assert sb.reloads == 0
    assert "watchdog-reload" not in names and "watchdog-reload-suppressed" in names
    assert not reload_file.exists()  # sentinel consumed so it cannot fire later in the call


def test_watchdog_reload_still_happens_after_admission(tmp_path):
    events, sb, _, _clock = _run(tmp_path, MEET, lambda now: (True, "2 participants"), timeout=900, seconds=60, reload_at=20)
    assert sb.reloads >= 1 and "watchdog-reload" in _names(events)


def test_non_meet_platform_is_no_longer_assumed_admitted(tmp_path):
    # ISS-LOBBYWATCH-001: this used to assert admitted-at-once (assumed=True) for a zoom URL.
    events, _, _, _clock = _run(tmp_path, "https://zoom.us/j/1", lambda now: (False, "welcome to the webinar"),
                                timeout=10, seconds=200)
    names = _names(events)
    assert "admitted" not in names and names.count("admission_timeout") == 1


def test_cli_flag_default_and_override():
    from sb_join_cli import parse_args
    argv = sys.argv
    try:
        sys.argv = ["x", MEET, "--profile", "p", "--title", "t", "--stop-file", "s"]
        assert parse_args().admission_timeout == 900
        sys.argv += ["--admission-timeout", "42"]
        assert parse_args().admission_timeout == 42
        sys.argv = sys.argv[:-2]
        os.environ["LKB_ADMISSION_TIMEOUT_S"] = "77"
        assert parse_args().admission_timeout == 77
    finally:
        sys.argv = argv
        os.environ.pop("LKB_ADMISSION_TIMEOUT_S", None)


# ---- IN_CALL_JS against static fixtures (one headless Chrome) --------------

class _Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=FIXTURES_DIR, **kw)

    def log_message(self, *a, **kw):
        pass


@pytest.fixture(scope="module")
def sb_browser():
    from seleniumbase import SB
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with SB(browser="chrome", headless=True, uc=False) as _sb:
            yield _sb, server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()


def _classify(sb_browser, name, platform="meet"):
    sb, port = sb_browser
    sb.driver.get(f"http://localhost:{port}/{name}")
    sb.wait_for_ready_state_complete()
    return classify_admission(platform, bool(sb.execute_script(IN_CALL_JS_BY_PLATFORM[platform])),
                              (sb.execute_script(BODY_TEXT_JS) or "").lower())


@pytest.mark.parametrize("name,expected", [
    ("meet_lobby.html", "lobby"),
    ("meet_prejoin.html", "lobby"),
    ("meet_incall.html", "in-call"),
    ("meet_incall_hidden.html", "unknown"),
])
def test_dom_fixtures_lobby_vs_in_call(sb_browser, name, expected):
    assert _classify(sb_browser, name) == expected


# ISS-LOBBYWATCH-001: Zoom-web / Teams-web / unknown-platform fixtures. Hand-written static HTML;
# selectors and wording are UNVERIFIED against live Zoom/Teams.
@pytest.mark.parametrize("name,platform,expected", [
    ("zoom_lobby.html", "zoom", "lobby"),
    ("zoom_incall.html", "zoom", "in-call"),
    ("zoom_denied.html", "zoom", "unknown"),
    ("zoom_incall_hidden.html", "zoom", "unknown"),
    ("zoom_ended_with_controls.html", "zoom", "unknown"),
    ("teams_lobby.html", "teams", "lobby"),
    ("teams_incall.html", "teams", "in-call"),
    ("teams_denied.html", "teams", "unknown"),
    ("other_incall.html", "other", "in-call"),
    ("other_nosignal.html", "other", "unknown"),
    ("inner.html", "zoom", "lobby"),  # the repo's pre-existing Zoom waiting-room fixture
    # zoomwebinar lane: Zoom web-client WEBINAR attendee view (no mic/camera controls). Modelled DOM.
    ("zoom_webinar/zoom_webinar_attendee.html", "zoom", "in-call"),
    ("zoom_webinar/zoom_webinar_text_leave_only.html", "zoom", "in-call"),
    ("zoom_webinar/zoom_webinar_footer_hidden.html", "zoom", "in-call"),
    ("zoom_webinar/zoom_webinar_iframe_host.html", "zoom", "in-call"),
    ("zoom_webinar/zoom_webinar_joinpage.html", "zoom", "unknown"),
    ("zoom_webinar/zoom_webinar_waiting.html", "zoom", "lobby"),
    ("zoom_webinar/zoom_webinar_hidden_media.html", "zoom", "unknown"),
])
def test_platform_dom_fixtures(sb_browser, name, platform, expected):
    assert _classify(sb_browser, name, platform) == expected


def test_admission_timeout_holds_browser_until_stop_file_so_the_recorder_can_flush(tmp_path):
    # zoomwebinar: the controller writes the stop file after the recorder acknowledges its flush; the loop
    # must still be open (Chrome alive) until then. Stop file appears 12 s after the timeout.
    def scenario(now):
        return (False, "asking to join... someone will let you in")
    stop_at = 300 + 12
    events, _, _, clock = _run(tmp_path, MEET, scenario, timeout=300, seconds=stop_at)
    names = _names(events)
    assert names.count("admission_timeout") == 1 and names[-1] == "closed"
    assert stop_at <= clock.now - 1000 < stop_at + 3, "closed as soon as the stop file appeared, not after the full grace"
