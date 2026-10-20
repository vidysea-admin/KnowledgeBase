"""Page agent: fake model + fake browser (no Chrome, no network). One test per guardrail rule, the step cap, the loop, the model client.
Run: python -m unittest test_page_agent (from packages/meeting-bot/py)."""
import json
import os
import sys
import tempfile
import unittest
import urllib.error

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # sb_join_onair lives one level up
import page_agent as pa  # noqa: E402
import page_agent_guard as guard  # noqa: E402
import page_agent_model as model  # noqa: E402
import sb_join_agent as wiring  # noqa: E402

HOST = "cloudonair.withgoogle.com"
BASE = "https://%s/events/x" % HOST


def el(i, tag="button", name="", **kw):
    d = {"index": i, "tag": tag, "role": "", "type": "", "name": name, "text": name, "href": "", "src": "", "id": "", "label": "", "placeholder": "",
         "autocomplete": "", "trail": "", "visible": True, "bbox": [0, 0, 10, 10]}
    d.update(kw)
    return d


PAGE = [el(0, "a", "home", href=BASE), el(1, "a", "video_youtube watch now", href=BASE + "/watch?talk=t1"),
        el(2, "button", "sign in"), el(3, "input", "email", type="email", label="email"), el(4, "input", "password", type="password", label="password"),
        el(5, "input", "one-time code", type="text", autocomplete="one-time-code"), el(6, "input", "card number", type="text", autocomplete="cc-number"),
        el(7, "a", "elsewhere", href="https://evil.example/x"), el(8, "button", "allow all cookies"), el(9, "a", "account", href="https://accounts.google.com/x"),
        el(10, "button", "register to watch"), el(11, "button", "buy ticket"), el(12, "iframe", "", src="https://www.youtube.com/embed/abc"),
        el(13, "input", "full name", type="text", label="full name")]
REG = None
CTX = {"start_host": HOST, "profile": {"name": "Test User", "email": "t@example.test"}, "goal": "play", "allow_submit": False}

REG = {**CTX, "goal": "register"}


def refused(action, ctx=CTX, page=PAGE):
    try:
        guard.check_action(action, page, ctx)
    except guard.AgentRefused as e:
        return str(e)
    return None


class Clock:
    def __init__(self):
        self.now = 0.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


class FakeSb:
    def __init__(self, pages, url=BASE, player=True):
        self.pages, self.n, self.url, self.player, self.clicks, self.typed = pages, 0, url, player, [], []
        self.driver = self

    @property
    def current_url(self):
        return self.url

    def execute_script(self, js, *a):
        if js is pa.ELEMENTS_JS:
            self.n += 1
            return self.pages(self) if callable(self.pages) else self.pages
        if js is pa.PLAYER_JS:
            return self.player
        return None

    def find_element(self, by, css):
        sb = self
        idx = int(css.split('"')[1])

        class E:
            def click(_):
                sb.clicks.append(idx)

            def clear(_):
                pass

            def send_keys(_, t):
                sb.typed.append(t)
        return E()


def script(*actions):
    it = iter(actions)
    return lambda prompt, jpeg: ("fake:model", next(it))


def run(sb, *actions, goal="get the webinar replay playing", **kw):
    events, clock = [], Clock()
    steps = pa.run_agent(sb, goal, time=clock, emit=lambda e, **k: events.append((e, k)), ask=script(*actions), shot=lambda s: b"jpeg", **kw)
    return steps, events


