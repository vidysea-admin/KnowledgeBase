"""Existing-profile auth boundary: temporary profiles, intercepted constructors, no browser."""
import contextlib
import json
import os
import pathlib
import sys
from types import SimpleNamespace

import pytest
sys.path.insert(0, os.path.dirname(__file__))
import sb_join


def profile(tmp_path):
    root = tmp_path / "parent"
    (root / "Profile 1").mkdir(parents=True)
    (root / "Profile 1" / "Preferences").write_text('{"profile":{},"keep":"fixture"}')
    return root


@pytest.mark.parametrize("selected", ["", ".", "..", "../Default", "a/b", "a\\b", "C:\\x", "--flag", "a,b", "a\n", " a", "a ", "a.", "x..y"])
def test_bad_selectors_refused_before_cleanup(monkeypatch, tmp_path, selected):
    root = profile(tmp_path)
    monkeypatch.setattr(sb_join.os, "listdir", lambda *_: pytest.fail("cleanup started"))
    with pytest.raises(RuntimeError):
        sb_join.kill_orphans(str(root), profile_directory=selected)


def test_existing_physical_profile_only(tmp_path):
    root = profile(tmp_path)
    assert sb_join.existing_profile_directory(str(root), None) is None
    assert sb_join.existing_profile_directory(str(root), "Profile 1") == "Profile 1"
    for selected in ("Missing", "Default"):
        with pytest.raises(RuntimeError): sb_join.existing_profile_directory(str(root), selected)
    (root / "Profile 1" / "Preferences").unlink()
    with pytest.raises(RuntimeError): sb_join.existing_profile_directory(str(root), "Profile 1")


def test_redirected_profile_refused(monkeypatch, tmp_path):
    root = profile(tmp_path)
    original = os.lstat
    selected = root / "Profile 1"
    monkeypatch.setattr(os, "lstat", lambda p, **kw: SimpleNamespace(st_file_attributes=0x400)
                        if pathlib.Path(p) == selected else original(p, **kw))
    with pytest.raises(RuntimeError, match="Redirected"): sb_join.existing_profile_directory(str(root), "Profile 1")


def test_unsupported_dependency_refuses_before_ownership(monkeypatch, tmp_path):
    import seleniumbase
    root = profile(tmp_path)
    monkeypatch.setattr(seleniumbase, "__version__", "4.52.0")
    monkeypatch.setattr(sys, "argv", ["sb_join.py", "https://example.invalid", "--profile", str(root),
        "--profile-directory", "Profile 1", "--title", "test", "--stop-file", str(tmp_path / "stop")])
    monkeypatch.setattr(sb_join, "kill_orphans", lambda *_a, **_k: pytest.fail("ownership started"))
    monkeypatch.setattr(sb_join, "SB", lambda **_k: pytest.fail("SB started"))
    with pytest.raises(RuntimeError, match="pinned"): sb_join.main()


def test_constructor_capability_and_restoration(monkeypatch):
    from seleniumbase import undetected
    calls = []
    class Supported:
        def __init__(self, options=None, suppress_welcome=True):
            calls.append(suppress_welcome)
    monkeypatch.setattr(undetected, "Chrome", Supported)
    class Options:
        arguments = ["--profile-directory=Profile 1"]
        def add_argument(self, value): self.arguments.append(value)
    with sb_join.selected_uc_profile("Profile 1"):
        undetected.Chrome(options=Options())
    assert undetected.Chrome is Supported and calls == [False]
    with pytest.raises(RuntimeError, match="exactly one"):
        with sb_join.selected_uc_profile("Profile 1"):
            undetected.Chrome(options=SimpleNamespace(arguments=["--profile-directory=Default"]))
    assert undetected.Chrome is Supported
    class Unsupported:
        def __init__(self, options=None): pass
    monkeypatch.setattr(undetected, "Chrome", Unsupported)
    with pytest.raises(RuntimeError, match="capability"): sb_join.validate_uc_profile_support("Profile 1")
    assert undetected.Chrome is Unsupported


@pytest.mark.parametrize("unsupported", ["options-varargs", "welcome-varargs"])
def test_unsupported_keyword_capability_fails_before_ownership(monkeypatch, tmp_path, unsupported):
    """Standing regression for the checker's two recorded cycle-one reproductions."""
    from seleniumbase import undetected
    root = tmp_path / "owned"
    selected = root / "Profile 1"
    selected.mkdir(parents=True)
    (selected / "Preferences").write_text(json.dumps({"profile": {}}))
    if unsupported == "options-varargs":
        class Unsupported:
            def __init__(self, *options, suppress_welcome=True): pass
    else:
        class Unsupported:
            def __init__(self, options=None, *suppress_welcome): pass
    monkeypatch.setattr(undetected, "Chrome", Unsupported)
    monkeypatch.setattr(sys, "argv", ["sb_join.py", "https://example.invalid", "--profile", str(root),
        "--profile-directory", "Profile 1", "--title", "checker fixture", "--stop-file", str(tmp_path / "stop")])
    def ownership(*args, **kwargs):
        pytest.fail("Unsupported keyword capability reached ownership side effects")
    monkeypatch.setattr(sb_join, "kill_orphans", ownership)
    monkeypatch.setattr(sb_join, "SB", lambda **kwargs: pytest.fail("Unexpected browser invocation"))
    with pytest.raises(RuntimeError, match="capability"):
        sb_join.main()


