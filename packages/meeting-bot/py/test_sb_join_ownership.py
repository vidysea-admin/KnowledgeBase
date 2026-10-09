"""Mocked ownership/cleanup cases and controlled localhost native-browser confinement tests."""
import os
import sys
import json
import pathlib
import psutil
import pytest
from types import SimpleNamespace
sys.path.insert(0, os.path.dirname(__file__))
import sb_join

def test_linux_orphan_cleanup_exact_identity_and_refusals(monkeypatch, tmp_path):
    import builtins
    import io
    import signal
    profile = str(tmp_path / "profile")
    original_open = builtins.open
    original_listdir = os.listdir
    original_readlink = os.readlink
    cases = ("owned", "separate", "neighbor", "substring", "ambiguous", "renderer", "missing-exe", "changed", "nonexit")
    for mode in cases:
        calls, reads = [], [0]
        alive = [True]
        argv = ["chrome", "--user-data-dir=" + profile]
        if mode == "separate": argv = ["chrome", "--user-data-dir", profile]
        if mode in ("neighbor", "substring"): argv[1] += "-other"
        if mode == "ambiguous": argv.append("--user-data-dir=" + profile)
        if mode == "renderer": argv.append("--type=renderer")
        def readlink(path):
            if str(path) != "/proc/42/exe": return original_readlink(path)
            reads[0] += 1
            if mode == "missing-exe": raise PermissionError()
            return ("/other/chrome" if mode == "changed" and reads[0] > 1 else "/managed/chrome")
        def opened(path, *args, **kwargs):
            if str(path) == "/proc/42/cmdline": return io.BytesIO("\0".join(argv).encode() + b"\0")
            if str(path) == "/proc/42/stat": return io.StringIO("42 (chrome) " + " ".join(["S"] + ["0"] * 18 + ["123"]))
            return original_open(path, *args, **kwargs)
        def kill(pid, sig):
            assert pid == 42
            if sig == signal.SIGTERM:
                calls.append((pid, sig))
                if mode != "nonexit": alive[0] = False
            elif not alive[0]: raise ProcessLookupError()
        clock = iter(range(100))
        with monkeypatch.context() as patch:
            patch.setattr(sys, "platform", "linux")
            patch.setattr(os, "listdir", lambda path: ["42"] if path == "/proc" else original_listdir(path))
            patch.setattr(os, "readlink", readlink)
            patch.setattr(builtins, "open", opened)
            patch.setattr(os, "kill", kill)
            patch.setattr(sb_join.time, "monotonic", lambda: next(clock))
            patch.setattr(sb_join.time, "sleep", lambda _: None)
            if mode in ("changed", "nonexit"):
                with pytest.raises(RuntimeError, match="identity changed|remains alive"):
                    sb_join.kill_orphans(profile)
            else:
                sb_join.kill_orphans(profile)
        assert calls == ([(42, signal.SIGTERM)] if mode in ("owned", "separate", "nonexit") else [])


