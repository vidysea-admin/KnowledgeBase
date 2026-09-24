"""
packages/meeting-bot/py/test_sb_join.py — T-029 auto-reconnect. Unit-tests the pure decision
logic (detect_trouble, ReconnectState) with no browser/Selenium involved, per the roadmap spec
("detection logic must be unit-testable without a browser"). Run: `python -m pytest
packages/meeting-bot/py/test_sb_join.py -v` from the repo root (pytest is on this machine's
system Python; no repo-level pytest config exists yet, none needed for a single test file).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from sb_join import (  # noqa: E402
    MAX_RECONNECTS,
    RECONNECT_COOLDOWN_S,
    RECONNECT_THRESHOLD_S,
    ReconnectState,
    detect_trouble,
)


# ---- detect_trouble -------------------------------------------------------

def test_detect_trouble_none_on_ordinary_page():
    assert detect_trouble("welcome to the webinar, please wait for the host", True) is None


def test_detect_trouble_banner_phrase():
    assert detect_trouble("oops, connection interrupted — trying to reconnect", True) == "banner"


def test_detect_trouble_offline_flag_wins_even_with_clean_body():
    assert detect_trouble("welcome to the webinar", False) == "offline"


def test_detect_trouble_net_error_interstitial():
    assert detect_trouble("this site can't be reached err_internet_disconnected", True) == "offline"


# ---- ReconnectState.tick — threshold ---------------------------------------
# Roadmap spec (docs/meeting-bot-roadmap.md T-029): "more than 20 s". These two tests hardcode
# literal seconds (not RECONNECT_THRESHOLD_S) against the DEFAULT constructor, so a mutant that
# silently changes the module constant (e.g. 20 -> 5) is still caught — a test that instead
# rederived its expectation from the same constant would pass against any value.

def test_reconnect_threshold_constant_is_20s_per_roadmap():
    assert RECONNECT_THRESHOLD_S == 20


def test_tick_stays_wait_under_threshold():
    rs = ReconnectState()
    action, gap = rs.tick("banner", 0.0)
    assert (action, gap) == ("wait", None)
    action, gap = rs.tick("banner", 19.0)  # 19s in, still under the 20s roadmap threshold
    assert (action, gap) == ("wait", None)


def test_tick_reloads_once_threshold_crossed():
    rs = ReconnectState()
    rs.tick("banner", 0.0)  # trouble starts at t=0
    action, gap = rs.tick("banner", 21.0)  # 21s in, over the 20s roadmap threshold
    assert action == "reload"
    assert gap is None  # gap only closes on recovery, not on reload
    assert rs.reload_count == 1


# ---- ReconnectState.tick — cooldown -----------------------------------------

def test_tick_cooldown_blocks_immediate_second_reload():
    rs = ReconnectState()
    rs.tick("banner", 0.0)
    action, _ = rs.tick("banner", RECONNECT_THRESHOLD_S + 1)
    assert action == "reload"
    # trouble persists (reload didn't fix it) and cooldown hasn't elapsed
    action, _ = rs.tick("banner", RECONNECT_THRESHOLD_S + 1 + 1)
    assert action == "cooldown"


def test_tick_reloads_again_after_cooldown_elapses():
    rs = ReconnectState()
    rs.tick("banner", 0.0)
    rs.tick("banner", RECONNECT_THRESHOLD_S + 1)  # reload #1 at t=21
    action, _ = rs.tick("banner", RECONNECT_THRESHOLD_S + 1 + RECONNECT_COOLDOWN_S + 1)
    assert action == "reload"
    assert rs.reload_count == 2


# ---- ReconnectState.tick — max reloads --------------------------------------

def test_tick_gives_up_after_max_reloads():
    rs = ReconnectState(threshold_s=0, cooldown_s=0, max_reloads=2)
    t = 0.0
    rs.tick("banner", t)
    t += 1
    action, _ = rs.tick("banner", t)  # reload 1
    assert action == "reload"
    t += 1
    action, _ = rs.tick("banner", t)  # reload 2
    assert action == "reload"
    assert rs.reload_count == 2
    t += 1
    action, _ = rs.tick("banner", t)  # over max_reloads now
    assert action == "give-up"


# ---- gap logging -------------------------------------------------------

def test_tick_recovery_closes_a_gap_with_correct_fields():
    rs = ReconnectState()
    rs.tick("banner", 100.0)  # trouble starts
    rs.tick("banner", 100.0 + RECONNECT_THRESHOLD_S + 1)  # reload
    action, gap = rs.tick(None, 140.0)  # banner gone → recovered
    assert action == "recovered"
    assert gap == {"start": 100.0, "end": 140.0, "reason": "banner", "recovered": True}


def test_tick_no_gap_when_never_in_trouble():
    rs = ReconnectState()
    action, gap = rs.tick(None, 5.0)
    assert (action, gap) == ("none", None)


def test_close_at_end_records_an_unrecovered_gap():
    rs = ReconnectState()
    rs.tick("offline", 10.0)
    gap = rs.close_at_end(45.0)
    assert gap == {"start": 10.0, "end": 45.0, "reason": "offline", "recovered": False}
    # state is cleared, so a second close_at_end call is a no-op (nothing left open)
    assert rs.close_at_end(60.0) is None


def test_close_at_end_is_none_when_nothing_was_open():
    rs = ReconnectState()
    assert rs.close_at_end(5.0) is None


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
