"""sb_join: join/end phrases, click gate and the T-029 reconnect state machine (moved verbatim from sb_join.py; browser-free)."""
import os
from urllib.parse import urlsplit

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


# ISS-CAPTUREFIX-001: admission detection. Meet shows a lobby ("Asking to join...", "Someone in the
# call will let you in") before the call; only the in-call page has the call-controls bar. Matched
# as lowercase substrings of the body text (the loop already computes it every tick).
LOBBY_PHRASES = [
    "asking to join", "ask to join", "someone will let you in", "waiting for someone to let you in",
    "you'll join the call when someone lets you in", "waiting for the host to let you in",
    "waiting to be let in", "your request to join",
]
ADMISSION_TIMEOUT_S = 15 * 60  # default lobby wait before giving up (--admission-timeout overrides)


def is_meet_url(url):
    """Admission is only detectable on Google Meet; every other platform keeps the old behaviour."""
    try:
        return (urlsplit(url or "").hostname or "").lower() == "meet.google.com"
    except ValueError:
        return False


def classify_meet_state(in_call_dom, body_lower):
    """Pure: "lobby" | "in-call" | "unknown". `in_call_dom` is IN_CALL_JS's result (the leave-call
    button / call-controls bar is visible); `body_lower` is the lowercased body text. Lobby text
    always wins: the pre-join and waiting screens can render a leave/hang-up control too."""
    if any(p in (body_lower or "") for p in LOBBY_PHRASES):
        return "lobby"
    return "in-call" if in_call_dom else "unknown"


# ISS-LOBBYWATCH-001: Zoom-web / Teams-web admission. Same shape as Meet: waiting-room text means
# "lobby"; a visible in-call control (the per-platform *_IN_CALL_JS in sb_join_scripts) means
# "in-call"; a denied / removed / ended page means "unknown" (never admitted). Phrases are lowercase
# substrings of the body text. ALL PHRASES AND SELECTORS HERE ARE UNVERIFIED AGAINST LIVE Zoom/Teams
# (hand-written from the clients' public wording and the repo fixture) and need a live check.
ZOOM_LOBBY_PHRASES = [
    "please wait, the meeting host will let you in soon", "please wait, the host will let you in soon",
    "the host will let you in soon", "host will let you in", "waiting for the host", "waiting room",
    "this meeting has a waiting room", "please wait for the host",
]
TEAMS_LOBBY_PHRASES = [
    "someone in the meeting should let you in soon", "someone in the meeting will let you in",
    "we've let people in the meeting know you're waiting", "when the meeting starts, we'll let people know you're waiting",
    "waiting for someone to let you in", "you're in the lobby", "waiting in the lobby", "let you in soon",
]
# A page that says the host refused / removed us, or the meeting is over, is never "admitted".
DENIED_PHRASES = [
    "you have been removed", "you've been removed", "you were removed", "removed from the meeting",
    "removed you from", "host denied", "denied your request", "denied entry", "request to join was declined",
    "request was declined", "was denied", "you can't join this meeting", "you cannot join this meeting",
    "unable to join", "meeting has ended", "meeting ended", "meeting is over", "the host has ended",
    "has ended the meeting", "you left the meeting", "you've left the meeting", "you have left the meeting",
    "rejoin meeting",
]
_PLATFORM_HOSTS = {
    "zoom": ("zoom.us", "zoom.com", "zoomgov.com"),
    "teams": ("teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"),
}


def platform_of(url):
    """"meet" | "zoom" | "teams" | "other" from the URL host (exact host, or a subdomain of a known
    Zoom/Teams host; look-alike hosts such as meet.google.com.evil.example are "other")."""
    if is_meet_url(url):
        return "meet"
    try:
        host = (urlsplit(url or "").hostname or "").lower()
    except ValueError:
        return "other"
    for name, hosts in _PLATFORM_HOSTS.items():
        if any(host == h or host.endswith("." + h) for h in hosts):
            return name
    return "other"


def classify_admission(platform, in_call_dom, body_lower):
    """Pure: "lobby" | "in-call" | "unknown" for any platform. `in_call_dom` is that platform's
    in-call JS result. Order: denied/ended -> unknown; lobby text -> lobby (the waiting room can
    render a leave control); visible in-call control -> in-call; otherwise unknown. An unknown
    platform ("other") is in-call ONLY on a positive generic control, and any known lobby text wins;
    nothing is ever assumed admitted."""
    body = body_lower or ""
    if platform == "meet":
        return classify_meet_state(in_call_dom, body)
    if any(p in body for p in DENIED_PHRASES):
        return "unknown"
    lobby = {"zoom": ZOOM_LOBBY_PHRASES, "teams": TEAMS_LOBBY_PHRASES}.get(
        platform, ZOOM_LOBBY_PHRASES + TEAMS_LOBBY_PHRASES + LOBBY_PHRASES)
    if any(p in body for p in lobby):
        return "lobby"
    return "in-call" if in_call_dom else "unknown"


class AdmissionState:
    """Pure state machine. tick(admitted_now, now) -> "admitted" (once, on the first admitted tick)
    | "timeout" (once, when still not admitted past timeout_s) | None. timeout_s <= 0 disables the
    timeout. Once admitted it stays admitted (a later reload is not a new lobby wait)."""

    def __init__(self, started, timeout_s=ADMISSION_TIMEOUT_S):
        self.started = started
        self.timeout_s = timeout_s
        self.admitted = False
        self.timed_out = False

    def tick(self, admitted_now, now):
        if self.admitted or self.timed_out:
            return None
        if admitted_now:
            self.admitted = True
            return "admitted"
        if self.timeout_s and self.timeout_s > 0 and now - self.started > self.timeout_s:
            self.timed_out = True
            return "timeout"
        return None
