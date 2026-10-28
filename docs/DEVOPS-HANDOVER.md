# DevOps handover: deploy LKB on the Ubuntu server

Audience: the Vidysea devops team. You deploy LKB on the Ubuntu server and own server and
MongoDB security. Written 2026-10-28 from the owner's decisions in
`qa/gates/golive-decisions-2026-10-28.md` (batch 2). No secret values appear here; this file
names variables only. Values come from the owner (Umesh) by a private channel, never chat or git.

The step-by-step deploy procedure is `docs/GO-LIVE-UBUNTU.md` (the "guide"). This file adds
ownership, ordering and the security checklist. Where the two differ, the guide is the procedure
and the exceptions are listed in section 2.

## 1. Decisions that shape your work

| Topic | Decision |
|---|---|
| Server and Mongo security | Devops owns it. Mongo hardening comes FIRST (section 3). |
| T-028 hosting vars | All five go in the main `.env` (not `.env.t028`). See section 2. |
| Pipeline | Runs on the same Ubuntu server. Deployed by `git pull` of the repo. See section 8. |
| WhatsApp | Ships at launch. Required vars and remaining work: `docs/WHATSAPP-GOLIVE-GAP.md` (being written in parallel; follow that file, this one does not repeat it). |
| Domain name | PENDING from Umesh. Shown below as `<DOMAIN-PLACEHOLDER>`. See section 4. |
| Live database | `lkb_prod`, user `lkb_app` (guide sections 6a, 8). `lkb_staging` is the pipeline's current target until cutover. |
| Consent-withdraw route | Out of scope for launch (ISS-W6-001 deferred). |

## 2. The five T-028 variables (all five or none)

T-028 turns on counsellor accounts, `/keys`, `/hosting`, `/webhooks`. Set all five in the main
`.env`. A compose change is being built so the `api` container reads them from `.env`. Until it is
merged to the branch you deploy, the compose file reads them only from `.env.t028`
(`docker-compose.yml` lines 72-77); check with the owner which version you are deploying.

| Name | Value shape |
|---|---|
| `LKB_HOSTING_STATE_DIR` | `/var/lib/lkb/hosting` (the named volume `lkb-hosting-state`) |
| `LKB_COUNSELLOR_STATE_DIR` | `/var/lib/lkb/counsellor` (volume `lkb-counsellor-state`); must differ from the previous one |
| `LKB_HOSTING_ENCRYPTION_KEY` | exactly 64 hex characters: `openssl rand -hex 32` (NOT base64, which is rejected) |
| `LKB_HOSTING_BOOTSTRAP_ADMINS` | JSON, single-quoted: `'{"toc":["<key-id>"]}'`. The operator admin key id is in guide section 0 |
| `LKB_HOSTING_WEBHOOK_ORIGINS` | JSON array, single-quoted, https origins only: `'["https://<DOMAIN-PLACEHOLDER>"]'` |

Rules:
- All five must be set together. A blank or partial set (even one empty string) makes every
  authenticated route return 503. If in doubt, leave all five absent: T-028 is then off and
  everything else works (`/api/keys` answers 503 `hosting_unavailable` by design).
- Generate the encryption key once. Back it up with the two state volumes. Losing it makes stored
  account data unreadable. Never commit it.
- After editing: `docker compose up -d --build api`.

## 3. Checklist (owner = devops). Do in this order.

Mongo hardening is first because this host was hit on 2026-10-26: it accepted internet
connections with no credentials and held a database `READ__ME_TO_RECOVER_YOUR_DATA` with a
ransom note (automated attack on open MongoDB). Do not pay or contact the sender. The same host
holds other Vidysea databases, so their owners must be told.

### A. MongoDB host (owner: devops) -- FIRST
- [ ] Inventory every database on the host, compare against backups, restore anything missing or altered, and tell the owners of the other databases.
- [ ] Network: bind `mongod` to a private interface only (`net.bindIp`), never `0.0.0.0`. Firewall 27017 to allow only the app server IP (and named office/admin IPs if needed). Never expose 27017 publicly.
- [ ] Authentication: set `security.authorization: enabled` and restart. Create an admin user FIRST (guide 6a, replica-set steps 4-5 explain the lock-out risk with `keyFile`).
- [ ] Least-privilege users, one per database, `readWrite` on that single DB only:
  - `lkb_app` on `lkb_prod` (guide section 6a)
  - a separate user for `lkb_staging`
  - no shared or root credentials in app `.env` files.
