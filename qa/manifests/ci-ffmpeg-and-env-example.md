# Manifest — ci-ffmpeg-and-env-example
**Contract:** none (CI / config hygiene; no frozen contract applies)
**Goal task:** none
**Date:** 2026-10-10
**Lane:** ci (branch lane/ci, from 7f352eb); lane ledger qa/issues.ci.jsonl (no issues filed)
**Backlog tier:** orchestrator-assigned unit

## What changed
- `.github/workflows/ci.yml`: job-level `timeout-minutes: 30`; new step "Install ffmpeg (provides ffprobe)" and new step "Check ffmpeg encoders", both placed after "Python validator deps" and before "Typecheck"/"Unit tests". No existing step reordered, removed or altered. No continue-on-error, no `|| true`, no test filtered, no version/cache/matrix change, no lint step touched.
- Timeout rationale: the job had none (GitHub default is 6 hours), so a hung test or stuck child process would burn 6 hours. 30 minutes is generous for one install + typecheck + test + lint job and only trips on a hang.
- `.env.example`: rewritten as a grouped, commented, complete list of the variables the code reads. All 17 previous entries kept (their original comments kept verbatim; the 6 with no reader are marked "not read by current code (verify before removing)"). No values added except the pre-existing CORS_ORIGINS localhost value.

## Exact ci.yml diff
```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index ee95152..8773deb 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -8,6 +8,9 @@ on:
 jobs:
   ci:
     runs-on: ubuntu-latest
+    # Without this a hung test (e.g. a stuck ffmpeg/browser child) runs to GitHub's 6-hour default.
+    # 30 minutes is several times the expected runtime of this single job, so it only ever trips on a hang.
+    timeout-minutes: 30
     steps:
       - uses: actions/checkout@v4
         with:
@@ -32,6 +35,24 @@ jobs:
       - name: Python validator deps
         run: python -m pip install --quiet jsonschema
 
+      # Tests shell out to ffmpeg/ffprobe (capture/record-backend remux test, upload, watch, ingest
+      # chain, process-video). ubuntu-latest does not guarantee them, so install explicitly.
+      - name: Install ffmpeg (provides ffprobe)
+        run: |
+          sudo apt-get update
+          sudo apt-get install -y --no-install-recommends ffmpeg
+
+      # The remux test needs libvpx (VP8/VP9) and libopus encoders. Fail here, with a clear message,
+      # if the packaged build lacks them, instead of as a confusing test failure later.
+      - name: Check ffmpeg encoders
+        run: |
+          ffmpeg -version
+          ffprobe -version
+          if ! ffmpeg -hide_banner -encoders | grep -E "libvpx|libopus"; then
+            echo "::error::ENVIRONMENT PROBLEM, not a test failure: this ffmpeg build lacks the libvpx/libopus encoders the record-backend remux test needs."
+            exit 1
+          fi
+
       - name: Typecheck
         run: pnpm -r typecheck
 
```

## .env.example variable table (62 variables: 17 previously listed, 45 newly added, 6 marked unused)
Method: Python scan of tracked non-test files under apps, packages, scripts, workers for `env.X`, `env["X"]`, `process.env.X`, `os.environ`/`os.getenv`, `$env:X`, plus a read of the indirect readers (`requireWorkDatabase`, queue-reader, security.mjs). Line = first read site.

