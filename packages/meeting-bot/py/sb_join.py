"""
packages/meeting-bot/py/sb_join.py — the real bot browser behind joiners/browser-joiner.ts
(spawned by src/capture/obs/obs-windows.ts). SeleniumBase 4, UC mode, HEADED (a headless Chrome
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
import json
import os
import sys
import threading
import time

from seleniumbase import SB

# Names below are re-exported: tests, scripts and the TS spawners import them from sb_join.
from sb_join_cli import load_registration, managed_driver, parse_args
from sb_join_detect import (  # noqa: F401
    ADMISSION_TIMEOUT_S, CLICK_WINDOW_S, END_PHRASES, LOBBY_PHRASES, JOIN_TEXTS, MAX_CLICKS, MAX_RECONNECTS, OFFLINE_PAGE_PHRASES, RECONNECT_COOLDOWN_S,
    RECONNECT_PHRASES, RECONNECT_THRESHOLD_S, AdmissionState, ReconnectState, apply_reload, classify_admission, classify_meet_state, click_gate, detect_trouble,
    is_meet_url, platform_of, should_force_reload)
from sb_join_loop import run_session
from sb_join_onair import OnairRefused, onair_enabled, onair_play, onair_prepare  # noqa: F401
from sb_join_agent import agent_enabled, agent_prepare
from sb_join_ownership import kill_orphans as _kill_orphans
from sb_join_profile import existing_profile_directory, selected_uc_profile, validate_uc_profile_support
from sb_join_recorder import recorder_link
from sb_join_register import REGISTRATION_JS, register_form  # noqa: F401
from sb_join_scripts import _IFRAME_WALK_JS, BODY_TEXT_JS, CLICK_JS, IN_CALL_JS, IN_CALL_JS_BY_PLATFORM  # noqa: F401
from sb_join_tiles import tile_clock


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


def kill_orphans(profile, launch=False, expected_exe=None, profile_directory=None):
    """Windows ownership is established before launch; cleanup never scans foreign processes."""
    return _kill_orphans(profile, launch, expected_exe, profile_directory, os=os, time=time)



def main():
    a = parse_args()
    a.profile_directory = existing_profile_directory(a.profile, a.profile_directory)
    validate_uc_profile_support(a.profile_directory)
    registration = load_registration(a)
    if a.cleanup_only:
        if not os.path.isabs(a.profile):
            raise RuntimeError("Cleanup requires an absolute owned profile")
        kill_orphans(a.profile, **({"profile_directory": a.profile_directory} if a.profile_directory is not None else {}))
        emit("cleanup-complete")
        return


    driver_version = managed_driver(a, emit)

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
            with recorder_link(sb, a, registration, policy_extension, os=os, time=time) as link:
                policy_check, command, extension_id = link.policy_check, link.command, link.extension_id
                if registration:
                    sb.driver.set_page_load_timeout(30)
                    sb.driver.set_script_timeout(10)
                    for method, arguments in (("Network.enable", {}), ("Network.setBypassServiceWorker", {"bypass": True})):
                        if not isinstance(sb.driver.execute_cdp_cmd(method, arguments), dict):
                            raise RuntimeError("Registration network isolation not acknowledged")
                    sb.driver.execute_cdp_cmd("Emulation.setScriptExecutionDisabled", {"value": True})
                    sb.driver.default_get(a.url)
                    import registration_cdp
                    emit("registration-result", **register_form(sb, registration, script_isolated=True, policy_check=policy_check, cdp_connect=registration_cdp.connect_page_cdp))
                    return
                sb.uc_open_with_reconnect(a.url, 4)
                emit("opened", url=sb.get_current_url())
                onair = onair_enabled(a.url)  # LKB_ONAIR_WATCH=1 + cloudonair.withgoogle.com only; otherwise untouched
                if onair:
                    if agent_enabled():  # LKB_PAGE_AGENT=1: the generic vision agent replaces the hard-coded Watch-now logic
                        agent_prepare(sb, time=time, emit=emit)
                    else:
                        onair_prepare(sb, time=time, emit=emit, session=os.environ.get("LKB_ONAIR_SESSION"))
                if a.capture_extension:
                    link.arm(15)
                    targets = command("Target.getTargets", {"filter": [{"type": "tab", "exclude": False}, {"exclude": True}]}).get("targetInfos", [])
                    tabs = [item for item in targets if item.get("type") == "tab" and item.get("url") == sb.get_current_url()]
                    if len(tabs) != 1:
                        raise RuntimeError("Recorder current tab ownership mapping refused")
                    command("Target.activateTarget", {"targetId": tabs[0]["targetId"]})
                    command("Extensions.triggerAction", {"id": extension_id, "targetId": tabs[0]["targetId"]})
                    emit("capture-invoked")
                if onair:
                    onair_play(sb, time=time, emit=emit)
        run_session(sb, a, os=os, time=tile_clock(sb, os, time), emit=emit)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit("fatal", error="Registration browser failed" if "--registration-stdin" in sys.argv else str(e)[:500])
        sys.exit(1)
