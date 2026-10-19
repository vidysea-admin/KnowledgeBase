"""w24-onairplay: OnAir replay playback decisions against fixture HTML. Stdlib unittest; no Chrome, no network.
Run: python -m unittest packages/meeting-bot/py/test_sb_join_onair.py -v   (from the repo root; seleniumbase is not imported)
The JS snippets are not executed here (that needs a browser); a FakeSb parses the fixture into the snapshot shape SNAPSHOT_JS returns."""
import os
import sys
import unittest
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(__file__))
import sb_join_onair as oa  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "onair")
URL = "https://cloudonair.withgoogle.com/events/cloud-next-recap"


class _Snap(HTMLParser):
    """Fixture HTML -> the shape SNAPSHOT_JS / DESCRIBE_JS return (controls = button and a, in document order)."""

    def __init__(self):
        super().__init__()
        self.controls, self.video, self.iframes, self.duration = [], False, [], None
        self.text, self.stack, self._btn, self._cards = [], [], None, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.stack.append((tag, (a.get("id", "") + " " + a.get("class", "") + " " + a.get("aria-label", "")).strip().lower(), a))
        if tag in ("article", "li"):
            self._cards.append([])
        if tag in ("button", "a"):
            self._btn = [tag, [], a.get("href", "").lower(), " | ".join(x[1] for x in reversed(self.stack)), self._cards[-1] if self._cards else []]
        if tag == "video":
            self.video = True
            self.duration = float(a["data-duration"]) if "data-duration" in a else None
        if tag == "iframe":
            self.iframes.append(a.get("src", "").lower())

    def handle_data(self, data):
        self.text.append(data)
        for c in self._cards:
            c.append(data)
        if self._btn:
            self._btn[1].append(data)

    def handle_endtag(self, tag):
        if self._btn and tag == self._btn[0]:
            b = self._btn
            self.controls.append({"text": "".join(b[1]).strip().lower(), "href": b[2], "trail": b[3], "_card": b[4]})
            self._btn = None
        if tag in ("article", "li") and self._cards:
            self._cards.pop()
        while self.stack and self.stack.pop()[0] != tag:
            pass


def snapshot(name, url=URL):
    p = _Snap()
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        p.feed(f.read())
    ctx = lambda t: " ".join(x.strip() for x in t).lower()
    controls = [{"text": c["text"], "href": c["href"], "trail": c["trail"], "context": ctx(c["_card"]) or c["text"]} for c in p.controls]
    return {"url": url, "text": " ".join(x.strip() for x in p.text).lower(), "controls": controls,
            "video": p.video, "iframes": p.iframes, "duration": p.duration}


class FakeSb:
    """Serves one fixture page. `describe_page` (if set) is what the page looks like at click time, after a reflow."""

    def __init__(self, page, on_click=None, url=URL, describe_page=None, sig_drift=False):
        self.page, self.on_click, self.url, self.clicked, self.played = page, on_click or {}, url, [], 0
        self.describe_page, self.sig_drift = describe_page, sig_drift

    def execute_script(self, js, *args):
        if js is oa.SNAPSHOT_JS:
            return snapshot(self.page, self.url)
        if js is oa.DESCRIBE_JS:
            c = snapshot(self.describe_page or self.page, self.url)["controls"]
            d = dict(c[args[0]]) if args[0] < len(c) else None
            if d:
                d["sig"] = d["text"] + "|" + d["href"] + "|" + d["trail"]
            return d
        if js is oa.CLICK_WATCH_JS:
            if self.sig_drift:
                return False
            self.clicked.append(args[0])
            self.page = self.on_click.get(args[0], self.page)
            return True
        if js is oa.PLAY_JS:
            self.played += 1
            return True
        raise AssertionError("unexpected script")


class Clock:
    def __init__(self):
        self.now = 0.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


