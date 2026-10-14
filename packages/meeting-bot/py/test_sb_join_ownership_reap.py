"""ISS-REGFLAKE-002: a recycled owner PID must not block terminating the verified, named, owned Job."""
import ctypes
import json
import msvcrt
import os
import pathlib
import sys
import uuid
from types import SimpleNamespace

import psutil
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import sb_join

# mode: (owner process, browser process, job, flags ok, member, phase, expected)
CASES = {
    "recycled-owner-browser-alive-verified": ("stranger", "alive", "present", True, True, "browser", "terminate"),
    "recycled-owner-contained-phase-verified": ("stranger", "none", "present", True, True, "contained", "terminate"),
    "recycled-owner-browser-gone-job-present": ("stranger", "gone", "present", True, True, "browser", "terminate"),
    "recycled-owner-job-gone-browser-gone": ("stranger", "gone", "missing", True, True, "browser", "clean"),
    "recycled-owner-foreign-job-flags": ("stranger", "alive", "present", False, True, "browser", "refuse"),
    "recycled-owner-browser-outside-job": ("stranger", "alive", "present", True, False, "browser", "refuse"),
    "recycled-owner-job-missing-browser-alive": ("stranger", "alive", "missing", True, True, "browser", "refuse"),
    "recycled-owner-recycled-browser": ("stranger", "stranger", "present", True, True, "browser", "refuse"),
    "owner-still-alive": ("same", "alive", "present", True, True, "browser", "refuse"),
}


@pytest.mark.parametrize("mode", list(CASES))
def test_recycled_owner_pid_does_not_block_verified_job_termination(monkeypatch, tmp_path, mode):
    owner_state, browser_state, job_state, flags_ok, member, phase, expected = CASES[mode]
    root = tmp_path / "profile"; root.mkdir()
    expected_profile = os.path.normcase(os.path.realpath(root))
    executable = os.path.normcase(os.path.realpath(tmp_path / "chrome.exe"))
    nonce = str(uuid.uuid4())
    record = {"version": 1, "profile": expected_profile, "nonce": nonce, "job": "Local\\LKB-" + nonce, "phase": phase,
              "owner": {"pid": 41, "created": 99, "exe": executable}, "browserExe": executable}
    if phase == "browser":
        record["browser"] = {"pid": 42, "created": 100, "exe": executable}
    ledger = root / ".lkb-ownership.json"
    ledger.write_text(json.dumps(record))
    (root / "Default" / "Sessions").mkdir(parents=True)
    terminated, opened_jobs, unsafe = [], [], []

    class Process:
        def __init__(self, pid):
            self.pid = pid
            state = owner_state if pid == 41 else browser_state
            if state in ("gone", "none"):
                raise psutil.NoSuchProcess(pid)
        def create_time(self):
            state = owner_state if self.pid == 41 else browser_state
            return 200 if state == "stranger" else 99 if self.pid == 41 else 100
        def exe(self): return executable
        def kill(self): unsafe.append(("kill", self.pid))
        def terminate(self): unsafe.append(("terminate", self.pid))

    class Function:
        def __init__(self, name): self.name = name
        def __call__(self, *args):
            if self.name == "OpenJobObjectW":
                opened_jobs.append(args[2])
                return 7 if job_state == "present" else 0
            if self.name == "QueryInformationJobObject":
                if args[1] == 9: args[2]._obj.Basic.Flags = 0x2000 if flags_ok else 0
                else: args[2]._obj.Active = 0
            if self.name == "IsProcessInJob": args[2]._obj.value = member
            if self.name == "TerminateJobObject": terminated.append(args[0])
            if self.name == "AssignProcessToJobObject": raise AssertionError("cleanup must never enter the Job")
            return 1

    names = ("CreateJobObjectW", "OpenJobObjectW", "SetInformationJobObject", "AssignProcessToJobObject", "IsProcessInJob",
             "QueryInformationJobObject", "TerminateJobObject", "OpenProcess", "CloseHandle", "GetCurrentProcess")
    kernel = SimpleNamespace(**{name: Function(name) for name in names})
    monkeypatch.setattr(sb_join, "os", SimpleNamespace(**{**vars(os), "name": "nt", "remove": lambda path: None}))
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(ctypes, "WinDLL", lambda *_a, **_k: kernel)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: 2)
    monkeypatch.setattr(psutil, "process_iter", lambda: (_ for _ in ()).throw(AssertionError("foreign scan forbidden")))
    monkeypatch.setattr(psutil, "Process", Process)
    monkeypatch.setattr(msvcrt, "locking", lambda *_a: None)
    clock = iter((0, 1))
    monkeypatch.setattr(sb_join.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(sb_join.time, "sleep", lambda _: None)

    if expected == "refuse":
        with pytest.raises(RuntimeError, match="parent is still alive" if owner_state == "same" else None):
            sb_join.kill_orphans(str(root))
        assert terminated == [] and json.loads(ledger.read_text()) == record
    else:
        sb_join.kill_orphans(str(root))
        assert terminated == ([7] if expected == "terminate" else [])
        assert json.loads(ledger.read_text())["phase"] == "cleaned"
    assert unsafe == []  # a stranger holding the recycled PID is never signalled
    if job_state == "present" or expected != "refuse":
        assert opened_jobs in ([record["job"]], [])

