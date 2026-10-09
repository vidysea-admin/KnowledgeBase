"""
packages/meeting-bot/py/sb_join.py — the real bot browser behind joiners/browser-joiner.ts
(spawned by src/capture/obs-windows.ts). SeleniumBase 4, UC mode, HEADED (a headless Chrome
plays no audio), with a persistent profile the user logs into once so the bot attends "as him".

It never records anything itself: OBS captures this window's audio + video. What it does:
  * opens the join URL with mic/camera prompts denied and autoplay allowed;
  * pins document.title to --title every 2s, so OBS's title-priority window match finds THIS
    Chrome (a separate process tree from the user's own Chrome) and nothing else;
  * clicks obvious join / computer-audio buttons during the first minutes;
  * prints one JSON event per line on stdout (opened / clicked / heartbeat / ended / closed);
  * exits when --stop-file appears.

Usage: python sb_join.py <url> --profile <dir> --title <title> --stop-file <path>
"""
import argparse
import contextlib
import json
import os
import sys
import threading
import time

from seleniumbase import SB


def existing_profile_directory(parent, selected):
    """An explicit selector reuses a physical subprofile without changing its parent."""
    if selected is None:
        return None
    import pathlib
    import re
    if (not isinstance(selected, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}", selected)
            or ".." in selected or selected.strip() != selected or selected.endswith((".", " "))):
        raise RuntimeError("Invalid browser profile-directory")
    root = pathlib.Path(parent)
    directory, preferences = root / selected, root / selected / "Preferences"
    if not root.is_absolute():
        raise RuntimeError("Selected browser profile requires an absolute parent")
    for target in (root, directory, preferences):
        try:
            if any(getattr(os.lstat(part), "st_file_attributes", 0) & 0x400 or part.is_symlink()
                   for part in (target, *target.parents)):
                raise RuntimeError("Redirected selected profile refused")
            if os.path.normcase(os.path.realpath(target)) != os.path.normcase(os.path.abspath(target)):
                raise RuntimeError("Noncanonical selected profile refused")
        except OSError as error:
            raise RuntimeError("Selected browser profile must already exist") from error
    if not root.is_dir() or not directory.is_dir() or not preferences.is_file():
        raise RuntimeError("Selected browser profile requires a physical directory and Preferences")
    return selected


def validate_uc_profile_support(selected):
    if selected is None:
        return
    import inspect
    import seleniumbase
    from seleniumbase import undetected
    if seleniumbase.__version__ != "4.51.9" or not isinstance(undetected.Chrome, type):
        raise RuntimeError("Selected profile requires supported pinned SeleniumBase 4.51.9")
    try:
        signature = inspect.signature(undetected.Chrome.__init__)
    except (TypeError, ValueError) as error:
        raise RuntimeError("Selected profile constructor capability unsupported") from error
    for name in ("options", "suppress_welcome"):
        parameter = signature.parameters.get(name)
        if parameter is None or parameter.kind not in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY):
            raise RuntimeError("Selected profile constructor capability unsupported")


@contextlib.contextmanager
def selected_uc_profile(selected):
    """SB omits this documented UC option; scope its constructor adaptation to one launch."""
    if selected is None:
        yield
        return
    validate_uc_profile_support(selected)
    from seleniumbase import undetected
    original = undetected.Chrome

    class SelectedChrome(original):
        def __init__(self, *args, **kwargs):
            options = kwargs.get("options", args[0] if args else None)
            arguments = getattr(options, "arguments", None)
            if not isinstance(arguments, list) or [arg for arg in arguments if arg.startswith("--profile-directory=")] != ["--profile-directory=" + selected]:
                raise RuntimeError("Selected profile requires exactly one effective directory argument")
            for welcome in ("--no-default-browser-check", "--no-first-run", "--no-service-autorun", "--password-store=basic"):
                if welcome not in arguments:
                    options.add_argument(welcome)
            kwargs["suppress_welcome"] = False
            super().__init__(*args, **kwargs)

    undetected.Chrome = SelectedChrome
    try:
        yield
    finally:
        undetected.Chrome = original

JOIN_TEXTS = [
    "join now", "join webinar", "join from browser", "join via browser", "join from your browser",
    "join in browser", "join", "join audio", "computer audio", "join with computer audio",
    "listen only", "continue in browser", "continue", "watch now", "i agree", "accept",
]
END_PHRASES = [
    "webinar has ended", "webinar has been ended", "session has ended", "meeting has ended",
    "has ended the webinar", "the webinar is over", "thank you for attending", "event has ended",
]
MAX_CLICKS = 8
CLICK_WINDOW_S = 15 * 60

# T-029 auto-reconnect. Phrases are lowercase substrings matched against document.body.innerText.
RECONNECT_PHRASES = [
    "connection interrupted", "trying to reconnect", "reconnecting",
    "connection lost", "attempting to reconnect", "you have been disconnected",
]
OFFLINE_PAGE_PHRASES = [  # a hard Chrome net-error interstitial, handled the same way as a banner
    "this site can't be reached", "no internet", "err_internet_disconnected",
    "err_connection", "err_network_changed",
]
RECONNECT_THRESHOLD_S = 20  # banner/offline must persist this long before we act (roadmap T-029)
RECONNECT_COOLDOWN_S = 30  # minimum gap between successive reload attempts
MAX_RECONNECTS = 5  # give up reloading after this many in one run; keep holding the window

