"""Bounded deterministic check batches. Never an independent semantic verdict.

Trusted caller supplies the complete mandatory/security inventory. This is not a
sandbox for hostile tests, nor a provider token interceptor. LLM routes refuse.
"""
import argparse
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid


class Refused(ValueError):
    pass


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def positive(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise Refused('positive finite allocation required')
    return value


def identity(plan):
    root = Path(plan['root']).resolve()
    sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], timeout=3).decode().strip()
    if sha != plan['candidate_sha']:
        raise Refused('candidate HEAD changed')
    for name, expected in plan['files'].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root) or digest(path) != expected:
            raise Refused('candidate bytes changed: ' + name)
    return root


def validate(plan):
    if plan.get('route') != 'deterministic':
        raise Refused('hard cumulative token control unavailable; zero LLM dispatches')
    selected = plan['selected']
    if not selected or any(not n or n.startswith('-') or not reason.strip() for n, reason in selected.items()):
        raise Refused('explicit nodes and coverage reasons required')
    required = plan['mandatory'] + plan['security']
    if not set(required).issubset(selected):
        raise Refused('omitted mandatory/security nodes')
    if plan.get('framework') not in ('unittest', 'pytest') or not plan.get('files') or not plan.get('base_sha'):
        raise Refused('framework, base and byte inventory required')
    positive(plan['allocation_s'])
    positive(plan['finalization_s'])
    if plan['finalization_s'] >= plan['allocation_s']:
        raise Refused('no execution allowance')
    maker = plan.get('maker_active_s')
    if maker is None:
        limit = positive(plan['bootstrap_limit_s'])
        verified = False
    else:
        limit = positive(maker) * .1
        verified = True
    return limit, verified


def reserve(plan, ledger):
    """Exclusive lock and fsynced append; crash reservations are never refunded."""
    limit, verified = validate(plan)
    seal = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    ledger = Path(ledger)
    ledger.parent.mkdir(parents=True, exist_ok=True)
    lock = ledger.with_suffix(ledger.suffix + '.lock')
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise Refused('ledger busy or interrupted; manual reconciliation required')
    try:
        os.close(fd)
        rows = [json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []
        if any(row['seal'] != seal for row in rows):
            raise Refused('immutable plan changed; ledger cannot reset identity or budget')
        if sum(row['reserved_s'] for row in rows) + plan['allocation_s'] > limit + 1e-9:
            raise Refused('cumulative retry budget exhausted')
        row = dict(id=uuid.uuid4().hex, seal=seal, reserved_s=plan['allocation_s'], time_ratio_verified=verified)
        with ledger.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(row) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        return row
    finally:
        lock.unlink()


class Tree:
    """Windows suspended assignment avoids the descendant-before-job race."""
    def __init__(self, argv, cwd, output):
        self.job = None
        if os.name == 'nt':
            from ctypes import wintypes as w
            class Basic(ctypes.Structure):
                _fields_ = [('a', ctypes.c_int64), ('b', ctypes.c_int64), ('flags', w.DWORD), ('min', ctypes.c_size_t), ('max', ctypes.c_size_t), ('active', w.DWORD), ('affinity', ctypes.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]
            class IO(ctypes.Structure):
                _fields_ = [(name, ctypes.c_uint64) for name in ('r','w','o','rb','wb','ob')]
            class Extended(ctypes.Structure):
                _fields_ = [('basic', Basic), ('io', IO), ('process', ctypes.c_size_t), ('job', ctypes.c_size_t), ('peakp', ctypes.c_size_t), ('peakj', ctypes.c_size_t)]
            self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            self.kernel.CreateJobObjectW.restype = w.HANDLE
            self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
            self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
            self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
            self.kernel.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
            self.kernel.CloseHandle.argtypes = [w.HANDLE]
            self.job = self.kernel.CreateJobObjectW(None, None)
            info = Extended(); info.basic.flags = 0x2000
            if not self.job or not self.kernel.SetInformationJobObject(self.job, 9, ctypes.byref(info), ctypes.sizeof(info)):
                self.close(); raise Refused('Windows job control unavailable')
            self.process = subprocess.Popen(argv, cwd=cwd, stdout=output, stderr=subprocess.STDOUT, shell=False, creationflags=4)
            if not self.kernel.AssignProcessToJobObject(self.job, int(self.process._handle)):
                self.process.kill(); self.process.wait(); self.close(); raise Refused('job assignment refused')
            ntdll = ctypes.WinDLL('ntdll'); ntdll.NtResumeProcess.argtypes = [w.HANDLE]
            if ntdll.NtResumeProcess(int(self.process._handle)) != 0:
                self.close(); self.process.wait(); raise Refused('resume refused')
        else:
            self.process = subprocess.Popen(argv, cwd=cwd, stdout=output, stderr=subprocess.STDOUT, shell=False, start_new_session=True)

    def close(self):
        if os.name == 'nt':
            if self.job:
                self.kernel.TerminateJobObject(self.job, 124)
                self.kernel.CloseHandle(self.job); self.job = None
        elif hasattr(self, 'process'):
            try: os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError: pass


def run(plan, ledger, receipts):
    start = time.monotonic()
    validate(plan)
    root = identity(plan)
    reservation = reserve(plan, ledger)
    destination = Path(receipts) / reservation['id']
    destination.mkdir(parents=True, exist_ok=False)
    (destination / 'plan.json').write_text(json.dumps(plan, indent=2))
    deadline = start + plan['allocation_s']
    argv = [sys.executable, '-m', plan['framework'], *plan['selected']]
    receipt = dict(reservation, argv=argv, stage='deterministic_checks', semantic_verdict=None, exit_code=None, status='ERROR', token_ratio_verified=False)
    tree = None
    try:
        remaining = deadline - plan['finalization_s'] - time.monotonic()
        if remaining <= 0: raise Refused('startup consumed execution allowance')
        with (destination / 'output.bin').open('wb') as output:
            tree = Tree(argv, root, output)
            try:
                remaining = deadline - plan['finalization_s'] - time.monotonic()
                receipt['exit_code'] = tree.process.wait(timeout=max(0, remaining))
                receipt['status'] = 'CHECKS_GREEN' if receipt['exit_code'] == 0 else 'CHECKS_FAILED'
            except subprocess.TimeoutExpired:
                receipt['status'] = 'TIMEOUT'
            finally:
                tree.close()
                tree.process.wait(timeout=max(.01, deadline-time.monotonic()))
                receipt['exit_code'] = tree.process.returncode
        identity(plan)
    except Exception as error:
        receipt['status'] = 'INCOMPLETE'
        receipt['error'] = str(error)
    finally:
        if tree: tree.close()
        receipt['elapsed_s'] = time.monotonic() - start
        receipt['deadline_met'] = time.monotonic() < deadline
        if not receipt['deadline_met']: receipt['status'] = 'DEADLINE_EXCEEDED'
        receipt['output_sha256'] = digest(destination / 'output.bin') if (destination / 'output.bin').exists() else None
        (destination / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', required=True)
    parser.add_argument('--ledger', required=True)
    parser.add_argument('--receipts', required=True)
    args = parser.parse_args()
    try:
        result = run(json.loads(Path(args.plan).read_text()), args.ledger, args.receipts)
        print(json.dumps(result)); sys.exit(0 if result['status'] == 'CHECKS_GREEN' else 2)
    except (Refused, KeyError, TypeError, OSError) as error:
        print(json.dumps({'status': 'REFUSED', 'reason': str(error)})); sys.exit(2)