@pytest.mark.parametrize("selected", [None, "Profile 1"])
def test_real_pinned_constructor_final_argv_no_launch(monkeypatch, tmp_path, selected):
    """Run actual dependency option assembly, stopping at Popen before any process/HTTP."""
    import fasteners
    from seleniumbase import undetected
    from seleniumbase.fixtures import shared_utils
    root = profile(tmp_path)
    original = undetected.Chrome
    monkeypatch.setattr(original, "__del__", lambda self: None)
    class NoHTTP:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def get(self, *_a, **_k): return SimpleNamespace(status_code=500)
    monkeypatch.setattr(undetected.requests, "Session", NoHTTP)
    monkeypatch.setattr(fasteners, "InterProcessLock", lambda *_: contextlib.nullcontext())
    monkeypatch.setattr(undetected, "FileLock", lambda *_: contextlib.nullcontext())
    monkeypatch.setattr(shared_utils, "make_writable", lambda *_: None)
    captured = []
    class Intercepted(Exception): pass
    def stopped(argv, **kwargs):
        captured.extend(argv)
        raise Intercepted()
    monkeypatch.setattr(undetected.subprocess, "Popen", stopped)
    options = undetected.ChromeOptions()
    options.binary_location = str(tmp_path / "chrome.exe")
    if selected: options.add_argument("--profile-directory=" + selected)
    options.add_argument("--autoplay-policy=no-user-gesture-required")
    with pytest.raises(Intercepted):
        with sb_join.selected_uc_profile(selected):
            undetected.Chrome(options=options, user_data_dir=str(root), patch_driver=False)
    assert undetected.Chrome is original
    assert [a for a in captured if a.startswith("--profile-directory=")] == ["--profile-directory=" + (selected or "Default")]
    assert "--user-data-dir=" + str(root) in captured
    assert all(flag in captured for flag in ("--no-default-browser-check", "--no-first-run", "--no-service-autorun", "--password-store=basic", "--autoplay-policy=no-user-gesture-required"))
    assert not any("fake" in a for a in captured)


def test_selected_cleanup_preserves_sibling_and_rejects_redirect(monkeypatch, tmp_path):
    """Mock only OS ownership handles; exercise real selected session/Preferences cleanup."""
    import ctypes
    import msvcrt
    import psutil
    import uuid
    root = profile(tmp_path)
    for name in ("Default", "Profile 1"):
        (root / name / "Sessions").mkdir(parents=True)
        (root / name / "Sessions" / "session").write_text("fixture")
    sibling = root / "Default" / "Preferences"
    sibling.write_text('{"profile":{"exit_type":"Crashed"},"keep":"sibling"}')
    nonce = str(uuid.uuid4())
    exe = os.path.normcase(os.path.realpath(tmp_path / "chrome.exe"))
    record = {"version":1,"profile":os.path.normcase(os.path.realpath(root)),"nonce":nonce,
        "job":"Local\\LKB-"+nonce,"phase":"browser","owner":{"pid":41,"created":99,"exe":exe},
        "browserExe":exe,"browser":{"pid":42,"created":100,"exe":exe}}
    (root / ".lkb-ownership.json").write_text(json.dumps(record))
    class Function:
        def __init__(self, name): self.name=name
        def __call__(self, *args):
            if self.name == "OpenJobObjectW": return 0
            return 1
    kernel = SimpleNamespace(**{name:Function(name) for name in ("CreateJobObjectW","OpenJobObjectW","SetInformationJobObject","AssignProcessToJobObject","IsProcessInJob","QueryInformationJobObject","TerminateJobObject","OpenProcess","CloseHandle","GetCurrentProcess")})
    monkeypatch.setattr(ctypes, "WinDLL", lambda *_a, **_k: kernel)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: 2)
    monkeypatch.setattr(psutil, "Process", lambda pid: (_ for _ in ()).throw(psutil.NoSuchProcess(pid)))
    monkeypatch.setattr(msvcrt, "locking", lambda *_: None)
    before = sibling.read_bytes()
    sb_join.kill_orphans(str(root), profile_directory="Profile 1")
    assert sibling.read_bytes() == before and (root / "Default" / "Sessions" / "session").exists()
    assert not (root / "Profile 1" / "Sessions").exists()
    prefs = json.loads((root / "Profile 1" / "Preferences").read_text())
    assert prefs == {"profile":{"exit_type":"Normal","exited_cleanly":True},"keep":"fixture"}
    sessions = root / "Profile 1" / "Sessions"
    sessions.mkdir(); child=sessions / "redirect"; child.write_text("fixture")
    original=os.lstat
    monkeypatch.setattr(os,"lstat",lambda p, **kw: SimpleNamespace(st_file_attributes=0x400) if pathlib.Path(p)==child else original(p, **kw))
    with pytest.raises(RuntimeError, match="Redirected"): sb_join.kill_orphans(str(root), profile_directory="Profile 1")
    assert child.exists() and sibling.read_bytes() == before
