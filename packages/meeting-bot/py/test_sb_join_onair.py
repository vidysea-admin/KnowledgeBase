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
    def __init__(self):
        super().__init__()
        self.controls, self.video, self.iframe, self.duration = [], False, False, None
        self.text, self._card, self._btn = [], [], None
        self._card_text = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("article", "li"):
            self._card_text = []
        if tag in ("button", "a"):
            self._btn = [tag, []]
        if tag == "video":
            self.video = True
            self.duration = float(a["data-duration"]) if "data-duration" in a else None
        if tag == "iframe":
            self.iframe = True

    def handle_data(self, data):
        self.text.append(data)
        if self._card_text is not None:
            self._card_text.append(data)
        if self._btn:
            self._btn[1].append(data)

    def handle_endtag(self, tag):
        if self._btn and tag == self._btn[0]:
            self.controls.append(["".join(self._btn[1]).strip().lower(), self._card_text])
            self._btn = None
        if tag in ("article", "li"):
            self._card_text = None


def snapshot(name, url=URL):
    p = _Snap()
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        p.feed(f.read())
    ctx = lambda t: " ".join(x.strip() for x in (t or [])).lower()
    # a control's context is its enclosing card, finalised after parsing: re-derive from the stored (shared) list
    return {"url": url, "text": " ".join(x.strip() for x in p.text).lower(),
            "controls": [{"text": t, "context": ctx(c)} for t, c in p.controls],
            "video": p.video, "iframe": p.iframe, "duration": p.duration}


class FakeSb:
    """Serves one fixture page; clicking a control index follows `on_click` to another page (or stays put)."""

    def __init__(self, page, on_click=None, url=URL):
        self.page, self.on_click, self.url, self.clicked, self.played, self.scripts = page, on_click or {}, url, [], 0, 0

    def execute_script(self, js, *args):
        if js is oa.SNAPSHOT_JS:
            return snapshot(self.page, self.url)
        if js is oa.CLICK_WATCH_JS:
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

    def test_enabled_only_with_flag_and_exact_host(self):
        on = {"LKB_ONAIR_WATCH": "1"}
        self.assertTrue(oa.onair_enabled(URL, on))
        self.assertFalse(oa.onair_enabled(URL, {}))
        self.assertFalse(oa.onair_enabled("https://evil.example/cloudonair.withgoogle.com", on))
        self.assertFalse(oa.onair_enabled("http://cloudonair.withgoogle.com/events/x", on))


if __name__ == "__main__":
    unittest.main()
