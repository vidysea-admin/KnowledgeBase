"""Fully fake-only regressions. No launcher import, WinDLL, socket or ACL calls."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest import mock
from contextlib import ExitStack
import ctypes
import socket
import subprocess
import os
import shutil
import builtins

PREP = Path(__file__).resolve().parents[1]
guards = ExitStack()


def unexpected(*args, **kwargs):
    raise AssertionError("unexpected real I/O/native operation")


# Guards are armed BEFORE loading either implementation helper. Source imports
# may read Python bytes; all transport/process/native/write entrypoints refuse.
for owner, name in ((socket, "socket"), (socket, "create_connection"),
                    (subprocess, "run"), (subprocess, "Popen"),
                    (ctypes, "WinDLL"), (ctypes, "CDLL"),
                    (os, "system"), (os, "replace"), (os, "unlink"),
                    (os, "remove"), (os, "mkdir"), (shutil, "rmtree"),
                    (Path, "write_text"), (Path, "write_bytes"), (Path, "mkdir")):
    guards.enter_context(mock.patch.object(owner, name, side_effect=unexpected))
original_import = builtins.__import__


def guarded_import(name, *args, **kwargs):
    if name == "pymongo" or name.startswith("pymongo."):
        return unexpected()
    return original_import(name, *args, **kwargs)


guards.enter_context(mock.patch.object(builtins, "__import__", side_effect=guarded_import))


def load(name):
    spec = importlib.util.spec_from_file_location(name, PREP / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


transport = load("owned_transport")
cleanup = load("cleanup_receipt")
PROOF = {"pid": 101, "creationFileTime": "1234", "image": "synthetic-image", "jobName": "synthetic-job"}


def snapshot(pid=101, creation="1234", connected_pid=101, extra=None):
    rows = [{"state": "Listen", "localPort": 27029, "localAddress": "127.0.0.1", "pid": pid},
            {"state": "Established", "localPort": 27029, "localAddress": "127.0.0.1", "pid": connected_pid,
             "remoteAddress": "127.0.0.1", "remotePort": 40000}]
    if extra: rows.append(extra)
    return {"pid": 101, "creationFileTime": creation, "image": "synthetic-image", "rows": rows}


class FakeSocket:
    def __init__(self): self.bytes = []; self.closed = False
    def connect(self, address): self.address = address
    def getsockname(self): return ("127.0.0.1", 40000)
    def getpeername(self): return self.address
    def sendall(self, value): self.bytes.append(value)
    def send(self, value): self.bytes.append(value); return len(value)
    def close(self): self.closed = True


class Ownership(unittest.TestCase):
    def test_released_probe_competitor_listener_refuses_dispatch(self):
        with self.assertRaises(transport.OwnershipRefused):
            transport.guard_before_dispatch(PROOF, lambda _: snapshot(pid=202))

    def test_missing_ownership_refuses_dispatch(self):
        for value in ({}, {"pid": 101, "creationFileTime": "1234", "image": "synthetic-image", "rows": []}):
            with self.assertRaises(transport.OwnershipRefused):
                transport.guard_before_dispatch(PROOF, lambda _: value)

    def test_ipv6_competing_listener_refused(self):
        value = snapshot(extra={"state": "Listen", "localPort": 27029, "localAddress": "::1", "pid": 202})
        with self.assertRaises(transport.OwnershipRefused):
            transport.verify_snapshot(PROOF, value)

    def test_connect_transition_competitor_receives_zero_bytes(self):
        observations = iter([snapshot(), snapshot(connected_pid=202)])
        guarded = transport.guarded_socket_type(FakeSocket, PROOF, lambda _: next(observations))()
        with self.assertRaises(transport.OwnershipRefused): guarded.connect(("127.0.0.1", 27029))
        self.assertEqual(guarded.bytes, []); self.assertTrue(guarded.closed)

    def test_replacement_before_auth_or_shutdown_send_refused(self):
        for replaced in (snapshot(creation="changed"), snapshot(connected_pid=202), snapshot(pid=202)):
            observations = iter([snapshot(), snapshot(), replaced])
            guarded = transport.guarded_socket_type(FakeSocket, PROOF, lambda _: next(observations))()
            guarded.connect(("127.0.0.1", 27029))
            with self.assertRaises(transport.OwnershipRefused): guarded.sendall(b"synthetic-auth-marker")
            self.assertEqual(guarded.bytes, [])

    def test_owned_connection_positive(self):
        guarded = transport.guarded_socket_type(FakeSocket, PROOF, lambda _: snapshot())()
        guarded.connect(("127.0.0.1", 27029)); guarded.sendall(b"synthetic")
        self.assertEqual(guarded.bytes, [b"synthetic"])


def throws(kind):
    def fail(*args): raise kind("synthetic-secret-path-and-password-must-never-serialize")
    return fail


class Receipts(unittest.TestCase):
    def test_owner_write_read_json_or_rmtree_failure_keeps_receipt(self):
        cases = [throws(OSError), throws(FileNotFoundError), lambda: json.loads("{"), throws(PermissionError)]
        for failure in cases:
            records = []; receipt = {"id": "synthetic-uuid"}
            cleanup.finalize(receipt, lambda: None, failure, records.append, lambda _: self.fail())
            self.assertEqual(len(records), 1); self.assertTrue(receipt["ownedRemnantsPossible"])
            self.assertFalse(receipt["ownedRuntimeRemoved"])
            self.assertNotIn("synthetic-secret-path", json.dumps(receipt))

    def test_job_close_timeout_never_attempts_delete_but_persists(self):
        records = []; receipt = {}; deleted = []
        cleanup.finalize(receipt, throws(TimeoutError), lambda: deleted.append(True), records.append, lambda _: self.fail())
        self.assertEqual(deleted, []); self.assertEqual(len(records), 1)
        self.assertFalse(receipt["ownedJobClosed"]); self.assertTrue(receipt["ownedRemnantsPossible"])

    def test_primary_receipt_throw_uses_independent_fallback(self):
        records = []; receipt = {}
        cleanup.finalize(receipt, lambda: None, lambda: False, throws(OSError), records.append)
        self.assertEqual(len(records), 1); self.assertEqual(receipt["primaryReceiptErrorType"], "OSError")
        self.assertNotIn("synthetic-secret-path", json.dumps(receipt))

    def test_both_receipt_writes_throw_reports_persistence_failure(self):
        with self.assertRaises(cleanup.ReceiptPersistenceFailed) as caught:
            cleanup.finalize({}, lambda: None, lambda: False, throws(OSError), throws(PermissionError))
        self.assertEqual(str(caught.exception), "PermissionError")

    def test_cleanup_success_recorded(self):
        records = []; receipt = {}
        cleanup.finalize(receipt, lambda: None, lambda: True, records.append, lambda _: self.fail())
        self.assertTrue(receipt["ownedRuntimeRemoved"]); self.assertFalse(receipt["ownedRemnantsPossible"])


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    names = [str(test) for group in suite for test in group]
    assert len(names) == 11, "unexpected regression discovery count"
    print(json.dumps({"discovered": len(names), "tests": names, "unexpectedIOGuardsArmed": True}), flush=True)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    guards.close()
    raise SystemExit(0 if result.wasSuccessful() else 1)
