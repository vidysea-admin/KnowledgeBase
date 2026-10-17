"""sb_join: active-speaker tile capture (T-042, D-160). OFF unless env LKB_TILE_CAPTURE_FILE names an output file.

Samples the Meet page source once per hold-loop tick and appends one JSON line per observation to that file, in the shape of
`TileObservation` (packages/core/src/domain/speaker-tile-alignment.ts): {tSec, displayName|null, source}. A first meta line
({"kind":"meta",...}) records bracketed epoch/monotonic witnesses bound to the managed generation,
local host digest and a fresh sampler instance. tSec uses monotonic elapsed seconds. These
witnesses do not establish decoded media sample zero. A release (displayName null)
is written when nobody is highlighted. Two highlighted tiles are written at the same tSec with different names; the aligner
treats that as an ambiguous instant and counts it for no name.

The names are UNTRUSTED display strings. They only ever become SUGGESTED speaker names a human must confirm (D-160, D-141).
The Meet selectors below are candidates that have not been validated against a live call (pending live check).
Hook: sb_join.main() wraps the `time` it hands to run_session with `tile_clock`; with the flag off nothing is wrapped.
"""
import json
import hashlib
import math
import socket
import uuid
from html.parser import HTMLParser

ENV_FLAG = "LKB_TILE_CAPTURE_FILE"
SOURCE = "meet-dom"
MAX_NAME_CHARS = 200
MIN_WRITE_GAP_S = 4.0   # re-write an unchanged state at least this often (aligner maxHoldSec defaults to 5)
GENERATION_ENV = "LKB_CAPTURE_CONTROL_GENERATION"
MAX_CLOCK_ERROR_S = 0.25
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _TileParser(HTMLParser):
    """Collects, per element carrying data-participant-id, its name and whether it shows a speaking marker."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tiles = []
        self._stack = []        # (tag, tile_or_None) for open elements
        self._capture = None    # tile whose name element text is being read

    def _tile(self):
        for _tag, tile in reversed(self._stack):
            if tile is not None:
                return tile
        return None

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        tile = None
        if "data-participant-id" in a:
            tile = {"id": a["data-participant-id"], "name": None, "speaking": False}
            self.tiles.append(tile)
        owner = tile or self._tile()
        if owner is not None:
            classes = a.get("class", "").lower().split()
            if a.get("data-is-speaking", "").lower() == "true" or a.get("data-speaking", "").lower() == "true" or "speaking" in classes:
                owner["speaking"] = True
            if owner["name"] is None and a.get("data-self-name", "").strip():
                owner["name"] = a["data-self-name"]
            if owner["name"] is None and "data-tile-name" in a:
                self._capture = owner
        if tag not in _VOID:
            self._stack.append((tag, tile))

    def handle_endtag(self, tag):
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                del self._stack[i:]
                break
        self._capture = None

    def handle_data(self, data):
        if self._capture is not None and self._capture["name"] is None and data.strip():
            self._capture["name"] = data


def speaking_names(page_source):
    """Sorted distinct display names of the tiles currently highlighted as speaking ([] if none or the markup is unusable)."""
    if not isinstance(page_source, str):
        return []
    p = _TileParser()
    try:
        p.feed(page_source)
        p.close()
    except Exception:
        return []
    names = set()
    for t in p.tiles:
        n = " ".join(str(t["name"]).split()) if t["name"] else ""
        if t["speaking"] and n and len(n) <= MAX_NAME_CHARS:
            names.add(n)
    return sorted(names)


class TileSampler:
    def __init__(self, path, clock, source_of_page, monotonic_clock, generation):
        self.path, self.clock, self.source_of_page = path, clock, source_of_page
        self.monotonic_clock = monotonic_clock
        parsed = uuid.UUID(generation)
        if str(parsed) != generation or parsed.version != 4:
            raise ValueError("Missing server capture generation")
        self.identity = {"version": 1, "captureGeneration": generation,
                         "hostId": hashlib.sha256(socket.gethostname().encode("utf-8")).hexdigest(),
                         "samplerInstance": str(uuid.uuid4())}
        self.t0 = None
        self.origin = None
        self.last_monotonic = None
        self.invalid = False
        self.last = None        # (names tuple, tSec written)

    def _append(self, rows):
        with open(self.path, "a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    def tick(self):
        if self.invalid:
            return
        before = self.clock()
        monotonic = self.monotonic_clock()
        after = self.clock()
        witness = {"epochBeforeSec": before, "epochAfterSec": after, "monotonicSec": monotonic}
        valid = all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v >= 0
                    for v in witness.values()) and 0 <= after - before <= MAX_CLOCK_ERROR_S
        if self.origin is not None:
            elapsed = monotonic - self.origin["monotonicSec"]
            valid = valid and monotonic >= self.last_monotonic and elapsed >= 0
            valid = valid and before - self.origin["epochAfterSec"] - MAX_CLOCK_ERROR_S <= elapsed <= after - self.origin["epochBeforeSec"] + MAX_CLOCK_ERROR_S
        if not valid:
            self.invalid = True
            self._append([{"kind": "sampler-clock-invalid", "source": SOURCE}])
            return
        self.last_monotonic = monotonic
        if self.t0 is None:
            self.t0, self.origin = before, witness
            self._append([{"kind": "meta", "startedAtEpoch": before, "source": SOURCE,
                           "samplerClock": {**self.identity, **witness}}])
        t = round(monotonic - self.origin["monotonicSec"], 3)
        names = tuple(speaking_names(self.source_of_page()))
        if self.last is not None and self.last[0] == names and t - self.last[1] < MIN_WRITE_GAP_S:
            return
        self.last = (names, t)
        if names:
            self._append([{"tSec": t, "displayName": n, "source": SOURCE, "samplerClock": witness} for n in names])
        else:
            self._append([{"tSec": t, "displayName": None, "source": SOURCE, "samplerClock": witness}])


class _TileClock:
    """Delegates to the real `time` module; `sleep` first takes one tile sample. A sampling failure never reaches the hold loop."""

    def __init__(self, real_time, sampler):
        self._time, self._sampler = real_time, sampler

    def sleep(self, seconds):
        try:
            self._sampler.tick()
        except Exception:
            pass
        return self._time.sleep(seconds)

    def __getattr__(self, name):
        return getattr(self._time, name)


def tile_clock(sb, os_module, time_module):
    """`time_module` unchanged when the flag is off (byte-identical behaviour); otherwise a sampling wrapper."""
    path = os_module.environ.get(ENV_FLAG, "")
    if not path:
        return time_module
    # Only the managed server invocation supplies this generation. Missing authority
    # disables tile evidence; it never disables or delays the recording hold loop.
    generation = os_module.environ.get(GENERATION_ENV, "")
    try:
        sampler = TileSampler(path, time_module.time, lambda: sb.driver.page_source, time_module.monotonic, generation)
    except (ValueError, TypeError, AttributeError):
        return time_module
    return _TileClock(time_module, sampler)
