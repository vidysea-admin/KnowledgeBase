"""Run: .venv/Scripts/python.exe workers/transcribe/src/worker.py [--once]."""
import argparse
import os
import re
import signal
import sys
import threading
import time
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
from google_transport import GoogleTransport
from job_queue import JobQueue


def run(queue, transport, stop, once=False):
    processed, failed = 0, 0
    while not stop.is_set():
        doc = queue.claim()
        if doc is None:
            if once:
                return 0
            stop.wait(0.1)
            continue
        heartbeat_stop = threading.Event()
        def renew():
            while not heartbeat_stop.wait(queue.lease_ms / 3000):
                try:
                    held = not stop.is_set() and queue.heartbeat(doc)
                except Exception:
                    held = False
                if not held:
                    heartbeat_stop.set()
        heartbeat = threading.Thread(target=renew, daemon=True)
        heartbeat.start()
        try:
            result = transport.execute(doc)
            if stop.is_set():
                queue.release(doc)
            elif not queue.finish(doc, response=result):
                failed += 1
        except Exception as error:
            # Persist only fixed codes; never exception text, request URLs or provider bodies.
            code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[a-z-]{1,100}", str(error)) else "worker-operation-failed"
            queue.finish(doc, error=code)
            failed += 1
        finally:
            heartbeat_stop.set()
            heartbeat.join(timeout=1)
        processed += 1
        print(f"operation processed={processed} failures={failed}", flush=True)
        if once:
            return 1 if failed else 0
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=False)
    tenant = os.getenv("UPLOAD_TENANT_ID", "").strip()
    database = os.getenv("UPLOAD_QUEUE_DB", "")
    url, spool = os.getenv("MONGODB_URL"), os.getenv("UPLOAD_SPOOL_ROOT")
    if not re.fullmatch(r"upload_queue_[a-zA-Z0-9_]{8,55}", database) or not url or not spool or not Path(spool).is_dir():
        print("dedicated queue database, Mongo URL and spool root required", file=sys.stderr)
        return 2
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    client = MongoClient(url, serverSelectionTimeoutMS=5000, socketTimeoutMS=10000)
    try:
        queue = JobQueue(client[database].jobs, tenant)
        transport = GoogleTransport(queue, spool, os.getenv("GEMINI_API_KEY"), timeout=1800)
        return run(queue, transport, stop, args.once)
    except Exception:
        print("worker prerequisite or queue failure", file=sys.stderr)
        return 2
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
