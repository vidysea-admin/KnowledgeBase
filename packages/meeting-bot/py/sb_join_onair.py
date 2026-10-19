"""Google Cloud OnAir replay playback for the signed-in bot profile (task: w24-onairplay).

Opt-in only: LKB_ONAIR_WATCH=1 and an https cloudonair.withgoogle.com URL. Two phases around the tab-capture trigger:
  onair_prepare(): fail closed on sign-in/register/account-chooser/consent, click "Watch now", wait for a player.
  onair_play():    unmute + play the <video>, emit the media duration as an `onair-duration` event.
It NEVER clicks sign-in, register, an account chooser or a consent control: the only element it ever clicks is a
"Watch now" control chosen by text. A refusal raises OnairRefused; main() turns that into a `fatal` event (exit 1).
"""
import os
import re
from urllib.parse import urlsplit

ONAIR_HOST = "cloudonair.withgoogle.com"
PLAYER_WAIT_S = 60
POLL_S = 2

# One snapshot of the visible controls and the player state; the Python side decides, JS only reports.
SNAPSHOT_JS = """
const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const controls = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')].filter(vis);
const card = e => { let n = e; for (let i = 0; i < 6 && n.parentElement; i++) { n = n.parentElement;
  if (n.matches('article,li,section,[role=listitem],[class*=card]')) break; } return (n.innerText || '').toLowerCase().slice(0, 400); };
const videos = [...document.querySelectorAll('video')];
const v = videos.find(x => isFinite(x.duration) && x.duration > 0) || videos[0];
return {url: location.href, text: (document.body.innerText || '').toLowerCase().slice(0, 4000),
  controls: controls.map(e => ({text: ((e.innerText || e.value || e.getAttribute('aria-label') || '') + '').trim().toLowerCase().slice(0, 80),
    href: (e.href || '').toLowerCase().slice(0, 300), context: card(e)})),
  video: videos.length > 0, iframes: [...document.querySelectorAll('iframe')].filter(vis).map(f => (f.src || '').toLowerCase().slice(0, 300)),
  duration: v && isFinite(v.duration) && v.duration > 0 ? v.duration : null};
"""
# Fresh look at controls[idx] at click time: the index came from an earlier snapshot and the DOM may have moved since.
_CONTROLS_JS = """
const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const controls = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')].filter(vis);
const e = controls[arguments[0]]; if (!e) return null;
const trail = []; for (let n = e, i = 0; n && n !== document.body && i < 10; n = n.parentElement, i++)
  trail.push([n.id, n.className, n.getAttribute('aria-label'), n.getAttribute('role'), n.getAttribute('data-testid')].join(' ').toLowerCase());
let card = e; for (let i = 0; i < 6 && card.parentElement; i++) { card = card.parentElement;
  if (card.matches('article,li,section,[role=listitem],[class*=card]')) break; }
const d = {text: ((e.innerText || e.value || e.getAttribute('aria-label') || '') + '').trim().toLowerCase().slice(0, 80),
  href: (e.href || '').toLowerCase().slice(0, 300), trail: trail.join(' | ').slice(0, 1500), context: (card.innerText || '').toLowerCase().slice(0, 400)};
d.sig = d.text + '|' + d.href + '|' + d.trail;
"""
DESCRIBE_JS = _CONTROLS_JS + "return d;"
CLICK_WATCH_JS = _CONTROLS_JS + "if (d.sig !== arguments[1]) return false; e.click(); return true;"
PLAY_JS = """
const v = document.querySelector('video'); if (!v) return false;
v.muted = false; v.volume = 1; const p = v.play(); if (p && p.catch) p.catch(() => {}); return true;
"""
# Case-insensitive SUBSTRING match on a visible control's text/href/ancestor attributes (e.g. "sign in to watch", "register now").
REFUSE_RE = re.compile(r"sign[ _-]?in|sign[ _-]?up|log[ _-]?in|register|choose an account|consent|allow|continue with google|accounts\.google\.com", re.I)
CHOOSER_TEXT = ("choose an account", "use another account", "to continue to", "wants to access your google account",
                "sign in with google", "before you continue to google")
# An iframe counts as the player only on these hosts (exact or subdomain) or on the OnAir host itself.
PLAYER_HOSTS = ("youtube.com", "youtube-nocookie.com", "vimeo.com", "brightcove.net", "brightcove.com", ONAIR_HOST)
LOGIN_FRAME_RE = re.compile(r"accounts\.google\.com|sign[ _-]?in|log[ _-]?in|consent|oauth|/o/oauth2|servicelogin", re.I)


