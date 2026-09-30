# Webinar → Knowledge Base operational release

The target path is tab audio/video capture → transcript/diarization → screen evidence and notes → work-database indexing → cited Ask. This is an implementation checkpoint, not a completed operational release. Full grounded notes/Q&A are pending canonical-schema approval; strict indexing currently refuses incomplete knowledge. Preview commands are safe defaults. Windows OBS remains an explicit fallback. Ubuntu is an acceptance target, not a verified live deployment.

## Setup

Use Node 24+, pnpm 10.33.0 (package.json), Python 3.10+, ffmpeg and ffprobe. Install JavaScript dependencies from the project root with `pnpm install --store-dir .cache/pnpm`.

Run `node scripts/webinar/setup.mjs --dry-run` to see the project-local install plan and prerequisites. `node scripts/webinar/setup.mjs --install` explicitly creates `.venv`, installs pinned `packages/meeting-bot/py/requirements.txt` and downloads Chrome for Testing plus its UC driver inside that environment. No capture or provider invocation occurs during setup. `--doctor` exits nonzero when a prerequisite is missing.

Set `LKB_PYTHON` to `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on Ubuntu, `LKB_BROWSER_EXECUTABLE=cft`, and `LKB_CAPTURE_BACKEND=tab`. Use an absolute Python path for services. Keep the persistent `data/bot-profile` and `.env` local to each machine.

For an isolated local capture proof, set trusted operator `LKB_BOT_PROFILE_DIR` and `LKB_RECORD_DIR` to separate project-confined fixture directories. Defaults remain `data/bot-profile` and `raw/webinars`. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` empty in the fixture child environment and omit transcription, video processing and indexing flags.

Ubuntu needs a headed X11 session or Xvfb, Chrome shared libraries, PyAutoGUI/Tk/X11 support and ffmpeg OS packages. Provision these with the host administrator; setup does not install system packages. Set DISPLAY for the usable display session. Capture invokes the managed extension action through its owned browser CDP endpoint; exact executable/profile/process identity, extension path, worker and current tab must match. Redirects, environment proxies, ambiguous targets and unverified endpoints fail closed. websocket-client 1.9.2 is explicitly pinned. OS foreground focus and xdotool are not capture dependencies. Wayland alone is not supported. Standard recent Chrome can restrict unpacked extensions; use the managed Chrome for Testing binary. Linux process cleanup uses exact executable/profile identity and bounded termination, without deleting Singleton symlinks. These adapters are unit-tested; Ubuntu audio/video and restart acceptance remain unverified until tested on its actual host.

## Connected sources and work boundary

Set `LKB_API_URL` and tenant-scoped `LKB_API_KEY` for the API serving the work environment. Existing authenticated `/calendar/upcoming` and `/meeting-candidates` routes supply discovery; Gmail/Calendar OAuth must already work there. Feed failures are errors, not a healthy empty schedule.

Set API `MONGODB_DB` and API/runner `MONGO_WORK_DB` to the same isolated database, and API/runner `LKB_TENANT_ID` to the connected operator's tenant. The machine's single Gmail/Calendar credential refuses other tenants before provider calls; this is not a multi-account OAuth mapping. Real runs refresh Gmail through authenticated `/gmail/scan` only after checking the API's actual database capability; missing, foreign or production bindings refuse scanning before writes. Preview reads cached candidates and never scans or persists health. Manual API scan clients must supply the qualified `X-LKB-Work-DB` header. Calendar and Gmail follow pagination with a 20-page bound; a limit, repeated token, malformed response or failed message fetch marks discovery unavailable rather than healthy partial coverage. Discovery uses the existing primary Calendar window (14 days) and recent Gmail query (30 days); live connected-source behavior still needs verification.

Set an isolated `MONGO_WORK_DB` plus the Mongo connection used by this installation. `lkb` and `global_university_db` are refused. The runner does not promote to production. Provider configuration for transcription/indexing and `GEMINI_API_KEY` + `WEBINAR_VISION_MODEL` for screen interpretation are needed before a session can become ready. Missing vision configuration fails processing explicitly. Telegram may be omitted for isolated manual synthetic capture. Operational release acceptance requires configured Telegram alerts and verified real receipt; this has not been proved here. The runner lazily sends failed/action-required/ready alerts through the existing notifier and persists sent/disabled/failed delivery metadata. Successfully sent fingerprints deduplicate retries and restarts; a timed-out delivery can still duplicate on retry. Discovery-feed failures now persist fixed feed health, queue deduplicated failure/recovery alerts and refuse capture on an incomplete discovery tick; API/UI expose failed, stale and legacy-unverified feed health. These changes are implemented locally; actual connected-feed and Telegram receipt validation remains pending.

## Manual live proof before unattended recording

Sign into the managed persistent browser once, then manually record the next real webinar through the CLI. Example (replace actual URL/end/session):

```text
node --import tsx packages/meeting-bot/src/cli.ts login
node --import tsx packages/meeting-bot/src/cli.ts record <url> --backend tab --until <ISO-end-time> --session-id <safe-id> --title <title> --transcribe --process-video --index
```

Verify playable audio and video with ffprobe plus playback, transcript timestamps/speakers, screen evidence/notes, completed work-database index, and a cited Ask answer. Exercise a reload and a controller interruption/recovery. Retain commands/results and checker evidence. This manual run is intentionally separate from enabling unattended operation.

Only after verification, record `data/webinar-release/live-proof.json` with `status: "passed"`, `backend: "tab"`, `platform: "win32"` or `"linux"`, `audio: true`, `video: true`, safe `sessionId`, ISO `verifiedAt`, and project-relative `recording`. The marker is a human/checker assertion, not an automatically generated substitute for live evidence. A proof from another OS is refused.

