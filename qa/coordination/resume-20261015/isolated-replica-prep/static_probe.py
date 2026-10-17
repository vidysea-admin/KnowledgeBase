"""Passive source/ignore proof only. Never imports application or vendor code."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess

prep = Path(__file__).resolve().parent
root = prep.parents[3]
results = []
for name in ("activate-proposal.py", "init-and-smoke.py", "shutdown-owned.py", "inspect-pe.py"):
    source = prep / name
    ast.parse(source.read_bytes(), filename=str(source))
    results.append({"node": "python_ast/" + name, "ok": True})
before = (prep / ".gitignore.before.bin").read_bytes()
after = (root / ".gitignore").read_bytes()
addition = (prep / ".gitignore.proposed").read_bytes()
assert after == before + addition, "gitignore changed beyond exact byte append"
results.append({"node": "gitignore/exact-byte-append", "ok": True,
                "beforeSha256": hashlib.sha256(before).hexdigest(),
                "afterSha256": hashlib.sha256(after).hexdigest()})
relative = prep.relative_to(root).as_posix()
positive = [relative + "/vendor/mongodb-8.0.34.zip",
            relative + "/private-run-0123456789abcdef0123456789abcdef/secrets/credentials.json",
            relative + "/private-run-0123456789abcdef0123456789abcdef/data/WiredTiger"]
negative = [relative + "/PLAN.md", relative + "/private-run-not-a-uuid/unrelated.txt"]
for index, (path, expected) in enumerate([(p, 0) for p in positive] + [(p, 1) for p in negative]):
    process = subprocess.run(["git", "check-ignore", "-q", "--", path], cwd=root,
                             capture_output=True, timeout=5)
    assert process.returncode == expected, "ignore boundary mismatch"
    results.append({"node": "gitignore/path-boundary-" + str(index), "ok": True,
                    "path": path, "expectedExit": expected, "actualExit": process.returncode})
print(json.dumps({"checks": results, "applicationImports": 0, "vendorExecutions": 0,
                  "databaseActions": 0, "aclMutations": 0, "activationReady": False}, indent=2))
