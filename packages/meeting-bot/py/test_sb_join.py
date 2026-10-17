"""Reconnect/click safety and fake managed-driver/CDP/owned-cleanup acceptance tests.
Run project Python -m pytest packages/meeting-bot/py/test_sb_join.py; no real browser starts.
"""
import os
import sys
import tempfile
import contextlib
import json
import pathlib
import subprocess
import urllib.request
import websocket
import psutil
import pytest
from types import SimpleNamespace
from seleniumbase.core import browser_launcher, detect_b_ver

sys.path.insert(0, os.path.dirname(__file__))
import sb_join

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
# Literal 19/21 seconds independently pin the 20-second roadmap threshold against constant mutants.

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


# C2 bounds cumulative actions across reloads; real apply_reload must not reset the cap.
def click_opportunities(clicks, total, last, now, started, extra_until):
    for _ in range(20):
        now += 10.0
        if click_gate(clicks, now, started, extra_until, last, no_click=False):
            clicks += 1
            total += 1
            last = now
    return clicks, total, last, now


def test_click_gate_exhausts_at_max_clicks_inside_initial_window():
    clicks, _, _, _ = click_opportunities(0, 0, -999.0, 0.0, 0.0, 0.0)
    assert clicks == MAX_CLICKS


def test_total_clicks_capped_across_multiple_reloads():
    """A reset mutant can leave the final counter correct: cumulative actions are the oracle.
    Preserve the initial 20 opportunities plus three real reloads with 20 opportunities each.
    """
    started = 0.0
    clicks, total_click_events, last_click, now = click_opportunities(0, 0, -999.0, 0.0, started, 0.0)
    assert clicks == MAX_CLICKS
    for reload_no in range(3):
        now = started + CLICK_WINDOW_S + 100 + reload_no * 1000
        clicks, extra_click_until = apply_reload(clicks, now)
        clicks, total_click_events, last_click, now = click_opportunities(clicks, total_click_events, last_click, now, started, extra_click_until)
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


# C2 forbids these standalone join actions; match full normalized button text.
C2_FORBIDDEN_STANDALONE = {"share", "unmute", "raise hand", "allow", "enable"}


def test_join_texts_never_contains_a_c2_forbidden_word_standalone():
    lowered = {t.lower() for t in JOIN_TEXTS}
    hit = lowered & C2_FORBIDDEN_STANDALONE
    assert not hit, f"C2 violation: JOIN_TEXTS contains forbidden standalone entr(y/ies): {hit}"


def test_join_texts_contains_the_verified_zoom_web_client_button():
    """Pin the previously observed Zoom browser join label."""
    assert "join from browser" in {t.lower() for t in JOIN_TEXTS}


def test_join_texts_contains_exact_meet_join_now_without_media_controls():
    assert "join now" in JOIN_TEXTS
    assert not ({"turn on microphone", "turn on camera", "unmute", "allow"} & set(JOIN_TEXTS))


@pytest.fixture
def managed_main(monkeypatch, tmp_path):
    stop = tmp_path / "stop"
    stop.write_text("stop")
    setup = SimpleNamespace(profile=str(tmp_path / "profile"), binary=str(tmp_path / "chrome.exe"), extension=str(tmp_path / "extension"),
                            stop=stop, exists=True, browser_version="154.0.8037.92", driver_version="ChromeDriver 154.0.8037.92",
                            selected=[], launched=[], cleanup=[])
    setup.argv = ["sb_join.py", "http://127.0.0.1/", "--profile", setup.profile, "--title", "fixture", "--stop-file", str(stop), "--browser-executable", setup.binary]
    monkeypatch.setattr(sys, "argv", setup.argv)
    monkeypatch.setattr(pathlib.Path, "is_file", lambda _: setup.exists)
    monkeypatch.setattr(detect_b_ver, "get_browser_version_from_binary", lambda _: setup.browser_version)
    monkeypatch.setattr(subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(stdout=setup.driver_version))
    def ownership(profile, **kwargs):
        setup.cleanup.append((profile, kwargs))
        return {"verify": lambda pid: setup.cleanup.append(("verify", pid))}
    monkeypatch.setattr(sb_join, "kill_orphans", ownership)
    monkeypatch.setattr(sb_join, "_bootstrap_progress", lambda *_args: None)
    monkeypatch.setattr(browser_launcher, "override_driver_dir", setup.selected.append)
    def stop_launch(**kwargs):
        setup.launched.append(kwargs)
        raise RuntimeError("fixture stopped before browser")
    monkeypatch.setattr(sb_join, "SB", stop_launch)
    return setup