class OnairTests(unittest.TestCase):
    def run_prepare(self, sb, session=None, wait_s=60):
        events, clock = [], Clock()
        oa.onair_prepare(sb, time=clock, emit=lambda e, **kw: events.append((e, kw)), session=session, wait_s=wait_s)
        return events, clock

    def test_signed_in_clicks_first_watch_now_and_waits_for_player(self):
        sb = FakeSb("signed_in.html", {2: "player.html"})
        events, _ = self.run_prepare(sb)
        self.assertEqual(sb.clicked, [2])  # 0 Account, 1 Sign out, 2 first Watch now
        self.assertEqual([e for e, _ in events], ["onair-watch-clicked", "onair-player-ready"])

    def test_session_substring_picks_matching_card(self):
        sb = FakeSb("signed_in.html", {})
        sb.on_click = {3: "player.html"}
        events, _ = self.run_prepare(sb, session="Data Pipelines")
        self.assertEqual(sb.clicked, [3])

    def test_signed_out_refuses_without_clicking(self):
        sb = FakeSb("signed_out.html")
        with self.assertRaisesRegex(oa.OnairRefused, "signed out"):
            self.run_prepare(sb)
        self.assertEqual(sb.clicked, [])

    def test_account_chooser_refuses_without_clicking(self):
        for page, url in (("chooser.html", URL), ("signed_in.html", "https://accounts.google.com/o/oauth2/auth")):
            sb = FakeSb(page, url=url)
            with self.assertRaisesRegex(oa.OnairRefused, "account chooser|left cloudonair"):
                self.run_prepare(sb)
            self.assertEqual(sb.clicked, [])

    def test_no_player_in_60s_refuses(self):
        sb = FakeSb("no_player.html")
        with self.assertRaisesRegex(oa.OnairRefused, "no player after 60s"):
            _, clock = self.run_prepare(sb)
        self.assertEqual(sb.clicked, [1])  # clicked Watch now exactly once, never anything else

    def test_play_emits_duration_and_bound(self):
        sb = FakeSb("player.html")
        events, clock = [], Clock()
        oa.onair_play(sb, time=clock, emit=lambda e, **kw: events.append((e, kw)))
        self.assertEqual(sb.played, 1)
        self.assertIn(("onair-duration", {"seconds": 1800.0}), events)
        self.assertEqual(oa.bound_seconds(1800), 1920)
        self.assertEqual(oa.bound_seconds(10 * 3600), 4 * 3600)
        for bad in (None, 0, -5, float("inf"), "x", True):
            self.assertIsNone(oa.bound_seconds(bad))

    def test_late_reflow_never_clicks_a_sign_in_control(self):  # finding 1: index from the old snapshot, DOM moved
        sb = FakeSb("signed_in.html", {2: "player.html"}, describe_page="shifted.html")
        with self.assertRaisesRegex(oa.OnairRefused, "click target changed"):
            self.run_prepare(sb)
        self.assertEqual(sb.clicked, [])

    def test_dom_drift_between_check_and_click_refuses(self):
        sb = FakeSb("signed_in.html", {2: "player.html"}, sig_drift=True)
        with self.assertRaisesRegex(oa.OnairRefused, "between check and click"):
            self.run_prepare(sb)
        self.assertEqual(sb.clicked, [])

    def test_verify_target_rules(self):
        ok = {"text": "watch now", "href": "", "trail": "card", "context": "keynote watch now"}
        self.assertIsNone(oa.verify_target(ok))
        self.assertIsNone(oa.verify_target(ok, "KEYNOTE"))
        self.assertIsNotNone(oa.verify_target(ok, "workshop"))
        self.assertIsNotNone(oa.verify_target(None))
        for bad in ({"text": "register"}, {"trail": "login-dialog"}, {"href": "https://accounts.google.com/x"}, {"trail": "consent-banner"}, {"text": "watch now to allow"}):
            self.assertIsNotNone(oa.verify_target({**ok, **bad}), bad)

    def test_localised_substring_controls_refuse(self):  # finding 2
        for page in ("sign_in_to_watch.html", "register_now.html"):
            sb = FakeSb(page)
            with self.assertRaisesRegex(oa.OnairRefused, "signed out"):
                self.run_prepare(sb)
            self.assertEqual(sb.clicked, [], page)

    def test_only_known_player_iframes_count(self):  # finding 3
        sb = FakeSb("iframe_youtube.html")
        events, _ = self.run_prepare(sb)
        self.assertEqual(events[-1][0], "onair-player-ready")
        for page, why in (("iframe_login.html", "login or consent iframe"), ("iframe_unknown.html", "no player after 60s")):
            with self.assertRaisesRegex(oa.OnairRefused, why):
                self.run_prepare(FakeSb(page))

    def test_enabled_only_with_flag_and_exact_host(self):
        on = {"LKB_ONAIR_WATCH": "1"}
        self.assertTrue(oa.onair_enabled(URL, on))
        self.assertFalse(oa.onair_enabled(URL, {}))
        self.assertFalse(oa.onair_enabled("https://evil.example/cloudonair.withgoogle.com", on))
        self.assertFalse(oa.onair_enabled("http://cloudonair.withgoogle.com/events/x", on))


if __name__ == "__main__":
    unittest.main()
