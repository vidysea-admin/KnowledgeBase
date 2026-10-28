# Vidysea Living Knowledge Base — live deploy (lkb-live)

## Quick Re-Run
```bash
# Health (no key)
curl -s https://34.47.136.12:8081/api/health            # expect {"db":"ok"}
# Authed sweep (key from password manager, never commit it)
K=<api key>; for r in /sessions /sources /gaps /system-status /keys /whatsapp/groups /calendar/upcoming; do
  printf "%s " $r; curl -s -o /dev/null -w "%{http_code}\n" -H "x-api-key: $K" https://34.47.136.12:8081/api$r; done
# Browser pass: Playwright, logged-in session, non-GET /api aborted; crawler inline in History row 2026-10-26 #4.
# Independent verification: NOT AUTOMATED — page verdicts are read from rendered text + network status, re-check by screenshots 70-117.
```
**Last run:** 2026-10-26 | 48 UI routes crawled logged-in (45 sidebar + 3 deep) | 30 work, 18 degraded/broken

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
| Backing DB | Mongo `<mongo-host>:27017`, db `lkb_prod` (D-186) — populated 2026-10-26: 22 sessions, 3,165 turns, 1,768 claims, 1,828 chunks, 105 topics, 1,126 jobs; 31 of 43 collections empty (tenants 0, speakers 0, graph_edges 0) |

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
| High | Mongo host has no auth (connects with no credentials). Umesh confirmed 2026-10-26 it is IP-allowlisted, so not open to the whole internet; the ransom-note db `READ__ME_TO_RECOVER_YOUR_DATA` (ObjectId time ≈ 2025-10-20) likely predates that lock. Same host holds global_university_db, pathlynks_engine, lkb. | connect with the URL in local `.env` (no credentials) from an allowlisted IP | keep the IP lock; still enable auth + `lkb_app` user per GO-LIVE-UBUNTU §6a; audit what the ransom event removed |
| High | Meeting bot joins nothing on the live server: `/api/calendar/upcoming` 503 "discovery unavailable", `/api/calendar/join-rules` 503 "storage not configured", bot-events/capture-readiness/privacy 503, and the drive/gmail/calendar watchers have never polled (`/watch`, heartbeats null) | open `/calendar`, `/meeting-bot`, `/watch` | install + OAuth the `gws` CLI on the server, configure the bot host and join-rules storage, start `run-watch.mjs` |
| Medium | Calendar discovery supports ONE mail id: the `gws` CLI's OAuth account (dev machine: umeshsugara@vidysea.com), reading only its `primary` calendar, tied to one tenant `LKB_TENANT_ID` (apps/api/src/gws/gws-calendar.ts:17-19, 93, 196-201). No UI or env var adds more accounts; `LKB_GMAIL_ALIASES` only adds aliases of the same mailbox for the Gmail scan | read the code | for more mail ids today: invite/forward meetings to the bot account's calendar; true multi-account needs a code change (list of calendarIds or per-account OAuth) |
| Medium | Join rules are stored but not enforced (`LKB_JOIN_RULES_ENFORCE` off) — once discovery works, the bot may join every meeting with a link on that calendar | `/join-rules` banner | decide rules, then set `LKB_JOIN_RULES_ENFORCE` |
| ~~High~~ Fixed | `lkb_prod` was empty — populated 2026-10-26 (22 sessions). Still 0 `tenants` rows, which may be why hosting endpoints 503 | `/status` | add the tenant row with the hosting config |
| Medium | 2 of 22 sessions have Index: FAILED (Visa Blueprint Part 2; Funding Dreams) → missing from tree search | `/sessions` | re-run index stage for those two |
| Low | `/analytics` renders the Developer API page (same as /api/docs-ui) | open `/analytics` | wire the analytics view or rename the link |
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

## Page matrix (2026-10-26, after lkb_prod populated)
WORKING (data renders, all GETs 2xx): /sessions (22; 20 index done, 2 index FAILED), /sessions/:id, /ask, /answer-policy,
/answer-review, /knowledge, /knowledge/{documents,collections,topics,resources,speakers}, /knowledge-outputs, /search,
/brain, /explorer, /graph-confidence, /gaps (0), /sources (22), /ingest, /claims (1,768), /jobs (49 done, 1 failed),
/status, /notifications, /watch (renders, but all 3 watchers SILENT), /counsellor, /championship, /transcript-review,
/api/compete, /api/docs-ui, /analytics (shows the Developer API page, not analytics).
PARTIAL (page loads, one panel 503): / dashboard (/keys), /operations (/operations-integrations{,/preview}, /activity-health),
/calendar (/calendar/upcoming, /calendar/join-rules), /setup (join-rules), /ops-health (activity-health), /meeting-bot
(privacy, capture-readiness, calendar/upcoming, bot-events, retention/status).
BROKEN (main content fails): /settings (/keys 503), /accounts (/counsellor-accounts 503), /automation + /automation/forms
(5× 503), /calibration-review, /extraction-review, /label-review (503 each), /activity-health (503), /join-rules (503),
/whatsapp (/whatsapp/groups 500), /connectors (/connector-workflow 404), /knowledge/profiles (blank page).
Root causes, 3 buckets: (1) hosting config not set → every 503 above; (2) WhatsApp Mongo not configured → 500; (3) code
gaps → connector-workflow router not mounted, /knowledge/profiles empty route. NOT TESTED: Ask/Compete answer generation,
Ingest, upload (POST, aborted by design).

## Functional tests (2026-10-26, real writes, Umesh-approved)
| Feature | Result | Evidence |
|---|---|---|
| Search | works, 200, relevant passages | shot 121 |
| Ingest URL | works: 201, 38 turns, 74 s, transcript+index done, summary generated (session 61ceadcd-…, Wikipedia CAT) | shots 124-125 |
| Ask | partial: right source retrieved, verdict ambiguous, candidate withheld for review, ~2 min | shot 120 |
| AI counsellor | broken: 0 sources, verdict incorrect "stale"; answer-workflow.ts:144/157 wipes sources when post-generation evidence verification fails | shot 122 |
| Knowledge outputs | broken: POST 422 `unavailable`; all claims are `needs-review` (In-Focus 43/43) + conservative default policy refuses (service.ts:32) | shot 123 |
| Meeting bot send-now | broken: POST /calendar/send-now 503 `send_now_unavailable` — no launcher mounted (send-now.ts:184-190); needs hosting env + bot host (GO-LIVE-UBUNTU.md:107, 236-253) | shot 126 |
| Calendar event creation for test | blocked: local gws OAuth has calendar.readonly only | — |
| Compete | not tested: page asks for the API key in its own form | — |

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
| 2026-10-26 | audit (meetings) | 3 new | Playwright headless, admin key, non-GET aborted | /calendar /join-rules /meeting-bot /watch /settings /setup /accounts /whatsapp; screenshots 60-67 + report-meetings.json; Mongo finding downgraded (IP-locked per Umesh) |
| 2026-10-26 | audit (full, post-data) | 18 broken/degraded of 48 | Playwright MCP, user-logged-in key, non-GET aborted | screenshots 70-117; page matrix below |
| 2026-10-26 | functional (writes) | 3 broken, 1 partial, 2 working | Playwright MCP | Ask/counsellor/ingest/outputs/send-now exercised; root causes: claims all needs-review, hosting env unset, no bot launcher; no server SSH from dev box |
