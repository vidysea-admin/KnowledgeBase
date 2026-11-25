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


# ---- B2-C1: refusal is its own state (D-232) ------------------------------

REFUSED_STRAIGHT = "you can't join this video call"
REFUSED_CURLY = "you can’t join this video call"


@pytest.mark.parametrize("body", [
    REFUSED_STRAIGHT, REFUSED_CURLY,
    "return to home screen " + REFUSED_STRAIGHT + " ask the host",
    "x " + REFUSED_CURLY,
])
@pytest.mark.parametrize("in_call_dom", [False, True])
def test_b2_c1_refusal_text_classifies_refused_and_wins_over_in_call_control(body, in_call_dom):
    assert classify_meet_state(in_call_dom, body) == "refused"
    assert classify_admission("meet", in_call_dom, body) == "refused"
    assert classify_meet_state(in_call_dom, body) not in ("lobby", "in-call", "unknown")


@pytest.mark.parametrize("body", [
    "you can join this video call",             # near-miss: no "can't"
    "you can't join this meeting",              # near-miss: no "video call" (not a Meet refusal text)
    "you cannot join this video call",          # not the Meet wording
    "can't join this video call",               # lacks "you"
    "you can't join this video",                # truncated
    "joining this video call is fun, you can't wait",
    "",
])
def test_b2_c1_near_miss_is_not_refused(body):
    assert classify_meet_state(False, body) == "unknown"
    assert classify_meet_state(True, body) == "in-call"
    assert classify_admission("meet", False, body) == "unknown"


def test_b2_c1_refusal_never_classifies_refused_on_other_platforms():
    for platform in ("zoom", "teams", "other"):
        for body in (REFUSED_STRAIGHT, REFUSED_CURLY):
            assert classify_admission(platform, False, body) != "refused"
            assert classify_admission(platform, True, body) != "refused"


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


def test_non_meet_platform_is_not_admitted_at_once_but_assumed_after_the_wait(tmp_path):
    # ISS-LOBBYWATCH-001 + D-167: not admitted on the first tick (the old bug), but a wait that ends with
    # no lobby/denied text ever seen is assumed-in (assumed=True) instead of aborting a possibly-live join.
    events, _, _, _clock = _run(tmp_path, "https://zoom.us/j/1", lambda now: (False, "welcome to the webinar"),
                                timeout=10, seconds=200)
    names = _names(events)
    assert "admission_timeout" not in names and names.count("admitted") == 1
    ev = dict(events)["admitted"]
    assert ev["assumed"] is True and ev["reason"] == "no-lobby-signal" and ev["platform"] == "zoom"
    assert _names(events).index("admitted") > 0 and _clock.now - 1000 >= 10


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
    ("meet_refused.html", "refused"),  # B2-C2
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


def test_b2_c2_saved_refusal_page_classifies_refused_in_chrome(sb_browser):
    sb, port = sb_browser
    sb.driver.get(f"http://localhost:{port}/meet_refused.html")
    sb.wait_for_ready_state_complete()
    body = (sb.execute_script(BODY_TEXT_JS) or "").lower()
    assert "you can't join this video call" in body
    in_call = bool(sb.execute_script(IN_CALL_JS_BY_PLATFORM["meet"]))
    assert in_call is False, "the saved refusal page has no call controls (D-225), so only the text can classify it"
    assert classify_admission("meet", in_call, body) == "refused"
    assert classify_meet_state(True, body) == "refused"


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


# ---- B2-C3 / C7 / C8: the join loop on a fake clock (D-232) -----------------

REFUSAL_BODY = "you can't join this video call"


def _refusal_at(t0, *, lobby_before=True):
    """In-call DOM never; lobby text before t0 (or the refusal from t=0), the refusal text from t0 on."""
    def scenario(now):
        t = now - 1000
        if t >= t0:
            return (False, REFUSAL_BODY)
        return (False, "asking to join... someone will let you in") if lobby_before else (False, "")
    return scenario