# ISS-U0-1: Zoom's web-client join UI (name field, Join button, "Join Audio by Computer",
# waiting-for-host / end-of-webinar text) renders inside a same-origin <iframe> the top document
# never contains directly. Both CLICK_JS and BODY_TEXT_JS below recurse into every same-origin
# iframe (and iframes nested inside those, arbitrarily deep) via a shared `walk(doc)` helper.
# `frame.contentDocument` throws (or returns null, depending on browser) for a cross-origin
# frame — that access is wrapped in try/catch so a cross-origin ad/tracker iframe is silently
# skipped rather than raising out of execute_script. Zoho/Meet pages that have no iframe at all
# take the exact same code path: `doc.querySelectorAll('iframe')` returns an empty list, `walk`
# recurses zero times, and behaviour is unchanged from before this fix.
#
# ISS-U0-4/ISS-U0-5 (checker cycle 1, fixed): the frame recursion above had no visibility gate on
# the <iframe> ELEMENT itself in its parent document — a frame collapsed to zero size or hidden
# via display:none/visibility:hidden (on itself OR any ancestor) still had its content visited,
# clicked (ISS-U0-4) and merged into BODY_TEXT_JS (ISS-U0-5), because CLICK_JS's own
# getBoundingClientRect check only ever looked at the clicked ELEMENT relative to ITS OWN
# document — a browser lays out an iframe's inner content at natural size regardless of the
# iframe's own collapsed CSS size, so that check can never see a collapsed/hidden container.
#
# ISS-U0-6/ISS-U0-7 (checker cycle 2, fixed here): the cycle-1 fix enumerated hiding TECHNIQUES
# one at a time (self zero-size, self/ancestor display:none via getClientRects, ancestor
# visibility:hidden) and cycle 2's own adversarial fixtures kept finding new techniques the
# enumeration missed — an ancestor that clips its OWN box to zero size via overflow:hidden while
# the iframe keeps an explicit nonzero width/height (ISS-U0-6, high: overflow:hidden only clips
# rendering, it never removes the child from layout or zeros the child's own rect, so
# getClientRects().length stays non-zero), plus opacity:0 and off-screen absolute positioning
# (ISS-U0-7, medium). isFrameVisible() below stops enumerating techniques and instead computes
# the frame's actual on-screen VISIBLE AREA: start from the frame's own
# getBoundingClientRect() intersected with its owner document's viewport (frame.ownerDocument is
# the PARENT document containing the <iframe> tag — not its nested contentDocument — so this is
# exactly the coordinate space the ancestor walk below also lives in); walk every ancestor up to
# documentElement, and whenever an ancestor's own overflow clips (overflow-x/-y not 'visible'),
# intersect the running rect with that ancestor's own box too. display:none, visibility:hidden/
# collapse and opacity:0 are checked directly (on the frame itself AND every ancestor) since those
# hide the whole box regardless of geometry. The frame is visible iff the final intersected area
# is at least 2x2px — an exact 0-width/0-height rect is unambiguously invisible; 2px is a
# deliberate small margin above that so a 1px antialiasing/rounding sliver from getBoundingClientRect
# floats never counts as "on screen" either. Because walkFrames only recurses into a frame once
# its OWN isFrameVisible() call passes, and each call only looks at that frame's local ancestor
# chain in its own parent document, nesting composes automatically — a nested frame's own geometry
# is checked fresh against its own (already-visible) parent document, never assumed from the
# outer frame's result. Zoho/Meet pages that have no iframe at all take the exact same code path
# as always: `doc.querySelectorAll('iframe')` returns an empty list, isFrameVisible is never
# called, and behaviour is unchanged from before ISS-U0-1.
_IFRAME_WALK_JS = """
function _rectIntersect(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function _hiddenBySelfStyle(cs) {
  return cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' ||
    parseFloat(cs.opacity) === 0;
}
function isFrameVisible(frame) {
  const csSelf = getComputedStyle(frame);
  if (_hiddenBySelfStyle(csSelf)) return false;
  const win = frame.ownerDocument.defaultView;
  let r = _rectIntersect(frame.getBoundingClientRect(),
    { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight });
  if (r.width < 2 || r.height < 2) return false;
  let el = frame.parentElement;
  while (el) {
    const cs = getComputedStyle(el);
    if (_hiddenBySelfStyle(cs)) return false;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      r = _rectIntersect(r, el.getBoundingClientRect());
      if (r.width < 2 || r.height < 2) return false;
    }
    el = el.parentElement;
  }
  return true;
}
function walkFrames(doc, visit) {
  visit(doc);
  let frames;
  try {
    frames = [...doc.querySelectorAll('iframe')];
  } catch (e) {
    return;
  }
  for (const frame of frames) {
    if (!isFrameVisible(frame)) continue;  // ISS-U0-4/ISS-U0-5: skip the whole hidden subtree
    let inner;
    try {
      inner = frame.contentDocument;
    } catch (e) {
      inner = null;  // cross-origin: SecurityError — skip silently, never throw
    }
    if (!inner) continue;
    walkFrames(inner, visit);
  }
}
"""

CLICK_JS = _IFRAME_WALK_JS + """
const wanted = arguments[0];
let hit = null;
walkFrames(document, (doc) => {
  if (hit) return;
  let els;
  try {
    els = [...doc.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')];
  } catch (e) {
    return;
  }
  for (const el of els) {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!t || t.length > 40) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || el.disabled) continue;
    if (wanted.includes(t)) { el.click(); hit = t; return; }
  }
});
return hit;
"""

# ISS-U0-1: same traversal for the body-text read main() uses for END_PHRASES/RECONNECT_PHRASES/
# OFFLINE_PAGE_PHRASES detection — text living only inside an iframe (e.g. "waiting for the host
# to start this webinar") was previously invisible to those checks.
BODY_TEXT_JS = _IFRAME_WALK_JS + """
let parts = [];
walkFrames(document, (doc) => {
  try {
    if (doc.body) parts.push(doc.body.innerText || '');
  } catch (e) {
    // ignore
  }
});
return parts.join(' ');
"""


_EMIT_LOCK = threading.Lock()


def emit(event, **kw):
    # ISS-324: the bootstrap-progress thread emits concurrently with the main thread, so the
    # write is serialised — an interleaved line would be unparseable JSON on the node side.
    with _EMIT_LOCK:
        print(json.dumps({"event": event, "t": time.time(), **kw}), flush=True)


def _bootstrap_progress(done, stage):
    """ISS-324: SB(uc=True, headed=True, user_data_dir=...) emits NOTHING while it fetches/patches
    chromedriver and loads a large signed-in profile. On the 2026-09-27 Ashoka run that opaque phase
    outlasted the node side's fixed 120 s budget, which then reported "did not open the page
    (timeout)" -- naming the page, when the page had not been reached yet. This thread ticks every
    10 s so the controller can tell "still bringing the browser up" from "wedged"."""
    waited = 0.0
    while not done.wait(10.0):
        waited += 10.0
        emit("bootstrapping", stage=stage, seconds=int(waited))


def click_gate(clicks, now, started, extra_click_until, last_click, no_click):
    """Pure predicate for whether this tick may attempt a click (C2, meeting-bot-live-capture
    contract): `clicks` is a single run-long counter — T-029's reload path only ever widens
    *when* clicking is still allowed (`extra_click_until`), never *how many* clicks are allowed
    (`MAX_CLICKS` stays the one global cap for the whole run, across any number of reloads)."""
    return (not no_click and clicks < MAX_CLICKS
            and (now - started < CLICK_WINDOW_S or now < extra_click_until)
            and now - last_click > 5)


def apply_reload(clicks, now):
    """Called from main() on a T-029 "reload" action, after the page has been reloaded and
    rejoined. Returns (clicks, extra_click_until). C2 requires MAX_CLICKS to bound the WHOLE
    run: a reload widens the click time window (extra_click_until = now + CLICK_WINDOW_S) but
    MUST return `clicks` unchanged — resetting it here would let a run with enough reloads click
    past MAX_CLICKS total, one fresh allowance per reload instead of one for the whole run."""
    return clicks, now + CLICK_WINDOW_S


def detect_trouble(body_lower, online):
    """Pure, browser-free: does this page state look like a dropped connection? `body_lower` is
    document.body.innerText.lower() (the caller already computes it for the join/end-phrase
    checks — no extra script eval here); `online` is navigator.onLine, or True if it couldn't be
    read. Covers both the in-app "trying to reconnect" banner and a hard Chrome net-error page."""
    if online is False:
        return "offline"
    for phrase in RECONNECT_PHRASES:
        if phrase in body_lower:
            return "banner"
    for phrase in OFFLINE_PAGE_PHRASES:
        if phrase in body_lower:
            return "offline"
    return None


