"""ISS-ADMISSION-STABLE-001 (live 2026-11-27, Phase B): the bot knocked on a Meet and was never let in, but the
recording ran 30 minutes as "admitted". Recorded frames: at second 1 Meet rendered the call-controls bar (red hang-up)
BEFORE the "please wait until a meeting host brings you into the call" text appeared. One such tick classified "in-call",
AdmissionState latched "admitted" forever, the 15-minute admission timeout never fired, and the lobby + Meet home page
were recorded and sent on to processing as a meeting.

Two rules pinned here:
  1. admission needs the in-call signal on ADMISSION_CONFIRM_TICKS consecutive ticks (a one-tick glimpse never admits);
  2. after admission, a Meet tab that sits on a page outside the meeting (meet.google.com/home, /landing, ...) for
     LEFT_MEETING_TICKS consecutive ticks emits one "ended" (reason "left-meeting"), so the controller stops.
Run: .venv python -m pytest packages/meeting-bot/py/test_sb_join_admission_stable.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import sb_join  # noqa: E402,F401
from sb_join_detect import ADMISSION_CONFIRM_TICKS, LEFT_MEETING_TICKS, AdmissionState, is_left_screen, is_outside_meeting  # noqa: E402
from test_sb_join_admission import MEET, _SB, _names, _run  # noqa: E402

LOBBY = "please wait until a meeting host brings you into the call"


# ---- pure ----------------------------------------------------------------

def test_confirm_ticks_constants_are_small_and_bounded():
    assert 2 <= ADMISSION_CONFIRM_TICKS <= 5
    assert 2 <= LEFT_MEETING_TICKS <= 30


def test_one_tick_glimpse_does_not_admit_when_confirmation_is_required():
    s = AdmissionState(started=0, timeout_s=100, confirm_ticks=3)
    assert s.tick(True, 1) is None
    assert s.tick(False, 3, blocked=True) is None  # lobby text arrived: the streak resets
    assert s.tick(True, 5) is None
    assert s.tick(True, 7) is None
    assert s.tick(True, 9) == "admitted"
    assert s.tick(True, 11) is None


def test_unconfirmed_glimpse_still_times_out():
    s = AdmissionState(started=0, timeout_s=100, confirm_ticks=3)
    assert s.tick(True, 1) is None
    for t in range(3, 101, 2):
        assert s.tick(False, t, blocked=True) is None
    assert s.tick(False, 102, blocked=True) == "timeout"


def test_default_confirm_ticks_keeps_the_old_contract():
    s = AdmissionState(started=0, timeout_s=100)
    assert s.tick(True, 10) == "admitted"


def test_is_outside_meeting():
    assert is_outside_meeting(MEET, "https://meet.google.com/home") is True
    assert is_outside_meeting(MEET, "https://meet.google.com/landing?authuser=0") is True
    assert is_outside_meeting(MEET, "https://meet.google.com/") is True
    assert is_outside_meeting(MEET, "https://meet.google.com/abc-defg-hij") is False
    assert is_outside_meeting(MEET, "https://meet.google.com/abc-defg-hij?authuser=0&hs=224") is False
    assert is_outside_meeting(MEET, "https://meet.google.com/ABC-DEFG-HIJ") is False
    assert is_outside_meeting(MEET, "https://meet.google.com/xyz-abcd-efg") is True  # another meeting is not ours
    # unknown / unparseable current URL is never treated as "left" (a navigating tab must not end a live capture)
    assert is_outside_meeting(MEET, "") is False
    assert is_outside_meeting(MEET, None) is False
    assert is_outside_meeting(MEET, "about:blank") is False
    # review A: links without the code redirect to the real code; that is inside, never "left"
    assert is_outside_meeting("https://meet.google.com/lookup/abc123", MEET) is False
    assert is_outside_meeting("https://meet.google.com/_meet/abc-defg-hij", MEET) is False
    assert is_outside_meeting(MEET, "https://meet.google.com/abcdefghij") is False
    assert is_outside_meeting(MEET, "https://meet.google.com/u/1/abc-defg-hij") is False
    assert is_outside_meeting(MEET, "https://meet.google.com/_meet/abc-defg-hij") is False
    # ...but home is still outside whatever link the bot started from
    assert is_outside_meeting("https://meet.google.com/lookup/abc123", "https://meet.google.com/home") is True
    # only Meet: other platforms keep their old behaviour
    assert is_outside_meeting("https://zoom.us/j/1", "https://zoom.us/") is False


# ---- run_session with a fake driver: the live 2026-11-27 sequence -------------

def test_live_sequence_controls_bar_glimpse_then_lobby_is_never_admitted_and_times_out(tmp_path):
    def scenario(now):
        t = now - 1000
        if t < 2:
            return (True, "")  # second 1: controls bar rendered, lobby text not yet
        # the recorded lobby frames show the red hang-up button AND the wait text together
        return (True, LOBBY) if t < 600 else (False, "no one has responded to your request to join the call")
    events, _, _, clock = _run(tmp_path, MEET, scenario, timeout=900, seconds=100000)
    names = _names(events)
    assert "admitted" not in names
    assert names.count("admission_timeout") == 1
    assert clock.now - 1000 < 900 + 60  # ended at the admission limit (+ flush grace), not at the meeting end


class _UrlSB(_SB):
    """_SB whose current URL follows the scenario: scenario(now) -> (in_call_dom, body, url)."""

    def execute_script(self, script, *args):
        orig = self.scenario
        self.scenario = lambda now: orig(now)[:2]
        try:
            return super().execute_script(script, *args)
        finally:
            self.scenario = orig

    def get_current_url(self):
        return self.scenario(self.clock.now)[2]


def _run_url(tmp_path, scenario, *, seconds, timeout=900):
    import test_sb_join_admission as base
    saved = base._SB
    base._SB = _UrlSB
    try:
        return _run(tmp_path, MEET, scenario, timeout=timeout, seconds=seconds)
    finally:
        base._SB = saved


def test_admitted_then_sent_back_to_meet_home_emits_one_ended_left_meeting(tmp_path):
    def scenario(now):
        t = now - 1000
        if t < 120:
            return (True, "2 participants", MEET)
        return (False, "meetings calls scheduled join", "https://meet.google.com/home")
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=400)
    names = _names(events)
    assert names.count("admitted") == 1
    ended = [kw for e, kw in events if e == "ended"]
    assert len(ended) == 1 and ended[0]["reason"] == "left-meeting"
    assert names.index("admitted") < names.index("ended")


def test_brief_home_url_blip_shorter_than_threshold_does_not_end(tmp_path):
    def scenario(now):
        t = now - 1000
        if 120 <= t < 120 + 2 * (LEFT_MEETING_TICKS - 1):
            return (True, "2 participants", "https://meet.google.com/home")
        return (True, "2 participants", MEET)
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=400)
    assert "ended" not in _names(events)


def test_exactly_left_meeting_ticks_on_home_ends(tmp_path):
    # boundary: N consecutive outside ticks end; then the call URL again must not emit a second ended
    def scenario(now):
        t = now - 1000
        if 120 <= t < 120 + 2 * LEFT_MEETING_TICKS:
            return (False, "meetings", "https://meet.google.com/home")
        return (True, "2 participants", MEET)
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=400)
    assert _names(events).count("ended") == 1


def test_removed_screen_on_the_meeting_url_ends(tmp_path):
    # review B: Meet's removed / left screen keeps the meeting URL; controls gone + that text ends the capture
    def scenario(now):
        t = now - 1000
        if t < 120:
            return (True, "2 participants", MEET)
        return (False, "you've been removed from the meeting return to home screen", MEET)
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=400)
    ended = [kw for e, kw in events if e == "ended"]
    assert [e["reason"] for e in ended] == ["left-meeting"]


def test_chat_text_with_denied_words_and_no_controls_never_ends(tmp_path):
    # review round 2: ordinary chat / caption text must not end a live call even if the controls probe is false
    def scenario(now):
        t = now - 1000
        if t < 120:
            return (True, "2 participants", MEET)
        return (False, "some attendees were unable to join; the meeting ended up running long; rejoin meeting", MEET)
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=400)
    assert "admitted" in _names(events) and "ended" not in _names(events)


def test_scattered_home_blips_never_add_up(tmp_path):
    # review round 2: the count is CONSECUTIVE; many one-tick blips across a long call must not end it
    def scenario(now):
        t = now - 1000
        if t >= 120 and int(t) % 20 < 2:
            return (True, "2 participants", "https://meet.google.com/home")
        return (True, "2 participants", MEET)
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=1200)
    assert "admitted" in _names(events) and "ended" not in _names(events)


def test_caption_saying_meeting_ended_while_controls_show_never_ends(tmp_path):
    def scenario(now):
        t = now - 1000
        return (True, "2 participants" if t < 120 else "speaker: you left the meeting notes open", MEET)
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=400)
    assert "ended" not in _names(events)


def test_home_in_a_second_tab_never_ends(tmp_path):
    # review B: the loop follows the last tab; a second Meet tab on home must not end a call live in the first
    class _TwoTabs(_UrlSB):
        def __init__(self, *args, **kw):
            super().__init__(*args, **kw)
            self.driver.window_handles = ["w", "w2"]
            self.driver.current_window_handle = "w2"
            self.driver.switch_to = type("S", (), {"window": staticmethod(lambda h: None)})()

    def scenario(now):
        t = now - 1000
        return (True, "2 participants", MEET if t < 120 else "https://meet.google.com/home")
    import test_sb_join_admission as base
    saved = base._SB
    base._SB = _TwoTabs
    try:
        events, _, _, _ = _run(tmp_path, MEET, scenario, timeout=900, seconds=400)
    finally:
        base._SB = saved
    assert "admitted" in _names(events) and "ended" not in _names(events)


def test_zoom_keeps_one_tick_admission(tmp_path):
    events, _, _, _ = _run(tmp_path, "https://zoom.us/j/123", lambda now: (True, ""), timeout=900, seconds=30)
    admitted = [kw for e, kw in events if e == "admitted"]
    assert len(admitted) == 1 and admitted[0].get("assumed") is False


def test_home_page_before_admission_never_emits_left_meeting(tmp_path):
    # pre-admission the bot may be bounced to home and knock again; that is the admission timeout's job
    def scenario(now):
        t = now - 1000
        return (False, LOBBY, MEET) if t < 300 else (False, "meetings", "https://meet.google.com/home")
    events, _, _, _ = _run_url(tmp_path, scenario, seconds=100000, timeout=600)
    names = _names(events)
    assert "ended" not in names and "admitted" not in names
    assert names.count("admission_timeout") == 1


def test_is_left_screen_needs_the_phrase_and_the_home_button():
    assert is_left_screen("you left the meeting rejoin return to home screen") is True
    assert is_left_screen("you've been removed from the meeting return to home screen") is True
    assert is_left_screen("you left the meeting") is False
    assert is_left_screen("return to home screen") is False
    assert is_left_screen("some attendees were unable to join") is False
    assert is_left_screen(None) is False
