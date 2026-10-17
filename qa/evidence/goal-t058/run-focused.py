"""Sequential focused checks, only after the coordinator grants the CPU lease."""
import hashlib
import json
import pathlib
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
FLAGS = ["node", "--test", "--test-isolation=none", "--test-concurrency=1", "--test-timeout=30000", "--import", "./.cache/coordination/safe-test-runtime/register.mjs"]
COMMANDS = [
    FLAGS + ["apps/api/src/knowledge-outputs/workbench.test.ts"],
    FLAGS + ["apps/web/src/pages/knowledge-outputs/workbench.ui.test.tsx"],
]
FILES = sorted([*ROOT.joinpath("apps/api/src/knowledge-outputs").glob("*.ts"), *ROOT.joinpath("apps/web/src/pages/knowledge-outputs").glob("*.tsx"), ROOT / "apps/web/src/api/knowledge-outputs.ts"])
def pins():
    return {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in FILES}

results = []
before = pins()
for command in COMMANDS:
    started = time.monotonic()
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        entry = {"command": command, "exitCode": result.returncode, "seconds": time.monotonic() - started, "stdout": result.stdout, "stderr": result.stderr}
    except subprocess.TimeoutExpired as error:
        entry = {"command": command, "exitCode": 124, "seconds": time.monotonic() - started, "stdout": str(error.stdout or ""), "stderr": str(error.stderr or ""), "timeout": True}
    except OSError as error:
        entry = {"command": command, "exitCode": 125, "seconds": time.monotonic() - started, "stderr": str(error)}
    results.append(entry)
    print(json.dumps({"command": command[-1], "exitCode": entry["exitCode"], "seconds": entry["seconds"], "stdout": entry.get("stdout", ""), "stderr": entry.get("stderr", "")}), flush=True)
receipt = {"scope": "fixture source/API + node/jsdom HTTP-consumer checks only; no actual provider/Mongo/browser/human acceptance", "candidatePinsBefore": before, "candidatePinsAfter": pins(), "results": results}
OUT.joinpath("focused.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
raise SystemExit(0 if all(r["exitCode"] == 0 for r in results) and before == receipt["candidatePinsAfter"] else 1)
