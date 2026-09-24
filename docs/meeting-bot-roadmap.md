# Meeting / Webinar Bot — feature list + plan

As of 2026-09-24 (first live run: Zoho webinar "The Next European Study Destinations to Watch").
Decision record: D-027. Task rows: TASKS.md "Webinar bot" section (T-029 … T-046).

## Where we are (phase 0: done, live-proven 2026-09-24)

| Feature | State | Evidence |
|---|---|---|
| Join as the registered attendee (own Chrome profile, mic/camera denied) | ✅ live | Zoho: auto "Join now", entered session |
| Per-app capture: only the bot's audio + video (OBS app-audio + window capture) | ✅ live | frame shows 4 panelists; OBS meter −0.1 dB peak |
| Scheduled start (Windows Task Scheduler) | ✅ live | task `LKB-webinar-2026-09-24` fired 15:55 |
| Silence gate (silent audio never transcribed) | ✅ | blocked a −91 dB capture; Gemini had invented 18 turns on one |
| Audio → Gemini diarized transcript → `data/toc-migrated/<id>/turns.json` | ✅ | TED sample transcribed correctly |
| Platforms: zoho, cloudonair → browser bot | ✅ | platform/strategy tests |

**Gaps seen live:**
- Zoho dropped the connection at ~16:03 and the bot had to be reloaded by hand.
- Nobody was told what happened until Umesh asked.
- Recordings are large (~2.7 GB/hour).
- Timestamps drift about 20% past the audio length.

## Learned from Read AI (and the open-source survey)

What to copy:
- auto-join **rules** (all / host-only / internal / external / per sender);
- **approve once**, then run automatically;
- a clear **"why it didn't join"** message;
- **add the bot to a live meeting** manually;
- a summary, action items and search **across meetings**.

What we keep as our advantage:
- **Zoho and Google OnAir** support (Read AI has neither);
- **Windows**;
- **no visible bot participant**, because the bot joins as the user.

---

## Feature list by phase

### P1 — Reliability (next; ~1.5 days). "It never silently fails."
| ID | Feature | Done when |
|---|---|---|
| T-029 | **Auto-reconnect**: detect "connection interrupted / trying to reconnect" for more than 20 s, then reload the page and rejoin. Record the gap window in source.json | a forced network drop mid-run is recovered without a human, and the gap is logged |
| T-030 | **Status alerts to Telegram**: joined · disconnected/recovered · silent for more than 2 min · finished + transcript ready (with a summary) | every state change arrives on Umesh's phone within 60 s |
| T-031 | **Live audio watchdog** (OBS level meters): no signal for more than 2 min while the session is live → alert + reconnect | a muted tab triggers the alert |
| T-032 | **OBS guard**: detect Safe Mode or the WebSocket being down → restart OBS normally; never force-kill it | a killed OBS is recovered before recording starts |
| T-033 | **Tests + checker pass** for today's code: failure paths with a fake OBS client (StartRecord/StopRecord throwing, mutes restored), the `audioPath` branch | `/checker` PASS on manifest `webinar-bot-live` |

### P2 — Own recorder, no OBS (~1 day)
| ID | Feature | Done when |
|---|---|---|
| T-034 | **In-browser tab capture**: a small extension in the bot Chrome (`chrome.tabCapture` + MediaRecorder) records the webinar tab's audio + video to webm. OBS stays as the fallback | a 60-min Zoho/YouTube run is recorded with no OBS running; two tabs recorded in parallel |
| T-035 | **Lean video**: 720p, low fps (slides don't need 60 fps) → ~10× smaller files | under 400 MB per hour |

### P3 — Automation, Read-AI style (~2 days)
| ID | Feature | Done when |
|---|---|---|
| T-036 | **Discovery**: scan Gmail + Calendar for webinar links (Zoho, OnAir, Zoom, Meet, Teams, Webex, YouTube Live) and pull out the personal join link | today's Zoho and Google invites appear as candidates automatically |
| T-037 | **Auto-join rules**: per sender/domain/platform, external/internal, approve once → trusted; opt out per meeting | rules are editable, and a trusted sender's next webinar is scheduled with no click |
| T-038 | **Scheduler service**: a poller every 5 min runs `selectEventsToAutoJoin` → `record`. Handles overlaps (parallel tab capture). Replaces one-off Windows tasks | a week of webinars runs with no manual scheduling |
| T-039 | **"Send bot now"**: CLI/API/web button to add the bot to a live meeting | bot joins a running meeting within 60 s |

### P4 — Knowledge (~2–3 days)
| ID | Feature | Done when |
|---|---|---|
| T-040 | **Post-processing**: summary, key facts, numbers, Q&A pairs, action items, each with timestamp citations | every claim links to a turn timestamp |
| T-041 | **Slides**: keyframe extraction (scene-change dedupe) → OCR → attached to turns by time | slide text is searchable next to the speech |
| T-042 | **Speaker names**: map `spk:N` to panelist names (Zoho tile names + self-introductions + existing `sync-speakers`) | today's 4 panelists named correctly |
| T-043 | **Index into the KB**: `sync-real-turns` + tree/vector index, hash dedupe, `/ask` across all webinars | "which countries were suggested for Europe?" answered with a citation from today's session |
| T-044 | **Transcript QA**: fix timestamp drift (clamp + validate against the audio duration), hallucination spot-check | no turn ends past the audio duration |

### P5 — Coverage + product (~2 days)
| ID | Feature | Done when |
|---|---|---|
| T-045 | **More sources**: Google OnAir on-demand (after a one-time login), YouTube via yt-dlp (direct audio, no recording), Meet/Teams/Zoom via the same browser bot | one successful run per source |
| T-046 | **Retention + web UI**: purge policy for raw video (D-008), and a real `/meeting-bot` page (upcoming · live status · past recordings · transcript links) | page shows today's run end to end |

---

## Order and timeline
1. **P1** first. Today's failure (the silent disconnect) is the most expensive kind.
2. **P2** next: removes OBS and cuts file size ~10×.
3. **P3** automates what is done by hand today.
4. **P4** is the real value (knowledge, not recordings). It can start in parallel with P3 once P1 is green.
5. **P5** last.

Rough total: **8–10 working days**. Each unit goes through `/maker` → `/checker` (auth/data-write units get full ceremony).

## Risks
- Platform terms around recording: internal KB use only, never redistributed.
- Zoho web-client changes can break the auto-click; P1 alerts make that visible the same day.
- Laptop dependency (must be on, awake and logged in). Moving the bot to an always-on machine or VM is a later decision (not planned yet).