| Variable | First read (file:line) |
|---|---|
| PORT | apps/api/src/server.ts:110 |
| CORS_ORIGINS | apps/api/src/composition/production.ts:205 |
| CONSENT_POLICY_DEFAULT | none found (kept; marked unused) |
| MONGODB_URL | apps/api/src/activity-health/queue-reader.ts:12 |
| MONGODB_DB | apps/api/src/index.ts:20 |
| MONGO_WORK_DB | apps/api/src/store.ts:162 |
| UPLOAD_QUEUE_DB | apps/api/src/activity-health/queue-reader.ts:12 |
| UPLOAD_TENANT_ID | apps/api/src/activity-health/queue-reader.ts:12 |
| UPLOAD_ACTOR | apps/api/src/activity-health/queue-reader.ts:12 |
| GEMINI_API_KEY | apps/api/src/composition/production.ts:130 |
| GEMINI_STT_MODEL | scripts/transcribe-long-session.mjs:118 |
| ANTHROPIC_API_KEY | none found (kept; marked unused) |
| AI_ANTHROPIC_ENABLED | none found (kept; marked unused) |
| OLLAMA_BASE_URL | apps/api/src/composition/production.ts:132 |
| SPEAKERS_OLLAMA_MODEL | apps/api/src/composition/production.ts:142 |
| WEBINAR_VISION_MODEL | scripts/webinar/process-video.mjs:227 |
| TAVILY_API_KEY | apps/api/src/ask-web-fallback.ts:57 |
| JINA_API_KEY | apps/api/src/ingest-store.ts:20 |
| FIRECRAWL_API_KEY | none found (kept; marked unused) |
| VEXA_BASE_URL | none found (kept; marked unused) |
| VEXA_API_KEY | none found (kept; marked unused) |
| LKB_CAPTURE_BACKEND | packages/meeting-bot/src/capture/record-commands.ts:66 |
| LKB_TENANT_ID | apps/api/src/gws-calendar.ts:184 |
| LKB_BOT_PROFILE_DIR | packages/meeting-bot/src/capture/record-commands.ts:19 |
| LKB_BROWSER_PROFILE_DIRECTORY | packages/meeting-bot/src/capture/browser/browser-profile.ts:25 |
| LKB_BROWSER_EXECUTABLE | packages/meeting-bot/src/capture/record-commands.ts:61 |
| LKB_PYTHON | packages/meeting-bot/src/capture/record-commands.ts:62 |
| LKB_RECORD_DIR | packages/meeting-bot/src/capture/record-commands.ts:20 |
| OBS_WS_URL | packages/meeting-bot/src/capture/record-commands.ts:119 |
| OBS_WS_PASSWORD | packages/meeting-bot/src/capture/record-commands.ts:86 |
| LKB_WEBINAR_REGISTRATION_CONFIG | packages/meeting-bot/src/joiners/browser-joiner.ts:69 |
| LKB_API_URL | packages/meeting-bot/src/calendar/schedule-tick.ts:197 |
| LKB_API_KEY | packages/meeting-bot/src/calendar/schedule-tick.ts:200 |
| TELEGRAM_BOT_TOKEN | packages/core/src/alerts/alert-sink.ts:48 |
| TELEGRAM_CHAT_ID | packages/core/src/alerts/alert-sink.ts:50 |
| NOTIFY_CHANNELS | packages/meeting-bot/src/capture/notify-channels.ts:150 |
| NOTIFY_CHANNELS_DIGEST | packages/meeting-bot/src/capture/notify-channels.ts:151 |
| NOTIFY_CHANNELS_BOT_STATUS | packages/meeting-bot/src/capture/notify-channels.ts:152 |
| AUTO_RECORD_TRUSTED_EMAILS | packages/meeting-bot/src/calendar/auto-record-policy.ts:87 |
| AUTO_RECORD_TRUSTED_DOMAINS | packages/meeting-bot/src/calendar/auto-record-policy.ts:88 |
| LKB_GMAIL_ALIASES | apps/api/src/gws-gmail.ts:283 |
| LKB_GMAIL_LABEL_IDS | apps/api/src/gws-gmail.ts:283 |
| LKB_GWS_PATH | scripts/webinar/calendar-attendance-source.mjs:63 |
| LKB_FFPROBE | scripts/webinar/calendar-attendance-source.mjs:79 |
| WATCH_HEARTBEAT_INTERVAL_MS | apps/api/src/composition/production.ts:63 |
| WATCH_HEARTBEAT_TENANTS | apps/api/src/composition/production.ts:68 |
| LKB_MAIN_TREE_ROOT | scripts/watch/lib/main-tree.mjs:9 |
| UPLOAD_INPUT_ROOT | scripts/upload/submit.mjs:76 |
| UPLOAD_OUTPUT_ROOT | scripts/upload/submit.mjs:76 |
| UPLOAD_SPOOL_ROOT | workers/transcribe/src/worker.py:64 |
| UPLOAD_PYTHON | scripts/upload/submit.mjs:31 |
| UPLOAD_FFPROBE | scripts/upload/submit.mjs:85 |
| UPLOAD_TIMEOUT_MS | scripts/upload/submit.mjs:96 |
| UPLOAD_MAX_ATTEMPTS | scripts/upload/submit.mjs:96 |
| UPLOAD_RUN_NONCE | scripts/upload/submit.mjs:92 |
| TELEMETRY_ENABLED | packages/ai/src/trace.ts:92 |
| WHATSAPP_MONGO_URL | apps/api/src/whatsapp/store.ts:22 |
| WHATSAPP_MONGO_DB | apps/api/src/whatsapp/store.ts:23 |
| WHATSAPP_TENANT_OWNER_MAP | apps/api/src/composition/production.ts:194 |
| VITE_API_BASE_URL | apps/web/src/api/client.ts:16 |
| LKB_SETUP_PYTHON | scripts/webinar/setup.mjs:14 |
| LEDGER_LOCK_WAIT_MS | scripts/qa/ledger-alloc.mjs:118 |

