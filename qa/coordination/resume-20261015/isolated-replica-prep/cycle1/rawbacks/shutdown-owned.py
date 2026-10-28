"""CODE ONLY: called inside owned job only after supervisor proves server PID ownership."""
import json
import sys
from pathlib import Path
from pymongo import MongoClient
from pymongo.errors import AutoReconnect

credentials = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
try:
    with MongoClient("mongodb://127.0.0.1:27029", directConnection=True,
                     username=credentials["rootUser"], password=credentials["rootPassword"],
                     authSource="admin", serverSelectionTimeoutMS=2000,
                     connectTimeoutMS=2000, socketTimeoutMS=5000) as client:
        assert client.admin.command("hello").get("setName") == "lkbAcceptance"
        client.admin.command("shutdown", force=False, timeoutSecs=5)
except AutoReconnect:
    pass  # Expected disconnect; supervisor must still verify exact child exited.
except Exception:
    raise SystemExit(1)  # Supervisor falls back to only its owned job.