- [ ] TLS on Mongo connections (`net.tls`), and add the matching option to `MONGODB_URL`.
- [ ] Rotate every credential that existed before the incident, including any that were ever in a `.env`, chat or the bot machine. Update `MONGODB_URL` on the server and on any other machine that connects.
- [ ] Backups: scheduled `mongodump` (or snapshots) of `lkb_prod` and `lkb_staging`, stored off the Mongo host. Run a RESTORE TEST into a scratch database and record the date.
- [ ] Topology decision: standalone works for Ask with a caveat; a one-node replica set is recommended (guide 6a). WhatsApp review store/decide, invalidation and the quarantine audit return 503 on a standalone (guide 6a), so check `docs/WHATSAPP-GOLIVE-GAP.md` before choosing standalone for a WhatsApp launch.
- [ ] Verify from outside: `mongosh` to 27017 from a non-allowed IP must time out; from the app server with credentials it must ping.

### B. Server firewall (owner: devops)
- [ ] Default deny inbound. Allow 80 and 443 from anywhere; SSH (22 or your port) only from admin IPs.
- [ ] Port 3300 (API) not public if the reverse proxy fronts it (compose publishes 3300; restrict with the firewall or bind it to localhost).
- [ ] No Mongo port open on this server. `local-mongo` (compose profile `local-dev`, port 27018) must never be started on this server.
- [ ] SSH key-only, root login off, unattended security updates on. Docker-published ports bypass `ufw` rules. Verify with an external port scan, not just `ufw status`.

### C. TLS (owner: devops) -- needs the domain
- [ ] Decided (guide section 8): Let's Encrypt behind the team's proxy. Caddy (automatic certs) or nginx plus `certbot`, in front of web (port 80 container) and the API.
- [ ] Open 80/443 for the ACME challenge. Redirect http to https. No plain HTTP with real keys.
- [ ] Current live layout (guide section 0): nginx serves the UI and proxies the API under `/api` on one origin. Keep that shape unless the owner changes it.
- [ ] Test auto-renewal (`certbot renew --dry-run` or Caddy logs).

### D. Environment file (owner: devops, values from owner)
- [ ] `cp .env.example .env && chmod 600 .env`. Never commit it; never paste values in chat or tickets.
- [ ] Fill the groups in section 5. Required by compose: `MONGODB_URL`, `MONGODB_DB`, `OLLAMA_API_KEY`.

### E. Build and start (owner: devops)
- [ ] `docker compose version` is v2.24 or newer.
- [ ] `docker compose build api web` then `docker compose up -d api web` then `docker compose ps` (guide section 3).
- [ ] Do NOT run `docker compose --profile migrate run --rm migrate` against `lkb_prod`: it needs separate human approval and the guard refuses `lkb_prod` (guide section 6). `lkb_prod` is already populated.

### F. Smoke test (owner: devops)
From guide section 7:
```sh
curl -fsS  http://localhost:3300/health                                   # 200, {"db":"ok"}
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3300/brain      # 401 without a key
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost/               # 200 (UI)
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost/sessions       # 200 (SPA route)
```
Then, with the owner's key (guide section 0 step 5):
`curl -s -H "Authorization: Bearer <key>" https://<DOMAIN-PLACEHOLDER>/api/system-status`
shows non-zero `sessions`; `/api/keys` returns 200 once T-028 is set. In a browser from another
machine, load the UI and confirm no CORS errors in the console.

### G. Operations (owner: devops)
- [ ] Log retention for `docker compose logs` (section 6) and alerting on `/health`.
- [ ] Backup of the Docker volumes `lkb-hosting-state`, `lkb-counsellor-state`, `lkb-join-rules-state`, and the encryption key.

## 4. Domain (PLACEHOLDER)

The domain name is pending from Umesh. `<DOMAIN-PLACEHOLDER>` is not a real value; do not invent
one. When it arrives it feeds four places, and changing it later means a web rebuild:

| Where | What it does |
|---|---|
| `CORS_ORIGINS` | exact browser origin(s) with scheme, e.g. `https://<DOMAIN-PLACEHOLDER>`. An unlisted origin is blocked by the API. |
| `VITE_API_BASE_URL` | URL the BROWSER uses to reach the API; baked into the web bundle at build time. Changing it requires `docker compose build web`. Same-origin production setups may leave it empty (see `.env.example`). |
| `LKB_HOSTING_WEBHOOK_ORIGINS` | https origins allowed for webhooks (T-028). |
| TLS certificate and proxy config | `certbot -d` / Caddy site name. |

Also `LKB_API_URL=https://<DOMAIN-PLACEHOLDER>/api` on any bot or worker machine.

