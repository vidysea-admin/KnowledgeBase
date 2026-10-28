#!/usr/bin/env python3
"""
schema/validate.py — loads every <collection>.schema.json in schema/, validates its
fixtures/<collection>/valid.json (must pass) and fixtures/<collection>/invalid.json
(must fail), and exits 0 only if every collection behaves as expected. (T-018: fixtures
moved from a flat fixtures/<collection>.valid.json layout to one subdir per collection so
schema/fixtures/ stays under the dirsize budget as collections grow — structure.config.json
dirsize.maxFiles, scripts/lint-dirsize.mjs.)

Usage: python schema/validate.py
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).parent
FIXTURES = ROOT / "fixtures"


def load(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    schema_files = sorted(ROOT.glob("*.schema.json"))
    if not schema_files:
        print("FAIL: no schema files found under schema/")
        return 1

    ok = True
    for schema_path in schema_files:
        collection = schema_path.stem.replace(".schema", "")
        schema = load(schema_path)
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)

        valid_fixture = FIXTURES / collection / "valid.json"
        invalid_fixture = FIXTURES / collection / "invalid.json"

        if not valid_fixture.exists() or not invalid_fixture.exists():
            print(f"FAIL: {collection} — missing fixture(s)")
            ok = False
            continue

        # valid.json / invalid.json are required; additional valid-*.json (must pass) and
        # invalid-*.json (each must fail) fixtures are optional (T-040: new optional fields).
        valid_files = [valid_fixture] + sorted((FIXTURES / collection).glob("valid-*.json"))
        invalid_files = [invalid_fixture] + sorted((FIXTURES / collection).glob("invalid-*.json"))
        collection_ok = True

        for vf in valid_files:
            valid_errors = list(validator.iter_errors(load(vf)))
            if valid_errors:
                print(f"FAIL: {collection}/{vf.name} unexpectedly failed validation:")
                for e in valid_errors:
                    print(f"  - {e.message} at {list(e.path)}")
                collection_ok = False

        for inf in invalid_files:
            if not list(validator.iter_errors(load(inf))):
                print(f"FAIL: {collection}/{inf.name} unexpectedly PASSED validation "
                      f"(schema is too permissive)")
                collection_ok = False

        if collection_ok:
            print(f"OK: {collection} — {len(valid_files)} valid fixture(s) pass, "
                  f"{len(invalid_files)} invalid fixture(s) correctly rejected")
        else:
            ok = False

    print()
    if ok:
        print(f"PASS: {len(schema_files)} collection schema(s) validated correctly.")
        return 0
    else:
        print("FAIL: one or more collections did not behave as expected.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