class ReconnectState:
    """Pure state machine for T-029 — no Selenium object is touched here, so it's unit-testable
    without a browser. `tick()` runs once per poll with the current trouble reason (or None from
    detect_trouble) and returns (action, gap):
      action: "none" (nothing happening) | "wait" (trouble seen, still under threshold) |
              "cooldown" (over threshold, but reloaded too recently) | "reload" (act now, caller
              reloads the page) | "give-up" (over max_reloads; keep holding the window, stop
              reloading).
      gap: a completed {start, end, reason, recovered} dict, returned only on the tick where
           trouble clears (recovered=True) — see also close_at_end() for a gap still open when
           the run itself ends (recovered=False).
    """

    def __init__(self, threshold_s=RECONNECT_THRESHOLD_S, cooldown_s=RECONNECT_COOLDOWN_S,
                 max_reloads=MAX_RECONNECTS):
        self.threshold_s = threshold_s
        self.cooldown_s = cooldown_s
        self.max_reloads = max_reloads
        self.trouble_since = None
        self.reason = None
        self.last_reload = None
        self.reload_count = 0

    def tick(self, reason, now):
        if reason is not None:
            if self.trouble_since is None:
                self.trouble_since = now
                self.reason = reason
                return "wait", None
            if now - self.trouble_since <= self.threshold_s:
                return "wait", None
            if self.reload_count >= self.max_reloads:
                return "give-up", None
            if self.last_reload is not None and now - self.last_reload < self.cooldown_s:
                return "cooldown", None
            self.last_reload = now
            self.reload_count += 1
            return "reload", None
        if self.trouble_since is not None:
            gap = {"start": self.trouble_since, "end": now, "reason": self.reason, "recovered": True}
            self.trouble_since = None
            self.reason = None
            return "recovered", gap
        return "none", None

    def close_at_end(self, now):
        """Called once when the run is ending (stop-file seen / browser dead) so a gap that was
        still open never goes unrecorded."""
        if self.trouble_since is None:
            return None
        gap = {"start": self.trouble_since, "end": now, "reason": self.reason, "recovered": False}
        self.trouble_since = None
        self.reason = None
        return gap


def should_force_reload(reload_file):
    """T-031: pure check for the audio-watchdog's forced-reload sentinel (docs/meeting-bot-
    roadmap.md T-031) — a file the Node controller drops when the live OBS meter has read silence
    past its own threshold, independent of this file's own T-029 DOM-banner detection (a muted-
    but-connected tab shows no banner at all). main() removes the file itself right after acting,
    so this has no side effect and is trivially testable with a real temp file, no browser."""
    return bool(reload_file) and os.path.exists(reload_file)


