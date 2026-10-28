"""CODE ONLY: unexecuted proposal; real Umesh D143/D173 exception still required.

No imports start a server. CLI refuses without an operator-supplied approval receipt.
Receipt is an audit reference, not self-issued authority or a replacement for approval.
This script runs synthetic init/smoke then shuts down; no parent acceptance claim.
"""
import argparse
import base64
import ctypes
from ctypes import wintypes as w
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
import uuid
from owned_transport import capture_identity, guard_before_dispatch, OwnershipRefused
from cleanup_receipt import durable_write, finalize

PREP = Path(__file__).resolve().parent
ROOT = PREP.parents[3]
EXE = PREP / "vendor/selected/mongodb-win32-x86_64-windows-8.0.34/bin/mongod.exe"
EXE_SHA = "4c9e9764cbac5be8eb92733e23ce7f70b52f8ae84b6879b4d5cc010c90ec6082"
PRIVATE_HELPER = ROOT / "packages/meeting-bot/src/capture/record-consent/private-directory.ps1"
HELPER_SHA = "48ec95f14880c235dd8812f7ef68d4afbdf11b9c2beb9a1421151aa4d50178ca"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class Basic(ctypes.Structure):
    _fields_ = [("a", ctypes.c_int64), ("b", ctypes.c_int64), ("flags", w.DWORD),
               ("min", ctypes.c_size_t), ("max", ctypes.c_size_t), ("active", w.DWORD),
               ("affinity", ctypes.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]


class IO(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in ("r", "w", "o", "rb", "wb", "ob")]


class Extended(ctypes.Structure):
    _fields_ = [("basic", Basic), ("io", IO), ("process", ctypes.c_size_t),
               ("job", ctypes.c_size_t), ("peakp", ctypes.c_size_t), ("peakj", ctypes.c_size_t)]


class Cpu(ctypes.Structure):
    _fields_ = [("flags", w.DWORD), ("rate", w.DWORD)]


class BoundedJob:
    """Adapted from pinned scoped-check-runner Tree; new caps are UNTESTED."""
    def __init__(self):
        self.processes = []
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.restype = w.HANDLE
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
        self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
        self.kernel.QueryInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p]
        self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.kernel.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.name = "Local\\LKBReplica-" + uuid.uuid4().hex
        self.job = self.kernel.CreateJobObjectW(None, self.name)
        try:
            if not self.job:
                raise RuntimeError("job creation refused")
            extended = Extended()
            extended.basic.flags = 0x2000 | 0x200  # KILL_ON_JOB_CLOSE | JOB_MEMORY
            extended.job = 1024 ** 3
            cpu = Cpu(0x1 | 0x4, 1000)  # ENABLE|HARD_CAP, 10% (nested-parent relative)
            for kind, info in ((9, extended), (15, cpu)):
                if not self.kernel.SetInformationJobObject(self.job, kind, ctypes.byref(info), ctypes.sizeof(info)):
                    raise RuntimeError("required job resource cap unavailable")
            observed = Extended(); observed_cpu = Cpu()
            for kind, info in ((9, observed), (15, observed_cpu)):
                if not self.kernel.QueryInformationJobObject(self.job, kind, ctypes.byref(info), ctypes.sizeof(info), None):
                    raise RuntimeError("job resource cap readback unavailable")
            if observed.job != 1024 ** 3 or observed.basic.flags & 0x2200 != 0x2200 or observed_cpu.flags != 5 or observed_cpu.rate != 1000:
                raise RuntimeError("job resource cap readback mismatch")
        except BaseException:
            self.close()
            raise

    def launch(self, argv, output, env):
        process = subprocess.Popen(argv, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT,
                                   env=env, shell=False, creationflags=0x4 | 0x4000)
        self.processes.append(process)
        if not self.kernel.AssignProcessToJobObject(self.job, int(process._handle)):
            process.kill(); process.wait(timeout=5)
            raise RuntimeError("suspended job assignment refused")
        native = ctypes.WinDLL("ntdll")
        native.NtResumeProcess.argtypes = [w.HANDLE]
        if native.NtResumeProcess(int(process._handle)) != 0:
            self.close()
            raise RuntimeError("resume refused")
        return process

    def close(self):
        if getattr(self, "job", None):
            if not self.kernel.TerminateJobObject(self.job, 124):
                raise RuntimeError("owned job termination refused")
            if not self.kernel.CloseHandle(self.job):
                raise RuntimeError("owned job handle closure refused")
            self.job = None
        for process in self.processes:
            process.wait(timeout=5)