class Guardrails(unittest.TestCase):
    def test_password_field_never_typed(self):
        self.assertIn("password", refused({"action": "type", "index": 4, "text": "Test User"}, REG))

    def test_one_time_code_and_card_fields_never_typed(self):
        for i in (5, 6):
            self.assertRegex(refused({"action": "type", "index": i, "text": "Test User"}, REG) or "", "one-time-code, card|payment")

    def test_type_value_must_be_in_profile(self):
        self.assertIn("allowlisted profile", refused({"action": "type", "index": 13, "text": "Someone Else"}, REG))
        self.assertIn("allowlisted profile", refused({"action": "type", "index": 13}, REG))
        self.assertIsNone(refused({"action": "type", "index": 13, "text": "Test User"}, REG))

    def test_select_value_must_be_in_profile(self):
        self.assertIn("allowlisted profile", refused({"action": "select", "index": 13, "text": "India"}, REG))

    def test_sign_in_consent_and_account_controls_refused(self):
        for i in (2, 8, 9):
            self.assertIn("refused", refused({"action": "click", "index": i}), i)

    def test_navigation_outside_start_site_and_player_hosts_refused(self):
        self.assertIn("navigation to evil.example", refused({"action": "click", "index": 7}))
        self.assertIsNone(refused({"action": "click", "index": 12}))  # player iframe host allowed
        self.assertIsNone(refused({"action": "click", "index": 1}))  # same-site watch link

    def test_payment_controls_refused(self):
        self.assertIn("payment", refused({"action": "click", "index": 11}))

    def test_register_and_submit_need_explicit_approval(self):
        self.assertIn("without explicit approval", refused({"action": "click", "index": 10}))
        self.assertIn("without explicit approval", refused({"action": "click", "index": 10}, REG))
        self.assertIsNone(refused({"action": "click", "index": 10}, {**REG, "allow_submit": True}))

    def test_bad_actions_and_indexes_refused(self):
        for a in ({"action": "eval"}, {"action": "click"}, {"action": "click", "index": 99}, {"action": "click", "index": True}, {"action": "click", "index": -1}, "x"):
            self.assertIsNotNone(refused(a), a)
        self.assertIn("model refused: bot check", refused({"action": "refuse", "reason": "bot check"}))

    def test_location_guard(self):
        guard.check_location(BASE, HOST)
        guard.check_location("https://www.youtube.com/embed/a", HOST)
        for bad in ("https://accounts.google.com/o/oauth2", "https://login.example.com/", "https://evil.example/", "http://%s/x" % HOST):
            with self.assertRaises(guard.AgentRefused):
                guard.check_location(bad, HOST)


