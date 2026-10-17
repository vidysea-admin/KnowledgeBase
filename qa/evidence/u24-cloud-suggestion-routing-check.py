from pathlib import Path
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

repo = Path(__file__).resolve().parents[2]
commands = [
    ["node", "--test", "--test-isolation=none", "--test-concurrency=1", "--test-timeout=30000", "--import", "./.cache/coordination/safe-test-runtime/register.mjs", "apps/api/src/speaker-routing/routing.test.ts", "qa/evidence/u24-cloud-suggestion-routing-independent.mjs"],
    [sys.executable, "contracts/verify_contracts.py"],
]
results = []
for command in commands:
    started = datetime.now(timezone.utc).isoformat()
    start = time.monotonic()
    try:
        result = subprocess.run(command, cwd=repo, shell=False, timeout=120, encoding="utf-8", capture_output=True)
        row = dict(command=command, started=started, ended=datetime.now(timezone.utc).isoformat(), seconds=time.monotonic()-start, exit=result.returncode, stdout=result.stdout, stderr=result.stderr)
    except subprocess.TimeoutExpired as error:
        row = dict(command=command, started=started, seconds=time.monotonic()-start, exit="TIMEOUT", stdout=str(error.stdout), stderr=str(error.stderr))
    results.append(row)
output = repo / "qa/evidence/u24-cloud-suggestion-routing-check.json"
output.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
sys.exit(0 if all(row["exit"] == 0 for row in results) else 1)
