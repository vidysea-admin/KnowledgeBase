"""Harness helpers for the real-browser ownership fixture tests (moved from test_sb_join_ownership.py; behaviour unchanged)."""
import json
import os
import pathlib
import subprocess
import time
from types import SimpleNamespace


def run_captured(root, args, tag, timeout, stdin_text=None):
        # Capture to FILES, not pipes: Chrome (a grandchild) inherits pipe handles and keeps them open after the
        # parent exits, which made communicate() hang to TimeoutExpired and hid the parent's real exit status/stderr.
        out_path, err_path = root / (tag + ".out"), root / (tag + ".err")
        with open(out_path, "wb") as out, open(err_path, "wb") as err:
            done = subprocess.run(args, input=stdin_text, stdout=out, stderr=err, text=True, timeout=timeout)
        return SimpleNamespace(returncode=done.returncode, stdout=out_path.read_text(encoding="utf-8", errors="replace"), stderr=err_path.read_text(encoding="utf-8", errors="replace"))


def replay_owned_cleanup(case, root, profile, command, remaining):
        try: record = json.loads((pathlib.Path(profile) / ".lkb-ownership.json").read_text())
        except (OSError, ValueError): record = {}
        if "browser" in record:
            import psutil
            try:
                process = psutil.Process(record["browser"]["pid"])
                assert process.create_time() == record["browser"]["created"]
                assert os.path.normcase(os.path.realpath(process.exe())) == record["browser"]["exe"]
            except psutil.NoSuchProcess: pass
            # Owned-Job teardown after the parent exits is asynchronous and measured at 13-18 s on an idle box (Chrome flushes
            # before dying), far longer under load. Poll the recorded browser's death cheaply (no Python start per probe)
            # BEFORE the strict cleanup replay, so spawn cost on a busy CPU cannot burn the retry budget.
            # Bounded by the remaining hard budget, but never below a small floor so cleanup is always attempted.
            death_deadline = time.monotonic() + max(10, min(150, remaining() / 2))
            while time.monotonic() < death_deadline:
                try:
                    if psutil.Process(record["browser"]["pid"]).create_time() != record["browser"]["created"]: break
                except psutil.NoSuchProcess: break
                time.sleep(.5)
            cleanup_started, cleanup_attempts = time.monotonic(), 0
            deadline = cleanup_started + max(20, min(90, remaining()))
            while True:
                cleanup_attempts += 1
                try:
                    cleanup = run_captured(root, command + ["--cleanup-only"], "cleanup%d" % cleanup_attempts, max(20, min(120, deadline - time.monotonic())))
                except subprocess.TimeoutExpired:
                    if time.monotonic() >= deadline: raise
                    continue
                # Replay only the exact ledger after asynchronous owned Job teardown; never repair on refusal.
                if cleanup.returncode and "Cannot inspect owned Job" in cleanup.stdout + cleanup.stderr and time.monotonic() < deadline:
                    time.sleep(.2); continue
                break
            assert cleanup.returncode == 0, (case, cleanup.stdout, cleanup.stderr)
            assert json.loads((pathlib.Path(profile) / ".lkb-ownership.json").read_text())["phase"] == "cleaned"
            print(json.dumps({"fixture_case": case, "cleanup_attempts": cleanup_attempts, "cleanup_seconds": round(time.monotonic() - cleanup_started, 3), "ledger_phase": "cleaned"}))
            try:
                process = psutil.Process(record["browser"]["pid"])
                assert process.create_time() == record["browser"]["created"]
                assert os.path.normcase(os.path.realpath(process.exe())) == record["browser"]["exe"]
                process.wait(timeout=10)
            except psutil.NoSuchProcess: pass