class CheckerProbes(unittest.TestCase):
    """The probes from verdict 1bd56f26 (w25-pageagent cycle 0), one test each."""

    def one(self, **kw):
        return [el(0, "a", "home", href=BASE), el(1, **kw)]

    def test_f1_non_keyword_submit_controls_refused_on_a_play_goal(self):
        for kw in ({"name": "reserve my spot", "type": "submit"}, {"name": "continue", "type": "submit"}, {"name": "rsvp"}, {"name": "next"},
                   {"name": "get access"}, {"tag": "input", "name": "go", "type": "submit"}, {"name": "go", "submit": True}, {"name": "go", "form": True},
                   {"name": "let me in", "type": "submit"}):
            page = self.one(**kw)
            self.assertIn("without explicit approval", refused({"action": "click", "index": 1}, CTX, page) or "", kw)
            self.assertIn("without explicit approval", refused({"action": "click", "index": 1}, REG, page) or "", kw)  # register without approval
            self.assertIsNone(refused({"action": "click", "index": 1}, {**REG, "allow_submit": True}, self.one(**{**kw, "name": "go"})) if kw.get("form") else None)

    def test_f1_typing_and_selecting_refused_unless_goal_is_register(self):
        for kind in ("type", "select"):
            self.assertIn("unless the goal is registration", refused({"action": kind, "index": 13, "text": "Test User"}, CTX))
        self.assertIsNone(refused({"action": "type", "index": 13, "text": "Test User"}, REG))

    def test_f2_provider_buttons_refused_before_the_click(self):
        for name in ("continue with facebook", "continue with apple", "sign in with microsoft", "continue with linkedin", "log in with github",
                     "continue with x", "sign up using twitter", "single sign-on", "sso"):
            self.assertIn("refused", refused({"action": "click", "index": 1}, CTX, self.one(name=name)) or "", name)
        self.assertIn("refused", refused({"action": "click", "index": 1}, CTX, self.one(tag="a", name="idp", href="https://login.okta.com/x")) or "")

    def test_f2_unknown_provider_refused_even_with_the_submit_gate_open(self):
        open_gate = {**REG, "allow_submit": True}
        for name in ("continue with acme", "sign in using zorg", "continue with x"):
            self.assertIn("provider control refused", refused({"action": "click", "index": 1}, open_gate, self.one(name=name)) or "", name)

    def test_f3_secret_field_spellings(self):
        for name in ("pin", "ssn", "secret answer", "p4ssw0rd", "pass word", "p@ssw0rd", "security code", "passcode", "social security number"):
            page = self.one(tag="input", name=name, type="text")
            self.assertRegex(refused({"action": "type", "index": 1, "text": "Test User"}, REG, page) or "", "secret|password|card", name)

    def test_f3_bot_check_detector_is_code_level(self):
        for text in ("Sign in to confirm you're not a bot", "Sign in to confirm you’re not a bot", "Please verify you are human", "Complete the CAPTCHA", "unusual traffic from your network"):
            with self.assertRaises(guard.AgentRefused, msg=text):
                guard.check_page(text, [])
        with self.assertRaises(guard.AgentRefused):
            guard.check_page("fine", [el(0, "iframe", src="https://www.google.com/recaptcha/api2/anchor")])
        with self.assertRaises(guard.AgentRefused):
            guard.check_page("fine", [el(0, "iframe", src="https://newassets.hcaptcha.com/captcha/v1")])
        guard.check_page("Welcome and Introduction. Watch now", PAGE)

    def test_f3_bot_check_inside_a_player_frame_stops_the_loop_before_the_model(self):
        class Sb(FakeSb):
            in_frame = False

            def execute_script(self, js, *a):
                if js is pa.TEXT_JS:
                    return "Sign in to confirm you're not a bot" if self.in_frame else "Welcome"
                return super().execute_script(js, *a)

            def find_elements(self, by, css):
                return ["frame"]
            switch_to = None
        sb = Sb(PAGE)
        sb.switch_to = type("S", (), {"frame": lambda _, f: setattr(sb, "in_frame", True), "default_content": lambda _: setattr(sb, "in_frame", False)})()
        asked = []
        with self.assertRaisesRegex(guard.AgentRefused, "bot check"):
            pa.run_agent(sb, "g", time=Clock(), emit=lambda *a, **k: None, ask=lambda p, j: asked.append(1), shot=lambda s: b"j")
        self.assertEqual(asked, [])


