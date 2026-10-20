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
# Smallest ancestor that holds just this one "Watch now" link (the session card); falls back to the control itself.
_CARD_JS = r"""
const isWatch = x => /(^|\n)\s*watch now\s*$/i.test((x.innerText || '').trim());
const nWatch = n => [...n.querySelectorAll('a,button,[role=button]')].filter(isWatch).length;
const cardOf = e => { let n = e; while (n.parentElement && n.parentElement !== document.body && nWatch(n.parentElement) <= 1) n = n.parentElement; return n; };
"""
SNAPSHOT_JS = _CARD_JS + """
const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const controls = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')].filter(vis);
const card = e => (cardOf(e).innerText || '').toLowerCase().slice(0, 400);
const videos = [...document.querySelectorAll('video')];
const v = videos.find(x => isFinite(x.duration) && x.duration > 0) || videos[0];
return {url: location.href, text: (document.body.innerText || '').toLowerCase().slice(0, 4000),
  controls: controls.map(e => ({text: ((e.innerText || e.value || e.getAttribute('aria-label') || '') + '').trim().toLowerCase().slice(0, 80),
    href: (e.href || '').toLowerCase().slice(0, 300), context: card(e)})),
  video: videos.length > 0, iframes: [...document.querySelectorAll('iframe')].filter(vis).map(f => (f.src || '').toLowerCase().slice(0, 300)),
  duration: v && isFinite(v.duration) && v.duration > 0 ? v.duration : null};
"""
# Fresh look at controls[idx] at click time: the index came from an earlier snapshot and the DOM may have moved since.
_CONTROLS_JS = _CARD_JS + """
const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const controls = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')].filter(vis);
const e = controls[arguments[0]]; if (!e) return null;
const trail = []; for (let n = e, i = 0; n && n !== document.body && i < 10; n = n.parentElement, i++)
  trail.push([n.id, n.className, n.getAttribute('aria-label'), n.getAttribute('role'), n.getAttribute('data-testid')].join(' ').toLowerCase());
const card = cardOf(e);
const d = {text: ((e.innerText || e.value || e.getAttribute('aria-label') || '') + '').trim().toLowerCase().slice(0, 80),
  href: (e.href || '').toLowerCase().slice(0, 300), trail: trail.join(' | ').slice(0, 1500), context: (card.innerText || '').toLowerCase().slice(0, 400)};
d.sig = d.text + '|' + d.href + '|' + d.trail;
"""
DESCRIBE_JS = _CONTROLS_JS + "return d;"
# The JS only MARKS the verified control; the click itself is a trusted WebDriver click (a scripted element.click() is untrusted:
# popup blockers and click handlers that need user activation ignore it, which is how the first live run found no player).
MARKED_CSS = "[data-lkb-onair-target]"
CLICK_WATCH_JS = _CONTROLS_JS + "if (d.sig !== arguments[1]) return false; e.setAttribute('data-lkb-onair-target', '1'); return true;"
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


def norm_text(raw):
    """innerText of a control without material-icon ligature lines: "video_youtube\nWatch now" -> "watch now"."""
    lines = [l.strip() for l in (raw or "").lower().split(chr(10)) if l.strip()]
    if len(lines) > 1:
        lines = [l for l in lines if not re.fullmatch(r"[a-z0-9_]+", l)] or lines
    return " ".join(lines)


def debug_dump(snap, why, env=None):
    """LKB_ONAIR_DEBUG=<file>: write what the detector saw (control texts, iframes, url) when it refuses. No clicks, no cookies."""
    path = (os.environ if env is None else env).get("LKB_ONAIR_DEBUG")
    if not path:
        return
    import json
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"why": why, "url": snap.get("url"), "iframes": snap.get("iframes"), "video": snap.get("video"),
                       "controls": [c["text"] for c in snap.get("controls", [])][:80], "text": snap.get("text", "")[:600]}, f, indent=1)
    except OSError:
        pass


def debug_shot(sb, tag, env=None, desc=None):
    """LKB_ONAIR_DEBUG=<file>: also save <file>.<tag>.png and the driver's url/handles (diagnosis only)."""
    path = (os.environ if env is None else env).get("LKB_ONAIR_DEBUG")
    if not path:
        return
    try:
        sb.driver.save_screenshot("%s.%s.png" % (path, tag))
        with open("%s.%s.txt" % (path, tag), "w", encoding="utf-8") as f:
            f.write("desc=%r\n" % (desc,))
            f.write("url=%s\nhandles=%d\ntitle=%s\n" % (sb.driver.current_url, len(sb.driver.window_handles), sb.driver.title))
    except Exception:
        pass


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
        if REFUSE_RE.search(norm_text(c["text"])) or REFUSE_RE.search(c.get("href", "")):
            return "onair-refused: signed out or consent control visible ('%s'); sign the bot profile in first" % norm_text(c["text"])
    for f in snap.get("iframes", []):
        if LOGIN_FRAME_RE.search(f):
            return "onair-refused: login or consent iframe (%s)" % (urlsplit(f).hostname or "unknown")
    return None