## 5. `.env` variable names by feature (names only)

Source: `.env.example` and `docker-compose.yml`. Compose forwards only the names it lists to the
`api` container; the rest belong to the pipeline/bot/scripts and are read by the host-side processes.

**Database (api, required)**: `MONGODB_URL`, `MONGODB_DB` (= `lkb_prod`, no default).
`MONGO_WORK_DB` (isolated work DB for scripts; see section 9). `LKB_ALLOW_STAGING` (exact opt-in
for `lkb_staging`). `LKB_I_KNOW_THIS_IS_PRODUCTION` (production opt-in; not human approval).
`LKB_MONGO_STANDALONE` (optional topology override).

**API server and web**: `PORT` (3300), `CORS_ORIGINS`, `WEB_PORT` (set 80), `VITE_API_BASE_URL`.

**AI providers**: `OLLAMA_API_KEY` (required, runtime only), `OLLAMA_CLOUD_BASE_URL`,
`OLLAMA_CLOUD_MODEL`, `OLLAMA_CLOUD_VERIFIER_MODEL`, `GEMINI_API_KEY` (audio transcription,
embeddings), `GEMINI_STT_MODEL`, `OLLAMA_VISION_MODELS`, `WEBINAR_VISION_MODEL`,
`LKB_VISION_ROUTED`, `LKB_KEYFRAME_OCR`.

**Web search**: `TAVILY_API_KEY` (without it Ask has no web fallback), `JINA_API_KEY`.

**T-028 hosting (all five together)**: `LKB_HOSTING_STATE_DIR`, `LKB_COUNSELLOR_STATE_DIR`,
`LKB_HOSTING_ENCRYPTION_KEY`, `LKB_HOSTING_BOOTSTRAP_ADMINS`, `LKB_HOSTING_WEBHOOK_ORIGINS`.

**Calendar/Gmail worker (D-192, guide last section)**: `LKB_CALENDAR_WORKER_ENABLED`,
`LKB_CALENDAR_WORKER_BINDINGS`, `LKB_JOIN_RULES_ENABLED`, `LKB_JOIN_RULES_STATE_DIR`.

**WhatsApp**: `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP`; the
authoritative list and what remains is `docs/WHATSAPP-GOLIVE-GAP.md`.

**Meeting bot and autojoin (pipeline host)**: `LKB_CAPTURE_BACKEND` (use `tab` on Linux),
`LKB_TENANT_ID`, `LKB_API_URL`, `LKB_API_KEY`, `LKB_BOT_PROFILE_DIR`, `LKB_BROWSER_EXECUTABLE`,
`LKB_PYTHON`, `LKB_GWS_PATH`, `LKB_FFPROBE`, `LKB_RECORD_DIR`, `LKB_JOIN_RULES_ENFORCE`,
`LKB_AUTOJOIN_DISCOVERY`, `LKB_AUTOJOIN_WEBINARS`, `LKB_AUTOJOIN_CAREER_PRIORITY`,
`LKB_AUTOJOIN_TEST_DATA_ROUTING`, `LKB_AUTOJOIN_CONFIG`, `LKB_CAREER_TOPICS_FILE`,
`LKB_WEBINAR_REGISTRATION_CONFIG`.

