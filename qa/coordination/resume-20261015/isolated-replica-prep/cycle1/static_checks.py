"""Passive cycle1 AST/order/receipt-shape checks. No launcher import."""
import ast
import json
from pathlib import Path

prep = Path(__file__).resolve().parents[1]
names = ["activate-proposal.py", "init-and-smoke.py", "shutdown-owned.py", "owned_transport.py",
         "cleanup_receipt.py", "cycle1/fake_regressions.py", "cycle1/static_checks.py"]
for name in names:
    ast.parse((prep / name).read_bytes(), filename=name)
for name in ("init-and-smoke.py", "shutdown-owned.py"):
    nodes = ast.parse((prep / name).read_bytes()).body
    install = next(n.lineno for parent in nodes for n in ast.walk(parent) if
                   isinstance(n, ast.Call) and getattr(n.func, "id", None) == "install")
    driver = next(n.lineno for n in nodes if isinstance(n, ast.ImportFrom) and n.module.startswith("pymongo"))
    assert install < driver
launcher = (prep / "activate-proposal.py").read_text()
assert "socket.create_connection" not in launcher
assert launcher.index("durable_write(receipt_path, receipt)") < launcher.index("job = BoundedJob()")
assert "finalize(receipt," in launcher
print(json.dumps({"astFiles": len(names), "driverImportOrdering": 2,
                  "noReadinessConnect": True, "preActivationDurablePendingReceipt": True,
                  "applicationImports": 0, "vendorExecutions": 0, "databaseActions": 0,
                  "networkOperations": 0, "aclMutations": 0}))