def test_windows_cleanup_exact_profile_identity_and_failure_gate(monkeypatch, tmp_path):
    import ctypes
    import msvcrt
    import shutil
    import uuid
    modes = ("owned", "separate", "neighbor", "duplicate", "equivalent", "conflicting", "relative", "empty", "malformed", "renderer", "nonbrowser", "missing", "reuse", "denied", "nonexit", "owner-alive", "owner-reuse", "job-missing", "wrong-membership", "changed-limits", "legacy", "occupied", "reparse")
    for mode in modes:
        profile = str(tmp_path / mode)
        root = pathlib.Path(profile); root.mkdir()
        expected = os.path.normcase(os.path.realpath(profile))
        executable = os.path.normcase(os.path.realpath(tmp_path / "chrome.exe"))
        nonce = str(uuid.uuid4())
        record = {"version": 1, "profile": expected, "nonce": nonce, "job": "Local\\LKB-" + nonce,
                  "phase": "browser", "owner": {"pid": 41, "created": 99, "exe": executable},
                  "browserExe": executable, "browser": {"pid": 42, "created": 100, "exe": executable}}
        if mode in ("neighbor", "conflicting", "relative", "empty"): record["profile"] = {"neighbor": expected + "-neighbor", "conflicting": expected + "-other", "relative": "owned-profile", "empty": ""}[mode]
        if mode == "malformed": record["browser"]["pid"] = True
        if mode == "renderer": record["phase"] = "contained"
        if mode == "nonbrowser": record["browser"]["exe"] = os.path.normcase(os.path.realpath(tmp_path / "other.exe"))
        if mode == "missing": record["browser"]["created"] = None
        ledger = root / ".lkb-ownership.json"
        if mode != "legacy": ledger.write_text(json.dumps(record))
        for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"): (root / name).write_text("fixture")
        (root / "Default" / "Sessions").mkdir(parents=True)
        terminated, deleted, queries = [], [], []
        class Process:
            def __init__(self, pid):
                self.pid = pid
                if pid == 41 and mode not in ("owner-alive", "owner-reuse"): raise psutil.NoSuchProcess(pid)
                if mode == "denied": raise psutil.AccessDenied(pid)
            def create_time(self): return 200 if mode in ("reuse", "owner-reuse") else 99 if self.pid == 41 else 100
            def exe(self): return executable
        class Function:
            def __init__(self, name): self.name = name
            def __call__(self, *args):
                if self.name == "OpenJobObjectW": return 0 if mode == "job-missing" else 7
                if self.name == "QueryInformationJobObject":
                    queries.append(args[1])
                    if args[1] == 9: args[2]._obj.Basic.Flags = 0 if mode == "changed-limits" else 0x2000
                    else: args[2]._obj.Active = 1 if mode == "nonexit" else 0
                if self.name == "IsProcessInJob": args[2]._obj.value = mode != "wrong-membership"
                if self.name == "TerminateJobObject": terminated.append(args[0])
                if self.name == "AssignProcessToJobObject": raise AssertionError("pytest parent must never enter owned Job")
                return 1
        kernel = SimpleNamespace(**{name: Function(name) for name in ("CreateJobObjectW", "OpenJobObjectW", "SetInformationJobObject", "AssignProcessToJobObject", "IsProcessInJob", "QueryInformationJobObject", "TerminateJobObject", "OpenProcess", "CloseHandle", "GetCurrentProcess")})
        with monkeypatch.context() as patch:
            patch.setattr(sb_join, "os", SimpleNamespace(**{**vars(os), "name": "nt", "remove": lambda path: deleted.append(path)}))
            patch.setattr(sys, "platform", "win32")
            patch.setattr(ctypes, "WinDLL", lambda *_args, **_kwargs: kernel)
            patch.setattr(ctypes, "get_last_error", lambda: 2)
            patch.setattr(psutil, "process_iter", lambda: (_ for _ in ()).throw(AssertionError("foreign process scan forbidden")))
            patch.setattr(psutil, "Process", Process)
            patch.setattr(msvcrt, "locking", lambda *_args: (_ for _ in ()).throw(OSError("occupied")) if mode == "occupied" else None)
            patch.setattr(shutil, "rmtree", lambda path, **_kwargs: deleted.append(path))
            clock = iter((0, 6))
            patch.setattr(sb_join.time, "monotonic", lambda: next(clock))
            patch.setattr(sb_join.time, "sleep", lambda _: None)
            if mode == "reparse":
                original_lstat = os.lstat
                patch.setattr(sb_join.os, "lstat", lambda path: SimpleNamespace(st_file_attributes=0x400) if str(path) == expected else original_lstat(path))
            if mode in ("owned", "separate", "duplicate", "equivalent"):
                sb_join.kill_orphans(profile)
                assert terminated == [7] and queries == [9, 1]
                assert len(deleted) == 4 and json.loads(ledger.read_text())["phase"] == "cleaned"
            else:
                with pytest.raises((RuntimeError, psutil.AccessDenied)):
                    sb_join.kill_orphans(profile)
                assert deleted == []
                assert terminated == ([7] if mode == "nonexit" else [])
                if mode != "legacy": assert json.loads(ledger.read_text()) == record


