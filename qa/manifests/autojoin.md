# autojoin

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 (roadmap T-036 / T-037 / T-038, enabled by D-165, commit a5e6df58)
Security class: decides which meetings the bot records and sends outward email and calendar writes - FULL ceremony.
Lane: `lane/autojoin` (worktree `KnowledgeBase-lanes/autojoin`, from 29416b51). No ledger shard needed: no issue filed.
Authority: D-165 (2026-10-14, Approved-by Umesh): auto-discovery and auto-join on, webinars joined automatically, career counselling/guidance first (also on conflicts), other webinars are test data to staging (D-143), alerts by email to umeshsugara@vidysea.com AND on the web dashboard. Calendar marker channel added by the coordinator the same day.

## Survey (what already existed, what needed turning on)
- Discovery (Gmail/Calendar link scan, `youtube-live-extract.ts`) has NO flag: it runs whenever the tick calls the API. YouTube Live extraction is flag-off and not wired into gws-calendar.ts, and a YouTube watch link cannot be joined by the bot (platform `unknown`); YouTube capture is T-045 and is NOT done here.
- `schedule-tick.ts` already ran with `everyWebinar: true`. T-037 join rules are a veto layer only, behind `LKB_JOIN_RULES_ENFORCE` (left unset: Approver's W3 policy choice, not in D-165).
- U6 consent gate: answered by D-045; `scripts/watch/install-tasks.ps1` did NOT exist. Built here, preview by default.
- T-057 notifications aggregate only persisted sources; bot events were nowhere persisted. Added a feed + `/bot-events` + a Bot activity section on `/meeting-bot`.
- Non-webinar meetings: `everyWebinar` skips them as `not-webinar`; T-037 never joined them either. No new policy invented; unchanged.

## What changed
- `config/autojoin.json` (non-secret deployment defaults, all ON) + `config/career-topics.json` (keywords, weights, minScore). Env overrides documented in `.env.example` (`LKB_AUTOJOIN_*`, `LKB_ALERT_*`). No file and no env = legacy tick behaviour.
- `packages/meeting-bot/src/autojoin/`: `config.ts`, `topic-priority.ts` (explainable classifier, stores matched keywords), `webinar-kind.ts` (masterclass / OnAir / Zoom `/w/` / registration-confirmation, only widens "uncertain"), `alerts.ts` (+`gws-channels.ts`, `bot-events.ts`), `capture-watch.ts`, `capture-tags.ts`, `tick-wiring.ts`.
- Overlap: optional `priorityOf` / `classifyInvite` on `SelectAutoRecordItemsInput` (core, additive); career wins before the earliest-start rule.
- `schedule-tick.ts`: optional `autojoin` deps; discovery-off yields empty loaders; `webinarAutoJoin` off forces dry-run; own marker events ignored; job file carries startTime + tags; about-to-join alert; capture watch after scheduling.
- testData routing: tick writes `raw/webinars/capture-tags/<id>.json`; `record-finalize.ts` merges it into source.json (+1 import, +1 line); `scripts/webinar/sync-session.mjs` routes `testData:true` to `lkb_staging` via `scripts/watch/test-data-route.mjs`, refuses without `LKB_ALLOW_STAGING=lkb_staging` (D-143).
- Alerts (email via gws `gmail users messages send`, dashboard feed, private calendar marker via gws `calendar events insert/patch`): per (session, kind, channel) once; email cap 6/hour (failures bypass; test-data webinars email only on failure); calendar updates >= 60 s apart; failed sends retried max 3 times; URLs stripped everywhere.
- Calendar marker: "🤖 LKB bot recording: <title>" on Umesh's own calendar, private, free/busy transparent, no attendees, sendUpdates none, patched only by the id we stored; colour and STATUS line show joining / recording / stopped early / failed / done + output path.
- API `GET /bot-events` (scope jobs, tenant from key, re-projected rows), host reader `scripts/watch/bot-events-host.ts`, wired in `join-rules-api-host.ts`; web `BotActivity` section.
- Scheduler: `scripts/watch/install-tasks.ps1` (D-045: preview default, idempotent, `-Remove`, current user, no password). NOT installed by this lane.

## Not touched
Python admission detection, tab-browser.ts flush, capture resume logic, qa/contracts, DECISIONS, enforcement paths. No real Gmail, Calendar, browser or Task Scheduler call was made; the real gws binary was used only with `--dry-run` to confirm argument shapes.

## Evidence
- meeting-bot full: `node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"` -> tests 914, pass 910, fail 2. The 2 failures (`record-backend.test.ts` owned-sidecar tests, `EPERM: symlink`) fail identically in the MAIN tree (`ℹ pass 16 / ℹ fail 2` on tab-browser + record-backend there): Windows symlink privilege, not this lane.
- New tests: topic-and-kind 10/10, alerts 11/11, tick-and-watch 14/14, capture-tags 2/2, `scripts/watch` test-data-route 3/3, install-tasks 4/4 (preview only), bot-events-host 1, apps/api bot-events router 3/3.
- apps/api full (`D2_FIXTURE_PYTHON=...\.venv\Scripts\python.exe`): tests 874, pass 873, fail 1 (`ai-transport.test.ts` "stdout overflow terminates owned process", a timing test under load); that file rerun alone 3 times: pass 17 / fail 0 each time.
- apps/web `vitest run`: 70 files, 723 tests passed (new BotActivity.test.tsx; MeetingBotSections.test.tsx updated for the 4th request). `tsc --noEmit` clean for meeting-bot (lane paths config, deleted), apps/api, apps/web.
- `node scripts/lint-loc.mjs --all`: all ten stages exit 0 (loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker, dependencies).
- Preview of the installer: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\watch\install-tasks.ps1` prints task, trigger every 5 minute(s), command, working directory, run-as, "PREVIEW (nothing changed)".

## Start the scheduler (orchestrator, after merging to the main tree)
From `C:\Users\product\Desktop\KnowledgeBase`:
1. Preview: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\watch\install-tasks.ps1 -NodePath "C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"`
2. Install: same command plus `-Apply`. Remove: `-Remove -Apply`.
3. The poller needs the API host: `node --import tsx scripts/webinar/join-rules-api-host.ts` (serves /meeting-candidates, /calendar, /bot-events).
Requires `LKB_API_KEY` and `LKB_TENANT_ID` in the main-tree `.env` (not committed). The u6 live-recording-proof gate (`qa/gates/live-recording-proof-method.md`) is a separate sequencing note; D-165 authorizes enabling.

## Known gaps (for the checker)
- Calendar/candidate DTOs carry no event description, so the classifier's description input is empty in production (title and sender only) until the API DTO exposes it.
- Capture alerts have 5-minute resolution (derived from the controller state file each tick), not instant.
- YouTube Live capture and non-webinar meeting joining are unchanged (see Survey).
- `testData` routing is enforced in `sync-session.mjs` (the DB writer) and covered by a helper test; there was no live Mongo run.
- Windows PowerShell 5.1 redirect `*>>` writes the poller log as UTF-16.