class Loop(unittest.TestCase):
    def test_happy_path_logs_each_step(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ["LKB_AGENT_LOG"] = os.path.join(d, "agent.jsonl")
            try:
                sb = FakeSb(PAGE)
                steps, events = run(sb, {"action": "scroll", "reason": "look"}, {"action": "click", "index": 1, "reason": "watch now"}, {"action": "done", "reason": "playing"})
                with open(os.environ["LKB_AGENT_LOG"], encoding="utf-8") as f:
                    rows = [json.loads(line) for line in f]
            finally:
                del os.environ["LKB_AGENT_LOG"]
        self.assertEqual(steps, 3)
        self.assertEqual(sb.clicks, [1])
        self.assertEqual([r["action"] for r in rows], ["scroll", "click", "done"])
        self.assertEqual(rows[1]["element"]["name"], "video_youtube watch now")
        self.assertEqual(len(rows[1]["shot"]), 12)
        self.assertEqual([e for e, _ in events], ["agent-step"] * 3)

    def test_step_cap(self):
        sb = FakeSb(PAGE)
        with self.assertRaisesRegex(guard.AgentRefused, "15-step cap"):
            run(sb, *([{"action": "wait", "reason": "x"}] * 40))
        self.assertEqual(sb.n, 15)

    def test_overall_timeout(self):
        with self.assertRaisesRegex(guard.AgentRefused, "timed out"):
            run(FakeSb(PAGE), *([{"action": "wait", "reason": "x"}] * 40), timeout_s=5)

    def test_done_without_a_player_refused(self):
        with self.assertRaisesRegex(guard.AgentRefused, "no video player"):
            run(FakeSb(PAGE, player=False), {"action": "done", "reason": "ok"})

    def test_target_changed_between_observation_and_action(self):
        calls = []

        def pages(sb):
            calls.append(1)
            return PAGE if len(calls) == 1 else [el(0, "button", "something else")] + PAGE[1:]
        sb = FakeSb(pages)
        with self.assertRaisesRegex(guard.AgentRefused, "target changed"):
            run(sb, {"action": "click", "index": 0, "reason": "x"})
        self.assertEqual(sb.clicks, [])

    def test_leaving_the_site_stops_the_run(self):
        sb = FakeSb(PAGE, url="https://accounts.google.com/signin")
        with self.assertRaises(guard.AgentRefused):
            run(sb, {"action": "done", "reason": "x"})

    def test_refusing_model_step_is_logged_and_raised(self):
        sb = FakeSb(PAGE)
        events = []
        with self.assertRaises(guard.AgentRefused):
            pa.run_agent(sb, "g", time=Clock(), emit=lambda e, **k: events.append(k), ask=script({"action": "click", "index": 2, "reason": "sign in"}), shot=lambda s: b"j")
        self.assertIn("refused", events[0])
        self.assertEqual(sb.clicks, [])


class Model(unittest.TestCase):
    def test_first_balanced_json(self):
        self.assertEqual(model.first_json('prose {"a": {"b": "}"}, "c": 1} tail {"z": 2}'), {"a": {"b": "}"}, "c": 1})
        self.assertEqual(model.first_json('fence {"action":"done"} end'), {"action": "done"})
        self.assertIsNone(model.first_json("no json"))
        self.assertEqual(model.first_json('{bad} {"ok": 1}'), {"ok": 1})

    def test_429_backoff_then_next_provider_gemini_last(self):
        sleeps, calls = [], []

        def limited(prompt, jpeg):
            calls.append("ollama")
            raise urllib.error.HTTPError("u", 429, "rate", {}, None)
        label, out = model.ask("p", b"j", chain=[("ollama:a", limited), ("gemini:g", lambda p, j: '{"action":"wait"}')], sleep=sleeps.append)
        self.assertEqual((label, out), ("gemini:g", {"action": "wait"}))
        self.assertEqual(sleeps, [2, 4, 8])
        self.assertEqual(len(calls), 4)

    def test_all_providers_failing_raises_without_keys(self):
        with self.assertRaisesRegex(RuntimeError, "no vision model answered"):
            model.ask("p", b"j", chain=[("ollama:a", lambda p, j: "no json")], sleep=lambda s: None)
        with self.assertRaisesRegex(RuntimeError, "no vision provider"):
            model.ask("p", b"j", chain=[])

    def test_provider_order_ollama_first_gemini_last(self):
        labels = [l for l, _ in model.providers({"OLLAMA_API_KEY": "k", "GEMINI_API_KEY": "g", "OLLAMA_VISION_MODELS": "m1,m2"})]
        self.assertEqual(labels, ["ollama:m1", "ollama:m2", "gemini:gemini-2.5-flash"])
        self.assertEqual(model.providers({}), [])


class Wiring(unittest.TestCase):
    def test_flag_and_profile(self):
        self.assertFalse(wiring.agent_enabled({}))
        self.assertTrue(wiring.agent_enabled({"LKB_PAGE_AGENT": "1"}))
        self.assertEqual(wiring.agent_profile({"LKB_AGENT_PROFILE": '{"name": "A"}'}), {"name": "A"})
        for bad in ("[1]", "not json", '{"a": 5}'):
            with self.assertRaises(wiring.OnairRefused):
                wiring.agent_profile({"LKB_AGENT_PROFILE": bad})

    def test_refusal_becomes_a_clear_fatal_reason(self):
        def runner(*a, **k):
            raise guard.AgentRefused("bot check")
        with self.assertRaisesRegex(wiring.OnairRefused, "page-agent refused: bot check"):
            wiring.agent_prepare(FakeSb(PAGE), time=Clock(), emit=lambda *a, **k: None, env={"LKB_DOTENV": "none"}, runner=runner)


if __name__ == "__main__":
    unittest.main()