## Portable runner and recovery

```text
node scripts/webinar/run-pipeline.mjs
node scripts/webinar/run-pipeline.mjs --run
node scripts/webinar/run-pipeline.mjs --run --watch
```

Default is one read-only preview tick. `--run` requires the live-proof marker and isolated work DB. `--watch` polls once per minute when idle; capture/processing is serialized. It directly launches the shared CLI without shell interpolation or Windows Task Scheduler. Existing `schedule-tick` and detached PowerShell launchers are legacy Windows paths, not the Ubuntu runner.

An unavailable discovery tick saves failed health, attempts its alert and retries on the next 60-second watch tick. Approval/owner/database/state/lock errors remain fatal. A process supervisor is still needed to restart the service after controller/process or host failure. Invites arriving during a long active capture are checked at the next idle tick, so continuous coverage and cancellation/rescheduling acceptance remain unproved.

Calendar discovery now requests deleted events and preserves validated cancellation tombstones, recurrence identity, provider revisions and incomplete invites. The scheduler uses authenticated `GET /calendar/upcoming?discovery=1`; the default Calendar UI response excludes cancelled and nonjoinable rows. A cancelled occurrence with its original URL/time suppresses a stale Gmail alias in the standing regression test. ID-only cancellation needs durable prior linkage; deleted recurring masters, moved occurrences and active-recording changes still require delta discovery and reconciliation. ISS-WEBINARRELEASE-013 remains open; this adapter repair does not prove full cancellation handling.

The authenticated discovery endpoint also accepts optional canonical UTC millisecond `changedSince`, provided through the existing HTTP loader callback. It completes both upcoming expanded instances and a deleted-master change pass without event-time bounds. A failed pass refuses the combined result; conflicting revisions remain for reconciliation. Validated positive recurring masters are omitted from the occurrence feed, while their expanded instances and deleted masters remain. Current runner callers do not yet supply this checkpoint.

The existing Calendar client now has a standalone pure reconciler for tenant-bound source occurrences, proven alias lineage, cancellation/reschedule transitions and future inventory. JSON replay and actual adapter-to-selector fixtures verify its behavior. Disputed observations never become accepted aliases, explicit rejection/registration remain barriers, and unknown relationships block new starts. This helper does not persist state itself and is not yet called by the operational runner. Its history-completeness input is caller-owned acquisition evidence, not proof that a bounded query covers every historical deletion. Durable checkpoint/coverage persistence and active capture controls remain required before operational cancellation acceptance.

Only positively classified webinars are selected. Personal/team meetings are excluded; uncertain invites, registration barriers and overlapping coverage remain visible. Gmail/Calendar token rotations deduplicate through the existing canonical identity. Operation state is atomically saved in `data/webinar-release/operations.json`: queued, recording, processing, failed, ready, or action_required. An index-completion marker is required for ready; a successful child exit alone is insufficient.

Interrupted jobs with saved media resume through `finalize` and repeat the idempotent processing/index pipeline. Missing media and exhausted retries become action_required. A live poller lock blocks another process; a dead PID is recoverable, while an invalid lock requires inspection. Keep media until recovery completes. Portable recovery requires operator-matching tenant/session/media/profile metadata, a confirmed dead controller or proven PID reuse, and exact owned-process cleanup. A separate recovery mutex blocks a new capture from starting during cleanup. Recovery records terminal recovered/recovery-failed capture status and an unrecovered conservative coverage gap in source.gaps; recovered media is not complete knowledge. Legacy sidecars without required ownership/timestamps and unknown recovery locks require inspection. Never delete profiles/recordings to clear an uncertain lock.

GitHub push, server deployment and live operational proof are separate milestones. Ubuntu must independently pass media and restart/recovery tests before being called supported. No unattended task or server service was enabled by this release implementation.

Set LKB_TENANT_ID explicitly for the scheduler and indexed capture/finalize; it must match the connected API key tenant. Unowned or mismatched operation/source state is refused. The Meeting Bot page shows tenant-scoped durable states, retries and sanitized coverage reasons. Legacy manual non-index capture retains its Vidysea default.

Authenticated recording playback uses bounded Blob loading for media up to 200 MiB. The native Chrome MediaRecorder WebM MSE path passed an independent headed-browser check on an 81.034-second capture, including forward seek, eviction, backward buffer recovery and cleanup. Generic large WebM container compatibility, sustained 60-minute playback and audible output remain unverified; recovery of an evicted range currently leaves playback paused.

Gmail discovery now has no age cutoff and matches the current webinar classifier vocabulary, known hosts/senders, generic invitations and calendar attachment filenames. Matching an ICS attachment does not parse it; unknown-platform candidates retain visible missing-link/time gaps. Provider search must finish within its resource bounds; exhausting the page limit is an acquisition failure, never truncated successful coverage. Injected query-driven tests cover all seven positive title forms; real connected Gmail acceptance remains unverified.

Required next Calendar integration: full available baseline without time/update bounds, terminal nextSyncToken persisted with its provider mirror and operations in one atomic tenant-owned generation. Native sync uses the same invariant parameters; expanded recurring occurrences remain a separate rolling materialization. A410 requires provider mirror rebuild while preserving enduring ready/retry/rejection/alias history. This design follows [Google synchronization guidance](https://developers.google.com/workspace/calendar/api/guides/sync) and [events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list); it is not yet implemented. Complete available state and continuity never imply reconstruction of disappeared historical deletions.
