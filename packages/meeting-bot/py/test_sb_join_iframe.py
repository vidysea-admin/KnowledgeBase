"""
packages/meeting-bot/py/test_sb_join_iframe.py — ISS-U0-1: sb_join.py's CLICK_JS and body-text
read only saw the top document; Zoom's real web-client join UI (name field, Join button,
"Join Audio by Computer", waiting-for-host / end-of-webinar text) renders inside a same-origin
<iframe> that was never traversed. These tests drive CLICK_JS/BODY_TEXT_JS against local HTML
fixtures (packages/meeting-bot/py/fixtures/) with a real headless Chrome via SeleniumBase — the
same browser automation sb_join.py itself uses — reproducing the exact DOM shape the live probe
found (qa/issues.u0.jsonl ISS-U0-1), without ever opening a real Zoom URL.

One browser instance is shared across the whole module (module-scoped fixture) to keep this
light on RAM (~1.9GB free at the time this was written) — headless, no UC mode (UC/anti-bot mode
is only needed against Zoom's real anti-bot checks, not local file fixtures).

Run: `python -m pytest packages/meeting-bot/py/test_sb_join_iframe.py -v` from the repo root.
"""
import http.server
import os
import sys
import threading

import pytest
from seleniumbase import SB

sys.path.insert(0, os.path.dirname(__file__))

from sb_join import BODY_TEXT_JS, CLICK_JS, JOIN_TEXTS  # noqa: E402

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


class _Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=FIXTURES_DIR, **kw)

    def log_message(self, *a, **kw):  # keep pytest output quiet
        pass