def pick_watch(snap, session=None):
    """Index of the first visible 'Watch now' control (matching `session` in its card text if given), else None.
    A real session link (an OnAir /events/<slug>/watch href) wins over the hero 'Watch now' button, which only scrolls to the agenda."""
    want = (session or "").strip().lower()
    found = [(i, c) for i, c in enumerate(snap.get("controls", []))
             if norm_text(c["text"]).startswith("watch now") and (not want or want in c["context"] or want in c["text"])]
    for i, c in found:
        if watch_href_ok(c.get("href", "")):
            return i
    return found[0][0] if found else None


def verify_target(desc, session=None):
    """Reason string if the freshly described control must NOT be clicked, else None."""
    if not desc:
        return "control vanished"
    text = norm_text(desc["text"])
    if not text.startswith("watch now"):
        return "control is '%s', not 'Watch now'" % text
    for part in (text, desc.get("href", ""), desc.get("trail", "")):
        if REFUSE_RE.search(part):
            return "control is or sits inside a sign-in, register or consent element"
    if session and session.strip().lower() not in desc["context"] + " " + desc["text"]:
        return "control is outside the matching card"
    return None


def _poll(sb, time, deadline_s, done):
    start = time.time()
    while True:
        try:
            snap = sb.execute_script(SNAPSHOT_JS)
        except Exception:  # the page is navigating (after Watch now): look again until the deadline
            snap = None
        why = refusal(snap) if snap else None
        if why:
            debug_dump(snap, why)
            raise OnairRefused(why)
        result = done(snap) if snap else None
        if result is not None:
            return snap, result
        if time.time() - start >= deadline_s:
            if snap:
                debug_dump(snap, "deadline")
            return snap, None
        time.sleep(POLL_S)


def watch_href_ok(href):
    """Only the OnAir host's own /events/<slug>/watch... page may be opened directly; never a login or foreign URL."""
    u = urlsplit(href or "")
    return u.scheme == "https" and u.hostname == ONAIR_HOST and bool(re.match(r"^/events/[a-z0-9-]+/watch/?$", u.path.lower()))         and not REFUSE_RE.search(href)


def _same(sb, url):
    try:
        return sb.driver.current_url == url
    except Exception:
        return False


def _follow_new_tab(sb):
    """Watch now may open the player in a new tab: keep driving the newest one."""
    try:
        handles = sb.driver.window_handles
        if len(handles) > 1:
            sb.driver.switch_to.window(handles[-1])
    except Exception:
        pass


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
                sb.driver.find_element("css selector", MARKED_CSS).click()
                clicked.append(idx)
                emit("onair-watch-clicked", index=idx)
                _follow_new_tab(sb)
                time.sleep(5)
                debug_shot(sb, "after-click", desc=desc)
                if _same(sb, snap["url"]) and watch_href_ok(desc.get("href", "")):
                    # The click did not navigate (the live OnAir page ignored it): open the verified control's own href instead.
                    sb.driver.get(desc["href"])
                    emit("onair-watch-navigated")
        return None

    _, ok = _poll(sb, time, wait_s, step)
    if not ok:
        raise OnairRefused("onair-refused: no player after %ds%s" % (wait_s, "" if clicked else " (no 'Watch now' control found)"))
    emit("onair-player-ready")


DURATION_JS = "const v = document.querySelector('video'); return v && isFinite(v.duration) && v.duration > 0 ? v.duration : null;"


def _play_in_player_frames(sb, time):
    """The OnAir player is a cross-origin (YouTube) iframe: WebDriver can still enter it. Play the video there and read its duration."""
    played, duration = False, None
    for frame in sb.driver.find_elements("css selector", "iframe"):
        try:
            if not player_frames({"iframes": [(frame.get_attribute("src") or "").lower()]}):
                continue
            sb.driver.switch_to.frame(frame)
            try:
                played = bool(sb.execute_script(PLAY_JS)) or played
                for _ in range(5):
                    duration = sb.execute_script(DURATION_JS)
                    if duration:
                        break
                    time.sleep(POLL_S)
            finally:
                sb.driver.switch_to.default_content()
        except Exception:
            continue
        if played:
            break
    return played, duration


def onair_play(sb, *, time, emit, wait_s=10):
    """Unmute and play (top-level <video>, else inside the allowed player iframe); emit the media duration when readable."""
    played = bool(sb.execute_script(PLAY_JS))
    if played:
        _, duration = _poll(sb, time, wait_s, lambda s: s["duration"])
    else:
        played, duration = _play_in_player_frames(sb, time)
    emit("onair-playing", played=played)
    debug_shot(sb, "after-play")
    if duration:
        emit("onair-duration", seconds=duration)
