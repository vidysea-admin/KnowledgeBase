# Contract — meeting-bot-live-capture (T-024b)

> **Status: DRAFT.** Per checker/SKILL.md's criticality gate, initial contract creation is normally
> a human-approved START. This file is drafted by `/checker` at the explicit request of the
> `webinar-bot-live` manifest ("Asked of the checker" #3 — "the maker never edits qa/contracts/,"
> per meeting-bot-capture.md's own precedent of checker-authored/adopted contracts). Treat it as
> **proposed criteria, not yet binding ground truth**, until Umesh (Approver) or the first T-024b
> unit check formally adopts it — the same adoption path meeting-bot-capture.md itself used.
>
> Supersedes `qa/contracts/meeting-bot-capture.md` C3 **for the browser joiner only**: C3 envisioned
> a Playwright-shaped launcher stub with real join/audio-track capture deferred to T-024b. The
> `webinar-bot-live` unit (commits fd74864, cfaf464) delivered that follow-up via a **different real
> implementation** — SeleniumBase-UC (not Playwright) driving a persistent Chrome profile, captured
> by OBS window+process-audio capture (not an in-browser audio track) — verified live against a
> Zoho webinar on 2026-09-24 (D-027, D-028). `vexa-joiner.ts` and `system-audio-joiner.ts` remain
> stubs; C3 is otherwise unchanged for them.

## Scope
The real capture path behind `lkb record <url> --until HH:MM`: join a web-client meeting/webinar as
the registered attendee via a real browser, capture it with OBS, gate on silence, write
`source.json`, and (optionally) transcribe and sync into the knowledge graph — replacing the
injected-fake demo path of meeting-bot-capture.md's C3/C5 with a live one for platforms routed to
`browser` (currently `webex`, `zoho`, `cloudonair`).

## Criteria (each machine-checkable)

1. **Real browser join** (`packages/meeting-bot/py/sb_join.py`): opens the join URL in a headed,
   UC-mode SeleniumBase Chrome on a persistent profile; denies mic/camera/notification prompts at
   the Chromium-arg level (`--deny-permission-prompts`), never via a page-level "Allow" click; pins
   `document.title` to a caller-supplied unique string within 2s of any drift; exits cleanly on
   `--stop-file`; recovers a previous run's orphaned Chrome (profile-lock removal, stale-session
   cleanup) before launching.
2. **Bounded, denylisted auto-click** (`sb_join.py` `JOIN_TEXTS`/`CLICK_JS`): only clicks elements
   whose full trimmed text/aria-label **exactly** matches an explicit join/consent allowlist
   (join / continue / accept / listen-only variants); the allowlist MUST NOT contain, and no future
   edit may add, any of `share`, `unmute`, `raise hand`, `allow` (or `enable`) as a standalone
   matched string; capped at `MAX_CLICKS` total within `CLICK_WINDOW_S` of joining. `--no-click`
   disables all clicking (used by `login`).
3. **Per-process, not per-desktop, capture** (`src/capture/obs-windows.ts`): matches OBS
   `window_capture` + `wasapi_process_output_capture` inputs to the bot Chrome's window by exact
   title (`WINDOW_PRIORITY_TITLE`), confirmed present before `StartRecord` is called (a title race
   must throw, never silently record black/silent); mutes the global Desktop/Mic inputs for the run
   and restores exactly the inputs it muted (never inputs that were already muted before the run) —
   on every exit path, including a thrown error mid-`launch()`.
4. **Silence gate** (`src/capture/record-commands.ts` `finalizeRecording`): measures `max_volume`
   via `ffmpeg volumedetect`; a capture **strictly below** `SILENCE_MAX_DB` (−50 dB) MUST throw before any
   transcription call and MUST still register `source.json` (with `audioLevel.silent: true`) so the
   attempt is not silently lost.
5. **Recovery / mid-run controller death** (`runFinalize --stop-obs`): when invoked with
   `--stop-obs`, stops an active OBS recording, waits for the output file size to stabilize before
   treating it as complete, unmutes every input the dead run may have left muted, and terminates the
   orphaned bot Chrome by profile path — producing the same `source.json` shape as a normal `record`
   run. A recovery run when OBS itself is unreachable must fail with a clear, actionable error (not
   an unhandled rejection) and must not corrupt or overwrite an already-valid `source.json`.
