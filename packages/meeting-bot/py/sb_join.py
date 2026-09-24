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
                if (not a.no_click and clicks < MAX_CLICKS and now - started < CLICK_WINDOW_S
                        and now - last_click > 5):
                    hit = sb.execute_script(CLICK_JS, JOIN_TEXTS)
                    if hit:
                        clicks += 1
                        last_click = now
                        emit("clicked", text=hit)
                body = (sb.execute_script("return document.body ? document.body.innerText : ''") or "").lower()
                ended = next((p for p in END_PHRASES if p in body), None)
                if ended:
                    emit("ended", reason=ended)
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
        emit("closed")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit("fatal", error=str(e)[:500])
        sys.exit(1)