**Alerts and notifications**: `LKB_ALERT_EMAIL`, `LKB_ALERT_DASHBOARD`, `LKB_ALERT_CALENDAR`,
`LKB_ALERT_EMAIL_TO`, `LKB_ALERT_EMAIL_TEST_DATA`, `LKB_ALERT_EMAIL_PER_HOUR`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTIFY_CHANNELS`, `NOTIFY_CHANNELS_DIGEST`,
`NOTIFY_CHANNELS_BOT_STATUS`.

**Gmail/calendar intake**: `AUTO_RECORD_TRUSTED_EMAILS`, `AUTO_RECORD_TRUSTED_DOMAINS`,
`LKB_GMAIL_ALIASES`, `LKB_GMAIL_LABEL_IDS`.

**Upload pipeline**: `UPLOAD_QUEUE_DB`, `UPLOAD_TENANT_ID`, `UPLOAD_ACTOR`, `UPLOAD_INPUT_ROOT`,
`UPLOAD_OUTPUT_ROOT`, `UPLOAD_SPOOL_ROOT`, `UPLOAD_PYTHON`, `UPLOAD_FFPROBE`,
`UPLOAD_TIMEOUT_MS`, `UPLOAD_MAX_ATTEMPTS`, `UPLOAD_RUN_NONCE`.

**Watchers**: `WATCH_HEARTBEAT_INTERVAL_MS`, `WATCH_HEARTBEAT_TENANTS`, `LKB_MAIN_TREE_ROOT`.

**Other**: `TELEMETRY_ENABLED`, `TELEMETRY_TRACE_FILE`, `LKB_LABEL_REVIEW_DIR` (the label-review
route answers 503 until set), `LKB_CHAMPIONSHIP` (leave unset).

Names marked "not read by current code" in `.env.example` (`ANTHROPIC_API_KEY`,
`AI_ANTHROPIC_ENABLED`, `VEXA_*`, `FIRECRAWL_API_KEY`, `CONSENT_POLICY_DEFAULT`) need no value.

## 6. Logs and diagnosis

- API and web: `docker compose logs api`, `docker compose logs web` (add `-f --tail 200`).
- The API entrypoint prints which required variables are `set` or `MISSING` (never values). Read this first when the container is unhealthy.
- Store failures on Ask return 503 `store_unavailable`; the real cause is in the api log with secrets redacted.
- Container state: `docker compose ps`. Health: `curl -fsS http://localhost:3300/health` (fails if Mongo does not ping).
- Persistent state lives in named Docker volumes (`docker volume ls | grep lkb`), not in the repo.
- Pipeline logs: wherever the pipeline runner on this host writes them (section 8); decide the path and add it to log retention.

## 7. Update and rollback

Update (guide, "Update / rollback"):
```sh
git pull && docker compose build api web && docker compose up -d api web
```
Rollback: note the running commit first (`git rev-parse HEAD`, and `docker image ls`). To roll
back, `git checkout <previous-commit>` (or `git revert <bad-commit>` on the deployed branch),
then repeat the build and up commands. If you tagged the previous images before building,
`docker compose up -d` with those tags is faster. Database migrations are NOT reversed by a code
rollback; restore from backup if a data change must be undone. If a `.env` change caused the
problem, restore the previous `.env` and `docker compose up -d --build api`.

## 8. Pipeline on this server (open items for devops and owner)

Decision: the pipeline already runs on the Ubuntu server; code is pushed to git and the server
runs `git pull`, then runs everything. Notes:
- The compose stack runs only `api` and `web`. The scheduler, watchers, meeting bot, capture and the Python transcription worker are separate processes run from the repo with Node/pnpm, Python, ffmpeg and the `gws` CLI (guide section 5).
- Guide section 5 still says a headless Linux bot run is UNTESTED and the bot lived on a Windows host. Linux needs a display (`xvfb-run` or a desktop session), `LKB_CAPTURE_BACKEND=tab`, and path overrides (`LKB_PYTHON`, `LKB_GWS_PATH`, `LKB_FFPROBE`). Confirm with the owner what is already running before changing it.
- The pipeline currently writes `lkb_staging`. Cutover to `lkb_prod` (owner decision: three-part production opt-in in `scripts/webinar/sync-session.mjs`, decision entry first) is a separate gated change; do not point pipeline processes at `lkb_prod` until the owner confirms it landed.
- Keep one `.env` per process owner; the pipeline user and the Docker `api` should use different Mongo users where possible.

## 9. What NOT to do

- Never expose Mongo 27017 to the internet, and never run Mongo without authentication.
- Never point `MONGO_WORK_DB` at `lkb_prod` (or `lkb`) without a decision-log entry authorizing it. It must be a separate isolated database; the scripts refuse `lkb`, `lkb_prod` and `global_university_db`.
- Never run the `migrate` profile against `lkb_prod`; never set `LKB_I_KNOW_THIS_IS_PRODUCTION=1` as a way to "unblock" a guard. It is a capability, not approval.
- Never mint another admin key (`scripts/mint-key.mjs`) unless the owner asks; one exists (guide section 0).
- Never create a partial T-028 set (blank or one-to-four of five variables).
- Never commit, paste in chat, or print `.env`, Mongo passwords, `OLLAMA_API_KEY`, API keys or the encryption key. Ask the owner for values privately.
- Never start the compose `local-dev` profile (`local-mongo`) on this server.
- Never use `docker compose down -v` or delete the named volumes; they hold hosting and counsellor state.
- Do not serve real keys over plain HTTP, and do not rename a target database to get past a script guard.

## 10. Who to ask
Owner and Approver: Umesh (values, domain, key ids, production writes, cutover approval). Deep reference: `docs/docker-deployment.md`; live-app audit: `references/portals/lkb-live.knowledge.md`; WhatsApp: `docs/WHATSAPP-GOLIVE-GAP.md`.
