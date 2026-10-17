"""Offline-only budget engine. No provider, credential or network implementation.

Injected clients are deliberately restricted to explicit offline fakes. A future
approved provider adapter needs independent capability/credential validation.
Deadlines are prospective client deadlines, not a guarantee of server cancellation.
No result from this module constitutes a semantic review verdict.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import time
import uuid
from contextlib import contextmanager


class Refused(ValueError):
    pass


def integer(value, name, positive=False):
    if type(value) is not int or value < (1 if positive else 0):
        raise Refused(name + " must be a known integer")
    return value


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")


class Ledger:
    """Exclusive admission; unknown/in-flight attempts retain their full charge.

    Ledger loss/deletion is outside this local trust boundary. Never recreate a
    missing ledger on retry. Stale lock files refuse; no automatic lock recovery.
    """
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def locked(self):
        lock = self.path.with_suffix(self.path.suffix + ".lock")
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as exc:
            raise Refused("ledger busy or stale lock") from exc
        try:
            os.close(fd)
            yield
        finally:
            lock.unlink()

    def write(self, value):
        temp = self.path.with_name(self.path.name + "." + uuid.uuid4().hex)
        try:
            with temp.open("xb") as stream:
                stream.write(encode(value)); stream.flush(); os.fsync(stream.fileno())
            os.replace(temp, self.path)
        finally:
            if temp.exists():
                temp.unlink()

    def initialize(self, identity, maker_actual_tokens, maker_active_s):
        """Derive both limits from known comparable maker actuals (10%)."""
        integer(maker_actual_tokens, "maker actual total tokens", True)
        token_limit = maker_actual_tokens // 10
        integer(token_limit, "token limit", True)
        if not isinstance(identity, str) or not identity:
            raise Refused("missing identity")
        if type(maker_active_s) not in (int, float) or not math.isfinite(maker_active_s) or maker_active_s <= 0:
            raise Refused("unknown active denominator")
        active_limit_s = maker_active_s / 10
        with self.locked():
            if self.path.exists():
                raise Refused("ledger already initialized; reset forbidden")
            self.write(dict(version=1, identity=identity, token_limit=token_limit,
                            active_limit_s=active_limit_s, maker_actual_tokens=maker_actual_tokens,
                            maker_active_s=maker_active_s, token_metric="actual_total", attempts=[]))

    def read(self):
        value = json.loads(self.path.read_bytes())
        if value.get("version") != 1:
            raise Refused("unsupported ledger")
        integer(value["token_limit"], "limit", True)
        if value.get("token_metric") != "actual_total":
            raise Refused("unsupported token metric")
        for duration in [value["active_limit_s"]] + [r["charged_s"] for r in value["attempts"]]:
            if type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0:
                raise Refused("unknown/nonfinite active accounting")
        for row in value["attempts"]:
            integer(row["charged_tokens"], "prior charge")
            if row["state"] not in ("reserved", "completed"):
                raise Refused("unsupported prior state")
            if row["state"] == "completed":
                integer(row["actual_total"], "prior usage")
                if row["charged_tokens"] != row["actual_total"]:
                    raise Refused("prior actual/charge mismatch")
        return value


def execute(ledger, request_path, *, identity, expected_sha256, pinned_model,
            client, reserve_tokens, finalize_s=0.05, clock=time.monotonic):
    """One count, one admission, one generation; exceptions never auto-retry.

    The same immutable canonical text payload bytes reach both fake operations.
    max_output_tokens is a separate generation control whose cap includes hidden
    reasoning/formatting tokens; clients must attest that capability explicitly.
    Count must cover the complete payload, including instructions and model.
    """
    if getattr(client, "offline_fake", None) is not True:
        raise Refused("real transport disabled pending approval/credential validation")
    required = {"exact_complete_input", "stateless_text", "total_output_cap", "deadline"}
    if set(getattr(client, "capabilities", ())) != required:
        raise Refused("unsupported client capabilities")
    integer(reserve_tokens, "completion reserve", True)
    if type(finalize_s) not in (int, float) or not math.isfinite(finalize_s) or finalize_s <= 0:
        raise Refused("invalid finalization reserve")
    path = Path(request_path)
    raw = path.read_bytes()
    if digest(raw) != expected_sha256:
        raise Refused("request bytes changed")
    request = json.loads(raw)
    if set(request) != {"model", "instructions", "input"} or any(type(v) is not str for v in request.values()):
        raise Refused("only stateless text input/instructions/model supported")
    if request["model"] != pinned_model or not pinned_model or encode(request) != raw:
        raise Refused("noncanonical or unpinned request")
    start = clock()
    attempt_id = uuid.uuid4().hex
    with ledger.locked():
        state = ledger.read()
        if state["identity"] != identity:
            raise Refused("ledger identity mismatch")
        remaining = state["token_limit"] - sum(r["charged_tokens"] for r in state["attempts"])
        time_left = state["active_limit_s"] - sum(r["charged_s"] for r in state["attempts"])
        if remaining <= reserve_tokens or time_left <= finalize_s:
            raise Refused("budget exhausted")
        # Reserve the entire available attempt before any potentially uncertain work.
        state["attempts"].append(dict(id=attempt_id, state="reserved", request_sha256=expected_sha256,
                                      charged_tokens=remaining, charged_s=time_left, actual_total=None))
        ledger.write(state)
    deadline = start + time_left - finalize_s
    if clock() >= deadline:
        raise Refused("deadline exhausted before count")
    count = client.count(raw, deadline=deadline)
    exact = integer(count.get("input_tokens"), "exact input")
    if count.get("payload_sha256") != expected_sha256 or count.get("model") != pinned_model:
        raise Refused("count binding mismatch")
    output_cap = remaining - exact - reserve_tokens
    if output_cap <= 0:
        raise Refused("input exhausts available budget")
    if path.read_bytes() != raw or clock() >= deadline:
        raise Refused("request mutated or deadline exhausted before generation")
    response = client.generate(raw, max_output_tokens=output_cap, deadline=deadline)
    if clock() >= deadline:
        raise Refused("client deadline exceeded; reservation retained")
    usage = response.get("usage", {})
    used_input = integer(usage.get("input_tokens"), "actual input")
    used_output = integer(usage.get("output_tokens"), "actual output")
    cached = integer(usage.get("cached_tokens", 0), "cached subset")
    reasoning = integer(usage.get("reasoning_tokens", 0), "reasoning subset")
    if (response.get("payload_sha256") != expected_sha256 or response.get("model") != pinned_model
            or used_input != exact or used_output > output_cap or cached > used_input or reasoning > used_output):
        raise Refused("usage/cap/binding mismatch; reservation retained")
    with ledger.locked():
        state = ledger.read()
        row = next(r for r in state["attempts"] if r["id"] == attempt_id)
        row.update(state="completed", actual_total=used_input + used_output,
                   charged_tokens=used_input + used_output, charged_s=clock() - start,
                   usage=usage, output_cap=output_cap, semantic_verdict="NOT_EVALUATED")
        if clock() >= start + time_left:
            raise Refused("finalization deadline exhausted; reservation retained")
        ledger.write(state)
    return response
