# Manifest — webinar-bot-live

**Contract:** qa/contracts/meeting-bot-capture.md (C1/C2 extended, C3 superseded for the browser joiner). **No T-024b contract exists.** The checker is asked to draft the T-024b criteria (the maker never edits qa/contracts/).
**Goal task:** U4.2 (one real meeting-bot joiner) · T-024b · D-027 · D-028
**Date:** 2026-09-24
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none filed. Live-run defects are tracked as T-029, T-030, T-032, T-047.
**Queue tier:** 3, a roadmap task (Umesh's fast-track: built and live-run first, checked after; recorded in D-027)
**Severity gate:** FULL ceremony. `scripts/sync-webinar-session.mjs` performs **data writes** to Mongo (lkb, tenant `toc`).
**Status:** ready-for-check
**Commits:** `fd74864` (feature) · `cfaf464` (split record commands out of cli.ts for lint-loc), on branch `feat/webinar-bot`

## What changed
- `packages/meeting-bot/src/platform.ts`, `strategy.ts` and their tests: new platforms `zoho` (webinar/meeting.zoho.*) and `cloudonair` (Google Cloud OnAir), both routed to `browser`. A lookalike host (`zoho.in.evil.example`) stays `unknown`.
- `src/capture/obs-windows.ts` (NEW): the real `BrowserJoinerDeps`.
  - Spawns `py/sb_join.py` (NEW): a headed SeleniumBase-UC Chrome on the persistent profile `data/bot-profile/`. It pins `document.title`, denies permission prompts, auto-clicks Join only for zoho, and kills orphaned processes on its own profile.
  - Confirms the OS window title `"<title> - Google Chrome"`.
  - Drives OBS over obs-websocket v5: scene `LKB Bot` with window_capture plus wasapi_process_output_capture, matched by title (priority 1). Mutes the global desktop and mic inputs.
  - Starts the recording. Stop waits until the file size is stable.
  - Every failure path restores the mutes and stops the bot browser.
- `src/capture/record-commands.ts` (NEW; `cli.ts` only dispatches to it):
  - `record <url> --until HH:MM`: join, record, extract m4a, silence gate (max < -50 dB → no transcription), write `source.json` with `audioPath` and `hash`, optional transcription.
  - `login`: opens the bot profile so the user can sign in.
  - `finalize --stop-obs`: recovery when the controller dies mid-run.
- `scripts/lib/find-audio-file.mjs`: honours `source.json.audioPath`. The TOC branch is unchanged.
- `scripts/transcribe-long-session.mjs`: `GEMINI_STT_MODEL` override, headers/body timeout 600 s → 1,800 s.
- `scripts/sync-webinar-session.mjs` (NEW, **data writes**): upserts source/session/speakers/orgs/topics; delete+insert of this session's turns and of graph_edges tagged with `sessionRef`. Tenant-scoped through the `packages/db` `coll(tenantId)` accessors only. Dry-run by flag.
- Data: `data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/{source,meta,turns,turns.chunked-gemini-3.5}.json`, `transcript.md`, `summary.md`.

## How to verify (commands + expected)
- `pnpm --filter @lkb/meeting-bot test` → 43 pass / 0 fail
- `pnpm --filter @lkb/meeting-bot typecheck` → exit 0
- `node scripts/lint-loc.mjs` → `OK (295 file(s) within budget)`
- `npx depcruise --config .dependency-cruiser.cjs packages apps workers` → 0 violations (310 modules)
- `node scripts/lint-dupes.mjs` → OK
- `node scripts/sync-webinar-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run` → turns 80 · speakers 3 · orgs 6 · topics 15 · graph_edges 94, and no Mongo connection
- Mongo read-back (tenant toc): `graph_edges` count 94; `spoke_in` edges on 2026-09-24 = devanshi 35 / anjum 27 / sagar 16 turns; every non-structural edge has `evidence[].turnId` that resolves to a turn of this session.

## Actual outputs (maker's own runs, 2026-09-24)
- **Live run.** Scheduled task at 15:55 → `opened` → `bot window confirmed` → clicked "join now" → recording started.
  - The controller died at 16:30:56 (console closed). OBS and the bot kept going.
  - Recovered with `finalize --stop-obs`: mkv of 3,599,045,544 bytes, audio max 0 dB / mean −19.2 dB, OBS inputs unmuted, bot browser closed.
- **Transcripts.**
  - Chunked gemini-3.5 at 40 min: failed on `UND_ERR_HEADERS_TIMEOUT`.
  - At 20 min on the untrimmed audio: refused because of an internal gap, and chunk 4 had invented turns over 13 min of post-event silence.
  - Trimmed 230–3935 s + gemini-3.8-flash in a single call: 80 turns, no gaps, max tEnd 3724 s on 3705 s of audio.
- **Silence gate.** Blocked a −91 dB smoke capture ("recording is silent … not transcribing").
- **Sync.** `written: turns -0/+80, graph_edges -0/+94`. Read-back queries are in D-028's Result.

## Known gaps (not claimed)
- Window video is intermittently black (it was black during the 16:24–16:27 slide share). Audio is fine.
- No auto-reconnect: Zoho dropped the bot at about 16:03 (reloaded by hand) and at about 17:01 (last ~5–8 min lost).
- No unit tests for `obs-windows.ts` failure paths or for the `audioPath` branch (T-033).
- Graph `covers`/`discussed` edges are keyword-based (confidence 0.7–0.8). `country:usa` also matches "Hellenic American".

## Asked of the checker
1. Verdict on the diff against C1–C7 as they apply (C3 is superseded for the browser joiner; say so explicitly).
2. **Security class (never capped):**
   - Tenancy of `sync-webinar-session.mjs` writes: every write goes through `coll(tenantId)`, and a delete can only touch this session's turns/edges.
   - Credential handling: `OBS_WS_PASSWORD` read from `.env`, never logged; the bot profile holding cookies is gitignored (`data/bot-profile/`).
   - `sb_join.py` auto-click list: can it click anything that shares or unmutes?
3. Draft T-024b contract criteria from this manifest (live join, per-process capture, silence gate, recovery, data-write scoping).

## Live browser evidence
Not a web-UI change. The live-run evidence is the Zoho participant page read over CDP at 16:07/16:42, a frame showing 4 panelists (16:05), and Zoho's "Thank you for attending" email at 17:09.
