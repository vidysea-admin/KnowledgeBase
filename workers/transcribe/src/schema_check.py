"""Validate documents against the repository's authoritative schemas, without logging data."""
import json
import sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[3]


def validate_document(collection, document):
    if collection not in {"jobs", "sources", "sessions", "turns"}:
        raise ValueError("unsupported schema")
    schema = json.loads((ROOT / "schema" / f"{collection}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(document)


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        for collection, documents in payload.items():
            for document in documents:
                validate_document(collection, document)
        print("schema-valid")
    except Exception:
        print("schema validation failed", file=sys.stderr)
        sys.exit(1)
