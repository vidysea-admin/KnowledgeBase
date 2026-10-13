"""sb_join: owned-profile browser cleanup and Windows Job containment (moved verbatim from sb_join.py).

`os` and `time` are keyword parameters so sb_join.kill_orphans can hand over its own (patchable) module globals.
"""
import json
import os
import sys
import time

from sb_join_profile import existing_profile_directory


def kill_orphans(profile, launch=False, expected_exe=None, profile_directory=None, *, os=os, time=time):
    """Windows ownership is established before launch; cleanup never scans foreign processes."""
    existing_profile_directory(profile, profile_directory)
    import subprocess
    if sys.platform.startswith("linux"):
        import signal
        expected = os.path.realpath(profile)

        def identity(pid):
            try:
                base = "/proc/" + str(pid)
                executable = os.path.realpath(os.readlink(base + "/exe"))
                if os.path.basename(executable) not in ("chrome", "chromium", "chromium-browser"):
                    return None
                with open(base + "/cmdline", "rb") as handle:
                    argv = [part.decode("utf-8", "strict") for part in handle.read().split(b"\0") if part]
                if any(arg == "--type" or arg.startswith("--type=") for arg in argv):
                    return None
                profiles = []
                for index, arg in enumerate(argv):
                    if arg.startswith("--user-data-dir="):
                        profiles.append(arg.split("=", 1)[1])
                    elif arg == "--user-data-dir" and index + 1 < len(argv):
                        profiles.append(argv[index + 1])
                if len(profiles) != 1 or not os.path.isabs(profiles[0]) or os.path.realpath(profiles[0]) != expected:
                    return None
                with open(base + "/stat", encoding="utf-8") as handle:
                    start_time = handle.read().rsplit(")", 1)[1].split()[19]
                return executable, expected, start_time
            except (OSError, UnicodeError, IndexError):
                return None

        try:
            entries = os.listdir("/proc")
        except OSError as error:
            raise RuntimeError("Cannot inspect Linux recorder processes") from error
        for entry in entries:
            if not entry.isdigit() or int(entry) <= 0:
                continue
            pid = int(entry)
            before = identity(pid)
            if before is None:
                continue
            if identity(pid) != before:
                raise RuntimeError("Recorder browser process identity changed before cleanup")
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                continue
            except OSError as error:
                raise RuntimeError("Cannot terminate owned recorder browser") from error
            deadline = time.monotonic() + 3
            while True:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                except OSError as error:
                    raise RuntimeError("Cannot verify recorder browser termination") from error
                current = identity(pid)
                if current != before:
                    raise RuntimeError("Recorder browser identity changed during termination")
                if time.monotonic() >= deadline:
                    raise RuntimeError("Owned recorder browser remains alive")
                time.sleep(0.05)
        return  # Never delete Linux Singleton files, which may be live symlinks.
    if os.name != "nt":
        raise RuntimeError("Unsupported recorder process-cleanup platform")
    import ctypes
    from ctypes import wintypes as w
    import math
    import msvcrt
    import pathlib
    import psutil
    import uuid
    expected = os.path.normcase(os.path.abspath(profile))

    def checked(target):
        target = pathlib.Path(target)
        for component in [target, *target.parents]:
            if component.exists() and os.lstat(component).st_file_attributes & 0x400:
                raise RuntimeError("Redirected owned profile refused")
        if os.path.normcase(os.path.realpath(target)) != os.path.normcase(os.path.abspath(target)):
            raise RuntimeError("Noncanonical owned profile refused")
        return str(target)

    checked(expected)
    os.makedirs(expected, exist_ok=True)
    lock_path = checked(os.path.join(expected, ".lkb-profile.lock"))
    lock = open(lock_path, "a+b")
    try:
        if os.path.getsize(lock_path) == 0:
            lock.write(b"0"); lock.flush()
        lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except Exception:
        lock.close(); raise RuntimeError("Owned profile is occupied")
    ledger_path = checked(os.path.join(expected, ".lkb-ownership.json"))
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    signatures = {
        "CreateJobObjectW": ([ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
        "OpenJobObjectW": ([w.DWORD, w.BOOL, w.LPCWSTR], w.HANDLE),
        "SetInformationJobObject": ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
        "AssignProcessToJobObject": ([w.HANDLE, w.HANDLE], w.BOOL),
        "IsProcessInJob": ([w.HANDLE, w.HANDLE, ctypes.POINTER(w.BOOL)], w.BOOL),
        "QueryInformationJobObject": ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p], w.BOOL),
        "TerminateJobObject": ([w.HANDLE, w.UINT], w.BOOL),
        "OpenProcess": ([w.DWORD, w.BOOL, w.DWORD], w.HANDLE),
        "CloseHandle": ([w.HANDLE], w.BOOL), "GetCurrentProcess": ([], w.HANDLE)}
    for name, (args, result) in signatures.items():
        getattr(kernel, name).argtypes = args; getattr(kernel, name).restype = result

    class Basic(ctypes.Structure):
        _fields_ = [("ProcessTime", ctypes.c_longlong), ("JobTime", ctypes.c_longlong), ("Flags", w.DWORD),
                    ("MinWorking", ctypes.c_size_t), ("MaxWorking", ctypes.c_size_t), ("ActiveLimit", w.DWORD),
                    ("Affinity", ctypes.c_size_t), ("Priority", w.DWORD), ("Scheduling", w.DWORD)]

    class IO(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in ("ReadOps", "WriteOps", "OtherOps", "ReadBytes", "WriteBytes", "OtherBytes")]

    class Extended(ctypes.Structure):
        _fields_ = [("Basic", Basic), ("IO", IO), ("ProcessMemory", ctypes.c_size_t), ("JobMemory", ctypes.c_size_t),
                    ("PeakProcessMemory", ctypes.c_size_t), ("PeakJobMemory", ctypes.c_size_t)]

    class Accounting(ctypes.Structure):
        _fields_ = [(name, ctypes.c_longlong) for name in ("User", "Kernel", "PeriodUser", "PeriodKernel")] + [
            (name, w.DWORD) for name in ("Faults", "Total", "Active", "Terminated")]

    def active(job):
        value = Accounting()
        if not kernel.QueryInformationJobObject(job, 1, ctypes.byref(value), ctypes.sizeof(value), None):
            raise RuntimeError("Cannot query owned Job accounting")
        return value.Active

    def identity(pid):
        if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
            raise RuntimeError("Invalid owned PID")
        process = psutil.Process(pid)
        created = process.create_time()
        if not isinstance(created, (int, float)) or not math.isfinite(created) or created <= 0:
            raise RuntimeError("Invalid owned creation time")
        return {"pid": pid, "created": created, "exe": os.path.normcase(os.path.realpath(process.exe()))}

    def persist(record):
        if len(json.dumps(record).encode("utf-8")) > 8192:
            raise RuntimeError("Owned ledger exceeds bound")
        temporary = checked(ledger_path + "." + str(uuid.uuid4()) + ".tmp")
        try:
            with open(temporary, "x", encoding="utf-8") as file:
                json.dump(record, file); file.flush(); os.fsync(file.fileno())
            os.replace(temporary, ledger_path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    if os.path.exists(ledger_path):
        if os.path.getsize(ledger_path) > 8192:
            raise RuntimeError("Owned ledger too large")
        with open(ledger_path, encoding="utf-8") as file:
            record = json.load(file)
        if (not isinstance(record, dict) or set(record) - {"version", "profile", "nonce", "job", "phase", "owner", "browserExe", "browser"}
                or record.get("version") != 1 or record.get("profile") != expected
                or record.get("phase") not in ("contained", "browser", "cleaned")
                or str(uuid.UUID(record.get("nonce", ""))) != record["nonce"]
                or record.get("job") != "Local\\LKB-" + record["nonce"]
                or not isinstance(record.get("owner"), dict) or set(record["owner"]) != {"pid", "created", "exe"}
                or not isinstance(record.get("browserExe"), str) or not os.path.isabs(record["browserExe"])):
            raise RuntimeError("Incomplete owned ledger refused")
        for item in [record["owner"], *([record["browser"]] if "browser" in record else [])]:
            if (not isinstance(item, dict) or set(item) != {"pid", "created", "exe"}
                    or not isinstance(item["pid"], int) or isinstance(item["pid"], bool) or item["pid"] <= 0
                    or not isinstance(item["created"], (int, float)) or isinstance(item["created"], bool)
                    or not math.isfinite(item["created"]) or item["created"] <= 0
                    or not isinstance(item["exe"], str) or not os.path.isabs(item["exe"])
                    or os.path.normcase(os.path.realpath(item["exe"])) != item["exe"]):
                raise RuntimeError("Malformed recorded process identity")
        if record["phase"] == "browser" and ("browser" not in record or record["browser"]["exe"] != record["browserExe"]):
            raise RuntimeError("Missing recorded browser ownership")
        if record["phase"] == "contained" and "browser" in record:
            raise RuntimeError("Inconsistent contained ledger")
        try:
            owner = identity(record["owner"]["pid"])
        except psutil.NoSuchProcess:
            owner = None
        if owner is not None:
            if owner != record["owner"]:
                raise RuntimeError("Reused owner PID refused")
            raise RuntimeError("Owned browser parent is still alive")
        browser_alive = False
        if "browser" in record:
            if not isinstance(record["browser"], dict) or set(record["browser"]) != {"pid", "created", "exe"}:
                raise RuntimeError("Malformed owned browser identity")
            try:
                if identity(record["browser"]["pid"]) != record["browser"]:
                    raise RuntimeError("Reused browser PID refused")
                browser_alive = True
            except psutil.NoSuchProcess:
                pass
        job = kernel.OpenJobObjectW(0x000C, False, record["job"])
        if job:
            try:
                limits = Extended()
                if (not kernel.QueryInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits), None)
                        or limits.Basic.Flags != 0x2000):
                    raise RuntimeError("Owned Job containment changed")
                if browser_alive:
                    process = kernel.OpenProcess(0x1000, False, record["browser"]["pid"])
                    if not process:
                        raise RuntimeError("Cannot verify recorded browser membership")
                    try:
                        member = w.BOOL()
                        if not kernel.IsProcessInJob(process, job, ctypes.byref(member)) or not member.value:
                            raise RuntimeError("Recorded browser is outside owned Job")
                    finally:
                        kernel.CloseHandle(process)
                if not kernel.TerminateJobObject(job, 1):
                    raise RuntimeError("Owned Job termination refused")
                deadline = time.monotonic() + 5
                while active(job):
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Owned Job still active")
                    time.sleep(0.05)
            finally:
                kernel.CloseHandle(job)
        elif ctypes.get_last_error() != 2 or browser_alive:
            raise RuntimeError("Cannot inspect owned Job")
        record["phase"] = "cleaned"; persist(record)
    elif any(name != ".lkb-profile.lock" for name in os.listdir(expected)):
        raise RuntimeError("Legacy occupied or unproved profile refused")
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        target = checked(os.path.join(expected, name))
        if os.path.exists(target):
            os.remove(target)
    # A killed run leaves exit_type=Crashed + saved Sessions, and Chrome then restores old tabs
    # (measured: the bot opened a stale YouTube tab and lost its own). Start from a clean session.
    import shutil
    selected = profile_directory or "Default"
    sessions = checked(os.path.join(expected, selected, "Sessions"))
    if os.path.exists(sessions):
        for current, directories, files in os.walk(sessions):
            checked(current)
            for name in directories + files:
                checked(os.path.join(current, name))
        shutil.rmtree(sessions)
    prefs = checked(os.path.join(expected, selected, "Preferences"))
    if os.path.exists(prefs):
        with open(prefs, encoding="utf-8") as f:
            p = json.load(f)
        p.setdefault("profile", {})["exit_type"] = "Normal"
        p["profile"]["exited_cleanly"] = True
        with open(prefs, "w", encoding="utf-8") as f:
            json.dump(p, f)
    if not launch:
        lock.close()
        return
    if not expected_exe or not os.path.isabs(expected_exe):
        raise RuntimeError("Explicit managed Windows browser required")
    executable = os.path.normcase(os.path.realpath(expected_exe))
    if not os.path.isfile(executable) or os.path.basename(executable) not in ("chrome.exe", "chromium.exe"):
        raise RuntimeError("Owned browser executable refused")
    nonce = str(uuid.uuid4())
    record = {"version": 1, "profile": expected, "nonce": nonce, "job": "Local\\LKB-" + nonce,
              "phase": "contained", "owner": identity(os.getpid()), "browserExe": executable}
    job = kernel.CreateJobObjectW(None, record["job"])
    if not job or ctypes.get_last_error() == 183:
        raise RuntimeError("Cannot create exclusive owned Job")
    limits = Extended(); limits.Basic.Flags = 0x2000
    if (not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))
            or not kernel.AssignProcessToJobObject(job, kernel.GetCurrentProcess())):
        kernel.CloseHandle(job)
        raise RuntimeError("Cannot contain owned browser before launch")
    persist(record)

    def verify(browser_pid):
        browser = identity(browser_pid)
        if browser["exe"] != executable:
            raise RuntimeError("Owned browser executable changed")
        argv = psutil.Process(browser_pid).cmdline()
        profiles = [arg.split("=", 1)[1] for arg in argv if arg.startswith("--user-data-dir=")]
        profiles += [argv[index + 1] for index, arg in enumerate(argv[:-1]) if arg == "--user-data-dir"]
        if len(profiles) != 1 or os.path.normcase(os.path.realpath(profiles[0])) != expected:
            raise RuntimeError("Owned browser profile identity changed")
        process = kernel.OpenProcess(0x1000, False, browser_pid)
        if not process:
            raise RuntimeError("Cannot inspect owned browser membership")
        try:
            member = w.BOOL()
            if not kernel.IsProcessInJob(process, job, ctypes.byref(member)) or not member.value or identity(browser_pid) != browser:
                raise RuntimeError("Owned browser escaped containment")
        finally:
            kernel.CloseHandle(process)
        record.update({"phase": "browser", "browser": browser}); persist(record)

    # Retain the kernel handle until interpreter exit: closing a self-containing Job kills Python.
    return {"job": job, "lock": lock, "verify": verify}
