"""sb_join: join/end phrases, click gate and the T-029 reconnect state machine (moved verbatim from sb_join.py; browser-free)."""
import os
import re
from urllib.parse import urlsplit

JOIN_TEXTS = [
    "join now", "join webinar", "join from browser", "join via browser", "join from your browser",
    "join in browser", "join", "join audio", "computer audio", "join with computer audio",
    "listen only", "continue in browser", "continue", "watch now", "i agree", "accept",
    # Meet pre-join (live 2026-11-26): skip the media modal without granting mic/camera (C2), and
    # knock on a meeting the bot's account does not own.
    "continue without microphone and camera", "ask to join",
    # Owner already in the call on the same account: dismiss the tooltip and join alongside. Never
    # "switch here" — it moves the owner's own call to the bot and ends it on his device.
    "got it", "join here too",
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
    # Live 2026-11-26 recorded frame: Meet's knock-wait page for a signed-in account.
    "still trying to get in", "brings you into the call",
]
# B2 / D-232: the Meet refusal page ("You can't join this video call", straight or typographic apostrophe).
# Meet only. It is a pre-admission signal: the loop ignores it once `admitted` was emitted (B2-C8), because
# body text also holds captions and chat lines typed by other participants.
REFUSED_PHRASES = ["you can't join this video call", "you can’t join this video call"]
# After admission_timeout the browser stays open this long for the controller's flush + stop file.
FLUSH_GRACE_S = 45
ADMISSION_TIMEOUT_S = 15 * 60  # default lobby wait before giving up (--admission-timeout overrides)
# ISS-ADMISSION-STABLE-001 (live 2026-11-27): Meet renders the call-controls bar about a second BEFORE the lobby text
# ("please wait until a meeting host brings you into the call"), so one in-call tick is not admission. The loop ticks
# every 2 s: admitted needs this many consecutive in-call ticks with no lobby text.
ADMISSION_CONFIRM_TICKS = 3
# After admission, a Meet tab on a page outside its meeting (sent back to meet.google.com/home after a removal or a
# lost knock) for this many consecutive ticks has left the meeting: one "ended" so the controller stops recording.
LEFT_MEETING_TICKS = 10


def is_meet_url(url):
    """Admission is only detectable on Google Meet; every other platform keeps the old behaviour."""
    try:
        return (urlsplit(url or "").hostname or "").lower() == "meet.google.com"
    except ValueError:
        return False


def _meet_code(url):
    try:
        parts = urlsplit(url or "")
    except ValueError:
        return None
    if (parts.hostname or "").lower() != "meet.google.com":
        return None
    return parts.path.strip("/").split("/")[0].lower()


_MEET_HOME_PAGES = frozenset({"", "home", "landing"})
_MEET_CODE_RE = re.compile(r"^[a-z]{3}-?[a-z]{4}-?[a-z]{3}$")


def _code_key(segment):
    return segment.replace("-", "") if segment and _MEET_CODE_RE.match(segment) else None


# ISS-ADMISSION-STABLE-001 rule (b): Meet's own removed / left screen, not the broad DENIED_PHRASES set (those are
# substrings of ordinary chat and captions, review round 2). Both a phrase AND the screen's "return to home screen"
# button must be in the body; unverified live, so a miss fails safe (no early stop).
LEFT_SCREEN_PHRASES = ("you've been removed from the meeting", "you have been removed from the meeting",
                       "you were removed from the meeting", "you left the meeting", "you've left the meeting",
                       "you have left the meeting")
LEFT_SCREEN_BUTTON = "return to home screen"


def is_left_screen(body_lower):
    body = body_lower or ""
    return LEFT_SCREEN_BUTTON in body and any(p in body for p in LEFT_SCREEN_PHRASES)


def is_outside_meeting(meeting_url, current_url):
    """Pure: True only when the meeting is a Meet URL and the tab now sits on a Meet page that is positively NOT this
    meeting: the home / landing / root page, or a different code-shaped meeting. Anything else is False -- an empty,
    non-Meet, unparseable or unrecognised path (/lookup/..., /_meet/..., /u/1/...), because a /lookup/ or nickname link
    redirects to the real code and a live capture must never end on a URL we cannot read (review A, 2026-11-27)."""
    own = _meet_code(meeting_url)
    if own is None:
        return False
    current = _meet_code(current_url)
    if current is None:
        return False
    if current in _MEET_HOME_PAGES:
        return True
    own_key, current_key = _code_key(own), _code_key(current)
    return own_key is not None and current_key is not None and own_key != current_key


def classify_meet_state(in_call_dom, body_lower):
    """Pure: "refused" | "lobby" | "in-call" | "unknown". `in_call_dom` is IN_CALL_JS's result (the
    leave-call button / call-controls bar is visible); `body_lower` is the lowercased body text. The
    refusal text ("you can't join this video call") wins over everything (B2-C1). Lobby text
    always wins over the controls: the pre-join and waiting screens can render a leave/hang-up control too."""
    if any(p in (body_lower or "") for p in REFUSED_PHRASES):
        return "refused"
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
    """Pure: "lobby" | "in-call" | "unknown" for any platform (Meet alone can also return "refused"). `in_call_dom` is that platform's
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


def is_blocked_text(body_lower):
    """Pure: does the body text show a denied / removed / ended page? (the DENIED_PHRASES set)"""
    body = body_lower or ""
    return any(p in body for p in DENIED_PHRASES)


class AdmissionState:
    """Pure state machine. tick(admitted_now, now, blocked=False) -> "admitted" (once, on the first
    admitted tick) | "assumed" (once, lenient mode only) | "timeout" (once, when still not admitted past
    timeout_s) | None. timeout_s <= 0 disables the timeout. Once admitted it stays admitted (a later
    reload is not a new lobby wait).

    `blocked` is True on a tick that positively showed a lobby or a denied/ended page. With
    lenient=True (non-Meet platforms, whose in-call DOM probes are unverified live; D-167: the bot must
    try its hardest to join and a false "not admitted" must not abort a join that succeeded) a timeout
    that was never preceded by a blocked tick is NOT a failure: the bot is assumed to be in the call
    ("assumed") instead of aborting. Any blocked tick makes the timeout strict again."""

    def __init__(self, started, timeout_s=ADMISSION_TIMEOUT_S, lenient=False, confirm_ticks=1):
        self.started = started
        self.timeout_s = timeout_s
        self.lenient = lenient
        self.confirm_ticks = max(1, int(confirm_ticks))  # ISS-ADMISSION-STABLE-001: consecutive in-call ticks needed
        self.streak = 0
        self.admitted = False
        self.timed_out = False
        self.blocked_seen = False

    def tick(self, admitted_now, now, blocked=False):
        if self.admitted or self.timed_out:
            return None
        if admitted_now:
            self.streak += 1
            if self.streak >= self.confirm_ticks:
                self.admitted = True
                return "admitted"
        else:
            self.streak = 0
        if blocked:
            self.blocked_seen = True
        if self.timeout_s and self.timeout_s > 0 and now - self.started > self.timeout_s:
            if self.lenient and not self.blocked_seen:
                self.admitted = True
                return "assumed"
            self.timed_out = True
            return "timeout"
        return None
