# Vidysea Living Knowledge Base — live deploy (lkb-live)

## Quick Re-Run
```bash
# Health (no key)
curl -s https://34.47.136.12:8081/api/health            # expect {"db":"ok"}
# Authed sweep (key from password manager, never commit it)
K=<api key>; for r in /sessions /sources /gaps /system-status /keys /whatsapp/groups /calendar/upcoming; do
  printf "%s " $r; curl -s -o /dev/null -w "%{http_code}\n" -H "x-api-key: $K" https://34.47.136.12:8081/api$r; done
# Independent verification: NOT AUTOMATED — browser pass (Step 2) still pending, see History.
```
**Last run:** 2026-10-26 | 19 GET routes probed, 54 UI routes mapped from code | browser pass blocked

## Portal Profile
| Field | Value |
|---|---|
| URL | https://34.47.136.12:8081/ (http redirects 301 → https; nginx/1.24.0 Ubuntu) |
| Type | internal_app (React SPA + Express API on same origin, API under `/api`) |
| Intent explored | audit |
| AI involvement | Tier 0 (clean JSON API, no anti-bot) |
| Browser tool used | Playwright (headless, separate context; MCP profile was locked by another session) |
| Anti-bot | None |
| Auth | API key (`lv_` + 48 hex), stored in browser localStorage `lkbApiKey`; server keeps only sha256 in `api_keys` |
| Data format | JSON API |
| Backing DB | Mongo `<mongo-host>:27017`, db `lkb_prod` (D-186) — empty at first visit; populated from lkb_staging on 2026-10-26 |

## How it works
Login page takes an API key only (no user/password); the key carries tenant (`toc`) + scopes. Keys are minted only by
`scripts/mint-key.mjs` (first key) or from Settings → Keys (needs `/api/keys`, currently 503). No forgot/reset flow exists.

## Endpoints / URLs
```
UI: / /ask /search /explorer /brain /counsellor /sessions /sessions/:id /knowledge /knowledge/{collections,documents,documents/:id,documents/:id/pages/:page,profiles,resources,speakers,speakers/:personId,topics,topics/:id}
UI: /sources /ingest /watch /whatsapp /whatsapp/review/:id/source /calendar /join-rules /meeting-bot /notifications /automation /automation/forms
UI: /answer-review /answer-policy /answer-policies /claims /gaps /graph-confidence /calibration-review /extraction-review /label-review /transcript-review /transcript-review/:id /knowledge-outputs /championship
UI: /analytics /activity-health /ops-health /operations /jobs /status /connectors /accounts /settings /setup
API 200: /api/health /api/sessions /api/sources /api/gaps /api/system-status /api/meeting-candidates /api/watch-state /api/watched-sources /api/webinar-operations
API 200 (server HTML pages): /api/ /api/compete /api/dashboard-ui /api/docs-ui /api/sessions-ui
API 400: /api/search (needs ?q=)   API 404: /api/graph (no tree index yet)   API 404: /api/me (no such route)
API 500: /api/whatsapp/groups      API 503: /api/keys, /api/calendar/upcoming
```

## Findings (audit)
| Severity | Finding | Repro | Fix suggestion |
|---|---|---|---|
| Critical | Mongo host is reachable from the internet with no auth; db `READ__ME_TO_RECOVER_YOUR_DATA` holds a ransom note (ObjectId time ≈ 2025-10-20). Same host holds global_university_db, pathlynks_engine, lkb. | connect with the URL in local `.env` (no credentials) | firewall 27017 to app server + office IPs; enable auth; `lkb_app` user per GO-LIVE-UBUNTU §6a; audit what is missing |
| High | `lkb_prod` is empty (0 sessions/turns/tenants) — app shows nothing | `/api/system-status` | point server at the DB that holds data, or import corpus (GO-LIVE-UBUNTU.md:94) |
| High | `/api/keys` returns 503 even with an all-scopes key → Settings → Keys cannot list/mint keys | GET /api/keys | check API logs; `tenants` collection is 0 — suspected missing tenant row; generic handler at apps/api/src/server.ts:163-168 hides cause |
| High | The live key (minted 2026-10-26, label umesh-live) is NOT all-scopes: 403 on answer-policies, answer-reviews, jobs, usage, activity-health, watch-runs, notifications, automation/*, meeting-bot privacy/capture/bot-events, counsellor-accounts → 13 of 46 pages show "this key is missing … scope" | browser crawl, screenshots 02-47 | mint an `--all-scopes` operator key (needs hosting configured to manage keys from UI) |
| High | "Hosting not configured": /api/keys, calibration/extraction/label-review, operations-integrations, retention/status, calendar/join-rules → 503; Dashboard shows "API keys unavailable (hosting not configured)" | open `/` or `/settings` | set hosting config on server (GO-LIVE-UBUNTU.md:210 `LKB_HOSTING_BOOTSTRAP_ADMINS`) and restart API |
| Medium | Setup wizard: 3 ready, 4 to do — GEMINI_API_KEY and TAVILY_API_KEY not set on server (Ask has no web fallback; Gemini jobs unavailable) | `/setup` | set in server `.env`, restart API |
| Medium | `/api/whatsapp/groups` 500 | GET with key | likely WHATSAPP_MONGO_URL unset on server; return 503 "not configured" instead |
| Medium | `/connectors` shows a raw "HTTP 404" (`/api/connector-workflow` not mounted) | open `/connectors` | mount the router or hide the page |
| Medium | Login gives no feedback on an invalid key (4 calls return 401, UI unchanged) | paste wrong key → Continue (screenshot 01) | show the 401 message on the login form |
| Low | `/knowledge/profiles` renders an empty page (no heading, no API call) | open it | route to speakers/topics or remove |
| Low | Graph pages (/explorer, /brain, /knowledge, /graph-confidence, /analytics) log a 404 for `/api/graph` on empty data | open any | treat "no tree index yet" as empty state, not error |
| Low | `/api/calendar/upcoming` 503 "discovery unavailable" | GET | expected without GWS on server; UI should say "not configured" |

## Gotchas
- `http://…:8081` 301s to https on the same port.
- `/api/me` does not exist; use `/api/sessions` or `/api/system-status` to test a key.
- `mint-key.mjs --i-know-this-is-production` targets legacy `lkb`, not `lkb_prod`; for live use `MONGODB_DB=lkb_prod MONGO_WORK_DB=lkb_prod` without that flag.
- Keys are unrecoverable (hash only); re-minting with the same `--label` deletes the old one.

## Change detection
- `/api/health` 200; `/api/system-status` collection counts; `/api/keys` status.

## History
| Date | Intent | Findings | Tool | Notes |
|---|---|---|---|---|
| 2026-10-26 | audit | 6 | curl + code read | first pass, no browser |
| 2026-10-26 | audit | 13 | Playwright headless (own context, non-GET /api aborted) | 46 routes + login, screenshots + report.json in screenshots/lkb-live/; crawler: session scratchpad explore-lkb.mjs |