def test_main_managed_driver_refuses_missing_unreadable_and_mismatched_versions(managed_main):
    for exists, browser_version, driver_version, expected in [
            (False, "154.0.8037.92", "ChromeDriver 154.0.8037.92", "required"),
            (True, None, "ChromeDriver 154.0.8037.92", "Cannot verify"),
            (True, "154.0.8037.92", "unknown", "Cannot verify"),
            (True, "153.0.1.2", "ChromeDriver 154.0.8037.92", "major versions differ")]:
        managed_main.exists, managed_main.browser_version, managed_main.driver_version = exists, browser_version, driver_version
        with pytest.raises(RuntimeError, match=expected): sb_join.main()
        assert managed_main.selected == managed_main.launched == managed_main.cleanup == []


def test_main_passes_verified_installed_driver_to_actual_sb_launch_seam(managed_main):
    managed_main.argv[-1] = "cft"
    with pytest.raises(RuntimeError, match="fixture stopped"): sb_join.main()
    assert len(managed_main.selected) == 1 and pathlib.Path(managed_main.selected[0]).name == "drivers"
    launched = managed_main.launched[0]
    assert launched["driver_version"] == "154"
    assert "cft_drivers" in launched["binary_location"]
    assert launched["uc"] is True and launched["headed"] is True
    assert "--enable-unsafe-extension-debugging" in launched["chromium_arg"]
    assert "--deny-permission-prompts" in launched["chromium_arg"].split(",")
    assert "use-fake-ui-for-media-stream" not in launched["chromium_arg"]
    assert "use-fake-device-for-media-stream" not in launched["chromium_arg"]
    assert pathlib.Path(launched["extension_dir"]).resolve() == pathlib.Path(sb_join.__file__).parent / "tab-capture"
    assert managed_main.cleanup == [(managed_main.profile, {"launch": os.name == "nt", "expected_exe": launched["binary_location"]})]


