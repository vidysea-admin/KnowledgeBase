"""Windows-only owned-command runner. No command starts until assigned to its job.

Usage: existing-python -B run_bounded.py TIMEOUT NEW_RECEIPT_DIR COMMAND [ARGS...]
New receipt directory must be an immediate child of this evidence directory.
"""
import ctypes as C
from ctypes import wintypes as W
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import subprocess
import sys
import time
import _winapi


class BasicLimits(C.Structure):
    _fields_ = [("process_time", C.c_longlong), ("job_time", C.c_longlong),
                ("flags", W.DWORD), ("min_ws", C.c_size_t),
                ("max_ws", C.c_size_t), ("active_processes", W.DWORD),
                ("affinity", C.c_size_t), ("priority", W.DWORD),
                ("scheduling", W.DWORD)]


class IO(C.Structure):
    _fields_ = [(name, C.c_ulonglong) for name in
                ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]


class ExtendedLimits(C.Structure):
    _fields_ = [("basic", BasicLimits), ("io", IO),
                ("process_memory", C.c_size_t), ("job_memory", C.c_size_t),
                ("peak_process_memory", C.c_size_t), ("peak_job_memory", C.c_size_t)]


def main():
    timeout = float(sys.argv[1])
    if not 0 < timeout <= 180:
        raise ValueError("timeout outside (0,180]")
    destination = Path(sys.argv[2]).absolute()
    if destination.parent.resolve() != Path(__file__).resolve().parent or destination.exists():
        raise ValueError("receipt directory must be a fresh immediate child")
    command = sys.argv[3:]
    if not command or not Path(command[0]).is_absolute():
        raise ValueError("absolute command executable required")
    destination.mkdir()
    receipt = {"command": command, "pid": None, "assigned_job": False,
               "resumed": False, "timed_out": False, "exit_code": None,
               "started_at": time.time(), "runtime_total_tokens": None}
    origin = time.monotonic()
    def save():
        receipt["elapsed_s"] = time.monotonic() - origin
        (destination / "receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    kernel = C.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [C.c_void_p, W.LPCWSTR]
    kernel.CreateJobObjectW.restype = W.HANDLE
    kernel.SetInformationJobObject.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [W.HANDLE, W.HANDLE]
    kernel.ResumeThread.argtypes = [W.HANDLE]
    kernel.ResumeThread.restype = W.DWORD
    kernel.CloseHandle.argtypes = [W.HANDLE]
    job = kernel.CreateJobObjectW(None, None)
    process = thread = None
    if not job:
        raise C.WinError(C.get_last_error())
    try:
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not kernel.SetInformationJobObject(job, 9, C.byref(limits), C.sizeof(limits)):
            raise C.WinError(C.get_last_error())
        with open(destination / "stdout.bin", "wb", buffering=0) as out, open(destination / "stderr.bin", "wb", buffering=0) as err, open(os.devnull, "rb") as inp:
            handles = [msvcrt.get_osfhandle(f.fileno()) for f in (inp, out, err)]
            for handle in handles:
                os.set_handle_inheritable(handle, True)
            startup = subprocess.STARTUPINFO()
            startup.dwFlags |= subprocess.STARTF_USESTDHANDLES
            startup.hStdInput, startup.hStdOutput, startup.hStdError = handles
            startup.lpAttributeList = {"handle_list": handles}
            process, thread, pid, tid = _winapi.CreateProcess(
                None, subprocess.list2cmdline(command), None, None, True,
                0x4 | 0x80000 | 0x8000000, None, None, startup)
            receipt["pid"], receipt["thread_id"] = pid, tid
            save()
            if not kernel.AssignProcessToJobObject(job, process):
                raise C.WinError(C.get_last_error())
            receipt["assigned_job"] = True
            save()
            if kernel.ResumeThread(thread) == 0xFFFFFFFF:
                raise C.WinError(C.get_last_error())
            receipt["resumed"] = True
            save()
            if _winapi.WaitForSingleObject(process, int(timeout * 1000)) == 258:
                receipt["timed_out"] = True
            else:
                receipt["exit_code"] = _winapi.GetExitCodeProcess(process)
    except BaseException as exc:
        receipt["error_type"] = type(exc).__name__
        receipt["error"] = str(exc)
        raise
    finally:
        # Closing job terminates every assigned descendant, also on errors.
        kernel.CloseHandle(job)
        if process is not None:
            if not receipt["assigned_job"]:
                _winapi.TerminateProcess(process, 1)  # never resumed
            wait = _winapi.WaitForSingleObject(process, 5000)
            receipt["direct_child_terminal"] = wait == 0
            if wait == 0:
                receipt["final_child_exit_code"] = _winapi.GetExitCodeProcess(process)
            _winapi.CloseHandle(process)
        if thread is not None:
            _winapi.CloseHandle(thread)
        for name in ("stdout.bin", "stderr.bin"):
            path = destination / name
            if path.exists():
                receipt[name] = {"size": path.stat().st_size,
                                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        save()
    return 124 if receipt["timed_out"] else receipt["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
