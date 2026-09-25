"""
packages/meeting-bot/py/test_sb_join.py — T-029 auto-reconnect. Unit-tests the pure decision
logic (detect_trouble, ReconnectState) with no browser/Selenium involved, per the roadmap spec
("detection logic must be unit-testable without a browser"). Run: `python -m pytest
packages/meeting-bot/py/test_sb_join.py -v` from the repo root (pytest is on this machine's
system Python; no repo-level pytest config exists yet, none needed for a single test file).
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

from sb_join import (  # noqa: E402
    CLICK_WINDOW_S,
    JOIN_TEXTS,
    MAX_CLICKS,
    MAX_RECONNECTS,
    RECONNECT_COOLDOWN_S,
    RECONNECT_THRESHOLD_S,
    ReconnectState,
    apply_reload,
    click_gate,
    detect_trouble,
    should_force_reload,
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


# ---- click_gate / apply_reload — C2 (meeting-bot-live-capture contract) ----
# C2: "capped at MAX_CLICKS total within CLICK_WINDOW_S of joining." T-029's reload path widens
# *when* clicking is allowed (extra_click_until) but must never widen *how many* clicks are
# allowed -- MAX_CLICKS bounds the whole run, across any number of reloads, not each reload's
# widened window. These tests exercise apply_reload(), the exact function main() calls on a
# "reload" action, so a future edit that reset `clicks` there is caught here, not just in a
# freestanding re-implementation of the check.

def test_click_gate_exhausts_at_max_clicks_inside_initial_window():
    clicks = 0
    last_click = -999.0
    started = 0.0
    extra_click_until = 0.0
    now = 0.0
    for _ in range(20):  # far more opportunities than MAX_CLICKS, all inside CLICK_WINDOW_S
        now += 10.0
        if click_gate(clicks, now, started, extra_click_until, last_click, no_click=False):
            clicks += 1
            last_click = now
    assert clicks == MAX_CLICKS


def test_total_clicks_capped_across_multiple_reloads():
    """The scenario the C2 amendment must settle: initial window exhausts the cap, then THREE
    separate reloads each go through apply_reload() and each open a fresh MAX_CLICKS-sized
    opportunity window (20 more eligible ticks apiece). If MAX_CLICKS bounded only the current
    window (a per-reload cap), total clicks would reach up to 4 * MAX_CLICKS. It must not.

    Tracks `total_click_events` SEPARATELY from `clicks` on purpose: a mutant that resets
    `clicks` on each reload would still show `clicks == MAX_CLICKS` at the end (each reset
    window independently climbs back to the same cap value), so asserting only the final
    counter value would NOT catch that mutation -- it has to catch the cumulative count of
    actual click actions taken over the whole run, which is the real-world quantity C2 bounds.
    """
    clicks = 0
    total_click_events = 0
    last_click = -999.0
    started = 0.0
    extra_click_until = 0.0
    now = 0.0

    for _ in range(20):
        now += 10.0
        if click_gate(clicks, now, started, extra_click_until, last_click, no_click=False):
            clicks += 1
            total_click_events += 1
            last_click = now
    assert clicks == MAX_CLICKS  # initial window alone already hits the cap

    for reload_no in range(3):
        now = started + CLICK_WINDOW_S + 100 + reload_no * 1000  # well past the initial window
        clicks, extra_click_until = apply_reload(clicks, now)  # the real main() reload call
        for _ in range(20):  # plenty of eligible ticks inside this reload's widened window
            now += 10.0
            if click_gate(clicks, now, started, extra_click_until, last_click, no_click=False):
                clicks += 1
                total_click_events += 1
                last_click = now

    assert total_click_events == MAX_CLICKS, (
        f"C2: MAX_CLICKS must bound the WHOLE run's total click actions across reloads, not "
        f"just the current window's counter value; got {total_click_events} total clicks after "
        f"an exhausted initial window + 3 reloads (would be up to {MAX_CLICKS * 4} if "
        f"apply_reload() reset the counter on each reload)"
    )


def test_apply_reload_widens_window_but_returns_clicks_unchanged():
    clicks, extra_click_until = apply_reload(5, 1000.0)
    assert clicks == 5  # unchanged
    assert extra_click_until == 1000.0 + CLICK_WINDOW_S


# ---- should_force_reload — T-031 audio-watchdog control channel ------------

def test_should_force_reload_false_when_no_reload_file_configured():
    assert should_force_reload(None) is False


def test_should_force_reload_false_when_file_does_not_exist():
    with tempfile.TemporaryDirectory() as d:
        assert should_force_reload(os.path.join(d, ".reload-missing")) is False


def test_should_force_reload_true_when_sentinel_file_exists():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, ".reload-abc")
        with open(p, "w", encoding="utf-8") as f:
            f.write("reload")
        assert should_force_reload(p) is True


# ---- JOIN_TEXTS — C2 forbidden-word guarantee (meeting-bot-live-capture contract) ----------
# C2 is binding: "the allowlist MUST NOT contain, and no future edit may add, any of `share`,
# `unmute`, `raise hand`, `allow` (or `enable`) as a standalone matched string." This test did NOT
# exist before U0 (2026-09-25) despite the contract's amendment log claiming it was "verified as
# holding" — that verification was a manual read, never a regression test. Written now so a future
# edit that adds e.g. "allow" while chasing a new platform's button text is caught automatically.
# CLICK_JS matches on the FULL trimmed, lowercased text — so this checks standalone-string
# equality (an entry that merely CONTAINS "share" as a substring inside a longer safe phrase,
# e.g. none currently do, would not by itself defeat C2's "exact match" click semantics — but the
# contract's own wording is "as a standalone string", so this test enforces exactly that: no
# JOIN_TEXTS entry, once lowercased, equals one of the forbidden words).

C2_FORBIDDEN_STANDALONE = {"share", "unmute", "raise hand", "allow", "enable"}


def test_join_texts_never_contains_a_c2_forbidden_word_standalone():
    lowered = {t.lower() for t in JOIN_TEXTS}
    hit = lowered & C2_FORBIDDEN_STANDALONE
    assert not hit, f"C2 violation: JOIN_TEXTS contains forbidden standalone entr(y/ies): {hit}"


def test_join_texts_contains_the_verified_zoom_web_client_button():
    """U0 live probe (2026-09-25, Ashoka Educator Dialogues real join URL): the Zoom `/w/<id>`
    landing page's actual button is 'Join from browser' (exact case-insensitive text, confirmed
    via DOM read against the real page) — not 'join from your browser', which the task brief
    guessed and which was already present but does not match this button. This test pins the
    real string so a future edit can't accidentally remove it while 'cleaning up' near-duplicates."""
    assert "join from browser" in {t.lower() for t in JOIN_TEXTS}


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
