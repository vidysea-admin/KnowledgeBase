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

def test_registration_actual_local_form_and_safety_exceptions(tmp_path):
    """Real local HTTP POST, explicit installed Chrome/driver, no provider/network fixture."""
    import pathlib
    import sb_join
    import http.server
    import threading
    import time
    from urllib.parse import parse_qs
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    import seleniumbase
    posts, cookies, resources_seen = [], [], []
    redirect_code, redirect_host = [None], ["localhost"]
    extra = [""]
    form_action = ["/submitted"]

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path.startswith("/leak"): resources_seen.append(self.path)
            html = ('<form id="registration" method="post" action="' + form_action[0] + '">'
                    '<input id="first" name="first" required><input id="last" name="last" required>'
                    '<input id="email" name="email" type="email" required><input type="hidden" name="csrf" value="token">' + extra[0]
                    + '<button type="submit">Register</button></form>')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Set-Cookie', 'auth=fixture; Path=/')
            self.end_headers()
            self.wfile.write(html.encode())

        def do_POST(self):
            posts.append({"path": self.path, "values": parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode())})
            cookies.append(self.headers.get("Cookie"))
            if self.path == "/submit" and redirect_code[0]:
                self.send_response(redirect_code[0]); self.send_header("Location", f"http://{redirect_host[0]}:{self.server.server_port}/redirected"); self.end_headers()
            else:
                self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
                self.wfile.write((f'<img src="http://localhost:{self.server.server_port}/leak?email=fixture">Await email confirmation').encode())

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    drivers = pathlib.Path(seleniumbase.__file__).parent / "drivers"
    options = webdriver.ChromeOptions()
    options.binary_location = str(drivers / "cft_drivers/chrome-win64/chrome.exe")
    options.add_argument("--headless=new")
    options.add_argument("--user-data-dir=" + str(tmp_path / "native-profile"))
    options.add_argument("--disable-background-networking")
    options.add_argument("--disable-gpu")
    options.add_argument("--enable-unsafe-extension-debugging")
    options.add_argument("--load-extension=" + str(pathlib.Path(sb_join.__file__).parent / "tab-capture"))
    options.add_argument("--no-first-run")
    browser, connection = None, None
    try:
        browser = webdriver.Chrome(service=Service(str(drivers / "uc_driver.exe")), options=options)
        browser.execute_cdp_cmd("Emulation.setScriptExecutionDisabled", {"value": True})
        url = f'http://127.0.0.1:{server.server_address[1]}/register'
        instructions = {"url": url, "allowedHosts": ["127.0.0.1"], "localFixture": True,
                        "operator": {"firstName": "Fixture", "lastName": "Operator", "email": "fixture@example.test"},
                        "form": {"mode": "native-html", "formSelector": "#registration", "submitSelector": "button[type=submit]",
                                 "fields": {"firstName": "#first", "lastName": "#last", "email": "#email"}}}
        import json, hashlib, uuid, psutil, websocket, urllib.request
        address = browser.capabilities["goog:chromeOptions"]["debuggerAddress"]
        with urllib.request.urlopen("http://" + address + "/json/version", timeout=5) as response:
            endpoint = json.load(response)["webSocketDebuggerUrl"]
        connection = websocket.create_connection(endpoint, timeout=5, suppress_origin=True, http_no_proxy=["127.0.0.1"], redirect_limit=0)
        sequence = 0
        def command(method, params=None, session=None):
            nonlocal sequence
            sequence += 1; request = {"id": sequence, "method": method, "params": params or {}}
            if session: request["sessionId"] = session
            connection.send(json.dumps(request))
            for _ in range(64):
                answer = json.loads(connection.recv())
                if answer.get("id") == sequence:
                    assert "error" not in answer, answer
                    return answer["result"]
            raise AssertionError("CDP event bound exceeded")
        extension = pathlib.Path(sb_join.__file__).parent / "tab-capture"
        extensions = command("Extensions.getExtensions")["extensions"]
        owned = [item for item in extensions if item.get("enabled") is True and pathlib.Path(item["path"]).resolve() == extension.resolve()]
        assert len(owned) == 1
        extension_id = owned[0]["id"]
        workers = [item for item in command("Target.getTargets")["targetInfos"] if item.get("url") == "chrome-extension://" + extension_id + "/background.js"]
        assert len(workers) == 1
        session = command("Target.attachToTarget", {"targetId": workers[0]["targetId"], "flatten": True})["sessionId"]
        def evaluate(expression):
            answer = command("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True}, session)
            assert "exceptionDetails" not in answer, answer
            return answer["result"]["value"]
        resources = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
        rules = [{"id": 910001, "priority": 1, "action": {"type": "block"}, "condition": {"urlFilter": "*", "resourceTypes": resources}},
                 {"id": 910002, "priority": 2, "action": {"type": "allow"}, "condition": {"regexFilter": r"^http://127\.0\.0\.1(:[0-9]{1,5})?/", "resourceTypes": resources}}]
        processes = [process for process in psutil.Process(browser.service.process.pid).children(recursive=True) if pathlib.Path(process.exe()).resolve() == pathlib.Path(options.binary_location).resolve() and not any(arg.startswith("--type=") for arg in process.cmdline())]
        assert len(processes) == 1
        process = processes[0]
        receipt = {"nonce": str(uuid.uuid4()), "browserPid": process.pid, "browserCreatedAt": process.create_time(), "profile": str((tmp_path / "native-profile").resolve()), "extensionId": extension_id, "fingerprint": hashlib.sha256(json.dumps(rules, sort_keys=True).encode()).hexdigest()}
        expected = {"receipt": receipt, "rules": rules, "javascript": {"setting": "block"}}
        assert evaluate("installRegistrationPolicy(" + json.dumps({"receipt": receipt, "rules": rules, "primaryUrl": url}) + ")") == expected
        def policy_check():
            assert process.create_time() == receipt["browserCreatedAt"] and pathlib.Path(process.exe()).resolve() == pathlib.Path(options.binary_location).resolve()
            assert evaluate("readRegistrationPolicy(" + json.dumps(url) + ")") == expected
            return True
        browser.execute_cdp_cmd("Network.enable", {})
        browser.execute_cdp_cmd("Network.setBypassServiceWorker", {"bypass": True})
        for markup, reason in [
            ('<input name="unknown" required>', 'unknown_required'),
            ('<input type="checkbox" required>', 'required_consent'),
            ('<input type="checkbox" name="marketing" checked>', 'unconfigured_consent'),
            ('<input type="password">', 'challenge_payment_login'),
            ('<div data-sitekey="fixture"></div>', 'challenge_payment_login'),
            ('<input autocomplete="cc-number">', 'challenge_payment_login'),
            ('<button type="submit" formaction="https://other.example/submit">Other</button>', 'submit_mismatch'),
        ]:
            extra[0] = markup
            browser.get(url)
            result = sb_join.register_form(browser, instructions, script_isolated=True, policy_check=policy_check)
            assert result == {"status": "action_required", "reason": reason}
            assert posts == []
        extra[0] = ""
        form_action[0] = "https://other.example/submit"
        browser.get(url)
        assert sb_join.register_form(browser, instructions, script_isolated=True, policy_check=policy_check)["reason"] == "redirect_host"
        assert posts == []
        form_action[0] = "/submitted"
        extra[0] = '''<script>
        window.pageScriptRan = true;
        const form = document.querySelector('form');
        const steal = () => {
          form.action = '/exfil';
          form.querySelector('button').setAttribute('formaction', '/exfil');
          const consent = document.createElement('input'); consent.type='checkbox'; consent.required=true;
          form.appendChild(consent); form.submit();
        };
        form.addEventListener('input', steal); form.addEventListener('change', steal);
        form.addEventListener('submit', steal);
        setInterval(steal, 1);
        Object.defineProperty(HTMLInputElement.prototype, 'value', {set: steal});
        </script>'''
        browser.get(url)
        assert browser.execute_script("return window.pageScriptRan === true") is False
        refused_policy = dict(instructions, allowedHosts=["different.example"])
        assert sb_join.register_form(browser, refused_policy, script_isolated=True, policy_check=policy_check)["reason"] == "request_policy_refused"
        assert posts == []
        refused = dict(instructions, allowedHosts=["localhost"])
        assert sb_join.register_form(browser, refused, script_isolated=True, policy_check=policy_check)["reason"] == "redirect_host"
        assert posts == []
        assert sb_join.register_form(browser, instructions)["reason"] == "script_isolation_unproved"
        result = sb_join.register_form(browser, instructions, script_isolated=True, policy_check=policy_check)
        # Selenium can return None when navigation replaces the JS context after submit.
        assert result["status"] in ("submitted", "uncertain")
        deadline = time.monotonic() + 5
        while not posts and time.monotonic() < deadline:
            time.sleep(0.05)
        assert posts == [{"path": "/submitted", "values": {
            "first": ["Fixture"], "last": ["Operator"], "email": ["fixture@example.test"], "csrf": ["token"]}}]
        assert cookies == ["auth=fixture"] and resources_seen == []
        expected_values = dict(posts[0]["values"])
        # ISS-374 recorded reproductions: native /submit POST on approved 127.0.0.1
        # returns 307/308 Location http://localhost:<port>/redirected, preserving its body.
        form_action[0] = "/submit"
        for code in (307, 308):
            for host in ("localhost", "127.0.0.1"):
                posts.clear(); cookies.clear(); resources_seen.clear()
                redirect_code[0], redirect_host[0] = code, host
                browser.get(url)
                outcome = sb_join.register_form(browser, instructions, script_isolated=True, policy_check=policy_check)
                assert outcome["status"] in ("submitted", "uncertain")
                time.sleep(.2)
                paths = ["/submit"] if host == "localhost" else ["/submit", "/redirected"]
                assert posts == [{"path": path, "values": expected_values} for path in paths], (code, host, posts)
                assert cookies == ["auth=fixture"] * len(paths) and resources_seen == []
        posts.clear(); browser.get(url)
        assert sb_join.register_form(browser, instructions, script_isolated=True)["reason"] == "persistent_policy_unproved"
        assert posts == []
        tampered = dict(receipt, nonce="wrong")
        evaluate("installRegistrationPolicy(" + json.dumps({"receipt": tampered, "rules": rules, "primaryUrl": url}) + ")")
        assert sb_join.register_form(browser, instructions, script_isolated=True, policy_check=policy_check)["status"] == "uncertain"
        assert posts == []
    finally:
        if connection: connection.close()
        if browser:
            browser.quit()
        server.shutdown()
        server.server_close()

