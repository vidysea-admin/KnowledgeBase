"""sb_join: active-speaker tile capture (T-042, D-160). OFF unless env LKB_TILE_CAPTURE_FILE names an output file.

Samples the Meet page source once per hold-loop tick and appends one JSON line per observation to that file, in the shape of
`TileObservation` (packages/core/src/domain/speaker-tile-alignment.ts): {tSec, displayName|null, source}. A first meta line
({"kind":"meta",...}) records the wall-clock start. tSec is seconds since the sampler first ran. A release (displayName null)
is written when nobody is highlighted. Two highlighted tiles are written at the same tSec with different names; the aligner
treats that as an ambiguous instant and counts it for no name.

The names are UNTRUSTED display strings. They only ever become SUGGESTED speaker names a human must confirm (D-160, D-141).
The Meet selectors below are candidates that have not been validated against a live call (pending live check).
Hook: sb_join.main() wraps the `time` it hands to run_session with `tile_clock`; with the flag off nothing is wrapped.
"""
import json
from html.parser import HTMLParser

ENV_FLAG = "LKB_TILE_CAPTURE_FILE"
SOURCE = "meet-dom"
MAX_NAME_CHARS = 200
MIN_WRITE_GAP_S = 4.0   # re-write an unchanged state at least this often (aligner maxHoldSec defaults to 5)
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
    def __init__(self, path, clock, source_of_page):
        self.path, self.clock, self.source_of_page = path, clock, source_of_page
        self.t0 = None
        self.last = None        # (names tuple, tSec written)

    def _append(self, rows):
        with open(self.path, "a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    def tick(self):
        now = self.clock()
        if self.t0 is None:
            self.t0 = now
            self._append([{"kind": "meta", "startedAtEpoch": now, "source": SOURCE}])
        t = round(now - self.t0, 3)
        names = tuple(speaking_names(self.source_of_page()))
        if self.last is not None and self.last[0] == names and t - self.last[1] < MIN_WRITE_GAP_S:
            return
        self.last = (names, t)
        if names:
            self._append([{"tSec": t, "displayName": n, "source": SOURCE} for n in names])
        else:
            self._append([{"tSec": t, "displayName": None, "source": SOURCE}])


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
    return _TileClock(time_module, TileSampler(path, time_module.time, lambda: sb.driver.page_source))
