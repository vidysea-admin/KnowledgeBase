"""Focused real-Mongo lifecycle/security checks; no provider calls or full suite."""
import concurrent.futures
import hashlib
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid
from pathlib import Path
from pymongo import MongoClient
from dotenv import load_dotenv
from job_queue import JobQueue, now_ms, iso
from google_transport import GoogleTransport, safe_file, provider_url

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env", override=False)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.database = "upload_queue_" + uuid.uuid4().hex
        self.client = MongoClient(os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=5000)
        self.jobs = self.client[self.database].jobs
        self.queue = JobQueue(self.jobs, "tenant-a", lease_ms=150)
        parent = ROOT / ".cache" / "upload-worker-tests"
        parent.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=parent)

    def tearDown(self):
        self.assertRegex(self.database, r"^upload_queue_[a-f0-9]{32}$")
        self.client.drop_database(self.database)
        self.client.close()
        self.temporary.cleanup()

    def job(self, tenant="tenant-a", **changes):
        doc = {"_id": uuid.uuid4().hex + uuid.uuid4().hex, "tenantId": tenant, "kind": "transcribe.rpc", "status": "pending",
            "createdAt": iso(), "attempts": 0, "maxAttempts": 2, "deadlineMs": now_ms() + 10000,
            "runId": "a" * 64, "request": {"op": "poll", "url": "https://generativelanguage.googleapis.com/v1beta/files/test", "method": "GET", "headers": {}}}
        doc.update(changes)
        self.jobs.insert_one(doc)
        return doc

    def test_atomic_contention_and_foreign_tenant(self):
        ours = self.job(); foreign = self.job("tenant-b")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(lambda _: self.queue.claim(), range(2)))
        self.assertEqual(len([c for c in claims if c]), 1)
        owner = next(c for c in claims if c)
        self.assertEqual(owner["_id"], ours["_id"])
        self.assertTrue(self.queue.finish(owner, response={"status": 200, "headers": {}, "body": {"state": "ACTIVE"}}))
        self.assertFalse(self.queue.finish(owner, response={"status": 200, "headers": {}, "body": {"different": True}}))
        self.assertEqual(self.jobs.find_one({"_id": foreign["_id"]})["status"], "pending")

    def test_expired_owner_fenced_recovery_and_exhaustion(self):
        self.job(); old = self.queue.claim()
        self.jobs.update_one({"_id": old["_id"], "tenantId": "tenant-a"}, {"$set": {"leaseUntilMs": now_ms() - 1}})
        new = self.queue.claim()
        self.assertNotEqual(old["claimToken"], new["claimToken"])
        self.assertFalse(self.queue.finish(old, response={"status": 200}))
        self.assertTrue(self.queue.finish(new, response={"status": 200, "headers": {}, "body": {}}))
        stale = self.job(status="processing", attempts=2, claimToken="old", leaseUntilMs=now_ms() - 1)
        self.assertIsNone(self.queue.claim())
        self.assertEqual(self.jobs.find_one({"_id": stale["_id"]})["status"], "failed")

    def test_cancelled_and_expired_operation_cannot_publish(self):
        self.job(); owner = self.queue.claim()
        self.jobs.update_one({"_id": owner["_id"], "tenantId": "tenant-a"}, {"$set": {"status": "failed", "cancelledAt": iso()}})
        self.assertFalse(self.queue.finish(owner, response={"status": 200}))
        self.assertFalse(self.queue.heartbeat(owner))
        self.assertIsNone(self.queue.claim())

    def test_interrupted_actual_claimer_process_recovers(self):
        row = self.job()
        marker = Path(self.temporary.name) / "claimed.json"
        env = {**os.environ, "UPLOAD_QUEUE_DB": self.database, "UPLOAD_TENANT_ID": "tenant-a", "UPLOAD_CLAIM_MARKER": str(marker)}
        child = subprocess.Popen([sys.executable, str(Path(__file__)), "--claim-and-wait"], env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            deadline = time.monotonic() + 8
            while not marker.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(marker.exists())
        finally:
            child.terminate()
            child.wait(timeout=5)
        time.sleep(0.2)
        recovered = self.queue.claim()
        self.assertEqual(recovered["_id"], row["_id"])
        self.assertEqual(recovered["attempts"], 2)

    def test_provider_and_blob_boundaries(self):
        worker = GoogleTransport(self.queue, self.temporary.name, "fake-key")
        for url in ["http://generativelanguage.googleapis.com/v1beta/files/a", "https://localhost/v1beta/files/a", "https://generativelanguage.googleapis.com/v1beta/files/a?key=secret"]:
            with self.assertRaises(ValueError):
                provider_url(url, "poll")
        doc = self.job()
        for change in [{"url": "https://localhost/v1beta/files/a"}, {"headers": {"authorization": "secret"}}, {"method": "DELETE"}]:
            with self.assertRaises(ValueError):
                worker.execute({**doc, "request": {**doc["request"], **change}})
        with self.assertRaisesRegex(ValueError, "foreign-or-missing-provider-file"):
            worker.execute(doc)
        with self.assertRaisesRegex(ValueError, "foreign-or-invalid-operation-identity"):
            worker.execute({**doc, "tenantId": "tenant-b"})
        ours = hashlib.sha256(b"tenant-a").hexdigest(); digest = hashlib.sha256(b"audio").hexdigest()
        root = Path(self.temporary.name); directory = root / ours / "blobs"; directory.mkdir(parents=True)
        path = directory / f"{digest}.bin"; path.write_bytes(b"audio")
        self.assertEqual(safe_file(root, f"{ours}/blobs/{digest}.bin", "tenant-a"), b"audio")
        with self.assertRaises(ValueError):
            safe_file(root, f"{ours}/blobs/{digest}.bin", "tenant-b")
        with self.assertRaises(ValueError):
            safe_file(root, "../../outside", "tenant-a")
        os.link(path, directory / "linked.bin")
        with self.assertRaises(ValueError):
            safe_file(root, f"{ours}/blobs/{digest}.bin", "tenant-a")

    def test_memory_only_upload_handoff_recovery_and_safe_response(self):
        worker = GoogleTransport(self.queue, self.temporary.name, "secret-key")
        start = self.job(request={"op": "upload-start", "method": "POST", "url": "https://generativelanguage.googleapis.com/upload/v1beta/files",
            "headers": {"content-type": "application/json", "x-goog-upload-protocol": "resumable", "x-goog-upload-command": "start",
                "x-goog-upload-header-content-length": "5", "x-goog-upload-header-content-type": "audio/mp4"}, "body": {"file": {"display_name": "fixture"}}})
        calls = []
        def http(url, method, headers, body):
            calls.append(url)
            if method == "POST":
                return {"status": 200, "headers": {}, "body": None, "upload_url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=private-token&upload_protocol=resumable"}
            return {"status": 200, "headers": {}, "body": {"file": {"name": "files/fixture", "uri": "https://generativelanguage.googleapis.com/v1beta/files/fixture"}}}
        worker._http = http
        response = worker.execute(start)
        self.assertNotIn("private-token", json.dumps(response))
        self.jobs.update_one({"_id": start["_id"], "tenantId": "tenant-a"}, {"$set": {"status": "done", "response": response}})
        tenant_hash = hashlib.sha256(b"tenant-a").hexdigest(); digest = hashlib.sha256(b"audio").hexdigest()
        directory = Path(self.temporary.name) / tenant_hash / "blobs"; directory.mkdir(parents=True)
        (directory / f"{digest}.bin").write_bytes(b"audio")
        finalize = self.job(request={"op": "upload-finalize", "method": "PUT", "url": response["headers"]["x-goog-upload-url"],
            "headers": {"x-goog-upload-offset": "0", "x-goog-upload-command": "upload, finalize"},
            "body": {"blob": f"{tenant_hash}/blobs/{digest}.bin", "sha256": digest, "size": 5}})
        cached = dict(worker.uploads[start["_id"]])
        with self.assertRaisesRegex(ValueError, "foreign-or-missing-upload-handoff"):
            worker.execute({**finalize, "runId": "d" * 64})
        self.assertEqual(worker.uploads[start["_id"]], cached)
        self.assertEqual(len(calls), 1)
        self.assertEqual(worker.execute(finalize)["status"], 200)
        self.assertEqual(len(calls), 2)  # legitimate warm owner: initial POST + PUT
        worker.uploads.clear()
        final = worker.execute(finalize)
        self.assertEqual(len(calls), 4)  # legitimate cold owner: reopened POST + PUT
        self.assertNotIn("private-token", json.dumps(final))
        with self.assertRaisesRegex(ValueError, "foreign-or-missing-upload-handoff"):
            worker.execute({**finalize, "runId": "b" * 64})

    def test_iss_375_recorded_warm_cache_same_tenant_cross_run_handoff(self):
        # Exact qa/issues.jsonl ISS-375 one-case floor: None collection, b'review', a/b/c/d IDs.
        tenant = "fixed-local-tenant"
        queue = type("LocalQueue", (), {"tenant": tenant, "collection": None})()
        worker = GoogleTransport(queue, self.temporary.name, "sentinel-credential")
        calls = []
        def http(url, method, headers, body):
            calls.append(method)
            if method == "POST":
                return {"status": 200, "headers": {}, "body": None,
                    "upload_url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=sentinel&upload_protocol=resumable"}
            return {"status": 200, "headers": {}, "body": {"file": {"name": "files/review", "uri": "https://generativelanguage.googleapis.com/v1beta/files/review"}}}
        worker._http = http
        start = {"_id": "a" * 64, "tenantId": tenant, "runId": "b" * 64,
            "request": {"op": "upload-start", "method": "POST", "url": "https://generativelanguage.googleapis.com/upload/v1beta/files",
                "headers": {"content-type": "application/json", "x-goog-upload-protocol": "resumable", "x-goog-upload-command": "start",
                    "x-goog-upload-header-content-length": "6", "x-goog-upload-header-content-type": "audio/mp4"}, "body": {"file": {"display_name": "review"}}}}
        worker.execute(start)
        original = dict(worker.uploads[start["_id"]])
        digest = hashlib.sha256(b"review").hexdigest()
        finalize = {"_id": "c" * 64, "tenantId": tenant, "runId": "d" * 64,
            "request": {"op": "upload-finalize", "method": "PUT", "url": "queue-upload://" + "a" * 64,
                "headers": {"x-goog-upload-offset": "0", "x-goog-upload-command": "upload, finalize"},
                "body": {"blob": f"{hashlib.sha256(tenant.encode()).hexdigest()}/blobs/{digest}.bin", "sha256": digest, "size": 6}}}
        with patch("google_transport.safe_file", return_value=b"review"):
            with self.assertRaisesRegex(ValueError, "foreign-or-missing-upload-handoff"):
                worker.execute(finalize)
        self.assertEqual(calls, ["POST"])
        self.assertEqual(worker.uploads[start["_id"]], original)
        self.assertIsNone(queue.collection)
        print("ISS-375: 1/1 refused; cross-run PUTs=0; rightful capability preserved")

    def test_redirect_cannot_forward_worker_key_to_another_origin(self):
        stolen = []
        class Target(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                stolen.append(self.headers.get("x-goog-api-key"))
                self.send_response(200); self.end_headers(); self.wfile.write(b"{}")
            def log_message(self, *_args):
                pass
        target = http.server.HTTPServer(("127.0.0.1", 0), Target)
        class Redirect(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                self.send_response(301)
                self.send_header("Location", f"http://127.0.0.1:{target.server_port}/stolen")
                self.end_headers(); self.wfile.write(b"private-fixture-key must not be logged")
            def log_message(self, *_args):
                pass
        origin = http.server.HTTPServer(("127.0.0.1", 0), Redirect)
        threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in (origin, target)]
        for thread in threads:
            thread.start()
        try:
            worker = GoogleTransport(self.queue, self.temporary.name, "private-fixture-key", timeout=2)
            result = worker._http(f"http://127.0.0.1:{origin.server_port}/redirect", "POST", {}, b"{}")
            self.assertEqual(result["status"], 301)
            self.assertEqual(stolen, [])
            self.assertNotIn("private-fixture-key", json.dumps(result))
        finally:
            for server in (origin, target):
                server.shutdown(); server.server_close()
            for thread in threads:
                thread.join(timeout=2)


if __name__ == "__main__":
    if "--claim-and-wait" in sys.argv:
        client = MongoClient(os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=5000)
        queue = JobQueue(client[os.environ["UPLOAD_QUEUE_DB"]].jobs, os.environ["UPLOAD_TENANT_ID"], lease_ms=150)
        doc = queue.claim()
        Path(os.environ["UPLOAD_CLAIM_MARKER"]).write_text(json.dumps({"claimed": bool(doc)}), encoding="utf-8")
        time.sleep(30)
    else:
        unittest.main()