@pytest.mark.parametrize("t0", [0, 20])
def test_b2_c3_refusal_emits_one_admission_denied_with_seconds_and_closes(tmp_path, t0):
    events, _, _, clock = _run(tmp_path, MEET, _refusal_at(t0), timeout=900, seconds=100000)
    names = _names(events)
    assert names.count("admission_denied") == 1
    assert "admitted" not in names and "admission_timeout" not in names
    assert names[-1] == "closed" and names.count("closed") == 1
    seconds = dict(events)["admission_denied"]["seconds"]
    assert isinstance(seconds, int) and t0 <= seconds <= t0 + 10, f"event at {seconds}s, text first shown at {t0}s"
    # No stop file: the browser is held for the flush grace (like admission_timeout), then the loop leaves.
    assert seconds + FLUSH_GRACE_S - 3 <= clock.now - 1000 <= seconds + FLUSH_GRACE_S + 3


@pytest.mark.parametrize("t0", [0, 20])
def test_b2_c3_stop_file_five_seconds_after_the_event_ends_the_loop_within_five_seconds(tmp_path, t0):
    # The loop ticks every 2 s from t=0, so the event lands at t0 exactly; the stop file appears at t0 + 5.
    events, _, _, clock = _run(tmp_path, MEET, _refusal_at(t0), timeout=900, seconds=t0 + 5)
    names = _names(events)
    assert names.count("admission_denied") == 1 and names[-1] == "closed"
    seconds = dict(events)["admission_denied"]["seconds"]
    assert seconds == t0
    assert seconds + 5 <= clock.now - 1000 <= seconds + 5 + 1, "left within 5 fake seconds of the stop file"


def test_b2_c7_lobby_of_120s_then_admitted_emits_admitted_once_and_no_denied(tmp_path):
    def scenario(now):
        return (True, "2 participants") if now - 1000 >= 120 else (False, "asking to join... someone will let you in")
    events, _, _, _clock = _run(tmp_path, MEET, scenario, timeout=900, seconds=200)
    names = _names(events)
    assert names.count("admitted") == 1
    assert "admission_denied" not in names and "admission_timeout" not in names
    assert names[-1] == "closed"


def test_b2_c7_endless_lobby_emits_exactly_one_timeout_at_the_limit_and_no_denied(tmp_path):
    events, _, _, _clock = _run(tmp_path, MEET, _lobby, timeout=300, seconds=100000)
    names = _names(events)
    assert names.count("admission_timeout") == 1 and "admission_denied" not in names and "admitted" not in names
    assert dict(events)["admission_timeout"]["limit"] == 300


@pytest.mark.parametrize("url", ["https://zoom.us/j/123", "https://us02web.zoom.us/wc/join/123456",
                                 "https://teams.microsoft.com/v2/?meetingjoin=true", "https://events.zoho.com/webinar/1"])
def test_b2_c7_refusal_text_on_a_non_meet_url_does_not_emit_admission_denied(tmp_path, url):
    events, _, _, _clock = _run(tmp_path, url, lambda now: (False, REFUSAL_BODY), timeout=40, seconds=120)
    names = _names(events)
    assert "admission_denied" not in names
    assert names[-1] == "closed"


@pytest.mark.parametrize("in_call_after_phrase", [True, False])
def test_b2_c8_refusal_phrase_after_admission_never_ends_a_live_capture(tmp_path, in_call_after_phrase):
    # Admitted at t=5; another participant's caption or chat line carries the phrase from t=20; the loop must
    # still be running at t=60 (the stop file only appears then) and must not emit denied or closed before it.
    def scenario(now):
        t = now - 1000
        if t < 5:
            return (False, "asking to join... someone will let you in")
        if t < 20:
            return (True, "2 participants")
        return (in_call_after_phrase, "2 participants " + REFUSAL_BODY)
    events, _, _, clock = _run(tmp_path, MEET, scenario, timeout=900, seconds=60)
    names = _names(events)
    assert names.count("admitted") == 1
    assert "admission_denied" not in names and "admission_timeout" not in names
    assert names.count("closed") == 1 and names[-1] == "closed"
    assert clock.now - 1000 >= 60, "the loop was still running at t=60; only the stop file ended it"
    assert "heartbeat" in names