### Read by code but deliberately left out
- PATH, APPDATA, DISPLAY, XDG_CACHE_HOME: OS variables, not configuration.
- PROD (apps/web/src/api/client.ts:23): Vite built-in `import.meta.env.PROD`.
- NODE_ENV: only set in apps/api/Dockerfile:30; no source branches on it.
- LKB_CAPTURE_CONTROL_TOKEN, LKB_CAPTURE_CONTROL_GENERATION (reconnect-gaps.ts:101): set internally by the parent capture process for its child, not operator config.
- LKB_ARGV_DUMP, LKB_FIXTURE_EXIT, LKB_FIXTURE_MODE, LKB_FIXTURE_TICKS, LKB_FIXTURE_TICK_MS: test fixtures only.
- UPLOAD_CLAIM_MARKER: appears only in workers/transcribe/src/test_worker.py.
- Variables read only inside test files (excluded by the brief).
- Limit: reads through a differently named env object or computed key name would not be caught by the scan.

## docker-compose.yml (follow-up for the owner, not changed here)
Passes to the `api` container: MONGODB_URL (required), MONGODB_DB (default lkb), CORS_ORIGINS, GEMINI_API_KEY (required), PORT=3300. Confirmed from the file. Runtime variables the API reads that the container does NOT receive: MONGO_WORK_DB, UPLOAD_QUEUE_DB, UPLOAD_TENANT_ID, UPLOAD_ACTOR (activity-health reader fails closed), OLLAMA_BASE_URL, SPEAKERS_OLLAMA_MODEL, TAVILY_API_KEY, JINA_API_KEY, LKB_TENANT_ID (calendar), LKB_GMAIL_ALIASES, LKB_GMAIL_LABEL_IDS, WHATSAPP_MONGO_URL, WHATSAPP_MONGO_DB, WHATSAPP_TENANT_OWNER_MAP, WATCH_HEARTBEAT_INTERVAL_MS, WATCH_HEARTBEAT_TENANTS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEMETRY_ENABLED. So in the container web fallback, Ollama, WhatsApp, calendar/Gmail and alerts are off. Also the image has no ffmpeg/gws, and there is no `web` service.

## Follow-ups (not done here)
1. Docker build steps in CI (unverifiable from this machine; would add a new failure source).
2. A `web` service in docker-compose.yml.
3. Split CI into parallel jobs (typecheck, test, schema/types, lint) so one failure does not hide the rest.
4. Pass the missing runtime variables to the api container (above).
5. Remove the 6 unused .env.example entries after verification.

## UNVERIFIED
The workflow change is UNVERIFIED until the next push runs it; GitHub Actions cannot be run from this machine. Validation done: `python -I -c "import yaml..."` (PyYAML 6.0.3) parses the file; 15 steps, `timeout-minutes` = 30. After the push, look at:
- the "Check ffmpeg encoders" output (versions printed, libvpx/libopus lines listed; if it fails, the ::error:: message says the build lacks the encoders: environment problem);
- whether "Unit tests" (`pnpm -r test`) gets past packages/meeting-bot (record-backend remux tests);
- which step fails next.
`lint:structure` is expected to STAY RED (file-length budget on three files, root loose-files budget awaiting the owner, ambiguous issue-id citations): other lanes own those and this unit neither fixes nor hides them. Other tests may still fail for non-ffmpeg reasons. Existing "not read" entries were judged by name search in apps/packages/scripts/workers only.

Status: ready-for-check
Fix cycle: 0