6. **Credential + profile handling:** `OBS_WS_PASSWORD` is read from `.env`/`process.env` only,
   never appears in a `console.log`/`console.error`/thrown-error string anywhere in
   `capture/obs-windows.ts` or `capture/record-commands.ts`; `data/bot-profile/` (holds live login
   cookies) and `raw/webinars/` (raw recordings) are gitignored and never referenced from a path
   that could land under a tracked directory.
7. **Data-write scoping** (`scripts/webinar/sync-session.mjs`): every Mongo write goes through a
   `packages/db` `coll(tenantId)` accessor (never a raw driver handle); the turns and graph_edges
   deletes are scoped by `sessionId`/`sessionRef` in addition to tenant, so a re-run can only ever
   replace the rows of the one session named on the command line — never another session's or
   another tenant's rows. `--dry-run` performs zero Mongo connection attempts.
8. **Graph edge provenance (H3):** every non-structural `graph_edges` row (i.e. not `held_on` /
   `in_month` / `captured`, which are dateless/structural) carries a non-empty `evidence[]` whose
   `turnId`s all resolve to a `turns` row of the same `sessionId`/tenant the edge was built from.
9. **Tests exist and pass** for: the silence-gate threshold boundary (`SILENCE_MAX_DB`); at least
   one OBS-failure path (`StartRecord`/`connect`/`StopRecord` rejecting) proving mutes are restored
   and the bot Chrome is still terminated; the `source.json` `audioPath` branch in
   `scripts/lib/find-audio-file.mjs`. (Tracked as the known gap this contract closes: T-033.)
10. **No regression:** `pnpm -r typecheck`, `pnpm -r test`, `pnpm gen:types --check`,
    `python schema/validate.py`, and `pnpm lint:structure` (the full composite script, not a subset
    of its sub-checks) all clean.

## Non-goals for T-024b (phase 1, per docs/meeting-bot-roadmap.md)
Auto-reconnect on a dropped connection (T-029), proactive status alerts (T-030), an OBS
Safe-Mode/websocket-down guard (T-032), and running the controller detached so a closed console
can't orphan a live recording (T-047) are explicitly **out of scope for this contract** — they are
reliability follow-ups, not preconditions for T-024b's own criteria above. In-browser tab capture
replacing OBS (T-034) is a separate phase-2 contract.

## Amendment log
- 2026-09-24 · routine (draft correction, still NOT adopted) · **C7's path corrected**
  `scripts/sync-webinar-session.mjs` → `scripts/webinar/sync-session.mjs` (the file moved in
  webinar-bot-live fix cycle 1 under ISS-285; this was the last non-historical reference to the old
  path in the repo, and it was on the checker's own surface). **C4's boundary wording corrected**
  "at or below `SILENCE_MAX_DB`" → "strictly below", to match the implementation
  (`record-commands.ts:157` is `maxDb < SILENCE_MAX_DB`) — the code was not changed to match a
  criterion drafted after it was built, and no criterion was weakened. · cycle-1 checker.
- 2026-09-24 · **adoption ruling: NOT ADOPTED — open HUMAN_GATE for the Approver.** Two independent
  checkers converged on this: `checker/SKILL.md`'s criticality gate makes initial contract creation
  human-approved *always*, this is a Lab Protocol repo, and no `docs/DECISIONS.md` entry authorizes
  `T-024b`/`meeting-bot-live-capture`. A draft the checker wrote for itself cannot self-ratify, and
  a second checker agreeing with the first is still not a human. The cycle-1 checker initially ruled
  ADOPTED and **reversed that ruling**; the reversal is recorded here rather than made silently.
  Until an Approver-signed entry exists, units are graded against `meeting-bot-capture.md` C1-C7
  (C3 superseded for the browser joiner) and these criteria serve only as structure for judging
  capability-coverage completeness.
- 2026-09-24 · initial draft · criteria proposed by `/checker` per the `webinar-bot-live` manifest's
  direct request; drafted from the manifest's "What changed"/"Actual outputs"/"Known gaps" and this
  check's own re-derivation (43/43 tests, Mongo read-back of 94 graph_edges with 225/225 evidence
  turnIds resolving, 0 cross-tenant rows). Not yet checker-adopted as binding — see Status above.
