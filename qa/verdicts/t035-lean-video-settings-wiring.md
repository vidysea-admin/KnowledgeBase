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

---

# Cycle 1

VERDICT: PASS
Cycle checked: 1
Commit checked: 7ebed10 (lane/leanwire)
Scope: lean-video-obs.ts, obs-windows.ts, record-commands.ts, telegram-alerts.ts, tests; no live OBS.

## EXPLANATION

ISS-LEANWIRE-003 is closed: previous values are persisted before the first Set call and put back after StopRecord. ISS-LEANWIRE-002 is closed by the end-to-end runRecord behaviour test (exact OBS call sequence through the new inject seams).

- (1) Restore correctness: values restored from the persisted snapshot; "unset" is stored as null and sent as parameterValue null (obs-websocket v5 deletes the key; not an empty string). Order: stop() awaits StopRecord and the 3 s size-stable wait, then restores in `finally`; restore also checks GetRecordStatus and skips with the state kept if the output is still active; the call-sequence test asserts SetVideoSettings(operator) after StopRecord. recordDir is NOT per recording: it is the shared RECORD_DIR (LKB_RECORD_DIR or raw/webinars), so crash in recording A then recording B finds A's leftover file, keeps A's originals (never overwrites with lean values) and restores at B's stop. Caveat: if LKB_RECORD_DIR differs between runs, B would snapshot lean values as "originals" (ISS-LEANWIRE-005, low). A leftover file that is unreadable blocks lean (nothing changed), the safe direction.
- (2) `lkb finalize` without --stop-obs: cannot restore and gives no alert or warning; the profile stays lean until the next record or `finalize --stop-obs`. Only after a crash; documented in the manifest. Filed low (ISS-LEANWIRE-005), not a unit.
- (3) Sensitive data: the state file holds only GetVideoSettings numbers and four profile keys (Output/Mode is read but not stored; SimpleOutput VBitrate, ABitrate stored). No stream key, password or URL is captured or stored; keys come from toObsRequests (VBitrate/ABitrate only).
- (4) record-backend: 2 failures (live WebM remux: ffmpeg exit null; interrupted recovery: EPERM symlink on Windows) are identical in the lane and in the main tree (which has none of the lane's changes), environmental, unrelated.
- (5) Tests: lean-video-obs 21/21, lean-finalize-alert 6/6, obs-windows 8/8, record-commands 22 pass + 1 skip, telegram-alerts 31/31, controller-state 22/22, tsc exit 0. None launched OBS/ffmpeg/Chrome.
- Mutations (own harness inside the worktree, per-mutation backup in finally, deleted after; every touched file hash == HEAD afterwards): skip restore after StopRecord KILLED (2 fail); overwrite leftover state with current values KILLED (1 fail); restore while OBS is recording KILLED (1 fail). 3/3.
- Owner decision still open: default-ON lean recording (`leanVideo: {}` for every OBS recording) is now non-destructive when the restore works, but it is still the owner's call whether it should be default-ON, and whether 720p/5 fps/500 kbps is legible enough for slides; the Output-mode skip means it may silently do nothing on Advanced-mode profiles.

ISSUES-WRITTEN: ISS-LEANWIRE-005 (low). Flipped to verified: ISS-LEANWIRE-003, ISS-LEANWIRE-002.
