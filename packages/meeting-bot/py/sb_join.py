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
import json
import os
import sys
import time

from seleniumbase import SB

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

CLICK_JS = """
const wanted = arguments[0];
const els = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')];
for (const el of els) {
  const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
  if (!t || t.length > 40) continue;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || el.disabled) continue;
  if (wanted.includes(t)) { el.click(); return t; }
}
return null;
"""


def emit(event, **kw):
    print(json.dumps({"event": event, "t": time.time(), **kw}), flush=True)


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


def kill_orphans(profile):
    """A previous bot run that was killed leaves its Chrome holding the profile lock, and the
    next launch then hangs silently. Kill only processes whose command line names this profile."""
    import subprocess
    needle = os.path.abspath(profile).replace("'", "''")
    ps = ("Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and "
          f"$_.CommandLine -like '*{needle}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force "
          "-ErrorAction SilentlyContinue }")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=60)
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            os.remove(os.path.join(profile, name))
        except OSError:
            pass
    # A killed run leaves exit_type=Crashed + saved Sessions, and Chrome then restores old tabs
    # (measured: the bot opened a stale YouTube tab and lost its own). Start from a clean session.
    import shutil
    shutil.rmtree(os.path.join(profile, "Default", "Sessions"), ignore_errors=True)
    prefs = os.path.join(profile, "Default", "Preferences")
    try:
        with open(prefs, encoding="utf-8") as f:
            p = json.load(f)
        p.setdefault("profile", {})["exit_type"] = "Normal"
        p["profile"]["exited_cleanly"] = True
        with open(prefs, "w", encoding="utf-8") as f:
            json.dump(p, f)
    except (OSError, ValueError):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--profile", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--stop-file", required=True)
    ap.add_argument("--no-click", action="store_true", help="never auto-click (login/dry-run mode)")
    a = ap.parse_args()

    os.makedirs(a.profile, exist_ok=True)
    kill_orphans(a.profile)
    if os.name == "nt":  # keep the system + display awake while attending (idle sleep would kill the capture)
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002)
    emit("starting")
    args =",".join([
        "--autoplay-policy=no-user-gesture-required",
        "--deny-permission-prompts",  # mic/camera/notifications: every prompt auto-denied
        "--start-maximized",
    ])
    with SB(uc=True, headed=True, user_data_dir=a.profile, chromium_arg=args) as sb:
        sb.uc_open_with_reconnect(a.url, 4)
        emit("opened", url=sb.get_current_url())
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
                body = (sb.execute_script("return document.body ? document.body.innerText : ''") or "").lower()
                ended = next((p for p in END_PHRASES if p in body), None)
                if ended:
                    emit("ended", reason=ended)

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
        emit("fatal", error=str(e)[:500])
        sys.exit(1)