def kill_orphans(profile, launch=False, expected_exe=None, profile_directory=None):
    """Windows ownership is established before launch; cleanup never scans foreign processes."""
    existing_profile_directory(profile, profile_directory)
    import subprocess
    if sys.platform.startswith("linux"):
        import signal
        expected = os.path.realpath(profile)

        def identity(pid):
            try:
                base = "/proc/" + str(pid)
                executable = os.path.realpath(os.readlink(base + "/exe"))
                if os.path.basename(executable) not in ("chrome", "chromium", "chromium-browser"):
                    return None
                with open(base + "/cmdline", "rb") as handle:
                    argv = [part.decode("utf-8", "strict") for part in handle.read().split(b"\0") if part]
                if any(arg == "--type" or arg.startswith("--type=") for arg in argv):
                    return None
                profiles = []
                for index, arg in enumerate(argv):
                    if arg.startswith("--user-data-dir="):
                        profiles.append(arg.split("=", 1)[1])
                    elif arg == "--user-data-dir" and index + 1 < len(argv):
                        profiles.append(argv[index + 1])
                if len(profiles) != 1 or not os.path.isabs(profiles[0]) or os.path.realpath(profiles[0]) != expected:
                    return None
                with open(base + "/stat", encoding="utf-8") as handle:
                    start_time = handle.read().rsplit(")", 1)[1].split()[19]
                return executable, expected, start_time
            except (OSError, UnicodeError, IndexError):
                return None

        try:
            entries = os.listdir("/proc")
        except OSError as error:
            raise RuntimeError("Cannot inspect Linux recorder processes") from error
        for entry in entries:
            if not entry.isdigit() or int(entry) <= 0:
                continue
            pid = int(entry)
            before = identity(pid)
            if before is None:
                continue
            if identity(pid) != before:
                raise RuntimeError("Recorder browser process identity changed before cleanup")
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                continue
            except OSError as error:
                raise RuntimeError("Cannot terminate owned recorder browser") from error
            deadline = time.monotonic() + 3
            while True:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                except OSError as error:
                    raise RuntimeError("Cannot verify recorder browser termination") from error
                current = identity(pid)
                if current != before:
                    raise RuntimeError("Recorder browser identity changed during termination")
                if time.monotonic() >= deadline:
                    raise RuntimeError("Owned recorder browser remains alive")
                time.sleep(0.05)
        return  # Never delete Linux Singleton files, which may be live symlinks.
    if os.name != "nt":
        raise RuntimeError("Unsupported recorder process-cleanup platform")
    import ctypes
    from ctypes import wintypes as w
    import math
    import msvcrt
    import pathlib
    import psutil
    import uuid
    expected = os.path.normcase(os.path.abspath(profile))

    def checked(target):
        target = pathlib.Path(target)
        for component in [target, *target.parents]:
            if component.exists() and os.lstat(component).st_file_attributes & 0x400:
                raise RuntimeError("Redirected owned profile refused")
        if os.path.normcase(os.path.realpath(target)) != os.path.normcase(os.path.abspath(target)):
            raise RuntimeError("Noncanonical owned profile refused")
        return str(target)

    checked(expected)
    os.makedirs(expected, exist_ok=True)
    lock_path = checked(os.path.join(expected, ".lkb-profile.lock"))
    lock = open(lock_path, "a+b")
    try:
        if os.path.getsize(lock_path) == 0:
            lock.write(b"0"); lock.flush()
        lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except Exception:
        lock.close(); raise RuntimeError("Owned profile is occupied")
    ledger_path = checked(os.path.join(expected, ".lkb-ownership.json"))
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    signatures = {
        "CreateJobObjectW": ([ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
        "OpenJobObjectW": ([w.DWORD, w.BOOL, w.LPCWSTR], w.HANDLE),
        "SetInformationJobObject": ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
        "AssignProcessToJobObject": ([w.HANDLE, w.HANDLE], w.BOOL),
        "IsProcessInJob": ([w.HANDLE, w.HANDLE, ctypes.POINTER(w.BOOL)], w.BOOL),
        "QueryInformationJobObject": ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p], w.BOOL),
        "TerminateJobObject": ([w.HANDLE, w.UINT], w.BOOL),
        "OpenProcess": ([w.DWORD, w.BOOL, w.DWORD], w.HANDLE),
        "CloseHandle": ([w.HANDLE], w.BOOL), "GetCurrentProcess": ([], w.HANDLE)}
    for name, (args, result) in signatures.items():
        getattr(kernel, name).argtypes = args; getattr(kernel, name).restype = result

    class Basic(ctypes.Structure):
        _fields_ = [("ProcessTime", ctypes.c_longlong), ("JobTime", ctypes.c_longlong), ("Flags", w.DWORD),
                    ("MinWorking", ctypes.c_size_t), ("MaxWorking", ctypes.c_size_t), ("ActiveLimit", w.DWORD),
                    ("Affinity", ctypes.c_size_t), ("Priority", w.DWORD), ("Scheduling", w.DWORD)]

    class IO(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in ("ReadOps", "WriteOps", "OtherOps", "ReadBytes", "WriteBytes", "OtherBytes")]

    class Extended(ctypes.Structure):
        _fields_ = [("Basic", Basic), ("IO", IO), ("ProcessMemory", ctypes.c_size_t), ("JobMemory", ctypes.c_size_t),
                    ("PeakProcessMemory", ctypes.c_size_t), ("PeakJobMemory", ctypes.c_size_t)]

    class Accounting(ctypes.Structure):
        _fields_ = [(name, ctypes.c_longlong) for name in ("User", "Kernel", "PeriodUser", "PeriodKernel")] + [
            (name, w.DWORD) for name in ("Faults", "Total", "Active", "Terminated")]

    def active(job):
        value = Accounting()
        if not kernel.QueryInformationJobObject(job, 1, ctypes.byref(value), ctypes.sizeof(value), None):
            raise RuntimeError("Cannot query owned Job accounting")
        return value.Active

    def identity(pid):
        if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
            raise RuntimeError("Invalid owned PID")
        process = psutil.Process(pid)
        created = process.create_time()
        if not isinstance(created, (int, float)) or not math.isfinite(created) or created <= 0:
            raise RuntimeError("Invalid owned creation time")
        return {"pid": pid, "created": created, "exe": os.path.normcase(os.path.realpath(process.exe()))}

    def persist(record):
        if len(json.dumps(record).encode("utf-8")) > 8192:
            raise RuntimeError("Owned ledger exceeds bound")
        temporary = checked(ledger_path + "." + str(uuid.uuid4()) + ".tmp")
        try:
            with open(temporary, "x", encoding="utf-8") as file:
                json.dump(record, file); file.flush(); os.fsync(file.fileno())
            os.replace(temporary, ledger_path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    if os.path.exists(ledger_path):
        if os.path.getsize(ledger_path) > 8192:
            raise RuntimeError("Owned ledger too large")
        with open(ledger_path, encoding="utf-8") as file:
            record = json.load(file)
        if (not isinstance(record, dict) or set(record) - {"version", "profile", "nonce", "job", "phase", "owner", "browserExe", "browser"}
                or record.get("version") != 1 or record.get("profile") != expected
                or record.get("phase") not in ("contained", "browser", "cleaned")
                or str(uuid.UUID(record.get("nonce", ""))) != record["nonce"]
                or record.get("job") != "Local\\LKB-" + record["nonce"]
                or not isinstance(record.get("owner"), dict) or set(record["owner"]) != {"pid", "created", "exe"}
                or not isinstance(record.get("browserExe"), str) or not os.path.isabs(record["browserExe"])):
            raise RuntimeError("Incomplete owned ledger refused")
        for item in [record["owner"], *([record["browser"]] if "browser" in record else [])]:
            if (not isinstance(item, dict) or set(item) != {"pid", "created", "exe"}
                    or not isinstance(item["pid"], int) or isinstance(item["pid"], bool) or item["pid"] <= 0
                    or not isinstance(item["created"], (int, float)) or isinstance(item["created"], bool)
                    or not math.isfinite(item["created"]) or item["created"] <= 0
                    or not isinstance(item["exe"], str) or not os.path.isabs(item["exe"])
                    or os.path.normcase(os.path.realpath(item["exe"])) != item["exe"]):
                raise RuntimeError("Malformed recorded process identity")
        if record["phase"] == "browser" and ("browser" not in record or record["browser"]["exe"] != record["browserExe"]):
            raise RuntimeError("Missing recorded browser ownership")
        if record["phase"] == "contained" and "browser" in record:
            raise RuntimeError("Inconsistent contained ledger")
        try:
            owner = identity(record["owner"]["pid"])
        except psutil.NoSuchProcess:
            owner = None
        if owner is not None:
            if owner != record["owner"]:
                raise RuntimeError("Reused owner PID refused")
            raise RuntimeError("Owned browser parent is still alive")
        browser_alive = False
        if "browser" in record:
            if not isinstance(record["browser"], dict) or set(record["browser"]) != {"pid", "created", "exe"}:
                raise RuntimeError("Malformed owned browser identity")
            try:
                if identity(record["browser"]["pid"]) != record["browser"]:
                    raise RuntimeError("Reused browser PID refused")
                browser_alive = True
            except psutil.NoSuchProcess:
                pass
        job = kernel.OpenJobObjectW(0x000C, False, record["job"])
        if job:
            try:
                limits = Extended()
                if (not kernel.QueryInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits), None)
                        or limits.Basic.Flags != 0x2000):
                    raise RuntimeError("Owned Job containment changed")
                if browser_alive:
                    process = kernel.OpenProcess(0x1000, False, record["browser"]["pid"])
                    if not process:
                        raise RuntimeError("Cannot verify recorded browser membership")
                    try:
                        member = w.BOOL()
                        if not kernel.IsProcessInJob(process, job, ctypes.byref(member)) or not member.value:
                            raise RuntimeError("Recorded browser is outside owned Job")
                    finally:
                        kernel.CloseHandle(process)
                if not kernel.TerminateJobObject(job, 1):
                    raise RuntimeError("Owned Job termination refused")
                deadline = time.monotonic() + 5
                while active(job):
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Owned Job still active")
                    time.sleep(0.05)
            finally:
                kernel.CloseHandle(job)
        elif ctypes.get_last_error() != 2 or browser_alive:
            raise RuntimeError("Cannot inspect owned Job")
        record["phase"] = "cleaned"; persist(record)
    elif any(name != ".lkb-profile.lock" for name in os.listdir(expected)):
        raise RuntimeError("Legacy occupied or unproved profile refused")
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        target = checked(os.path.join(expected, name))
        if os.path.exists(target):
            os.remove(target)
    # A killed run leaves exit_type=Crashed + saved Sessions, and Chrome then restores old tabs
    # (measured: the bot opened a stale YouTube tab and lost its own). Start from a clean session.
    import shutil
    selected = profile_directory or "Default"
    sessions = checked(os.path.join(expected, selected, "Sessions"))
    if os.path.exists(sessions):
        for current, directories, files in os.walk(sessions):
            checked(current)
            for name in directories + files:
                checked(os.path.join(current, name))
        shutil.rmtree(sessions)
    prefs = checked(os.path.join(expected, selected, "Preferences"))
    if os.path.exists(prefs):
        with open(prefs, encoding="utf-8") as f:
            p = json.load(f)
        p.setdefault("profile", {})["exit_type"] = "Normal"
        p["profile"]["exited_cleanly"] = True
        with open(prefs, "w", encoding="utf-8") as f:
            json.dump(p, f)
    if not launch:
        lock.close()
        return
    if not expected_exe or not os.path.isabs(expected_exe):
        raise RuntimeError("Explicit managed Windows browser required")
    executable = os.path.normcase(os.path.realpath(expected_exe))
    if not os.path.isfile(executable) or os.path.basename(executable) not in ("chrome.exe", "chromium.exe"):
        raise RuntimeError("Owned browser executable refused")
    nonce = str(uuid.uuid4())
    record = {"version": 1, "profile": expected, "nonce": nonce, "job": "Local\\LKB-" + nonce,
              "phase": "contained", "owner": identity(os.getpid()), "browserExe": executable}
    job = kernel.CreateJobObjectW(None, record["job"])
    if not job or ctypes.get_last_error() == 183:
        raise RuntimeError("Cannot create exclusive owned Job")
    limits = Extended(); limits.Basic.Flags = 0x2000
    if (not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))
            or not kernel.AssignProcessToJobObject(job, kernel.GetCurrentProcess())):
        kernel.CloseHandle(job)
        raise RuntimeError("Cannot contain owned browser before launch")
    persist(record)

    def verify(browser_pid):
        browser = identity(browser_pid)
        if browser["exe"] != executable:
            raise RuntimeError("Owned browser executable changed")
        argv = psutil.Process(browser_pid).cmdline()
        profiles = [arg.split("=", 1)[1] for arg in argv if arg.startswith("--user-data-dir=")]
        profiles += [argv[index + 1] for index, arg in enumerate(argv[:-1]) if arg == "--user-data-dir"]
        if len(profiles) != 1 or os.path.normcase(os.path.realpath(profiles[0])) != expected:
            raise RuntimeError("Owned browser profile identity changed")
        process = kernel.OpenProcess(0x1000, False, browser_pid)
        if not process:
            raise RuntimeError("Cannot inspect owned browser membership")
        try:
            member = w.BOOL()
            if not kernel.IsProcessInJob(process, job, ctypes.byref(member)) or not member.value or identity(browser_pid) != browser:
                raise RuntimeError("Owned browser escaped containment")
        finally:
            kernel.CloseHandle(process)
        record.update({"phase": "browser", "browser": browser}); persist(record)

    # Retain the kernel handle until interpreter exit: closing a self-containing Job kills Python.
    return {"job": job, "lock": lock, "verify": verify}


