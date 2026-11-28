"""sb_join: the hold-the-window polling loop (moved verbatim from main())."""
import json

from sb_join_detect import (ADMISSION_CONFIRM_TICKS, ADMISSION_TIMEOUT_S, END_PHRASES, FLUSH_GRACE_S, JOIN_TEXTS, LEFT_MEETING_TICKS,
                            AdmissionState, ReconnectState, apply_reload, classify_admission, click_gate, detect_trouble,
                            is_blocked_text, is_left_screen, is_outside_meeting, platform_of, should_force_reload)
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
    hold_for_flush = False
    # ISS-CAPTUREFIX-001 / ISS-LOBBYWATCH-001: admission for every platform. "admitted" is emitted on a positive
    # in-call signal; a lobby / denied page is never admitted. On non-Meet platforms (probes unverified live) a
    # wait that ends with no lobby or denied text ever seen is assumed admitted (assumed=True), not aborted.
    platform = platform_of(a.url)
    in_call_js = IN_CALL_JS_BY_PLATFORM[platform]
    # ISS-ADMISSION-STABLE-001: a one-tick controls-bar glimpse before the lobby text renders is not admission.
    # Meet only: other platforms' probes are unverified live and keep their old one-tick contract (review B).
    admission = AdmissionState(started, getattr(a, "admission_timeout", None), lenient=platform != "meet",
                               confirm_ticks=ADMISSION_CONFIRM_TICKS if platform == "meet" else 1)
    if admission.timeout_s is None:
        admission.timeout_s = ADMISSION_TIMEOUT_S
    outside_ticks = 0  # consecutive post-admission ticks on a Meet page outside this meeting
    left_emitted = False
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
            try:
                in_call_dom = bool(sb.execute_script(in_call_js))
            except Exception:
                in_call_dom = False
            if ended:
                # Review E 2026-11-28: the phrase is matched on the whole page text, chat included; in_call tells the
                # controller the call controls still show, so a chat line is never taken for the end.
                emit("ended", reason=ended, in_call=in_call_dom)
            state = classify_admission(platform, in_call_dom, body)
            if state == "refused" and not admission.admitted:
                # B2 / D-232: Meet refused the bot. Never click or reload; end the capture now instead of
                # waiting out the lobby timeout. Pre-admission only (B2-C8): after `admitted`, the phrase is
                # just text (a caption or chat line) and must never end a live recording.
                emit("admission_denied", seconds=int(now - started))
                hold_for_flush = True  # same bounded hold as admission_timeout: the controller flushes, then writes the stop file
                break
            verdict = admission.tick(state == "in-call", now, blocked=state == "lobby" or bool(ended) or is_blocked_text(body))
            if verdict == "admitted":
                emit("admitted", platform=platform, assumed=False)
            elif verdict == "assumed":
                # D-167 / ISS-LOBBYWATCH-001: non-Meet in-call probes are unverified live; after the wait with
                # no lobby or denied text ever seen, assume we are in rather than abort a possibly-live join.
                emit("admitted", platform=platform, assumed=True, reason="no-lobby-signal", seconds=int(now - started))
            elif verdict == "timeout":
                emit("admission_timeout", seconds=int(now - started), limit=admission.timeout_s)
                hold_for_flush = True
                break

            # ISS-ADMISSION-STABLE-001: after admission on Meet, the bot is no longer in the meeting when, for
            # LEFT_MEETING_TICKS consecutive ticks, either (a) its only tab sits on a Meet page that is positively not
            # this meeting (home / landing / another code), or (b) the call controls are gone AND Meet shows its
            # own removed / left screen (phrase + 'return to home screen') (those screens keep the meeting URL). One "ended" so the controller stops.
            # Never before admission (that is the admission timeout's job), never on an unknown URL, never with a
            # second tab open (the call may still be live in the other one), never on text while the controls show
            # (a caption or chat line saying "meeting ended" is not the end).
            if platform == "meet" and admission.admitted and not left_emitted:
                try:
                    single_tab = len(sb.driver.window_handles) == 1
                    current_url = sb.get_current_url()
                except Exception:
                    single_tab, current_url = False, ""
                gone = (single_tab and is_outside_meeting(a.url, current_url)) or (
                    not in_call_dom and is_left_screen(body))
                outside_ticks = outside_ticks + 1 if gone else 0
                if outside_ticks >= LEFT_MEETING_TICKS:
                    left_emitted = True
                    emit("ended", reason="left-meeting")

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
    if hold_for_flush:
        # zoomwebinar: leaving now closes Chrome and kills the tab recorder BEFORE the controller can ask it
        # to flush (live run 2026-10-13: "Recorder did not acknowledge final flush; media requires recovery").
        # The controller reacts to admission_timeout by stopping the recorder and then writing the stop file,
        # so hold the browser open (bounded) until that stop file shows up.
        waited = 0
        while waited < FLUSH_GRACE_S and not os.path.exists(a.stop_file):
            time.sleep(1)
            waited += 1
    final_gap = reconnect.close_at_end(time.time())
    if final_gap is not None:
        emit("gap", **final_gap)
    emit("closed")
