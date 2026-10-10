# Verdict - ci-ffmpeg-and-env-example - Cycle checked: 0

**VERDICT:** FAIL
**Cycle checked:** 0
**Commit checked:** 012b149 (base 7f352eb), lane/ci
**ISSUES-WRITTEN:** ISS-CI-001 (qa/issues.ci.jsonl)

## What I ran
- `git diff 7f352eb 012b149 --stat`: exactly `.env.example` (142 lines), `.github/workflows/ci.yml` (+21), `qa/manifests/ci-ffmpeg-and-env-example.md` (+152). Nothing else.
- Sensitive-data sweep: read every added line of .env.example and the manifest; regex scan for emails, 10+ digit runs, `C:\Users` and `\Users\` found nothing. All values are empty (`NAME=`) except `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` (pre-existing, localhost). No keys, tokens, credentialed connection strings, private hosts, chat/label/calendar ids, personal emails, phone numbers, or profile paths.
- YAML parse (PyYAML): 15 steps; indices 6 and 7 are the new steps, after checkout/pnpm/node/python/Install/Python deps and before Typecheck (8) and Unit tests (9); `timeout-minutes` = 30 at job level (`jobs.ci`). The diff is purely additive (+21, 0 removed): no step reordered, no `continue-on-error`, no `|| true`, no test filter.
- My own environment-read scan over apps/packages/scripts/workers non-test code (process.env, env.X, Python os.getenv, destructured env, `$env:`), compared with `.env.example`.

## Sensitive-data findings (nothing new)
Nothing new or real. Pre-existing identifiers already in public source, listed for completeness: .env.example says "Umesh's phone" (first name only, a comment carried over from the old file, in the Telegram alert comment); default tenant `toc` (WATCH_HEARTBEAT_TENANTS, production.ts:68); database names `lkb`, `global_university_db`, `whatsapp_msg` (store/guard names in code). The built-in trusted sender emails/domains were NOT copied: the AUTO_RECORD_TRUSTED_* comment only says "a built-in list in auto-record-policy.ts" (confirmed). The source file's own doc comment does name a partner domain, but that is in source, not in this diff.

## Encoder check - DEFECT (the FAIL reason)
`if ! ffmpeg -hide_banner -encoders | grep -E "libvpx|libopus"` succeeds when EITHER name matches. A build with libvpx but no libopus (or the reverse) passes the guard. The remux test (record-backend.test.ts:22) uses `-c:v libvpx -c:a libopus`, so it needs both, and each must be checked separately. The failure path itself is correct (explicit `::error::` then `exit 1`; `if !` is unaffected by `set -e`; pipefail is harmless because grep reads all input). Also, `libvpx` as a substring matches `libvpx-vp9`, so a VP9-only build would pass; the test needs plain `libvpx` (VP8). Filed as ISS-CI-001 (medium) with a fix direction. Practical impact is small (the standard Ubuntu ffmpeg has both) but the step exists to give an unambiguous diagnostic, and per the verdict criteria "the encoder check can pass with a required encoder missing" is a FAIL.

## ffmpeg availability
Ubuntu's packaged `ffmpeg` is built with libvpx and libopus: confidence about 95%. The check step exists to catch it otherwise (once it tests both). `--no-install-recommends` is fine; ffprobe ships in the same package. record-commands.test.ts uses native mpeg4/aac encoders and self-skips if ffmpeg is absent.

## 30-minute timeout
Plausible, no hard data. apt (~1 min) + pnpm install (1-2) + typecheck of all packages (2-4) + all tests (many spawn node/ffmpeg/python; 5-15) + lints (1-2) is likely 10-20 minutes on a hosted runner, so 30 is probably enough with moderate margin. A too-low value would itself turn CI red; I would prefer 45 until there is run history. Not a defect.

## .env.example accuracy
All sampled variables, plus every calendar/Gmail, meeting-bot and telemetry variable, were checked against source at the cited lines. Spelling, case, defaults and required/optional matched on all of them.

| Variable | Source check | Result |
|---|---|---|
| PORT | server.ts:110 default 3300 | OK |
| CORS_ORIGINS | production.ts:205, empty-list default | OK |
| MONGODB_URL | index.ts:20 default mongodb://localhost:27017; scripts have none | OK |
| MONGODB_DB | index.ts:20 default "lkb" | OK |
| MONGO_WORK_DB | store.ts:162; scripts refuse without | OK |
| UPLOAD_QUEUE_DB | queue.mjs:35 regex upload_queue_ + 8-55 chars | OK |
| UPLOAD_TENANT_ID, UPLOAD_ACTOR | queue-reader.ts:12, queue.mjs | OK |
| GEMINI_API_KEY | production.ts:130 default "" | OK |
| OLLAMA_BASE_URL | production.ts:132 passes undefined (provider default) | OK |
| SPEAKERS_OLLAMA_MODEL | production.ts:142 "qwen3:8b" | OK |
| WEBINAR_VISION_MODEL | process-video.mjs:227 also needs GEMINI_API_KEY | OK |
| TAVILY_API_KEY, JINA_API_KEY | ask-web-fallback.ts:57, ingest-store.ts:20 | OK |
| WATCH_HEARTBEAT_INTERVAL_MS | production.ts:63, 1 hour fallback | OK |
| WATCH_HEARTBEAT_TENANTS | production.ts:68 default "toc" | OK |
| WHATSAPP_MONGO_URL, _DB | store.ts:22-23 defaults match | OK |
| LKB_PYTHON, LKB_RECORD_DIR | record-commands.ts:62, :20 | OK |
| LKB_CAPTURE_BACKEND | record-commands.ts:66 default "tab"; obs win32-only | OK |
| OBS_WS_URL, OBS_WS_PASSWORD | default ws://127.0.0.1:4455; password required for obs | OK |
| LKB_BROWSER_PROFILE_DIRECTORY | browser-profile.ts:25 | OK |
| LKB_API_URL, LKB_API_KEY | schedule-tick.ts:197-200 default http://localhost:3300 | OK |
| TELEGRAM_BOT_TOKEN, _CHAT_ID | alert-sink.ts:48-50, both needed | OK |
| NOTIFY_CHANNELS, _DIGEST, _BOT_STATUS | notify-channels.ts:150-152 default telegram | OK |
| AUTO_RECORD_TRUSTED_EMAILS, _DOMAINS | auto-record-policy.ts:87-88 built-in default | OK |
| LKB_GMAIL_ALIASES, _LABEL_IDS | gws-gmail.ts:283; empty = no filter; invalid throws | OK |
| LKB_TENANT_ID | gws-calendar.ts:184 (owner mismatch error if unset) | OK |
| LKB_GWS_PATH, LKB_FFPROBE | calendar-attendance-source.mjs:63,79 defaults match; must be absolute | OK |
| TELEMETRY_ENABLED | trace.ts:92 exactly "true", case-insensitive | OK |
| UPLOAD_SPOOL_ROOT | worker.py:64 | OK |

Unused entries (6): CONSENT_POLICY_DEFAULT, ANTHROPIC_API_KEY (appears only in one test file), AI_ANTHROPIC_ENABLED, FIRECRAWL_API_KEY, VEXA_BASE_URL, VEXA_API_KEY. Repo-wide `git grep` (including yml, Dockerfile, .py, .ps1) finds no non-test, non-doc reader. Marking confirmed.

Misses: no operator-configuration variable is missing. Extra names my scan surfaced are internal and not in the manifest's "left out" list, a minor omission only: CLAUDE_CODE_MAX_OUTPUT_TOKENS / _MAX_TURNS / _MAX_RETRIES / _DISABLE_CLAUDE_MDS (set by ai-transport.ts for a child CLI) and COREPACK_* / PIP_CACHE_DIR (set by scripts/webinar/setup.mjs for its child).

## Predicted next CI failures (UNVERIFIED; I did not run CI)
One push will not necessarily turn CI green:
1. `pnpm lint:structure` stays red as the manifest says (and any earlier "Unit tests" failure hides it, since steps run in sequence).
2. apps/api/src/activity-health/router.test.ts:137 runs `.venv/Scripts/python.exe` (a Windows venv path) unless D2_FIXTURE_PYTHON is set.
3. scripts/webinar/start-calendar-attendance.test.mjs and start-record-detached.test.mjs call PowerShell; scripts are likely Windows-oriented.
4. scripts/upload/queue.test.mjs:141 spawns the python worker.py (needs pymongo and Google deps; CI installs only jsonschema).
5. packages/meeting-bot/src/joiners/joiners.test.ts:76 runs python with a probe (needs the browser-automation python deps).
6. Guarded (should skip or branch): transcript-qa-report.test.ts:169 (`cmd /c`), controller-state.test.ts:132, ledger-alloc-fix1.test.mjs icacls test (skip off win32).
7. Any test needing a live mongod would fail (not checked).

## Manifest accuracy
Accurate on the diff and the 17/45/6 counts. It states plainly that the workflow change is UNVERIFIED until it runs on GitHub and that `lint:structure` is expected to stay red. Its description of the encoder step as guarding libvpx/libopus is the overstatement that ISS-CI-001 contradicts.

## EXPLANATION
Sensitive-data review: clean. .env.example: accurate on everything checked. ci.yml: valid, additive, correctly placed, timeout at job level. The one defect is that the encoder guard is an OR, not an AND, so a missing required encoder can slip through and surface later as the same confusing test failure the step was written to prevent. Small fix: check each encoder separately (and anchor `libvpx` so `libvpx-vp9` does not satisfy it). Cycle 0 FAIL; re-check after that one-step fix.