@pytest.fixture(scope="module")
def fixture_server():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    # cross_origin_outer.html's iframe src needs the real (randomly-assigned) port. The checked-in
    # fixture keeps the literal "__PORT__" placeholder forever; we never rewrite it in place (that
    # would leave a stale port baked into git after the first local run and break repeatability —
    # caught in review). Instead we render a throwaway sibling file with the placeholder swapped
    # for this run's actual port, serve THAT, and delete it when the server shuts down. 127.0.0.1
    # vs "localhost" below is a different origin (different hostname) even though both are served
    # by this one process on this one port — no second server process needed for a real
    # cross-origin case.
    template_path = os.path.join(FIXTURES_DIR, "cross_origin_outer.html")
    rendered_path = os.path.join(FIXTURES_DIR, "_cross_origin_outer.rendered.html")
    with open(template_path, encoding="utf-8") as f:
        template = f.read()
    with open(rendered_path, "w", encoding="utf-8") as f:
        f.write(template.replace("__PORT__", str(port)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()
        try:
            os.remove(rendered_path)
        except OSError:
            pass


@pytest.fixture(scope="module")
def sb(fixture_server):
    with SB(browser="chrome", headless=True, uc=False) as _sb:
        yield _sb


def _url(fixture_server, name, host="localhost"):
    return f"http://{host}:{fixture_server}/{name}"


# ---- CLICK_JS traverses a same-origin iframe (ISS-U0-1) --------------------

def test_click_js_finds_and_clicks_button_inside_same_origin_iframe(sb, fixture_server):
    sb.driver.get(_url(fixture_server, "top.html"))
    sb.wait_for_ready_state_complete()
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit == "join", f"expected CLICK_JS to click the iframe's Join button, got {hit!r}"
    # verify the click actually landed (button's onclick appended the marker), read back through
    # BODY_TEXT_JS itself — this also exercises the body-text traversal end to end.
    body = sb.execute_script(BODY_TEXT_JS)
    assert "join (clicked)" in body.lower()


# ---- BODY_TEXT_JS traverses a same-origin iframe (ISS-U0-1) ----------------

def test_body_text_js_reads_waiting_for_host_text_inside_iframe(sb, fixture_server):
    sb.driver.get(_url(fixture_server, "top.html"))
    sb.wait_for_ready_state_complete()
    body = sb.execute_script(BODY_TEXT_JS).lower()
    assert "please wait, the host will let you in soon" in body
    assert "trying to reconnect" in body
    # the top document's own text must still be present too (merge, not replace)
    assert "back" in body


# ---- nested iframe (two levels deep) ---------------------------------------

def test_click_js_and_body_text_js_traverse_nested_iframe(sb, fixture_server):
    sb.driver.get(_url(fixture_server, "nested_outer.html"))
    sb.wait_for_ready_state_complete()
    body_before = sb.execute_script(BODY_TEXT_JS).lower()
    assert "please wait, the host will let you in soon" in body_before  # leaf, 2 frames deep
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit == "join"
    body_after = sb.execute_script(BODY_TEXT_JS).lower()
    assert "join (clicked)" in body_after


# ---- cross-origin iframe is skipped silently, never throws ----------------

def test_cross_origin_iframe_is_skipped_without_throwing(sb, fixture_server):
    sb.driver.get(_url(fixture_server, "_cross_origin_outer.rendered.html", host="localhost"))
    sb.wait_for_ready_state_complete()
    # must not raise (a bare contentDocument access on a cross-origin frame throws a
    # SecurityError in the browser, which would surface here as a WebDriverException)
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit is None  # nothing clickable is visible from the same-origin side
    body = sb.execute_script(BODY_TEXT_JS).lower()
    assert "back" in body  # top document's own text still read
    # the cross-origin iframe's content must NOT leak into the merged text
    assert "please wait, the host will let you in soon" not in body
    assert "join" not in body


# ---- ISS-U0-4/ISS-U0-5 (checker cycle 1 FAIL): an invisible same-origin iframe's content must
# never be clicked and never merged into body text, regardless of HOW it's hidden -------------

@pytest.mark.parametrize("fixture_name", [
    "hidden_zerosize_top.html",            # iframe itself collapsed to width:0;height:0
    "hidden_displaynone_top.html",         # iframe itself display:none
    "hidden_in_displaynone_div_top.html",  # iframe has no hiding style; an ANCESTOR div does
])
def test_hidden_iframe_subtree_is_never_clicked_or_merged(sb, fixture_server, fixture_name):
    sb.driver.get(_url(fixture_server, fixture_name))
    sb.wait_for_ready_state_complete()
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit is None, (
        f"{fixture_name}: CLICK_JS clicked {hit!r} inside an invisible iframe (ISS-U0-4)"
    )
    body = sb.execute_script(BODY_TEXT_JS).lower()
    assert "webinar has ended" not in body, (
        f"{fixture_name}: BODY_TEXT_JS leaked hidden-iframe END_PHRASE text (ISS-U0-5)"
    )
    assert "thank you for attending" not in body
    assert "join (clicked)" not in body  # the click assertion above should already guarantee this
    # the top document's own text must still be present (only the hidden subtree is skipped)
    assert "back" in body


# ---- ISS-U0-6 (checker cycle 2 FAIL): an ancestor that clips its OWN box to zero size via
# overflow:hidden -- while the iframe itself keeps an explicit nonzero width/height -- must be
# treated exactly like an ancestor display:none, not missed by it -------------------------------

def test_zerosize_overflow_hidden_ancestor_iframe_is_never_clicked_or_merged(sb, fixture_server):
    sb.driver.get(_url(fixture_server, "zerosize_ancestor_top.html"))
    sb.wait_for_ready_state_complete()
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit is None, (
        f"zerosize_ancestor_top.html: CLICK_JS clicked {hit!r} inside a zero-size, "
        "overflow:hidden ancestor's iframe (ISS-U0-6)"
    )
    body = sb.execute_script(BODY_TEXT_JS).lower()
    assert "webinar has ended" not in body, (
        "zerosize_ancestor_top.html: BODY_TEXT_JS leaked clipped-ancestor iframe text (ISS-U0-6)"
    )
    assert "back" in body


# ---- ISS-U0-7 (checker cycle 2, medium): opacity:0 and off-screen absolute positioning must
# also gate the same way ------------------------------------------------------------------------

@pytest.mark.parametrize("fixture_name", [
    "opacity_zero_top.html",  # iframe itself opacity:0, otherwise nonzero on-screen size
    "offscreen_top.html",     # iframe itself position:absolute;left/top:-9999px, nonzero size
])
def test_opacity_or_offscreen_iframe_is_never_clicked_or_merged(sb, fixture_server, fixture_name):
    sb.driver.get(_url(fixture_server, fixture_name))
    sb.wait_for_ready_state_complete()
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit is None, (
        f"{fixture_name}: CLICK_JS clicked {hit!r} inside an opacity:0/offscreen iframe (ISS-U0-7)"
    )
    body = sb.execute_script(BODY_TEXT_JS).lower()
    assert "webinar has ended" not in body, (
        f"{fixture_name}: BODY_TEXT_JS leaked opacity:0/offscreen iframe text (ISS-U0-7)"
    )
    assert "back" in body


# ---- cycle-3 happy path: the geometric visible-area rewrite must not overcorrect into treating
# a genuinely visible, real-world-shaped iframe as invisible ------------------------------------

@pytest.mark.parametrize("fixture_name", [
    "happy_fullviewport_top.html",         # position:fixed;inset:0;width:100%;height:100%
    "happy_scrollable_container_top.html",  # visible iframe inside an on-screen overflow:auto div
])
def test_happy_path_visible_iframe_still_clicked_and_read(sb, fixture_server, fixture_name):
    sb.driver.get(_url(fixture_server, fixture_name))
    sb.wait_for_ready_state_complete()
    body_before = sb.execute_script(BODY_TEXT_JS).lower()
    assert "please wait, the host will let you in soon" in body_before, (
        f"{fixture_name}: a genuinely visible iframe's text must still be read"
    )
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit == "join", (
        f"{fixture_name}: a genuinely visible iframe's Join button must still be clicked, got {hit!r}"
    )
    body_after = sb.execute_script(BODY_TEXT_JS).lower()
    assert "join (clicked)" in body_after
    assert "back" in body_after  # top document's own text must still be present (merge, not replace)


# ---- regression: a page with no iframe at all behaves exactly as before ---

def test_no_iframe_page_click_and_body_text_regression(sb, fixture_server):
    sb.driver.get(_url(fixture_server, "no_iframe.html"))
    sb.wait_for_ready_state_complete()
    body_before = sb.execute_script(BODY_TEXT_JS).lower()
    assert "the webinar has ended" in body_before
    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
    assert hit == "join"
    body_after = sb.execute_script(BODY_TEXT_JS).lower()
    assert "join (clicked)" in body_after


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
