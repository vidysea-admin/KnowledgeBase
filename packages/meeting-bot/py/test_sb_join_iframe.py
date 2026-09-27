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
    # cross_origin_outer.html's iframe src needs the real port; write it once we know it, before
    # any test requests it. 127.0.0.1 vs "localhost" below is a different origin (different
    # hostname) even though both are served by this one process on this one port — no second
    # server process needed just to get a real cross-origin case.
    src_path = os.path.join(FIXTURES_DIR, "cross_origin_outer.html")
    with open(src_path, encoding="utf-8") as f:
        template = f.read()
    if "__PORT__" in template:
        with open(src_path, "w", encoding="utf-8") as f:
            f.write(template.replace("__PORT__", str(port)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()


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
    sb.driver.get(_url(fixture_server, "cross_origin_outer.html", host="localhost"))
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