def register_form(sb, instructions, script_isolated=False, policy_check=None):
    """One submit attempt; positive result is awaiting confirmation, never registration proof."""
    if not script_isolated:
        return {"status": "action_required", "reason": "script_isolation_unproved"}
    import re
    from urllib.parse import urlsplit
    hosts = instructions.get("allowedHosts")
    raw_url = instructions.get("url", "")
    if not isinstance(raw_url, str) or not raw_url or len(raw_url) > 8192:
        return {"status": "action_required", "reason": "request_policy_refused"}
    try:
        parsed = urlsplit(raw_url)
        origin_port = parsed.port if parsed.port is not None else (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return {"status": "action_required", "reason": "request_policy_refused"}
    local = instructions.get("localFixture") is True and parsed.hostname in ("127.0.0.1", "localhost")
    if (not isinstance(hosts, list) or not 1 <= len(hosts) <= 20
            or any(not isinstance(host, str) or not re.fullmatch(r"[a-z0-9.-]{1,253}", host)
                   or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                          for label in (host[:-1] if host.endswith(".") else host).split(".")) for host in hosts)
            or parsed.username or parsed.password or parsed.fragment
            or any(ord(char) < 32 or ord(char) == 127 for char in raw_url)
            or not 1 <= origin_port <= 65535
            or parsed.scheme == "http" and any(host not in ("127.0.0.1", "localhost") for host in hosts)
            or parsed.scheme != "https" and not (local and parsed.scheme == "http")):
        return {"status": "action_required", "reason": "request_policy_refused"}
    if parsed.hostname not in hosts:
        return {"status": "action_required", "reason": "redirect_host"}
    sources = [parsed.scheme + "://" + host + ":" + str(origin_port) for host in hosts]
    policy = "form-action " + " ".join(sources)
    script = r"""
    const i = arguments[0], action = arguments[1];
    const blocked = reason => ({status:'action_required', reason});
    const expected = new URL(i.url), current = new URL(location.href);
    const port = url => url.port || (url.protocol === 'https:' ? '443' : '80');
    if (!i.allowedHosts.includes(current.hostname) || current.protocol !== expected.protocol
      || port(current) !== port(expected)) return blocked('redirect_host');
    if (document.querySelector('input[type=password],iframe[src*="captcha"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey],input[autocomplete^="cc-"]')) return blocked('challenge_payment_login');
    const text = document.body.innerText.toLowerCase();
    if (/captcha|payment required|credit card|sign in to register|log in to register/.test(text)) return blocked('challenge_payment_login');
    const forms = document.querySelectorAll(i.form.formSelector);
    if (forms.length !== 1 || !(forms[0] instanceof HTMLFormElement)) return blocked('form_mismatch');
    const form = forms[0], mapped = [];
    for (const [key, selector] of Object.entries(i.form.fields)) {
      const controls = form.querySelectorAll(selector);
      if (controls.length !== 1 || !(controls[0] instanceof HTMLInputElement)
        || !['text','email','tel'].includes(controls[0].type) || controls[0].disabled
        || controls[0].readOnly || !controls[0].getClientRects().length) return blocked('field_mismatch');
      mapped.push(controls[0]);
    }
    for (const control of form.elements) {
      if (control.type === 'checkbox' && control.required) return blocked('required_consent');
      if (['checkbox','radio'].includes(control.type) && control.checked && !control.disabled) return blocked('unconfigured_consent');
      if (control.required && !mapped.includes(control)) return blocked('unknown_required');
    }
    const submits = form.querySelectorAll(i.form.submitSelector);
    if (submits.length !== 1 || submits[0].type !== 'submit' || submits[0].disabled) return blocked('submit_mismatch');
    const submit = submits[0], target = new URL(submit.getAttribute('formaction') || form.action, location.href);
    const method = (submit.getAttribute('formmethod') || form.method).toLowerCase();
    const encoding = (submit.getAttribute('formenctype') || form.enctype).toLowerCase();
    if (!i.allowedHosts.includes(target.hostname) || target.protocol !== expected.protocol
      || port(target) !== port(expected)
      || target.username || target.password || (submit.formTarget || form.target)) return blocked('redirect_host');
    if (method !== 'post' || encoding !== 'application/x-www-form-urlencoded') return blocked('unsupported_form');
    if (action === 'inspect') return {status:'ready',reason:'ready'};
    for (const [key, selector] of Object.entries(i.form.fields)) {
      const element = form.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,i.operator[key]);
    }
    if (!form.checkValidity()) return blocked('invalid_values');
    form.action = target.href;
    form.method = method;
    form.enctype = encoding;
    HTMLFormElement.prototype.submit.call(form);
    return {status:'submitted',reason:'awaiting_confirmation'};
    """
    try:
        driver = getattr(sb, "driver", sb)
        for command, arguments in (("Network.enable", {}), ("Network.setBypassServiceWorker", {"bypass": True})):
            if not isinstance(driver.execute_cdp_cmd(command, arguments), dict):
                return {"status": "action_required", "reason": "request_policy_unproved"}
        if not callable(policy_check) or policy_check() is not True:
            return {"status": "action_required", "reason": "persistent_policy_unproved"}
        result = sb.execute_script(script, instructions, "inspect")
        if result.get("status") != "ready":
            return result
        installed = sb.execute_script(r"""
        if (!document.head) return false;
        const policy = document.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy'; policy.content = arguments[0];
        document.head.appendChild(policy);
        return policy.isConnected && policy.content === arguments[0];
        """, policy)
        if installed is not True:
            return {"status": "action_required", "reason": "request_policy_unproved"}
        for command, arguments in (("Network.enable", {}), ("Network.setBypassServiceWorker", {"bypass": True})):
            if not isinstance(driver.execute_cdp_cmd(command, arguments), dict):
                return {"status": "action_required", "reason": "request_policy_unproved"}
        if policy_check() is not True:
            return {"status": "action_required", "reason": "persistent_policy_unproved"}
        result = sb.execute_script(script, instructions, "submit")
        return result if isinstance(result, dict) else {"status": "uncertain", "reason": "navigation_during_submit"}
    except Exception:
        return {"status": "uncertain", "reason": "browser_failure"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--profile", required=True)
    ap.add_argument("--profile-directory", default=None, help="existing physical Chrome subprofile under --profile")
    ap.add_argument("--title", required=True)
    ap.add_argument("--stop-file", required=True)
    ap.add_argument("--reload-file", default=None,
                     help="T-031: sentinel; if present, force an immediate reload/rejoin then delete it")
    ap.add_argument("--no-click", action="store_true", help="never auto-click (login/dry-run mode)")
    ap.add_argument("--capture-extension", default=None, help="unpacked tab audio/video recorder extension")
    ap.add_argument("--browser-executable", default=None, help="project-managed Chromium/Chrome for Testing binary")
    ap.add_argument("--cleanup-only", action="store_true", help="terminate only exact owned profile browser processes, without launching")
    ap.add_argument("--registration-stdin", action="store_true", help="single explicit registration attempt from bounded JSON stdin")
    a = ap.parse_args()
    a.profile_directory = existing_profile_directory(a.profile, a.profile_directory)
    validate_uc_profile_support(a.profile_directory)
    registration = None
    if a.registration_stdin:
        registration = json.loads(sys.stdin.read(16385))
        if len(json.dumps(registration)) > 16384:
            raise RuntimeError("Registration instructions refused")
        a.url = registration["url"]
        from urllib.parse import urlsplit
        parsed = urlsplit(a.url)
        hosts = registration.get("allowedHosts", [])
        operator, form = registration.get("operator", {}), registration.get("form", {})
        fields = form.get("fields", {})
        keys = {"firstName", "lastName", "email", "organization"}
        values = list(operator.values()) + list(fields.values()) + [form.get("formSelector"), form.get("submitSelector")]
        if (form.get("mode") != "native-html" or not isinstance(hosts, list) or not 1 <= len(hosts) <= 20
                or not all(isinstance(h, str) and h == h.lower() and len(h) <= 253 for h in hosts)
                or set(operator) != set(fields) or not {"firstName", "lastName", "email"} <= set(fields)
                or not set(fields) <= keys or len(set(fields.values())) != len(fields)
                or not all(isinstance(v, str) and v.strip() and len(v) <= 256
                           and all(ord(c) >= 32 and ord(c) != 127 for c in v) for v in values)):
            raise RuntimeError("Registration operator or form refused")
        local = registration.get("localFixture") is True and parsed.hostname in ("127.0.0.1", "localhost")
        if (parsed.scheme != "https" and not (local and parsed.scheme == "http")
                or parsed.username or parsed.password or parsed.fragment or parsed.hostname not in hosts
                or a.capture_extension or a.cleanup_only):
            raise RuntimeError("Registration URL refused")
    if a.cleanup_only:
        if not os.path.isabs(a.profile):
            raise RuntimeError("Cleanup requires an absolute owned profile")
        kill_orphans(a.profile, **({"profile_directory": a.profile_directory} if a.profile_directory is not None else {}))
        emit("cleanup-complete")
        return

    driver_version = None
    if a.browser_executable:
        import pathlib
        import re
        import subprocess
        import seleniumbase
        from seleniumbase.core import browser_launcher, detect_b_ver
        if seleniumbase.__version__ != "4.51.9":
            raise RuntimeError("Managed capture requires pinned SeleniumBase 4.51.9; run setup")
        driver_dir = pathlib.Path(seleniumbase.__file__).parent / "drivers"
        if a.browser_executable == "cft":
            platform_dir, browser_name = (("chrome-win64", "chrome.exe") if os.name == "nt"
                                          else ("chrome-linux64", "chrome"))
            a.browser_executable = str(driver_dir / "cft_drivers" / platform_dir / browser_name)
        browser = pathlib.Path(a.browser_executable)
        driver = driver_dir / ("uc_driver.exe" if os.name == "nt" else "uc_driver")
        if not browser.is_file() or not driver.is_file():
            raise RuntimeError("Managed Chrome and installed UC driver are required; run setup")
        browser_version = detect_b_ver.get_browser_version_from_binary(str(browser))
        installed = subprocess.run([str(driver), "--version"], capture_output=True,
                                   text=True, timeout=20, check=True)
        version = re.search(r"ChromeDriver\s+(\d+(?:\.\d+){3})", installed.stdout)
        if not browser_version or not version:
            raise RuntimeError("Cannot verify managed browser/driver versions")
        driver_version = version.group(1)
        if browser_version.split(".")[0] != driver_version.split(".")[0]:
            raise RuntimeError("Managed Chrome and installed UC driver major versions differ")
        browser_launcher.override_driver_dir(str(driver_dir))
        emit("managed-driver", browser_version=browser_version, driver_version=driver_version)

    if os.name != "nt":
        os.makedirs(a.profile, exist_ok=True)
    ownership = kill_orphans(a.profile, launch=os.name == "nt", expected_exe=a.browser_executable,
                             **({"profile_directory": a.profile_directory} if a.profile_directory is not None else {}))
    if os.name == "nt":  # keep the system + display awake while attending (idle sleep would kill the capture)
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002)
    emit("starting")
    args =",".join([
        "--autoplay-policy=no-user-gesture-required",
        "--deny-permission-prompts",  # mic/camera/notifications: every prompt auto-denied
        "--start-maximized",
    ])
    import pathlib
    policy_extension = a.capture_extension or str(pathlib.Path(__file__).parent / "tab-capture")
    args += ",--enable-unsafe-extension-debugging"
    if a.profile_directory is not None:
        args += ",--profile-directory=" + a.profile_directory
    # ISS-324: tick while SB() brings the browser up. Daemon thread, so a failure inside SB()
    # needs no unwinding here -- __main__ emits "fatal" and the interpreter exits under it.
    boot_done = threading.Event()
    threading.Thread(target=_bootstrap_progress, args=(boot_done, "driver-bringup"), daemon=True).start()
    with selected_uc_profile(a.profile_directory), SB(uc=True, headed=True, user_data_dir=a.profile, chromium_arg=args,
            extension_dir=policy_extension, binary_location=a.browser_executable,
            driver_version=driver_version.split(".")[0] if driver_version else None) as sb:
        if ownership:
            ownership["verify"](getattr(sb.driver, "browser_pid", None))
        boot_done.set()
        emit("driver-ready")
        if policy_extension:
            import math
            import re
            import psutil
            import urllib.request
            import websocket
            from urllib.parse import urlparse
            if websocket.__version__ != "1.9.2":
                raise RuntimeError("Managed capture requires pinned websocket-client 1.9.2")
            browser_pid = getattr(sb.driver, "browser_pid", None)
            if not isinstance(browser_pid, int) or isinstance(browser_pid, bool) or browser_pid <= 0 or not a.browser_executable:
                raise RuntimeError("Cannot verify managed recorder browser ownership")
            expected_exe = os.path.normcase(os.path.realpath(a.browser_executable))
            expected_profile = os.path.normcase(os.path.realpath(a.profile))
            identity = None
            deadline = time.monotonic() + 15
            def remaining():
                budget = deadline - time.monotonic()
                if budget <= 0:
                    raise RuntimeError("Recorder extension invocation deadline exceeded")
                return min(5, budget)
            address = sb.driver.capabilities.get("goog:chromeOptions", {}).get("debuggerAddress", "")
            if not isinstance(address, str) or not re.fullmatch(r"127\.0\.0\.1:[0-9]{1,5}", address):
                raise RuntimeError("Recorder debugger endpoint ownership refused")
            port = int(address.split(":")[1])
            if not 1 <= port <= 65535:
                raise RuntimeError("Recorder debugger port refused")
            connection, worker_session = None, None
            sequence = 0
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *_args, **_kwargs):
                    raise RuntimeError("Recorder debugger redirects refused")
            try:
                for phase in ("before-connect", "before-action"):
                    process = psutil.Process(browser_pid)
                    argv = process.cmdline()
                    profiles = [arg.split("=", 1)[1] for arg in argv if arg.startswith("--user-data-dir=")]
                    profiles += [argv[index + 1] if index + 1 < len(argv) else "" for index, arg in enumerate(argv) if arg == "--user-data-dir"]
                    created = process.create_time()
                    if (os.path.normcase(os.path.realpath(process.exe())) != expected_exe or
                        any(arg == "--type" or arg.startswith("--type=") for arg in argv) or not profiles or
                        any(not value or not os.path.isabs(value) or os.path.normcase(os.path.realpath(value)) != expected_profile for value in profiles) or
                        not isinstance(created, (int, float)) or isinstance(created, bool) or not math.isfinite(created) or created <= 0):
                        raise RuntimeError("Recorder browser process identity refused")
                    current_identity = (browser_pid, expected_exe, expected_profile, created)
                    if identity is not None and identity != current_identity:
                        raise RuntimeError("Recorder browser process identity changed")
                    identity = current_identity
                    if phase == "before-action":
                        break
                    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
                    with opener.open("http://" + address + "/json/version", timeout=remaining()) as response:
                        payload = response.read(1048577)
                    if len(payload) > 1048576:
                        raise RuntimeError("Recorder debugger response oversized")
                    endpoint = json.loads(payload)["webSocketDebuggerUrl"]
                    parsed = urlparse(endpoint)
                    if (parsed.scheme != "ws" or parsed.hostname != "127.0.0.1" or parsed.port != port or
                        parsed.username or parsed.password or parsed.query or parsed.fragment or
                        not re.fullmatch(r"/devtools/browser/[A-Za-z0-9-]+", parsed.path)):
                        raise RuntimeError("Recorder browser websocket ownership refused")
                    connection = websocket.create_connection(endpoint, timeout=remaining(), suppress_origin=True,
                                                             http_no_proxy=["127.0.0.1"], redirect_limit=0)
                    def command(method, params=None, session=None):
                        nonlocal sequence
                        sequence += 1
                        connection.settimeout(remaining())
                        request = {"id": sequence, "method": method, "params": params or {}}
                        if session:
                            request["sessionId"] = session
                        connection.send(json.dumps(request))
                        for _ in range(64):
                            connection.settimeout(remaining())
                            reply = connection.recv()
                            if not isinstance(reply, str) or len(reply) > 1048576:
                                raise RuntimeError("Recorder CDP message refused")
                            reply = json.loads(reply)
                            if not isinstance(reply, dict):
                                raise RuntimeError("Recorder CDP reply shape refused")
                            if "id" in reply:
                                if type(reply["id"]) is not int or reply["id"] != sequence:
                                    raise RuntimeError("Recorder CDP reply identity refused")
                                if "error" in reply or not isinstance(reply.get("result"), dict):
                                    raise RuntimeError("Recorder CDP " + method + " failed")
                                return reply["result"]
                        raise RuntimeError("Recorder CDP event limit exceeded")
                    extensions = command("Extensions.getExtensions").get("extensions", [])
                    expected_extension = os.path.normcase(os.path.realpath(policy_extension))
                    owned = [item for item in extensions if item.get("enabled") is True and item.get("path") and os.path.normcase(os.path.realpath(item["path"])) == expected_extension]
                    if len(owned) != 1 or not re.fullmatch(r"[a-p]{32}", owned[0].get("id", "")):
                        raise RuntimeError("Recorder extension ownership mapping refused")
                    extension_id = owned[0]["id"]
                    while True:
                        targets = command("Target.getTargets").get("targetInfos", [])
                        workers = [item for item in targets if item.get("type") == "service_worker" and item.get("url") == "chrome-extension://" + extension_id + "/background.js"]
                        if len(workers) == 1:
                            break
                        if len(workers) > 1:
                            raise RuntimeError("Recorder extension worker ambiguous")
                        time.sleep(min(0.1, remaining()))
                    if not isinstance(workers[0].get("targetId"), str) or not workers[0]["targetId"]:
                        raise RuntimeError("Recorder extension worker identity refused")
                    worker_session = command("Target.attachToTarget", {"targetId": workers[0]["targetId"], "flatten": True}).get("sessionId")
                    if not isinstance(worker_session, str) or not worker_session:
                        raise RuntimeError("Recorder extension worker attachment refused")
                    # A clean blank target replaces every restored registration page before policy changes.
                    sb.driver.switch_to.new_window("tab")
                    current_target = sb.driver.current_window_handle.removeprefix("CDwindow-")
                    pages = [item for item in command("Target.getTargets").get("targetInfos", []) if item.get("type") == "page"]
                    if not any(item.get("targetId") == current_target and item.get("url") == "about:blank" for item in pages):
                        raise RuntimeError("Registration blank target ownership refused")
                    for item in pages:
                        if item.get("targetId") != current_target:
                            if command("Target.closeTarget", {"targetId": item["targetId"]}).get("success") is not True:
                                raise RuntimeError("Restored registration target removal unproved")
                    while True:
                        remaining_pages = [item for item in command("Target.getTargets").get("targetInfos", []) if item.get("type") == "page"]
                        if len(remaining_pages) == 1 and remaining_pages[0].get("targetId") == current_target:
                            break
                        time.sleep(min(0.1, remaining()))
                def evaluate_policy(expression):
                    answer = command("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True}, worker_session)
                    if answer.get("exceptionDetails"):
                        raise RuntimeError("Registration policy evaluation refused")
                    return answer.get("result", {}).get("value")
                policy_check = None
                if registration:
                    import hashlib
                    import uuid
                    from urllib.parse import urlsplit
                    allowed = registration["allowedHosts"]
                    parsed_policy_url = urlsplit(a.url)
                    scheme = parsed_policy_url.scheme
                    port = parsed_policy_url.port if parsed_policy_url.port is not None else (443 if scheme == "https" else 80)
                    local_http = registration.get("localFixture") is True and parsed_policy_url.hostname in ("127.0.0.1", "localhost")
                    if not 1 <= port <= 65535 or scheme != "https" and not (scheme == "http" and local_http):
                        raise RuntimeError("Registration policy origin refused")
                    port_pattern = "(:" + str(port) + ")?" if port == (443 if scheme == "https" else 80) else ":" + str(port)
                    resources = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
                    rules = [{"id": 910001, "priority": 1, "action": {"type": "block"}, "condition": {"urlFilter": "*", "resourceTypes": resources}}]
                    for host in sorted(set(allowed)):
                        if (not re.fullmatch(r"[a-z0-9.-]{1,253}", host)
                            or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                                   for label in (host[:-1] if host.endswith(".") else host).split("."))):
                            raise RuntimeError("Registration policy host refused")
                        if scheme == "http" and host not in ("127.0.0.1", "localhost"):
                            raise RuntimeError("Registration policy local origin refused")
                        rules.append({"id": 910001 + len(rules), "priority": 2, "action": {"type": "allow"},
                                      "condition": {"regexFilter": "^" + scheme + "://" + re.escape(host) + port_pattern + "/", "resourceTypes": resources}})
                    fingerprint = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                    receipt = {"nonce": str(uuid.uuid4()), "browserPid": browser_pid, "browserCreatedAt": identity[3],
                               "profile": expected_profile, "extensionId": extension_id, "fingerprint": fingerprint}
                    expected = {"receipt": receipt, "rules": rules, "javascript": {"setting": "block"}}
                    policy_origin = parsed_policy_url.scheme + "://" + parsed_policy_url.netloc + "/"
                    installed = evaluate_policy("installRegistrationPolicy(" + json.dumps({"receipt": receipt, "rules": rules, "primaryUrl": policy_origin}) + ")")
                    def verify_policy():
                        nonlocal deadline
                        deadline = time.monotonic() + 10
                        process = psutil.Process(browser_pid)
                        if process.create_time() != receipt["browserCreatedAt"] or os.path.normcase(os.path.realpath(process.exe())) != expected_exe:
                            raise RuntimeError("Registration browser identity changed")
                        value = evaluate_policy("readRegistrationPolicy(" + json.dumps(policy_origin) + ")")
                        if value != expected:
                            raise RuntimeError("Registration policy receipt mismatch")
                        return True
                    if installed != expected or verify_policy() is not True:
                        raise RuntimeError("Registration policy installation unproved")
                    policy_check = verify_policy
                else:
                    cleared = evaluate_policy("clearRegistrationPolicy(" + json.dumps({"extensionId": extension_id, "priorTargetsGone": True, "primaryUrl": a.url}) + ")")
                    if (not isinstance(cleared, dict) or cleared.get("rules") or cleared.get("receipt") is not None
                            or cleared.get("javascript") != {"setting": "allow"}):
                        raise RuntimeError("Registration policy removal unproved")
                if registration:
                    sb.driver.set_page_load_timeout(30)
                    sb.driver.set_script_timeout(10)
                    for method, arguments in (("Network.enable", {}), ("Network.setBypassServiceWorker", {"bypass": True})):
                        if not isinstance(sb.driver.execute_cdp_cmd(method, arguments), dict):
                            raise RuntimeError("Registration network isolation not acknowledged")
                    sb.driver.execute_cdp_cmd("Emulation.setScriptExecutionDisabled", {"value": True})
                    sb.driver.default_get(a.url)
                    emit("registration-result", **register_form(sb, registration, script_isolated=True, policy_check=policy_check))
                    return
                sb.uc_open_with_reconnect(a.url, 4)
                emit("opened", url=sb.get_current_url())
                if a.capture_extension:
                    deadline = time.monotonic() + 15
                    targets = command("Target.getTargets", {"filter": [{"type": "tab", "exclude": False}, {"exclude": True}]}).get("targetInfos", [])
                    tabs = [item for item in targets if item.get("type") == "tab" and item.get("url") == sb.get_current_url()]
                    if len(tabs) != 1:
                        raise RuntimeError("Recorder current tab ownership mapping refused")
                    command("Target.activateTarget", {"targetId": tabs[0]["targetId"]})
                    command("Extensions.triggerAction", {"id": extension_id, "targetId": tabs[0]["targetId"]})
                    emit("capture-invoked")
            finally:
                if connection is not None:
                    if worker_session is not None:
                        try:
                            command("Target.detachFromTarget", {"sessionId": worker_session})
                        except Exception:
                            pass
                    close_budget = max(0, min(1, deadline - time.monotonic()))
                    if close_budget:
                        connection.settimeout(close_budget)
                        connection.close(timeout=close_budget)
                    else:
                        connection.shutdown()
        started = time.time()
        clicks = 0
        last_click = 0.0
        last_beat = 0.0
        pinned = json.dumps(a.title)
        errors = 0
        reconnect = ReconnectState()  # T-029
        extra_click_until = 0.0  # widened click window after a reload; MAX_CLICKS/JOIN_TEXTS unchanged
        gave_up_emitted = False
        while not os.path.exists(a.stop_file):
            if errors >= 10:
                # Only a browser with no windows left ends the run; a page that is merely
                # unresponsive (redirect, interstitial, alert) must not cut a live webinar.
                try:
                    alive = bool(sb.driver.window_handles)
                except Exception:
                    alive = False
                if not alive:
                    break
                errors = 0
            try:
                handles = sb.driver.window_handles
                if handles and sb.driver.current_window_handle != handles[-1]:
                    sb.driver.switch_to.window(handles[-1])
                    emit("tab-switch", count=len(handles))
                real_title = sb.execute_script("return document.title")
                if real_title != a.title:
                    sb.execute_script(f"document.title = {pinned};")
                now = time.time()
                if click_gate(clicks, now, started, extra_click_until, last_click, a.no_click):
                    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
                    if hit:
                        clicks += 1
                        last_click = now
                        emit("clicked", text=hit)
                body = (sb.execute_script(BODY_TEXT_JS) or "").lower()
                ended = next((p for p in END_PHRASES if p in body), None)
                if ended:
                    emit("ended", reason=ended)

                # T-031: forced reload from the Node-side audio watchdog — independent of T-029's
                # own DOM-banner detection below (silence has no banner). No gap is recorded here:
                # silence is not necessarily a connectivity gap (the whole "muted tab" case).
                if should_force_reload(a.reload_file):
                    try:
                        os.remove(a.reload_file)
                    except OSError:
                        pass
                    emit("watchdog-reload", reason="audio-silence")
                    try:
                        sb.uc_open_with_reconnect(a.url, 4)
                        clicks, extra_click_until = apply_reload(clicks, time.time())
                        emit("watchdog-rejoined")
                    except Exception as e:
                        emit("warn", error=f"watchdog reload failed: {str(e)[:200]}")

                # T-029 auto-reconnect: detect a "trying to reconnect" banner or a hard net-error
                # page, and if it persists past the threshold, reload and rejoin. Recording a
                # closed gap window (start/end/reason/recovered) is the whole point — the reload
                # itself just reuses the same open + click path used at initial join.
                try:
                    online = bool(sb.execute_script("return navigator.onLine"))
                except Exception:
                    online = True
                reason = detect_trouble(body, online)
                action, gap = reconnect.tick(reason, now)
                if action == "reload":
                    emit("reconnect-reload", reason=reconnect.reason, attempt=reconnect.reload_count)
                    try:
                        sb.uc_open_with_reconnect(a.url, 4)
                        clicks, extra_click_until = apply_reload(clicks, time.time())
                        emit("reconnect-rejoined")
                    except Exception as e:
                        emit("warn", error=f"reload failed: {str(e)[:200]}")
                elif action == "give-up" and not gave_up_emitted:
                    emit("reconnect-giveup", reason=reconnect.reason, reloads=reconnect.reload_count)
                    gave_up_emitted = True
                if gap is not None:
                    gave_up_emitted = False
                    emit("gap", **gap)

                if now - last_beat > 30:
                    last_beat = now
                    emit("heartbeat", url=sb.get_current_url(), page_title=real_title)
                errors = 0
            except Exception as e:  # page navigating / tab busy — keep holding the window
                errors += 1
                emit("warn", error=str(e)[:200])
                try:  # current handle gone (tab closed) → reattach to whatever tab is left
                    handles = sb.driver.window_handles
                    if handles:
                        sb.driver.switch_to.window(handles[-1])
                except Exception:
                    pass
            time.sleep(2)
        final_gap = reconnect.close_at_end(time.time())
        if final_gap is not None:
            emit("gap", **final_gap)
        emit("closed")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit("fatal", error="Registration browser failed" if "--registration-stdin" in sys.argv else str(e)[:500])
        sys.exit(1)
