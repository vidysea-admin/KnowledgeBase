"""Gate review phases on measured usage; inspect runtime and evidence identity."""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone

METRICS = ("active_s", "tokens", "cost")
IDENTITY = ("candidate_sha", "base_sha", "command", "python", "python_version",
            "lock_hash", "import_root", "environment_hash", "runtime_identity")


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("metric must be a nonnegative finite number or null")
    if not math.isfinite(value) or value < 0:
        raise ValueError("metric must be a nonnegative finite number or null")
    return value


def metric(row, key):
    value = row.get(key)
    return None if value is None else number(value)


def assess(data):
    maker = data.get("maker", {})
    rows = data.get("reviewers", [])
    if not rows or any(not row.get("id") for row in rows):
        raise ValueError("reviewers require unique nonempty ids")
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("duplicate reviewer id")
    next_phase = data.get("next_phase", {})
    if metric(next_phase, "active_s") is None:
        raise ValueError("next phase requires explicit active_s allocation")
    result = {"ratios": {}, "totals": {}, "limits": {}, "unknown": []}
    exceeded = []
    bootstrap = False
    escalation = data.get("escalation")
    if escalation and not all(escalation.get(k) for k in ("authority", "reason", "limits")):
        raise ValueError("escalation needs authority, reason and finite limits")
    for key in METRICS:
        values = [metric(row, key) for row in rows]
        known = sum(v for v in values if v is not None)
        total = None if any(v is None for v in values) else known
        denominator = metric(maker, key)
        result["totals"][key] = {"value": total, "known_lower_bound": known}
        result["ratios"][key] = total / denominator if total is not None and denominator else None
        if not denominator:
            bootstrap = True
            default = {"active_s": 180, "tokens": 6000, "cost": None}[key]
            limit = data.get("bootstrap", {}).get(key, default)
            if default is not None and limit is None:
                raise ValueError("bootstrap active_s and tokens limits must be finite")
            limit = None if limit is None else number(limit)
        else:
            limit = denominator * 0.1
        if escalation:
            escalated_limit = metric(escalation["limits"], key)
            if limit is not None and escalated_limit is None:
                raise ValueError("escalation cannot remove a finite metric limit")
            limit = escalated_limit
        allocation = metric(next_phase, key)
        result["limits"][key] = limit
        if total is None or denominator is None or allocation is None:
            result["unknown"].append(key)
        if limit is not None and known + (allocation or 0) > limit:
            exceeded.append(key)
        if key == "active_s" and total is None:
            exceeded.append("unknown_active_time")
    if bootstrap and not data.get("bootstrap_scope"):
        exceeded.append("missing_bootstrap_scope")
    result["status"] = "NEEDS_EXTRA_REVIEW" if exceeded else (
        "BOOTSTRAP_REVIEW" if bootstrap else "WITHIN_ALLOCATION")
    result["ratio_verified"] = not result["unknown"] and not bootstrap
    result["exceeded"] = exceeded
    result["escalated"] = bool(escalation)
    result["target_missed"] = [key for key, value in result["ratios"].items()
                               if value is not None and value > 0.1]
    return result


def reuse(data):
    existing, requested = data["existing"], data["requested"]
    mismatch = [key for key in IDENTITY if not existing.get(key)
                or not requested.get(key) or existing[key] != requested[key]]
    if type(existing.get("exit_code")) is not int or existing["exit_code"] != 0:
        mismatch.append("exit_code")
    return {"status": "REUSABLE_IDENTITY" if not mismatch else "DO_NOT_REUSE",
            "mismatch": mismatch, "policy_permission_still_required": True}


def preflight(args):
    root = Path(args.root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("root is not a directory")
    expected = Path(args.import_root).resolve(strict=True)
    if not expected.is_relative_to(root):
        raise ValueError("source root is outside intended checkout")
    spec = importlib.util.find_spec(args.import_name)
    if spec is None or not spec.origin:
        raise ValueError("package not importable with intended executable")
    origin = Path(spec.origin).resolve(strict=True)
    if not origin.is_relative_to(expected):
        raise ValueError("import resolves outside intended source root")
    temp_parent = Path(args.temp_parent).resolve(strict=True) if args.temp_parent else None
    if temp_parent is not None and not temp_parent.is_dir():
        raise ValueError("basetemp parent is not a directory")
    with tempfile.TemporaryDirectory(prefix="checker-preflight-", dir=temp_parent) as directory:
        probe = Path(directory) / "write-probe"
        probe.write_text("ok", encoding="utf-8")
        if probe.read_text(encoding="utf-8") != "ok":
            raise ValueError("temporary directory write/read failed")
    return {"status": "PREFLIGHT_OK", "root": str(root), "python": sys.executable,
            "python_version": sys.version.split()[0], "import_origin": str(origin),
            "temp_writable": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    for operation in ("assess", "reuse"):
        command = sub.add_parser(operation)
        command.add_argument("--input", required=True)
    command = sub.add_parser("preflight")
    for argument in ("root", "import-name", "import-root"):
        command.add_argument("--" + argument, required=True)
    command.add_argument("--temp-parent", help="Existing parent of intended pytest basetemp")
    args = parser.parse_args()
    try:
        if args.operation == "preflight":
            result = preflight(args)
        else:
            data = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
            result = assess(data) if args.operation == "assess" else reuse(data)
        code = 2 if result["status"] in ("NEEDS_EXTRA_REVIEW", "DO_NOT_REUSE") else 0
    except (ValueError, KeyError, OSError, ImportError, TypeError) as error:
        result, code = {"status": "INVALID_OR_BLOCKED", "error": str(error)}, 2
    result["observed_at"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(result, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