def _host_ok(src):
    host = urlsplit(src).hostname or ""
    return urlsplit(src).scheme == "https" and any(host == h or host.endswith("." + h) for h in PLAYER_HOSTS)


def player_frames(snap):
    return [f for f in snap.get("iframes", []) if _host_ok(f) and not LOGIN_FRAME_RE.search(f)]


class OnairRefused(Exception):
    """Fail-closed refusal; str() is the clear reason that reaches the `fatal` event."""


def onair_enabled(url, env=None):
    env = os.environ if env is None else env
    if env.get("LKB_ONAIR_WATCH") != "1":
        return False
    u = urlsplit(url or "")
    return u.scheme == "https" and u.hostname == ONAIR_HOST


def bound_seconds(duration, padding=120, cap=4 * 3600):
    """duration + 2 min, capped at 4 h; unknown or invalid duration -> None (caller keeps its own --until)."""
    if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not duration > 0 or duration == float("inf"):
        return None
    return int(min(duration + padding, cap))


def refusal(snap):
    """Reason string if the page must not be driven, else None. Checked on every poll."""
    host = (urlsplit(snap.get("url", "")).hostname or "")
    if host != ONAIR_HOST:
        return "onair-refused: left %s for %s (account chooser or consent)" % (ONAIR_HOST, host or "unknown page")
    if any(t in snap.get("text", "") for t in CHOOSER_TEXT):
        return "onair-refused: account chooser or consent page"
    for c in snap.get("controls", []):
        if REFUSE_RE.search(c["text"]) or REFUSE_RE.search(c.get("href", "")):
            return "onair-refused: signed out or consent control visible ('%s'); sign the bot profile in first" % c["text"]
    for f in snap.get("iframes", []):
        if LOGIN_FRAME_RE.search(f):
            return "onair-refused: login or consent iframe (%s)" % (urlsplit(f).hostname or "unknown")
    return None


def pick_watch(snap, session=None):
    """Index of the first visible 'Watch now' control (matching `session` in its card text if given), else None."""
    want = (session or "").strip().lower()
    for i, c in enumerate(snap.get("controls", [])):
        if c["text"].startswith("watch now") and (not want or want in c["context"] or want in c["text"]):
            return i
    return None


def verify_target(desc, session=None):
    """Reason string if the freshly described control must NOT be clicked, else None."""
    if not desc:
        return "control vanished"
    if not desc["text"].startswith("watch now"):
        return "control is '%s', not 'Watch now'" % desc["text"]
    for part in (desc["text"], desc.get("href", ""), desc.get("trail", "")):
        if REFUSE_RE.search(part):
            return "control is or sits inside a sign-in, register or consent element"
    if session and session.strip().lower() not in desc["context"] + " " + desc["text"]:
        return "control is outside the matching card"
    return None


def _poll(sb, time, deadline_s, done):
    start = time.time()
    while True:
        snap = sb.execute_script(SNAPSHOT_JS)
        why = refusal(snap)
        if why:
            raise OnairRefused(why)
        result = done(snap)
        if result is not None:
            return snap, result
        if time.time() - start >= deadline_s:
            return snap, None
        time.sleep(POLL_S)


def onair_prepare(sb, *, time, emit, session=None, wait_s=PLAYER_WAIT_S):
    """Click Watch now (unless a player is already up) and wait for a <video> or player iframe, or refuse."""
    clicked = []

    def step(snap):
        if snap["video"] or player_frames(snap):
            return True
        if not clicked:
            idx = pick_watch(snap, session)
            if idx is not None:
                desc = sb.execute_script(DESCRIBE_JS, idx)
                why = verify_target(desc, session)
                if why:
                    raise OnairRefused("onair-refused: click target changed (%s)" % why)
                if sb.execute_script(CLICK_WATCH_JS, idx, desc["sig"]) is not True:
                    raise OnairRefused("onair-refused: click target changed between check and click")
                clicked.append(idx)
                emit("onair-watch-clicked", index=idx)
        return None

    _, ok = _poll(sb, time, wait_s, step)
    if not ok:
        raise OnairRefused("onair-refused: no player after %ds%s" % (wait_s, "" if clicked else " (no 'Watch now' control found)"))
    emit("onair-player-ready")


def onair_play(sb, *, time, emit, wait_s=10):
    """Unmute and play; emit the media duration when the page exposes it (a cross-origin iframe player does not)."""
    played = bool(sb.execute_script(PLAY_JS))
    snap, duration = _poll(sb, time, wait_s if played else 0, lambda s: s["duration"])
    emit("onair-playing", played=played)
    if duration:
        emit("onair-duration", seconds=duration)
