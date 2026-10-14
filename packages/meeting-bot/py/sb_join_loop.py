"""sb_join: the hold-the-window polling loop (moved verbatim from main())."""
import json

from sb_join_detect import (ADMISSION_TIMEOUT_S, END_PHRASES, JOIN_TEXTS, AdmissionState, ReconnectState, apply_reload,
                            classify_admission, click_gate, detect_trouble, platform_of, should_force_reload)
from sb_join_scripts import BODY_TEXT_JS, CLICK_JS, IN_CALL_JS_BY_PLATFORM


def run_session(sb, a, *, os, time, emit):
    started = time.time()
    clicks = 0
    last_click = 0.0
    last_beat = 0.0
    pinned = json.dumps(a.title)
    errors = 0
    reconnect = ReconnectState()  # T-029
    extra_click_until = 0.0  # widened click window after a reload; MAX_CLICKS/JOIN_TEXTS unchanged
    gave_up_emitted = False
    # ISS-CAPTUREFIX-001 / ISS-LOBBYWATCH-001: admission for every platform. "admitted" is emitted only
    # on a positive in-call signal (Meet / Zoom web / Teams web / generic leave control); an unknown
    # platform is never assumed admitted and ends in admission_timeout like the others.
    platform = platform_of(a.url)
    in_call_js = IN_CALL_JS_BY_PLATFORM[platform]
    admission = AdmissionState(started, getattr(a, "admission_timeout", None))
    if admission.timeout_s is None:
        admission.timeout_s = ADMISSION_TIMEOUT_S
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

            try:
                in_call_dom = bool(sb.execute_script(in_call_js))
            except Exception:
                in_call_dom = False
            state = classify_admission(platform, in_call_dom, body)
            verdict = admission.tick(state == "in-call", now)
            if verdict == "admitted":
                emit("admitted", platform=platform, assumed=False)
            elif verdict == "timeout":
                emit("admission_timeout", seconds=int(now - started), limit=admission.timeout_s)
                break

            # T-031: forced reload from the Node-side audio watchdog — independent of T-029's
            # own DOM-banner detection below (silence has no banner). No gap is recorded here:
            # silence is not necessarily a connectivity gap (the whole "muted tab" case).
            if should_force_reload(a.reload_file):
                try:
                    os.remove(a.reload_file)
                except OSError:
                    pass
                if not admission.admitted:
                    # ISS-CAPTUREFIX-001: never reload while waiting in the lobby -- the reload ends
                    # the tab's audio track and the host would see a fresh knock.
                    emit("watchdog-reload-suppressed", reason="not-admitted")
                else:
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
