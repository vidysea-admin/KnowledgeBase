# Verdict: t035-lean-video-settings-wiring

VERDICT: FAIL
Cycle checked: 0
Commit checked: 8dab21c (lane/leanwire)
Scope: lean-video-obs.ts, obs-windows.ts, record-commands.ts, record-finalize.ts, telegram-alerts.ts; no live OBS.

## EXPLANATION

The wiring does what the manifest says, but it permanently rewrites the operator's OBS profile with no restore and no documentation (ISS-LEANWIRE-003, high). That is the FAIL.

- (1) Protocol, from the obs-websocket v5 spec (not verifiable against a live OBS here): SetVideoSettings fields baseWidth/baseHeight/outputWidth/outputHeight/fpsNumerator/fpsDenominator are the correct names (set in pairs, as sent; rejected while an output is active, and the call is made before StartRecord, good). SetProfileParameter parameterCategory/parameterName/parameterValue (string) are correct. [SimpleOutput] VBitrate and ABitrate are the real basic.ini keys, but they only drive the recording when the profile is in Simple output mode with RecQuality "Stream" ("Same as stream"); Advanced mode, or Simple with High/Indistinguishable quality, ignores them silently. Not verifiable without live OBS; the finalize alert is the only safety net (ISS-LEANWIRE-002 text already says so). Fail-soft per request: acceptable.
- (2) Persistence: nothing reads the previous values or restores them; obs-windows only restores muted inputs. Canvas size, fps and bitrates stay changed in the profile after the run, for all `lkb record` runs (leanVideo:{} always on) and for the operator's manual OBS use. Not in the manifest. ISS-LEANWIRE-003.
- (3) 5 fps: T-041 keyframes sample every 2 s and T-042 tile alignment works from tile name changes; neither needs more than 5 fps. Risk is 720p/500 kbps OCR legibility of slides (owner already flagged in the manifest), not frame rate. Note only.
- (4) Alert content: title (raw meeting title, same as the existing Joined/Finished alerts), session id, MB/h, size, duration. No URL, token or passcode field is added; but the title is not passed through the ISS-R1ALERTS-009 allow-list (that covers calendar attention alerts only). Same exposure as existing alerts; note, no new issue.
- (5) ISS-LEANWIRE-002 (medium): the `leanVideo: {}` line has only a source-text pin; it does not block on its own, but together with 003 the default-ON choice is unguarded. Rated medium, non-blocking.
- (6) Tests I ran: lean-video-obs 14/14; obs-windows 8/8; record-commands 22 pass + 1 skip; telegram-alerts 31/31; controller-state 22/22; tsc exit 0. None launches OBS/ffmpeg/Chrome.
- Mutations (own harness, per-mutation backup in finally, applied files hash-checked): skip lean before StartRecord KILLED (2 fail); wrong fps in the SetVideoSettings payload KILLED (3 fail); finalize threshold 400 -> 4000 KILLED (2 fail). 3/3. A first fps mutation in the worktree's core file survived only because @lkb/core resolves through a junction to the MAIN tree (ISS-LEANWIRE-004); redone at the wiring layer.
- After: touched files equal `git rev-parse HEAD:<file>`, harness deleted, both trees clean (before my verdict files).
- Default-ON owner decision: needed. Turning lean on for every OBS recording changes the operator's profile permanently; Umesh should decide restore vs bot-owned profile.

ISSUES-WRITTEN: ISS-LEANWIRE-003 (high), ISS-LEANWIRE-004 (medium)