def test_main_cdp_requires_owned_transport_process_extension_worker_and_tab(monkeypatch, managed_main):
    profile, binary, extension, stop = managed_main.profile, managed_main.binary, managed_main.extension, managed_main.stop
    extension_id = "a" * 32
    modes = ("success", "remote", "bad-port", "redirect", "oversized-http", "ws-remote", "ws-path", "ws-query", "wrong-exe", "wrong-profile", "relative-profile", "conflicting-profile", "missing-created", "changed-created", "missing-pid", "missing-extension", "ambiguous-extension", "wrong-worker", "ambiguous-worker", "wrong-tab", "ambiguous-tab", "cdp-error", "oversized-message", "event-flood", "deadline", "bool-id", "nonobject", "result-list", "enabled-string", "clear-error", "clear-rules", "clear-receipt", "clear-javascript")
    for mode in modes:
        commands, connections, http_handlers, process_reads, launches = [], [], [], [], []
        clock = [0]
        def monotonic():
            clock[0] += 16 if mode == "deadline" else .001
            return clock[0]
        class Process:
            def __init__(self, pid): process_reads.append(pid)
            def exe(self): return binary + "-other" if mode == "wrong-exe" else binary
            def cmdline(self):
                argv = [binary, "--user-data-dir=" + (profile + "-other" if mode == "wrong-profile" else profile)]
                if mode == "relative-profile": argv.append("--user-data-dir=relative")
                if mode == "conflicting-profile": argv.append("--user-data-dir=" + profile + "-other")
                return argv
            def create_time(self): return None if mode == "missing-created" else (101 if mode == "changed-created" and len(process_reads) > 1 else 100)
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_args): pass
            def read(self, limit):
                assert limit == 1048577
                if mode == "oversized-http": return b"x" * limit
                endpoint = "ws://127.0.0.1:9222/devtools/browser/owned-1"
                if mode == "ws-remote": endpoint = endpoint.replace("127.0.0.1", "example.com")
                if mode == "ws-path": endpoint = endpoint.replace("/browser/", "/page/")
                if mode == "ws-query": endpoint += "?token=bad"
                return json.dumps({"webSocketDebuggerUrl": endpoint}).encode()
        class Opener:
            def open(self, url, timeout):
                assert url == "http://127.0.0.1:9222/json/version" and 0 < timeout <= 5
                if mode == "redirect":
                    http_handlers[-1].redirect_request(None, None, None, None, None, None)
                return Response()
        class Connection:
            def __init__(self): self.closed = False; self.request = None
            def settimeout(self, timeout): assert 0 < timeout <= 5
            def send(self, value): self.request = json.loads(value); commands.append(self.request)
            def recv(self):
                if mode == "oversized-message": return "x" * 1048577
                if mode == "event-flood": return json.dumps({"method": "noise"})
                if mode == "bool-id": return json.dumps({"id": True, "result": {}})
                if mode == "nonobject": return "[]"
                if mode == "result-list": return json.dumps({"id": self.request["id"], "result": []})
                method = self.request["method"]
                result = {}
                if method == "Extensions.getExtensions":
                    owned = {"enabled": "true" if mode == "enabled-string" else True, "path": extension, "id": extension_id}
                    result = {"extensions": [] if mode == "missing-extension" else [owned, owned] if mode == "ambiguous-extension" else [owned]}
                if method == "Target.getTargets":
                    if self.request["params"].get("filter"):
                        tab = {"type": "tab", "targetId": "tab1", "url": "http://127.0.0.1/"}
                        result = {"targetInfos": [] if mode == "wrong-tab" else [tab, tab] if mode == "ambiguous-tab" else [tab]}
                    else:
                        worker = {"type": "service_worker", "targetId": "worker1", "url": "chrome-extension://" + extension_id + "/background.js"}
                        result = {"targetInfos": [] if mode == "wrong-worker" else [worker, worker] if mode == "ambiguous-worker" else [worker, {"type": "page", "targetId": "page1", "url": "about:blank"}]}
                if method == "Target.attachToTarget": result = {"sessionId": "worker-session"}
                if method == "Runtime.evaluate":
                    cleared = {"rules": [], "receipt": None, "javascript": {"setting": "allow"}}
                    if mode == "clear-rules": cleared["rules"] = [{"id": 910001}]
                    if mode == "clear-receipt": cleared["receipt"] = {"nonce": "stale"}
                    if mode == "clear-javascript": cleared["javascript"] = {"setting": "block"}
                    result = {"exceptionDetails": {}} if mode == "clear-error" else {"result": {"value": cleared}}
                    if mode == "clear-error": result["exceptionDetails"] = {"text": "denied"}
                if mode == "cdp-error" and method == "Extensions.triggerAction": return json.dumps({"id": self.request["id"], "error": {"message": "denied"}})
                return json.dumps({"id": self.request["id"], "result": result})
            def shutdown(self): self.closed = True
            def close(self, timeout):
                assert 0 <= timeout <= 1
                self.closed = True
        def connect(endpoint, **kwargs):
            assert endpoint == "ws://127.0.0.1:9222/devtools/browser/owned-1"
            assert kwargs["suppress_origin"] is True and kwargs["http_no_proxy"] == ["127.0.0.1"] and kwargs["redirect_limit"] == 0
            connection = Connection(); connections.append(connection); return connection
        address = "remote:9222" if mode == "remote" else "127.0.0.1:0" if mode == "bad-port" else "127.0.0.1:9222"
        driver = SimpleNamespace(browser_pid=None if mode == "missing-pid" else 42, capabilities={"goog:chromeOptions": {"debuggerAddress": address}}, current_window_handle="CDwindow-page1", switch_to=SimpleNamespace(new_window=lambda kind: None))
        browser = SimpleNamespace(driver=driver, uc_open_with_reconnect=lambda *_args: None, get_current_url=lambda: "http://127.0.0.1/")
        def build(*handlers):
            assert isinstance(handlers[0], urllib.request.ProxyHandler) and handlers[0].proxies == {}
            http_handlers.extend(handlers); return Opener()
        with monkeypatch.context() as patch:
            patch.setattr(sys, "argv", ["sb_join.py", "http://127.0.0.1/", "--profile", profile, "--title", "fixture", "--stop-file", str(stop), "--capture-extension", extension, "--browser-executable", binary])
            patch.setattr(sb_join, "kill_orphans", lambda _profile, **_kwargs: {"verify": lambda pid: None})
            patch.setattr(sb_join, "_bootstrap_progress", lambda *_args: None)
            patch.setattr(sb_join, "time", SimpleNamespace(time=lambda: 0, monotonic=monotonic, sleep=lambda _: None))
            patch.setattr(psutil, "Process", Process)
            patch.setattr(urllib.request, "build_opener", build)
            patch.setattr(websocket, "create_connection", connect)
            patch.setattr(sb_join, "SB", lambda **kwargs: launches.append(kwargs) or contextlib.nullcontext(browser))
            if mode == "success":
                sb_join.main()
                assert [item["method"] for item in commands][-3:] == ["Target.activateTarget", "Extensions.triggerAction", "Target.detachFromTarget"]
                assert len(process_reads) == 2
                methods = [item["method"] for item in commands]
                assert methods.index("Runtime.evaluate") < methods.index("Extensions.triggerAction")
            else:
                with pytest.raises(RuntimeError): sb_join.main()
                if mode != "cdp-error": assert not any(item["method"] == "Extensions.triggerAction" for item in commands)
            assert all(connection.closed for connection in connections)
            assert "--enable-unsafe-extension-debugging" in launches[0]["chromium_arg"]








if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