def test_cleanup_only_uses_existing_exact_profile_cleanup_without_browser(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(sys, "argv", ["sb_join.py", "http://127.0.0.1/", "--profile", str(tmp_path), "--title", "cleanup", "--stop-file", str(tmp_path / "stop"), "--cleanup-only"])
    monkeypatch.setattr(sb_join, "kill_orphans", lambda profile: calls.append(profile))
    monkeypatch.setattr(sb_join, "SB", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("browser launch forbidden")))
    sb_join.main()
    assert calls == [str(tmp_path)]


@pytest.mark.parametrize("registration_url", ["https://organizer.example/register", "https://organizer.example:443/register", "https://organizer.example:8443/register", "http://127.0.0.1/register", "http://127.0.0.1:80/register", "http://127.0.0.1:8080/register"])
@pytest.mark.parametrize("fault", ["none", "ownership", "blank", "receipt", "transport", "service-worker"])
def test_registration_main_disables_scripts_before_same_target_navigation(monkeypatch, tmp_path, capsys, fault, registration_url):
    import contextlib, io, json, pathlib, urllib.request, websocket, psutil
    from urllib.parse import urlsplit
    import sb_join
    from types import SimpleNamespace
    calls, installed = [], {}
    extension = str(pathlib.Path(sb_join.__file__).parent / "tab-capture")
    binary = str(tmp_path / "chrome.exe")
    driver = SimpleNamespace(browser_pid=42, capabilities={"goog:chromeOptions": {"debuggerAddress": "127.0.0.1:9222"}},
        current_window_handle="CDwindow-owned", switch_to=SimpleNamespace(new_window=lambda kind: calls.append(("new-target", kind))),
        set_page_load_timeout=lambda n: calls.append(("page_timeout", n)), set_script_timeout=lambda n: calls.append(("script_timeout", n)),
        execute_cdp_cmd=lambda method, args: None if (fault == "transport" and method == "Network.enable") or (fault == "service-worker" and method == "Network.setBypassServiceWorker") else calls.append((method, args)) or {}, default_get=lambda url: calls.append(("navigate", url)))
    class Process:
        def __init__(self, pid): assert pid == 42
        def exe(self): return binary
        def create_time(self): return 100
        def cmdline(self): return [binary, "--user-data-dir=" + str(tmp_path)]
    class Response:
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read(self, limit): return json.dumps({"webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/browser/owned"}).encode()
    class Connection:
        def settimeout(self, value): pass
        def send(self, text): self.request = json.loads(text); calls.append((self.request["method"], self.request["params"]))
        def recv(self):
            method, params = self.request["method"], self.request["params"]; result = {}
            if method == "Extensions.getExtensions": result = {"extensions": [{"id": "a" * 32, "enabled": True, "path": extension}]}
            if method == "Target.getTargets": result = {"targetInfos": [{"type": "service_worker", "targetId": "worker", "url": "chrome-extension://" + "a" * 32 + "/background.js"}, {"type": "page", "targetId": "other" if fault == "blank" else "owned", "url": "about:blank"}]}
            if method == "Target.attachToTarget": result = {"sessionId": "worker-session"}
            if method == "Runtime.evaluate":
                expression = params["expression"]
                if expression.startswith("installRegistrationPolicy("):
                    input = json.loads(expression[len("installRegistrationPolicy("):-1]); installed.update(receipt=input["receipt"], rules=input["rules"], javascript={"setting": "block"})
                result = {"result": {"value": dict(installed, receipt={"nonce": "wrong"}) if fault == "receipt" else dict(installed)}}
            return json.dumps({"id": self.request["id"], "result": result})
        def close(self, **kwargs): pass
        def shutdown(self): pass
    @contextlib.contextmanager
    def fake_sb(**kwargs):
        assert kwargs["extension_dir"] == extension
        yield SimpleNamespace(driver=driver)
    def registered(_sb, instructions, script_isolated=False, policy_check=None):
        assert _sb.driver is driver and script_isolated is True
        assert callable(policy_check) and policy_check() is True
        calls.append(("submitted", instructions["url"]))
        return {"status": "submitted", "reason": "awaiting_confirmation"}
    instructions = {"url": registration_url, "allowedHosts": [urlsplit(registration_url).hostname], "localFixture": registration_url.startswith("http:"), "operator": {"firstName": "Fixture", "lastName": "Operator", "email": "fixture@example.test"}, "form": {"mode": "native-html", "formSelector": "#form", "submitSelector": "#submit", "fields": {"firstName": "#first", "lastName": "#last", "email": "#email"}}}
    from seleniumbase.core import browser_launcher, detect_b_ver
    import subprocess
    monkeypatch.setattr(pathlib.Path, "is_file", lambda _: True)
    monkeypatch.setattr(detect_b_ver, "get_browser_version_from_binary", lambda _: "154.0.8037.92")
    monkeypatch.setattr(subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(stdout="ChromeDriver 154.0.8037.92"))
    monkeypatch.setattr(browser_launcher, "override_driver_dir", lambda _: None)
    monkeypatch.setattr(sb_join, "SB", fake_sb)
    def owned(pid):
        if fault == "ownership": raise RuntimeError("fixture ownership refused")
        calls.append(("owned", pid))
    monkeypatch.setattr(sb_join, "kill_orphans", lambda profile, **kwargs: {"verify": owned})
    monkeypatch.setattr(sb_join, "register_form", registered)
    monkeypatch.setattr(psutil, "Process", Process)
    monkeypatch.setattr(urllib.request, "build_opener", lambda *_args: SimpleNamespace(open=lambda *_args, **_kwargs: Response()))
    monkeypatch.setattr(websocket, "create_connection", lambda *_args, **_kwargs: Connection())
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(instructions)))
    monkeypatch.setattr(sys, "argv", ["sb_join.py", "about:blank", "--profile", str(tmp_path), "--title", "fixture", "--stop-file", str(tmp_path / "stop"), "--browser-executable", binary, "--registration-stdin"])
    if fault != "none":
        with pytest.raises(RuntimeError): sb_join.main()
        assert not any(method in ("navigate", "submitted") for method, _ in calls)
        assert instructions["url"] not in capsys.readouterr().out
        return
    sb_join.main()
    assert calls.index(("owned", 42)) < calls.index(("new-target", "tab"))
    methods = [method for method, _ in calls]
    assert methods.index("Runtime.evaluate") < methods.index("Network.enable") < methods.index("Network.setBypassServiceWorker") < methods.index("Emulation.setScriptExecutionDisabled") < methods.index("navigate") < methods.index("submitted")
    assert ("Emulation.setScriptExecutionDisabled", {"value": True}) in calls
    assert ("Network.setBypassServiceWorker", {"bypass": True}) in calls
    assert instructions["url"] not in capsys.readouterr().out
    import re
    from urllib.parse import urlsplit
    parsed = urlsplit(registration_url); default_port = 443 if parsed.scheme == "https" else 80; port = parsed.port or default_port; host = parsed.hostname
    rules = installed["rules"]; pattern = rules[1]["condition"]["regexFilter"]
    assert re.search(pattern, f"{parsed.scheme}://{host}:{port}/submit")
    assert bool(re.search(pattern, f"{parsed.scheme}://{host}/submit")) == (port == default_port)
    for other in (80, 443, 444, 8080, 8443, 9443):
        assert bool(re.search(pattern, f"{parsed.scheme}://{host}:{other}/submit")) == (other == port)
    for forbidden in (f"{'http' if parsed.scheme == 'https' else 'https'}://{host}:{port}/", f"{parsed.scheme}://{host}.evil:{port}/", f"{parsed.scheme}://{host}:{port}@evil.example/", f"{parsed.scheme}://user@{host}:{port}/"):
        assert re.search(pattern, forbidden) is None
    assert rules[0]["action"] == {"type": "block"} and rules[0]["condition"]["urlFilter"] == "*"
    assert len(rules[0]["condition"]["resourceTypes"]) == 15
    assert rules[1]["condition"]["resourceTypes"] == rules[0]["condition"]["resourceTypes"]



