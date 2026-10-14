# Manifest — zoomwebinar

**Contract:** none specific (live defect, 2026-10-13 Zoom WEBINAR via web client).
**Date:** 2026-10-14
**Fix cycle:** 0
**Status:** ready-for-check

## Defect
Bot was inside a Zoom webinar (share frames, non-silent audio) but admission never fired ("admission_timeout ... waited 900s in the lobby"); the stop then failed with "Recorder did not acknowledge final flush; media requires recovery".

## Fix 1 — in-call detection (py/sb_join_scripts.py ZOOM_IN_CALL_JS)
Positive signals, searched in the top document and same-origin iframes: Leave control (aria-label, visible text "Leave [meeting|webinar]", `.footer__leave-btn`), footer toolbar (`#wc-footer`, `footer[role=toolbar]`, Q&A/Chat/Raise Hand/Reactions/Participants/Attendees/More buttons), or (weak) big visible canvas/video AND a name-tag/share-container overlay. Join-page guard (visible name input or "Join" button) returns not-in-call first. Fixtures in `py/fixtures/zoom_webinar/` (attendee, text-leave-only, footer-hidden, iframe-host => in-call; joinpage, hidden-media => unknown; waiting => lobby). Fixtures are MODELLED DOM, not saved live markup: needs a live check.

## Fix 2 — flush failure
Root cause (from logs): on admission_timeout the Python loop exited, closing Chrome and the tab recorder before the controller could request the final flush. `sb_join_loop.py` now holds the browser open up to `FLUSH_GRACE_S` (45 s) after admission_timeout, closing as soon as the stop file appears. Fallback (flag `LKB_TAB_REMUX_RECOVERY=1`, default OFF; output byte-identical when off): `tab-remux.ts` runs `ffmpeg -c copy` on the received bytes, keeps the original as `<output>.raw`, notes the lost tail in status.json `error`. `LKB_FFMPEG` overrides the binary.

## Policy question (NOT decided here)
Should admission_timeout while real audio is flowing discard/stop a good capture? Recommendation: no — if audio level is non-silent, treat as admitted-by-evidence (or HUMAN_GATE) rather than stop; needs Umesh's ruling.

## Evidence
- `pytest packages/meeting-bot/py -k "not native_same_host"`: 380 passed, 7 deselected (8 new webinar/grace tests included).
- `node --test --import tsx src/capture/tab-remux.test.ts`: pass 4 / fail 0.
- meeting-bot TS suite (src/**/*.test.ts): 829 pass / 2 fail / 1 skipped; both failures are record-backend.test.ts tests that need EPERM-blocked `symlink` creation on this Windows account (environmental, in code this lane does not touch). tsc --noEmit clean; `node scripts/lint-loc.mjs --all` no output (pass).
