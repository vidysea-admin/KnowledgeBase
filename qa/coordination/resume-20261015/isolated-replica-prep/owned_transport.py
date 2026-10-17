"""No OS/network work at import. Guard every Mongo transport before auth bytes."""
import ctypes
from ctypes import wintypes as w
import ipaddress
import json
import os
from pathlib import Path
import socket
import subprocess


class OwnershipRefused(RuntimeError):
    pass


def verify_snapshot(proof, snapshot, local=None, peer=None):
    """Pure policy: all listeners and the established reverse tuple are owned."""
    if (snapshot.get("pid") != proof["pid"] or
        str(snapshot.get("creationFileTime")) != str(proof["creationFileTime"]) or
        os.path.normcase(snapshot.get("image", "")) != os.path.normcase(proof["image"])):
        raise OwnershipRefused("process identity unavailable or changed")
    rows = snapshot.get("rows")
    if not isinstance(rows, list) or not rows:
        raise OwnershipRefused("socket table unavailable")
    listeners = [r for r in rows if r.get("state") == "Listen"]
    if not listeners:
        raise OwnershipRefused("owned listener absent")
    for row in listeners:
        if (row.get("localPort") != 27029 or row.get("pid") != proof["pid"] or
            not ipaddress.ip_address(row.get("localAddress", "")).is_loopback):
            raise OwnershipRefused("competing or nonloopback listener")
    if local is not None:
        if peer != ("127.0.0.1", 27029) or local[0] != "127.0.0.1":
            raise OwnershipRefused("unexpected connected endpoint")
        matches = [r for r in rows if r.get("state") == "Established" and
                   r.get("localAddress") == peer[0] and r.get("localPort") == peer[1] and
                   r.get("remoteAddress") == local[0] and r.get("remotePort") == local[1]]
        if len(matches) != 1 or matches[0].get("pid") != proof["pid"]:
            raise OwnershipRefused("connected socket owner unavailable or changed")


def capture_identity(process, image, job_name):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetProcessTimes.argtypes = [w.HANDLE] + [ctypes.POINTER(w.FILETIME)] * 4
    values = [w.FILETIME() for _ in range(4)]
    if not kernel.GetProcessTimes(int(process._handle), *(ctypes.byref(v) for v in values)):
        raise OwnershipRefused("creation identity unavailable")
    created = (values[0].dwHighDateTime << 32) | values[0].dwLowDateTime
    return {"pid": process.pid, "creationFileTime": str(created),
            "image": str(image.resolve()), "jobName": job_name}


def require_exact_job(proof):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]; kernel.OpenProcess.restype = w.HANDLE
    kernel.OpenJobObjectW.argtypes = [w.DWORD, w.BOOL, w.LPCWSTR]; kernel.OpenJobObjectW.restype = w.HANDLE
    kernel.IsProcessInJob.argtypes = [w.HANDLE, w.HANDLE, ctypes.POINTER(w.BOOL)]
    kernel.CloseHandle.argtypes = [w.HANDLE]
    process = kernel.OpenProcess(0x1000, False, proof["pid"])
    job = kernel.OpenJobObjectW(4, False, proof["jobName"])
    try:
        answer = w.BOOL()
        if not process or not job or not kernel.IsProcessInJob(process, job, ctypes.byref(answer)) or not answer.value:
            raise OwnershipRefused("exact job ownership unavailable")
    finally:
        if process: kernel.CloseHandle(process)
        if job: kernel.CloseHandle(job)


def observe(proof):
    require_exact_job(proof)
    powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-File",
                             str(Path(__file__).with_name("verify-owned-socket.ps1")),
                             "-ServerPid", str(proof["pid"])], capture_output=True, timeout=5)
    if result.returncode or len(result.stdout) > 65536:
        raise OwnershipRefused("ownership observation unavailable")
    try:
        snapshot = json.loads(result.stdout)
        verify_snapshot(proof, snapshot)
        require_exact_job(proof)
        return snapshot
    except Exception:
        raise OwnershipRefused("ownership observation refused") from None


def guard_before_dispatch(proof, observation=observe):
    verify_snapshot(proof, observation(proof))


def guarded_socket_type(original, proof, observation):
    """Install BEFORE importing PyMongo. Every new/reconnected raw socket guarded.

    Listener checks alone have TOCTOU; proof of the actual established reverse
    tuple is required before any send. A competitor cannot receive bytes sent on
    this retained connection after the original peer exits: that connection fails.
    """
    class OwnedSocket(original):
        def connect(self, address):
            if address != ("127.0.0.1", 27029):
                raise OwnershipRefused("unexpected target")
            guard_before_dispatch(proof, observation)
            super().connect(address)
            try:
                self._verify()
            except BaseException:
                self.close()
                raise

        def connect_ex(self, address):
            self.connect(address)
            return 0

        def _verify(self):
            verify_snapshot(proof, observation(proof), self.getsockname()[:2], self.getpeername()[:2])

        def sendall(self, data, *args, **kwargs):
            self._verify()
            return super().sendall(data, *args, **kwargs)

        def send(self, data, *args, **kwargs):
            self._verify()
            return super().send(data, *args, **kwargs)

    return OwnedSocket


def install(proof_path, observation=observe):
    proof = json.loads(Path(proof_path).read_text(encoding="utf-8"))
    socket.socket = guarded_socket_type(socket.socket, proof, observation)