def safe_tree_size(run):
    total = 0
    for directory, directories, files in os.walk(run, followlinks=False):
        for name in directories + files:
            path = Path(directory) / name
            if path.is_symlink() or path.is_junction() or path.stat().st_file_attributes & 0x400:
                raise RuntimeError("unexpected reparse point")
        total += sum((Path(directory) / name).stat().st_size for name in files)
    return total


def require_ignored(paths):
    for path in paths:
        result = subprocess.run(["git", "check-ignore", "-q", "--", str(path)], cwd=ROOT,
                                timeout=5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode != 0:
            raise RuntimeError("private/vendor path is not git ignored")


def run(approval_path):
    if os.name != "nt" or Path(sys.executable).resolve() != (ROOT / ".venv/Scripts/python.exe").resolve():
        raise RuntimeError("approved Windows interpreter required")
    approval = json.loads(approval_path.read_text(encoding="utf-8-sig"))
    # Human root must authenticate/reference the real appended decision before launch.
    required = {"approvedBy": "Umesh", "host": "127.0.0.1:27029", "replicaSet": "lkbAcceptance",
                "databases": ["lkb_staging", "lkb_t059_acceptance"], "syntheticOnly": True}
    if any(approval.get(key) != value for key, value in required.items()) or not approval.get("decisionId"):
        raise RuntimeError("exact human approval reference missing")
    if digest(EXE) != EXE_SHA or digest(PRIVATE_HELPER) != HELPER_SHA:
        raise RuntimeError("artifact/helper drift")
    if shutil.disk_usage(PREP).free < 5 * 1024 ** 3:
        raise RuntimeError("insufficient free disk")
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        probe.bind(("127.0.0.1", 27029))
    ident = uuid.uuid4().hex
    runtime = PREP / ("private-run-" + ident)
    require_ignored([EXE, runtime / "secrets/credentials.json", runtime / "data/WiredTiger"])
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(("MONGO", "LKB_"))}
    receipt = {"id": ident, "approvalDecision": approval["decisionId"], "syntheticOnly": True,
               "applicationAcceptance": False, "scriptExecuted": True,
               "finalizationPending": True, "ownedRemnantsPossible": True,
               "ownedJobClosed": False, "ownedRuntimeRemoved": False}
    receipt_path = PREP / ("activation-" + ident + ".json")
    fallback_path = PREP / ("activation-" + ident + ".fallback.json")
    # Durable outside-root pending record exists BEFORE job/private-root creation.
    # If storage later fails completely, this record remains and never claims cleanup.
    durable_write(receipt_path, receipt)
    job = None
    created = False
    try:
        job = BoundedJob()
        with (PREP / ("activation-" + ident + ".log")).open("xb") as output:
            powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
            mkdir = job.launch([str(powershell), "-NoProfile", "-NonInteractive", "-File", str(PRIVATE_HELPER), "-TargetPath", str(runtime)], output, env)
            if mkdir.wait(timeout=20) != 0:
                raise RuntimeError("private creation refused")
            created = True
            (runtime / "owner.json").write_text(json.dumps({"id": ident, "root": str(runtime)}))
            # Owner-created DACL is inherited by all children; verify it before writing secrets.
            acl = job.launch([str(powershell), "-NoProfile", "-NonInteractive", "-Command",
                              "$a=Get-Acl -LiteralPath $args[0]; $s=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; "
                              "if(-not $a.AreAccessRulesProtected){exit 2}; "
                              "$allowed=@($s,'S-1-5-18','S-1-5-32-544'); "
                              "foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed){exit 3}}",
                              str(runtime)], output, env)
            if acl.wait(timeout=20) != 0:
                raise RuntimeError("private ACL verification refused")
            for name in ("data", "logs", "secrets"):
                (runtime / name).mkdir()
            credentials = {"rootUser": "acceptance_root", "rootPassword": secrets.token_urlsafe(48),
                           "fixtureUser": "acceptance_fixture", "fixturePassword": secrets.token_urlsafe(48),
                           "t059User": "acceptance_t059", "t059Password": secrets.token_urlsafe(48)}
            credential_path = runtime / "secrets/credentials.json"
            credential_path.write_text(json.dumps(credentials), encoding="utf-8")
            (runtime / "secrets/keyfile").write_text(base64.b64encode(secrets.token_bytes(756)).decode(), encoding="ascii")
            config = runtime / "mongod.yml"
            config.write_text((PREP / "mongod.yml.template").read_text().replace("@PRIVATE_ROOT@", runtime.as_posix()), encoding="utf-8")
            server = job.launch([str(EXE), "--config", str(config)], output, env)
            receipt["serverPid"] = server.pid
            proof = capture_identity(server, EXE, job.name)
            proof_path = runtime / "secrets/server-ownership.json"
            proof_path.write_text(json.dumps(proof), encoding="utf-8")
            deadline = time.monotonic() + 900
            while True:
                if server.poll() is not None:
                    raise RuntimeError("server failed before readiness")
                try:
                    guard_before_dispatch(proof)
                    break
                except OwnershipRefused:
                    if time.monotonic() + 850 >= deadline:
                        raise RuntimeError("server readiness deadline")
                    time.sleep(.25)
            guard_before_dispatch(proof)
            smoke = job.launch([sys.executable, str(PREP / "init-and-smoke.py"), str(credential_path), str(proof_path)], output, env)
            smoke_deadline = min(deadline, time.monotonic() + 120)
            while smoke.poll() is None:
                if time.monotonic() >= smoke_deadline or safe_tree_size(runtime) > 2 * 1024 ** 3:
                    raise RuntimeError("acceptance deadline/disk threshold")
                log = runtime / "logs/mongod.log"
                if log.exists() and log.stat().st_size > 32 * 1024 ** 2:
                    raise RuntimeError("log threshold")
                time.sleep(.5)
            receipt["smokeExit"] = smoke.returncode
            if smoke.returncode:
                raise RuntimeError("synthetic smoke refused")
            # Exact still-live owned child established above; authenticated shutdown.
            if server.poll() is None:
                guard_before_dispatch(proof)
                shutdown = job.launch([sys.executable, str(PREP / "shutdown-owned.py"), str(credential_path), str(proof_path)], output, env)
                try:
                    shutdown.wait(timeout=10)
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    pass  # finally closes only the owned job.
    except BaseException as error:
        receipt["errorType"] = type(error).__name__
        raise
    finally:
        def cleanup():
            if not created:
                return not runtime.exists()  # Unknown created root is retained.
            owner = json.loads((runtime / "owner.json").read_text())
            expected = PREP / ("private-run-" + ident)
            if owner != {"id": ident, "root": str(runtime)} or runtime.resolve() != expected or not runtime.resolve().is_relative_to(PREP):
                raise RuntimeError("cleanup ownership/path mismatch")
            safe_tree_size(runtime)
            if runtime.is_symlink() or runtime.is_junction():
                raise RuntimeError("cleanup root reparse refused")
            shutil.rmtree(runtime)
            return not runtime.exists()
        receipt["finalizationPending"] = False
        finalize(receipt, lambda: job.close() if job is not None else None, cleanup,
                 lambda record: durable_write(receipt_path, record),
                 lambda record: durable_write(fallback_path, record))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval-receipt", required=True, type=Path)
    arguments = parser.parse_args()
    try:
        run(arguments.approval_receipt)
    except BaseException as error:
        print(json.dumps({"ok": False, "errorType": type(error).__name__}))
        raise SystemExit(1)