@pytest.mark.parametrize("case", ["wrong-action", "wrong-page", "native307", "native308", "resource", "positive", "positive-alias"])
def test_registration_native_same_host_other_port_confinement(tmp_path, case):
    """Actual main: same hostname is insufficient for POST or reflected resource traffic."""
    import http.server, threading, subprocess, shutil, time
    from urllib.parse import parse_qs
    posts, foreign, cookies = [], [], []
    mode = [case]
    class Foreign(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args): pass
        def do_GET(self): foreign.append(("GET", self.path)); self.send_response(200); self.end_headers()
        def do_POST(self): foreign.append(("POST", self.path, self.rfile.read(int(self.headers["Content-Length"])))); self.send_response(200); self.end_headers()
    foreign_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Foreign)
    class Approved(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args): pass
        def do_GET(self):
            if mode[0] == "wrong-page":
                self.send_response(302); self.send_header("Location", f"http://127.0.0.1:{foreign_server.server_port}/page"); self.end_headers(); return
            action = f"http://127.0.0.1:{foreign_server.server_port}/submit" if mode[0] == "wrong-action" else "/submit"
            self.send_response(200); self.send_header("Content-Type", "text/html"); self.send_header("Set-Cookie", "auth=fixture; Path=/"); self.end_headers()
            self.wfile.write(('<form id="registration" method="post" action="' + action + '"><input id="first" name="first"><input id="last" name="last"><input id="email" name="email"><input type="hidden" name="csrf" value="token"><button type="submit">Register</button></form>').encode())
        def do_POST(self):
            posts.append({"path": self.path, "values": parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())}); cookies.append(self.headers.get("Cookie"))
            code = 307 if mode[0] in ("native307", "positive-alias") else 308 if mode[0] == "native308" else None
            if code and self.path == "/submit":
                destination = f"http://localhost:{self.server.server_port}/redirected" if mode[0] == "positive-alias" else f"http://127.0.0.1:{foreign_server.server_port}/redirected"
                self.send_response(code); self.send_header("Location", destination); self.end_headers()
            else:
                self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
                self.wfile.write((f'<img src="http://127.0.0.1:{foreign_server.server_port}/leak?email=fixture">Await confirmation').encode())
    approved = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Approved)
    for server in (approved, foreign_server): threading.Thread(target=server.serve_forever, daemon=True).start()
    # Observe values after the real helper, without replacing policy, transport or submission.
    source = pathlib.Path(sb_join.__file__).read_text(encoding="utf-8")
    needle = 'emit("registration-result", **register_form(sb, registration, script_isolated=True, policy_check=policy_check))'
    assert source.count(needle) == 1
    observer = "return Array.from(document.querySelectorAll('#first,#last,#email'), element => element.value)"
    instrumented = source.replace(needle, 'result = register_form(sb, registration, script_isolated=True, policy_check=policy_check)\n                    emit("registration-result", **result)\n                    emit("fixture-values", values=sb.driver.execute_script(' + json.dumps(observer) + '))')
    compile(instrumented, "fixture-main", "exec")
    expected_values = {"first": ["Fixture"], "last": ["Operator"], "email": ["fixture@example.test"], "csrf": ["token"]}
    try:
        mode[0] = case; posts.clear(); foreign.clear(); cookies.clear()
        root = tmp_path / case; root.mkdir(); program = root / "sb_join.py"; program.write_text(instrumented, encoding="utf-8")
        shutil.copytree(pathlib.Path(sb_join.__file__).parent / "tab-capture", root / "tab-capture")
        profile = str((root / "profile").resolve()); stop = str((root / "stop").resolve())
        instructions = {"url": f"http://127.0.0.1:{approved.server_port}/register", "localFixture": True,
            "allowedHosts": ["127.0.0.1", "localhost"] if case == "positive-alias" else ["127.0.0.1"],
            "operator": {"firstName": "Fixture", "lastName": "Operator", "email": "fixture@example.test"},
            "form": {"mode": "native-html", "formSelector": "#registration", "submitSelector": "button[type=submit]", "fields": {"firstName": "#first", "lastName": "#last", "email": "#email"}}}
        command = [sys.executable, str(program), "about:blank", "--profile", profile, "--title", "Fixture", "--stop-file", stop]
        try:
            result = subprocess.run(command + ["--browser-executable", "cft", "--registration-stdin"], input=json.dumps(instructions), capture_output=True, text=True, timeout=55)
            assert result.returncode == 0, (case, result.stdout, result.stderr)
            events = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
            outcome = next(event for event in events if event.get("event") == "registration-result")
            values = next(event["values"] for event in events if event.get("event") == "fixture-values")
            assert foreign == [], (case, foreign)
            if case in ("wrong-action", "wrong-page"):
                assert values == (["", "", ""] if case == "wrong-action" else [])
                assert posts == [] and cookies == []
                assert outcome["status"] == "action_required" and outcome["reason"] == "redirect_host"
            else:
                assert outcome["status"] in ("submitted", "uncertain")
                paths = ["/submit", "/redirected"] if case == "positive-alias" else ["/submit"]
                assert posts == [{"path": path, "values": expected_values} for path in paths]
                assert cookies == (["auth=fixture", None] if case == "positive-alias" else ["auth=fixture"] * len(paths))
        finally:
            # The parent exited before independent cleanup. Only this fixture's exact Job/profile is eligible.
            # Verify identity, exercise strict owned cleanup, then prove recorded browser death.
            record = json.loads((root / "profile" / ".lkb-ownership.json").read_text())
            import psutil
            try:
                process = psutil.Process(record["browser"]["pid"])
                assert process.create_time() == record["browser"]["created"]
                assert os.path.normcase(os.path.realpath(process.exe())) == record["browser"]["exe"]
            except psutil.NoSuchProcess: pass
            cleanup_started, cleanup_attempts = time.monotonic(), 1
            cleanup = subprocess.run(command + ["--cleanup-only"], capture_output=True, text=True, timeout=25)
            deadline = time.monotonic() + 15
            while cleanup.returncode and "Cannot inspect owned Job" in cleanup.stdout + cleanup.stderr and time.monotonic() < deadline:
                # Replay only the exact ledger after asynchronous owned Job teardown; never repair on refusal.
                time.sleep(.1); cleanup_attempts += 1
                cleanup = subprocess.run(command + ["--cleanup-only"], capture_output=True, text=True, timeout=25)
            assert cleanup.returncode == 0, (case, cleanup.stdout, cleanup.stderr)
            assert json.loads((root / "profile" / ".lkb-ownership.json").read_text())["phase"] == "cleaned"
            print(json.dumps({"fixture_case": case, "cleanup_attempts": cleanup_attempts, "cleanup_seconds": round(time.monotonic() - cleanup_started, 3), "ledger_phase": "cleaned"}))
            try:
                process = psutil.Process(record["browser"]["pid"])
                assert process.create_time() == record["browser"]["created"]
                assert os.path.normcase(os.path.realpath(process.exe())) == record["browser"]["exe"]
                process.wait(timeout=10)
            except psutil.NoSuchProcess: pass
    finally:
        for server in (approved, foreign_server): server.shutdown(); server.server_close()


@pytest.mark.parametrize("url", ["https://organizer.example/register", "https://organizer.example:443/register", "https://organizer.example:8443/register", "http://127.0.0.1/register", "http://127.0.0.1:80/register", "http://127.0.0.1:8080/register"])
def test_registration_csp_exact_origin(url):
    from urllib.parse import urlsplit
    parsed = urlsplit(url); port = parsed.port or (443 if parsed.scheme == "https" else 80)
    hosts = [parsed.hostname, "localhost"] if parsed.scheme == "http" else [parsed.hostname, "other.example"]
    policies = []
    def execute(_script, *arguments):
        if len(arguments) == 1:
            policies.append(arguments[0]); return True
        return {"status": "ready" if arguments[-1] == "inspect" else "submitted", "reason": "fixture"}
    browser = SimpleNamespace(execute_script=execute, execute_cdp_cmd=lambda *_args: {})
    instructions = {"url": url, "allowedHosts": hosts, "localFixture": parsed.scheme == "http"}
    assert sb_join.register_form(browser, instructions, script_isolated=True, policy_check=lambda: True)["status"] == "submitted"
    assert policies == ["form-action " + " ".join(f"{parsed.scheme}://{host}:{port}" for host in hosts)]
