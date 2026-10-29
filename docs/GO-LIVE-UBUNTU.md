# Go live on Ubuntu (Docker Compose, from `master`)

One doc, one path: API (port 3300) + web (nginx, port 80) from the root `Dockerfile`.
Deeper reference: `docs/docker-deployment.md`. No secrets belong in this file or in git.

Status of this guide: the api and web sections were written from a static review of `Dockerfile`, `docker-compose.yml`
and the package scripts; run the checks below once and report anything that fails. The meeting-bot section (5) is
different: its image, doctor mode and container smoke were built and run, see the status line there.

## 0. Live deployment: state and remaining DevOps steps (as of 2026-10-26)
The app is deployed and reachable over HTTPS; nginx serves the UI and proxies the API under `/api`
on the same origin. Checked from outside on 2026-10-26: `/api/health` returns `{"db":"ok"}`.

Already done (do NOT redo):
- `lkb_prod` was populated on 2026-10-26 by copying `lkb_staging` (all collections and their indexes,
  including `migrations_changelog`; `api_keys` NOT copied). Counts matched source: 23 sessions,
  3238 turns, 1828 chunks, 1768 claims, 105 topics. Section 6 `migrate` therefore finds the DB
  already migrated. The local pipeline still writes `lkb_staging`; new data does not reach live
  until it writes `lkb_prod`.
- An operator admin key (all scopes, tenant `toc`, label `umesh-admin`) exists in `lkb_prod`. Its key
  id, for `LKB_HOSTING_BOOTSTRAP_ADMINS` in section 9, is `ab8eb0de-d7c9-43cc-8b3d-b1122065a943`.
  The raw key is held by the owner only. Do not mint another `first-key` unless the owner asks.

Remaining, in this order:
1. **MongoDB security, urgent.** On 2026-10-26 the Mongo host accepted connections from the internet
   with no credentials, and contained a database named `READ__ME_TO_RECOVER_YOUR_DATA` holding a
   ransom note (an automated attack on open MongoDB). Do not pay or contact the sender. Do:
   firewall port 27017 to the app server and office IPs only; create the `lkb_app` user and enable
   authorization (section 6a); update `MONGODB_URL` on the server (api and bot `.env`) and on any other machine that connects, such as the existing Windows bot host; check
   every database on that host for missing data and restore from backup where needed. The same
   host holds other Vidysea databases, so their owners must be told.
2. **Hosting (T-028), optional.** Without it, Settings → Keys and the Dashboard key tile show
   "API keys unavailable (hosting not configured)" (`/api/keys` → 503); everything else works.
   To enable, add all five names from section 9 to the main server `.env`, using
   `LKB_HOSTING_BOOTSTRAP_ADMINS='{"toc":["ab8eb0de-d7c9-43cc-8b3d-b1122065a943"]}'` and the app's
   https origin in `LKB_HOSTING_WEBHOOK_ORIGINS`, then `docker compose up -d --build api`.
   All five or none: a partial set makes every authenticated route return 503.
3. **Provider keys.** Setup wizard (`/setup`) reports `GEMINI_API_KEY` and `TAVILY_API_KEY` unset on the
   server. Without Tavily, Ask has no web fallback. Add them to the server `.env`, restart api.
4. **WhatsApp (ships at launch).** `/api/whatsapp/groups` returns 500 until the main `.env` has
   `WHATSAPP_MONGO_URL` (and `WHATSAPP_MONGO_DB`); `WHATSAPP_TENANT_OWNER_MAP` grants each tenant its
   owner (JSON array, see `docs/whatsapp/SETUP.md`). Compose forwards the three names from `.env`;
   an absent name stays undefined in the container (then `docker compose up -d --build api`).
5. Verify (with the owner's key):
   `curl -s -H "Authorization: Bearer <key>" https://<server>/api/system-status` shows non-zero
   `sessions`, and `/api/keys` returns 200 once step 2 is done.

Full page-by-page audit of the live app: `references/portals/lkb-live.knowledge.md`.

## 1. Prerequisites
- Ubuntu 22.04+ with Docker Engine and Docker Compose v2.24 or newer (`docker compose version`).
  Older compose is untested with `docker-compose.yml`. Upgrade:
  `sudo apt-get update && sudo apt-get install --only-upgrade docker-compose-plugin` (Docker's apt repo).
- Outbound HTTPS (npm, GitHub release download of yt-dlp during build, Ollama Cloud).
- A reachable MongoDB (NOT containerized by default) and an Ollama Cloud key.
  A MongoDB replica set (a single-node replica set is fine) is RECOMMENDED but no longer required: a
  standalone `mongod` works for Ask with a consistency caveat, see section 6a.
- Node/pnpm on the host only if you run the key-minting script (section 6).

## 2. Clone and configure
```sh
git clone https://github.com/<org>/KnowledgeBase.git && cd KnowledgeBase
git checkout master            # use ae5e2e71 or later
cp .env.example .env && chmod 600 .env
```
Set in `.env` (names only; get values from the owner):
- `MONGODB_URL` required. Mongo connection URI with the product's dedicated user
  (section 6a). Placeholder: `mongodb://lkb_app:<PASSWORD>@<mongo-host>:27017/lkb_prod?authSource=lkb_prod`.
- `MONGODB_DB=lkb_prod` required, no default. D-186 authorizes the deployed app.
  D-196 protects both `lkb` and `lkb_prod` (case-insensitively) on shared work/test
  paths: set `MONGO_WORK_DB` to a separate isolated database, never either production
  alias. Capture children must select that work database independently of the app
  parent. `global_university_db` remains refused; `lkb_staging` requires the exact
  `LKB_ALLOW_STAGING=lkb_staging` opt-in. Production-enabled scripts require all three:
  caller `allowProduction`, `--i-know-this-is-production`, and explicit canonical
  `MONGODB_DB=lkb` or `MONGODB_DB=lkb_prod`. These select a capability; approval to
  execute a production write is still a separate human gate (section 6).
- `OLLAMA_API_KEY` required. Copy it from the existing Windows bot host's `.env` into the server `.env`
  by hand; never commit it, paste it in chat or print it. Runtime only, never a build arg.
- `CORS_ORIGINS` the exact browser origin(s) of the web UI, with scheme,
  e.g. `http://<server-ip>`. nginx does not proxy the API, so the browser calls the API
  cross-origin and an unlisted origin is blocked.
- `VITE_API_BASE_URL` the URL the BROWSER uses to reach the API, e.g.
  `http://<server-ip>:3300`. It is baked into the web bundle at build time:
  changing it means rebuilding web (`docker compose build web`).
- `WEB_PORT=80` (compose default is 8080).
- Optional: `GEMINI_API_KEY` (audio transcription), `OLLAMA_CLOUD_MODEL`,
  `OLLAMA_CLOUD_VERIFIER_MODEL`.
- WhatsApp (launch feature): `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP`.
  T-028: the five names of section 9. Compose forwards all of these from `.env` as value-less
  pass-through: a name that is absent stays UNDEFINED in the container. Never leave a blank `NAME=`
  line in `.env` for them (a blank line defines an empty string); comment the line out instead.
  Check before every `docker compose up` (it must print nothing; servers whose `.env` was copied from an
  older `.env.example` still carry blank `WHATSAPP_*=` lines):
  `grep -nE '^(LKB_HOSTING_[A-Z_]+|LKB_COUNSELLOR_STATE_DIR|WHATSAPP_[A-Z_]+)=$' .env`
  Also never export these names as empty strings in the shell that runs compose.
The remaining names in `.env.example` belong to the meeting bot (section 5.4 lists the ones the `bot` service forwards) and
scripts, not to the api/web containers (compose forwards only the names it lists).

## 3. Build and start
```sh
docker compose build api web
docker compose up -d api web
docker compose ps
```
The first build downloads dependencies and takes several minutes. Plain
`docker build -t kb-api .` gives the same API image; `--target web` builds the UI.

## 4. Ports and health
- 3300: API. `curl -fsS http://localhost:3300/health` must return HTTP 200.
  It is unauthenticated and fails if Mongo does not ping.
- 80: web UI (nginx, serves SPA deep links such as `/sessions`).
- Open 80 (and 3300 unless a reverse proxy fronts it) in the firewall/security group.
- If the container is unhealthy: `docker compose logs api` first. The entrypoint prints
  which required variables are `set` or `MISSING`, never the values.

## 4a. Base path (APP_BASE_PATH): serving at vidysea.com/knowledgebase
The web image is built once and mounted at any path chosen when the container STARTS (no rebuild).
Owner decision (gate 2026-10-29): the product lives at `https://vidysea.com/knowledgebase`.
- `.env`: `APP_BASE_PATH=/knowledgebase` (default `/`; `knowledgebase`, `/knowledgebase/` mean the same).
  Then `docker compose up -d web` (a restart is enough; changing the path needs no `build`).
- The web container serves the UI at `<base>/` (also `<base>` without the slash and deep links such as
  `<base>/sessions/abc`) and proxies `<base>/api/*` to the api service with the prefix stripped
  (`/knowledgebase/api/health` reaches the api's `/health`). The browser therefore calls the API
  same-origin; leave `VITE_API_BASE_URL` empty (a rebuild is only needed if you still set it).
- Optional: `APP_API_BASE` (browser-side API base, only if the API is on another origin; then also add
  that web origin to `CORS_ORIGINS`) and `API_UPSTREAM` (where the web container proxies, default
  `http://api:3300`; it must resolve when the container starts, which compose guarantees).
- Not covered by the prefix: pages the API itself serves as HTML (`/compete`, `/docs-ui`). They open from
  the sidebar via `<base>/api/compete` and `<base>/api/docs-ui`, but links INSIDE those pages are
  root-relative and break under a prefix. Known limitation.
- The one rule the vidysea.com team needs (nginx, on the vidysea.com front proxy). Pass the FULL path
  through: no rewrite and no prefix stripping, because the web container already expects `/knowledgebase/...`.
  ```nginx
  location /knowledgebase/ {
      proxy_pass http://<LKB-SERVER>:<WEB_PORT>;   # NO path after the port: the original URI is forwarded unchanged
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      client_max_body_size 1g;
      proxy_read_timeout 300s;
  }
  ```
  Without the trailing-slash form (`/knowledgebase`) the container also answers, so no redirect rule is needed;
  a `location = /knowledgebase { return 301 /knowledgebase/; }` is optional. Keep the main site's own
  `location /` as is. `<LKB-SERVER>:<WEB_PORT>` is the host and `WEB_PORT` (default 8080) of the compose `web` service.
- Smoke test after start (replace host/port):
  ```sh
  curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8080/knowledgebase/          # 200 (UI)
  curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8080/knowledgebase/watch     # 200 (SPA deep link)
  curl -fsS http://localhost:8080/knowledgebase/api/health                                  # 200 from the api
  ```

## 5. Meeting bot (Docker, compose profile `bot`)
Status: the Linux bot image and the compose `bot` service are merged (D-205). The image build, the doctor mode and the
container recording smoke (fake meeting page, no real meeting) PASSED on a developer machine (`qa/manifests/bot-image.md`,
`bot-gws-install.md`, `bot-smoke.md`). NOT yet proven: a real meeting join on Ubuntu, the one-time Google sign-in, gws OAuth in the
container, and the Linux live proof (5.5, 5.6 and 5.7 are human steps). Survey and design: `qa/evidence/bot-linux-survey-2026-10-29.md`.

What it is: `docker/meeting-bot/Dockerfile` (node:24-slim, headed Chrome for Testing under Xvfb :99, PulseAudio null sink, tab
capture to `.webm`, pinned `gws` 0.22.5 with a sha256 check, runs as uid 1000, no `.env` baked in). The entrypoint
(`docker/meeting-bot/entrypoint.sh`) takes `BOT_MODE=run` (default) | `doctor` | `login`. The service is `bot` in `docker-compose.yml`
with `profiles: ["bot"]`, so a plain `docker compose up -d api web` never starts it. No ports are published. The scheduler and
watchers run inside the bot container (`run-pipeline.mjs --run --watch`). OBS capture is Windows-only and is not used here
(`LKB_CAPTURE_BACKEND=tab`, set by the image).

Needs: Docker with at least 4 GB RAM for the Docker VM or host (the build and a 1280x720 recording ran without OOM at 4 GB),
outbound HTTPS for the build and for the smoke (the smoke runs `apt` to add `libnss3-tools` to its throwaway container), and the
host `.env` from section 2. Every `docker compose` command below needs the `--profile bot` flag.

### 5.1 Build
```sh
docker compose --profile bot build bot
# or, to get a stable tag for the smoke test (layers are shared, so a second build is cached):
docker build -f docker/meeting-bot/Dockerfile -t lkb-bot .
```
A cold build takes about 4 minutes (image about 700 MiB of content, about 2.8 GB unpacked disk). The Linux `gws` archive is fetched
from the official googleworkspace/cli v0.22.5 release and checked against a pinned sha256; the build FAILS on a mismatch. To move versions,
override all three of `GWS_VERSION`, `GWS_URL`, `GWS_SHA256` together (shell or `.env`).

### 5.2 Doctor (checks the image and the display; needs no meeting and no login)
```sh
docker compose --profile bot run --rm -e BOT_MODE=doctor bot
```
It starts PulseAudio and Xvfb, runs `node scripts/webinar/setup.mjs --doctor` (pnpm, Node 24, ffmpeg, ffprobe, the venv with
SeleniumBase and PyAutoGUI, Chrome for Testing present with its major version equal to the UC driver's, DISPLAY) and exits 0 only when
the doctor exits 0 and prints no `MISSING` line. Run mode applies the same gate before it starts, so a broken image restarts in a loop
(`restart: unless-stopped`) instead of running half-configured.

### 5.3 Smoke test (records a fixture page inside the image; no real meeting)
```sh
BOT_IMAGE=lkb-bot bash scripts/qa/container-workflows/bot-smoke.sh
```
(`scripts/qa/container-workflows/bot-smoke.sh`; fixture `scripts/qa/container-workflows/fixtures/bot-smoke-meeting.html`.) It starts one
throwaway container, serves a canvas and 440 Hz tone page over local HTTPS, records it with the same `cli.ts record ... --backend tab`
call the pipeline uses, and always removes the container. It takes about 2 minutes and ends with `SMOKE RESULT PASS` (exit 0) or
`SMOKE RESULT FAIL` (nonzero). Checks: (a) a non-empty `tab-*.webm`, (b) exactly one video and one audio stream, (c) audio peak above
-40 dB, (d) the record process exited 0 and no chrome process remains. Reference run: 5.0 MB webm, audio peak -3.4 dB. It uses no
secrets and writes nothing to MongoDB.

### 5.4 Configure the server `.env` (names only; values from the owner)
Compose forwards these to the `bot` service as value-less pass-through (an absent name stays undefined in the container; never leave a
blank `NAME=` line, comment it out):
- Database and tenant: `MONGODB_URL`, `MONGO_WORK_DB` (an isolated work database, never `lkb` or `lkb_prod`; run mode refuses a protected name),
  `LKB_TENANT_ID`, `LKB_API_URL`, `LKB_API_KEY` (the bot's own key; with the vidysea.com layout of section 4a the URL is
  `https://vidysea.com/knowledgebase/api`).
- Scheduler gates (run mode refuses to start without them): `LKB_JOIN_RULES_ENFORCE` (`last-valid` or `fail-closed`), and
  `LKB_AUTOJOIN_DISCOVERY`, `LKB_AUTOJOIN_WEBINARS`, `LKB_AUTOJOIN_CAREER_PRIORITY`, `LKB_AUTOJOIN_TEST_DATA_ROUTING` all `1`.
  Also forwarded: `LKB_AUTOJOIN_CONFIG`, `LKB_CAREER_TOPICS_FILE`, `LKB_WEBINAR_REGISTRATION_CONFIG`, `AUTO_RECORD_TRUSTED_EMAILS`,
  `AUTO_RECORD_TRUSTED_DOMAINS`, `LKB_GMAIL_ALIASES`, `LKB_GMAIL_LABEL_IDS`.
- Alerts: `LKB_ALERT_EMAIL`, `LKB_ALERT_DASHBOARD`, `LKB_ALERT_CALENDAR`, `LKB_ALERT_EMAIL_TO`, `LKB_ALERT_EMAIL_TEST_DATA`,
  `LKB_ALERT_EMAIL_PER_HOUR`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTIFY_CHANNELS`, `NOTIFY_CHANNELS_DIGEST`, `NOTIFY_CHANNELS_BOT_STATUS`.
- Providers: `GEMINI_API_KEY`, `OLLAMA_API_KEY`.
- Container-only: `VNC_PASSWORD` (login mode only) and `LKB_CHROME_NO_SANDBOX` (the image already sets it to `1`; leave it out of `.env`).

Set by the image, not by you: `DISPLAY=:99`, `LKB_PYTHON`, `LKB_BROWSER_EXECUTABLE=cft`, `LKB_CAPTURE_BACKEND=tab`,
`LKB_BOT_PROFILE_DIR=/data/bot-profile`, `LKB_RECORD_DIR=/app/raw/webinars`, `LKB_FFMPEG_PATH`, `LKB_GWS_PATH`, `TZ=Asia/Kolkata`.
`LKB_RECORD_DIR` must stay inside the repo tree (`/app`): the recorder refuses a path outside it. Validate the compose file before
every start with `docker compose --profile bot config --quiet` (it must print nothing).

Volumes (named; back them up, and never `docker compose down -v`): `lkb-bot-profile` (`/data/bot-profile`, the signed-in Chrome profile),
`lkb-bot-recordings` (`/app/raw/webinars`), `lkb-bot-data` (`/app/data`: scheduler state and `data/webinar-release/live-proof.json`),
`lkb-bot-gws` (`/home/node/.config/gws`, the gws OAuth state).

### 5.5 One-time Google sign-in of the bot profile (login mode, human step)
Login mode opens Chrome on the bot profile inside the container and exposes it through x11vnc. VNC is never published to the network:
it is published to the server's loopback only, and you reach it through an SSH tunnel.
1. Put `VNC_PASSWORD=<a strong password you choose>` in the server `.env` (mode 600). The container reads it into a 0600 file; it is not put on any command line.
2. Stop the run-mode bot if it is running (one Chrome per profile): `docker compose --profile bot stop bot`.
3. On the server: `docker compose --profile bot run --rm -p 127.0.0.1:5900:5900 -e BOT_MODE=login bot`
4. On your own machine: `ssh -N -L 5900:127.0.0.1:5900 <user>@<server>`, then connect a VNC client to `localhost:5900` with that password.
5. In the Chrome window (it opens on `https://accounts.google.com/`) sign in with the bot's Google account (CAPTCHA and 2FA are manual), then CLOSE the Chrome window.
   The container exits and `--rm` removes it; the session stays in the `lkb-bot-profile` volume.
6. Remove `VNC_PASSWORD` from `.env` (or comment it out) once done.

### 5.6 gws OAuth on the server (human step, owner-approved Google account)
`gws` (calendar and mail alerts and discovery) authenticates from its own state in the `lkb-bot-gws` volume. The commands exist
(`gws auth status`, `gws auth login`; see `apps/web/src/pages/setup-wizard/setupModel.ts` line 105 and `docs/webinar-release.md`) and the
binary is proven to start in the image; the full OAuth login inside the container has NOT been exercised. Check the state with:
```sh
docker compose --profile bot run --rm --entrypoint gws bot auth status
```
If it is not signed in, run `gws auth login` the same way with the account and scopes the owner approves (`--readonly --services gmail,calendar`
is the least privilege the CLI offers). Tell the owner if the headless callback cannot complete.

### 5.7 Linux live proof (human step; blocks run mode)
`run-pipeline --run` refuses to start without `data/webinar-release/live-proof.json` saying `status: passed`, `backend: tab`,
`platform: linux`, `audio: true`, `video: true`, with a non-empty recording inside the repo tree (`scripts/webinar/run-pipeline.mjs`,
`validateRunGate`). A Windows proof is refused on Linux. Procedure (`docs/webinar-release.md`, live proof): after 5.5, join one real meeting
and record it with
`node --import tsx packages/meeting-bot/src/cli.ts record <url> --backend tab --until <ISO-end> --session-id <safe-id> --title <title>`
run inside the container (`docker compose --profile bot run --rm --entrypoint sh bot`), check audio and video with ffprobe and playback, then
write the marker into the `lkb-bot-data` volume (`/app/data/webinar-release/live-proof.json`) with `recording` relative to `/app`, for example
`raw/webinars/tab-<id>.webm`. The marker is a human assertion; build agents never write it.

### 5.8 Run mode, health and logs
```sh
docker compose --profile bot up -d bot
docker compose --profile bot ps                 # STATUS becomes "healthy" (90 s start period)
docker compose --profile bot logs -f --tail 200 bot
```
The container runs `node scripts/webinar/run-pipeline.mjs --run --watch` (one poll per minute when idle, capture and processing
serialised). The healthcheck (`docker/meeting-bot/healthcheck.sh`, every 30 s, 3 retries) requires Xvfb `:99` to answer, the run-pipeline
process to be alive and the profile directory to be writable. `restart: unless-stopped` restarts it after a crash or reboot; the entrypoint
clears stale X and tab-capture locks first. The time zone is `Asia/Kolkata` (the recorder's "today" uses local time).
Update: `git pull && docker compose --profile bot build bot && docker compose --profile bot up -d bot`.

### 5.9 Limits (accepted)
- No native privacy-window masking on Ubuntu: it needs the Windows-only clock and WASAPI path (D-205: accepted as unavailable for now, filed for later).
  Do not pass `--native-tab-clock`; it is unsupported on Linux.
- Linux recording is the tab backend only (Chrome extension tab capture to `.webm`); OBS is not available.
- Windows `schtasks` and PowerShell scheduling is not used; `run-pipeline --run --watch` is the Linux driver.
- `--assisted` capture is not part of the supported Linux path.
- The Windows calendar and Gmail worker described in the last section (D-192) is separate and unaffected.
- Real-meeting behaviour on Ubuntu (lobby, platform UI changes, long recordings) is unproven until the live proof of 5.7 passes.

### 5.10 Cloud OnAir auto-join (D-207)
Google Cloud OnAir events (`cloudonair.withgoogle.com/events/<slug>`) are joined from the "You're registered" mails Google sends after a
registration. This used to run only when `LKB_ONAIR_MAIL=1` was set, which was undocumented and off, and an InfraMod webinar was missed
because of it (2026-10-29). It is now DEFAULT ON.
- Switch: `config/autojoin.json` key `onair` (`mail`, `watch`, both `true`). A missing file or key also means on. Override per deployment
  with `LKB_ONAIR_MAIL` (read the mails and schedule the events) and `LKB_ONAIR_WATCH` (the bot browser opens the OnAir page and presses
  Watch now): `1`/`true`/`on` force on, `0`/`false`/`off` force off, empty or unrecognised = use the file. Both names are forwarded by the compose `bot`
  service as value-less pass-through (comment the lines out in `.env` rather than leaving them blank).
- How the mails are read: through `gws` (section 5.6), read-only (`gmail users messages list` and `get`; no send, modify or delete), only mails whose
  sender passes the Google DMARC check. The gws account must therefore be the mailbox the registrations arrive in. Each mail is resolved to one
  event link, then added to the candidate list beside the Gmail and Calendar candidates; a mail failure is logged and costs only that tick.
- Recording on Ubuntu: tab capture only (`--backend tab`, pinned by the scheduler); OBS is refused off Windows. The bot profile (section 5.5)
  must be signed in to a Google account that is registered for the event.
- Live-proof requirement: the section 5.7 proof (`live-proof.json`) still blocks run mode, and it does not cover OnAir. Treat OnAir as unproven
  on Ubuntu until one real registered event has been recorded end to end (mail read, candidate scheduled, page joined, audio and video checked), then record it
  in the section 5.7 evidence. Do not rely on it for a must-not-miss event before that.
- Wiring: the Ubuntu driver (`scripts/webinar/run-pipeline-deps.mjs`, authorized by D-208 item 6) wraps its candidate loader with the mail lane, so the mails
  are read on every discovery pass, and sets `LKB_ONAIR_WATCH=1` in the environment of the record child unless it is set to `0`. A failed mail read is logged
  and costs only the OnAir candidates for that pass; it never fails the Gmail discovery. The Windows schedule tick wires the same lane separately.

## 6. First-run database step
Compose never migrates by itself. After separate human approval for the specific
migration and target database, run it deliberately:
```sh
docker compose --profile migrate run --rm migrate
```
It writes to `MONGODB_DB`. D-186 deployed-app authority does not authorize this
migration. Under D-197, `config/migrate-mongo-config.cjs` independently refuses
`lkb_prod`, including case/whitespace variants, with or without production opt-in.
Its existing production path accepts only explicit canonical `MONGODB_DB=lkb`
with the required opt-in. The `lkb_prod` app configuration above therefore cannot
run this migration; do not rename the target to get past the guard. A migration
for that target remains blocked pending a separately authorized implementation.
Neither supported configuration nor `LKB_I_KNOW_THIS_IS_PRODUCTION=1` is human approval.
After separate approval to create the production key, mint it for the UI/API
(printed once, store it safely):
```sh
pnpm install --frozen-lockfile
node scripts/mint-key.mjs --tenant toc --label first-key --i-know-this-is-production
```
Use explicit `MONGODB_DB=lkb_prod`; do not set `MONGO_WORK_DB=lkb_prod`. The script's
production opt-in does not apply to work/test captures or authorize other writes.
For the first operator admin key (every scope, incl. `answer-policy:*`, `automation:*`, `hosting`, `jobs`), add `--all-scopes`; for a narrower key use `--scopes answer-policy:read,jobs`.
Data from other machines is not copied by deploying; import the corpus separately.

### 6a. Dedicated Mongo user for the product (D-186)
Create it once on the Mongo host as an admin; the team picks the password, which goes
only into the server `.env`, never into git, chat or logs. Placeholders only:
```js
use lkb_prod
db.createUser({ user: "lkb_app", pwd: "<PASSWORD>", roles: [{ role: "readWrite", db: "lkb_prod" }] })
```
Then enable authentication (`security.authorization: enabled` in `mongod.conf`, restart
mongod; managed clusters already enforce it), bind Mongo to the server's IP only, and set
`MONGODB_URL` with the credentials as in section 2 (URL-encode special characters in the
password). Check: `mongosh "<MONGODB_URL>" --eval 'db.runCommand({ping:1})'`.

**Replica set RECOMMENDED; a standalone mongod also works for Ask (w27-standalone).** `POST /ask`
(and `/graph`, session decisions) read through a snapshot transaction
(`apps/api/src/visibility/read-snapshot.ts`). MongoDB refuses transactions on a standalone `mongod`
(`Transaction numbers are only allowed on a replica set member or mongos`). The API now detects the
topology once per connection (`hello`: no `setName` and not a mongos means standalone; override with
`LKB_MONGO_STANDALONE=1` to force standalone or `=0` to force replica-set behaviour) and on a standalone
runs the SAME tenant-scoped queries without a session or transaction, at readConcern `local`.

Consistency caveat on standalone: the reads of one request are no longer a single point-in-time
snapshot across collections, so a request racing a publication may see it half-applied (for example a
new tree root with the previous session page). Every read is still tenant-scoped and the visibility
gates still re-check authority per read, so the risk is a momentarily stale or incomplete answer, not a
cross-tenant read. Use a replica set when you need the stricter guarantee.

Writes on standalone: index publication (`publishIndexWithCommit`), native publication
(`runNativePublicationTransaction`) and the transcript-review refresh run without a transaction. They are
safe because publication is a pointer flip, not a multi-document commit: artifacts are written under a
fresh generation id, `sessions.indexAttempt` is flipped to complete by ONE conditional single-document update,
and readers (`verifyIndexGeneration`) serve only a complete generation whose artifacts match the manifest
digests. A crash before the flip leaves the session hidden (fail closed); a crash after it leaves the new
generation live. A crashed or failed run leaves the attempt `uncertain`/`running`, and a new attempt for that
session is refused until an operator recovers it (unchanged rule: no automatic takeover of possibly-written
state). Re-indexing a live session rewrites its artifacts in place, so that session is briefly hidden.

Non-atomic on standalone (they run, but without all-or-nothing):
- Transcript-review `mutate` bumps the native publication revision before the review-head compare-and-swap, so a lost swap leaves the bump: native publications are hidden (availability only).
- Speaker-suggestions `decide` checks currency, bumps, then confirms without a transaction, so a concurrent root-only source swap can interleave in a narrow window.
- Refresh executor: a crash mid-refresh can show partially rewritten graph edges until the refresh retries.

`LKB_MONGO_STANDALONE=1` can only confirm a standalone: if `hello` reports a replica set or mongos it is ignored with a warning and transactions stay in use. `=0` forces transactions.

Still refuse with a 503 on standalone (a half-applied write there would be visible, so they need a replica
set): WhatsApp review store/decide, invalidation and the quarantine audit, and speaker attribute and
relationship edits. They are not needed for Ask.

Unknown store failures on Ask now return 503 `store_unavailable` (the real cause is logged server-side,
secrets redacted) instead of the misleading `answer_history_unavailable`.

To convert to a one-node replica set anyway, follow this order exactly. `security.keyFile` turns authorization on by
implication, so the admin user must exist BEFORE the keyFile is added, or the localhost exception
closes with no admin and you are locked out:
1. Back up first: `mongodump --uri "<MONGODB_URL>" --out /backup/pre-rs`. Converting an existing
   standalone needs mongod restarts (brief downtime); no data is lost.
2. Set `replication.replSetName: rs0` in `mongod.conf` (or `--replSet rs0`), with NO `security.keyFile`
   and no authorization yet. Restart mongod.
3. Initiate with an explicit host the API container can reach (not `localhost`):
   `rs.initiate({_id:"rs0",members:[{_id:0,host:"<host-or-ip-reachable-from-the-api-container>:27017"}]})`.
4. On the primary create an admin user, then the app user:
   `use admin` then `db.createUser({user:"admin",pwd:"<ADMIN-PASSWORD>",roles:["root"]})`
   (or `userAdminAnyDatabase` + `clusterAdmin`), then `use lkb_prod` and create `lkb_app` with
   `readWrite` on `lkb_prod` as in the block above. If users already exist, skip creating the admin and
   use your existing admin.
5. Create the keyFile: `openssl rand -base64 756 > /etc/mongo-keyfile && chmod 400 /etc/mongo-keyfile && chown mongodb:mongodb /etc/mongo-keyfile`
   (use the real mongod user and group). Add `security.keyFile: /etc/mongo-keyfile` to `mongod.conf`
   (this implies `authorization`). Restart mongod.
6. Verify: `mongosh -u admin -p --authenticationDatabase admin --eval 'rs.status().ok'` prints 1.
7. Set `MONGODB_URL` with `replicaSet=rs0` and the explicit host above (recommended). Only if the member
   host cannot be made reachable from the API, use `directConnection=true` instead of `replicaSet`.
Check: `mongosh "<MONGODB_URL>" --eval 'db.hello().setName'` prints the set name.
Ask does NOT depend on the T-028 env in section 9.

## 7. Smoke test
```sh
curl -fsS  http://localhost:3300/health                      # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3300/brain   # 401 without a key
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost/             # 200 (UI)
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost/sessions     # 200 (SPA route)
```
In a browser on another machine: open `http://<server>/`, enter the minted key, and
confirm pages load with no CORS errors in the console (if they appear, fix
`CORS_ORIGINS`; if requests go to `localhost`, rebuild web with the right
`VITE_API_BASE_URL`).

## 8. Owner decisions the team must make before real traffic
1. Domain and public hostnames (web and API). Then update `CORS_ORIGINS`, rebuild web.
2. TLS (decided: Let's Encrypt behind the team's proxy): no TLS is built in. Put Caddy
   (automatic Let's Encrypt, `app.example.org { reverse_proxy localhost:80 }` plus an
   API host `api.example.org { reverse_proxy localhost:3300 }`) or nginx with
   `certbot --nginx -d app.example.org -d api.example.org` in front. Open 80/443 for
   the ACME challenge. Use `https://` in `VITE_API_BASE_URL` and `CORS_ORIGINS`, rebuild
   web, and do not expose plain HTTP to the internet with real keys.
3. Database (decided, D-186): `lkb_prod`, with the dedicated user of section 6a. Never
   point a test deploy at it.
4. MongoDB network: accept only the server's IP. Mongo is not run by this compose file
   (the `local-dev` profile is an empty throwaway DB only).
5. The bot runs on this Ubuntu server as the compose `bot` service (section 5, D-205), using `MONGODB_URL` with an isolated
   `MONGO_WORK_DB`; the team owns the signed-in Chrome profile (volume `lkb-bot-profile`) and the Linux live proof.

## 9. Launch feature flags (D-189)
At launch only T-028 counsellor accounts is on; T-013 avatar and T-014 championship wait.
- T-028 hosting env gates `/keys`, `/hosting`, `/webhooks`, operations schedules, automation and capture
  readiness. Without the five names, `/keys` answers 503 `hosting_unavailable` by design. Ask is unaffected.
- T-028: put all five in the main server `.env` (chmod 600, gitignored). Compose forwards them to the
  api container as value-less pass-through, so when a name is absent from `.env` it stays undefined and
  everything works with T-028 off. Never write blank or partial values: the API treats a
  defined-but-incomplete set (even an empty string, i.e. a blank `NAME=` line) as a misconfiguration and
  answers every authenticated route 503. All five are required together:
  `LKB_HOSTING_STATE_DIR=/var/lib/lkb/hosting` and `LKB_COUNSELLOR_STATE_DIR=/var/lib/lkb/counsellor`
  (exactly these paths; they are the named volumes `lkb-hosting-state` and `lkb-counsellor-state`, so
  state survives restarts; back the volumes up too),
  `LKB_HOSTING_ENCRYPTION_KEY` (the code requires exactly 64 hex characters = 32 bytes; generate
  with `openssl rand -hex 32`, NOT base64, which is rejected),
  `LKB_HOSTING_BOOTSTRAP_ADMINS='{"toc":["<key-id>"]}'` (key ids from `mint-key`),
  `LKB_HOSTING_WEBHOOK_ORIGINS='["https://app.example.org"]'` (https origins only).
  WARNING: a partial set makes every authenticated route return 503: fill all five or none (comment
  them out or delete them to turn T-028 off). The old optional `.env.t028` file is retired: compose no
  longer reads it. If a server already has one, move its five lines into `.env` and delete the file.
  Single-quote the JSON values. Back the key up with the volumes; losing it makes stored account
  data unreadable. Never commit it. Then `docker compose up -d --build api`.
- T-014 championship: leave `LKB_CHAMPIONSHIP` unset (it is on only when `=1`).
- T-013 avatar: no environment flag exists; leave it unannounced. The `/counsellor` page
  ships in the web bundle either way.

## Cutover: reindex the 3 FAILED sessions in lkb_prod (D-204 opt-in, D-207 fix; devops step)
`scripts/webinar/sync-session.mjs` writes `lkb_prod` only through a three-part opt-in (the same one as `mint-key.mjs`,
`recover-index-attempt.mjs` and `backfill-document-consent.mjs`): the script passes `allowProduction`, the command line
carries `--i-know-this-is-production`, and the environment has `MONGODB_DB=lkb_prod`. It also requires
`MONGO_WORK_DB=lkb_prod` (a disagreement between the two is refused; a `testData` source routes to `lkb_staging` first, so it never takes this path).
With any part missing the old refusal ("MONGO_WORK_DB must name an isolated work database; production writes refused")
applies unchanged. A run that does take the production path prints one `PRODUCTION WRITE ENABLED (D-204)` line. D-207 added no second opt-in:
`--index-existing` calls the same guard function.

The three sessions (Funding Dreams is NOT part of this cutover and is not touched):

| session | tenant | how |
|---|---|---|
| `2026-04-21-visa-blueprint-part2-italy-france-nz` | toc | `--index`: re-syncs the rows from `data/toc-migrated/<id>/` (migrated source shape; title comes from `session.json`), then indexes |
| `2026-08-10-ucas-what-changed-what-matters` | toc | same as above |
| `2026-10-13-zoom-webinar-p2` | vidysea | `--index-existing --tenant vidysea`: no local directory; indexes the rows already in `lkb_prod` (it never creates or replaces rows) |

Run on the Ubuntu server, one session at a time, dry run first (a dry run connects to nothing):
```
node scripts/webinar/sync-session.mjs 2026-04-21-visa-blueprint-part2-italy-france-nz --dry-run --index
node scripts/webinar/sync-session.mjs 2026-08-10-ucas-what-changed-what-matters --dry-run --index
node scripts/webinar/sync-session.mjs 2026-10-13-zoom-webinar-p2 --index-existing --tenant vidysea --dry-run
# live, with MONGODB_URL (the lkb_app user, section 6a) already in the environment:
MONGO_WORK_DB=lkb_prod MONGODB_DB=lkb_prod node scripts/webinar/sync-session.mjs 2026-04-21-visa-blueprint-part2-italy-france-nz --index --i-know-this-is-production
MONGO_WORK_DB=lkb_prod MONGODB_DB=lkb_prod node scripts/webinar/sync-session.mjs 2026-08-10-ucas-what-changed-what-matters --index --i-know-this-is-production
MONGO_WORK_DB=lkb_prod MONGODB_DB=lkb_prod node scripts/webinar/sync-session.mjs 2026-10-13-zoom-webinar-p2 --index-existing --tenant vidysea --i-know-this-is-production
```

Read before the live run:
- **Both TOC dry runs currently stop at `invalid turn timing, write refused`** (UCAS t114: tStart 1883 > tEnd 1868; Visa t141: tEnd 213 < tStart 2008).
  That is a data defect in the migrated `turns.json` (the same inversion is what the strict indexer rejects as `invalid transcript ownership/identity/time`),
  not a code bug: the loader never swaps or clamps timings. The turns need a human-approved repair first; the dry run is the check that it is done.
- Re-running `--index` on the TOC pair REPLACES their turn rows (generation swap: rows with an older `syncGen` are deleted). Compare turn ids against `lkb_prod` first.
  If the production rows are verified intact and only the index is missing, `--index-existing --tenant toc` is the non-destructive alternative.
  Before the run record `db.turns.countDocuments({sessionId: '<id>'})` and take a `mongodump` of `lkb_prod` (the swap is upsert-then-delete on a standalone Mongo: a failure between the two leaves old and new rows mixed).
  If a `--index` run FAILS, fix the cause and re-run the SAME `--index` command; do NOT use `--index-existing` on the mixed row set (the completion gate also checks the indexed turn count equals the rows present, so a partial set is refused, but the clean re-sync is the repair).
  Rows with no `syncGen` that are not in the new set are deleted by the swap (intended).
- Migrated sources (and `--index-existing`) have no capture proof (no `validation.json`), so they skip the retention/processed-proof bookkeeping and instead
  require the indexer's own completion (tree written, chunks written, retrieval mode ready, no degraded summary/claims) before reporting success.
- A failed run now keeps its reason: `sessions.<id>.indexFailure` = `{at, via, reason, generation, state, phase}` (the closed `indexAttempt` shape is unchanged; a successful run unsets it).
  Read it with `db.sessions.findOne({_id: '<id>'}, {indexFailure: 1, indexAttempt: 1, 'status.index': 1})`.
If an index attempt is stuck as `uncertain`, recover it first (next section). Not run by the build agent: this is a
production write and stays a human/devops action.

## Recovering a stuck index attempt
A session whose index attempt is `uncertain` (or `running` after a crash) stays hidden and the next index run refuses it
(`index_attempt_requires_recovery`). Recover ONE session at a time (no bulk mode); dry run first:
`node scripts/operations/recover-index-attempt.mjs --tenant <t> --session <s>` shows the attempt state, generation, age
and any artifacts tagged with that generation. Then add `--apply --reason "<why>"` to reset it to `failed/preflight` so a
fresh index run can claim it (one conditional update; a changed attempt gives `conflict` and writes nothing; who/when/why
are stored in `sessions.indexRecovery`). A `running` attempt under 30 min old is refused unless `--force-running`.
Database rules are the usual script guard (`lkb_staging` with `MONGO_WORK_DB`/`LKB_ALLOW_STAGING`; production only with
`--i-know-this-is-production` and `MONGODB_DB=lkb`). Nothing is deleted: leftover artifacts of the abandoned generation
stay invisible and the next index run rewrites them.

## Update / rollback
`git pull && docker compose build api web && docker compose up -d api web`.
Roll back by checking out the previous commit and repeating. Migrations are not
reversed by this.


## D-192 cross-host Calendar and Gmail worker

A hosted container cannot use the Windows Google CLI credentials. Deploying the code exposes the authenticated bridge; it does not configure or start its Windows worker.

Set these names in the hosted compose environment (the main `.env`):
- `LKB_CALENDAR_WORKER_ENABLED=1`
- `LKB_CALENDAR_WORKER_BINDINGS` to a JSON array of `{tenantId,keyId,account,hostId}`. Pin a deliberately issued active worker key, the connected Google account and the Windows host. The key must hold `calendar`, `gmail` and `operations:write`; do not grant these silently to existing keys.
- `LKB_JOIN_RULES_ENABLED=1`. Compose persists the authoritative rules at `/var/lib/lkb/join-rules`.

On the Windows worker set `LKB_TENANT_ID`, `LKB_API_URL=https://<host>/api`, the dedicated `LKB_API_KEY`, and the SAME `LKB_CALENDAR_WORKER_HOST_ID`. Google credentials remain on Windows. Start discovery without recording:

```sh
node scripts/webinar/run-pipeline.mjs --calendar-attendance-account umeshsugara@vidysea.com --discovery-only --watch
```

The loop polls every five minutes. Two missed cycles retain the inventory with a stale warning and hold new scheduling. A failed upload cannot renew old coverage. Calendar inventory starts at the verified Google Calendar's local day boundary; scan freshness uses actual acquisition time. Gmail defaults to the last 30 days, with bounded pagination and 10 body reads at once. Large messages are processed in bounded chunks; a content/link limit failure never becomes successful empty coverage.

Choose `attendanceMode: all` explicitly in the existing Join Rules editor for initial all-join validation. Deny and opt-out take precedence. Recording still requires genuine audio/video proof, reviewed independent slots and an isolated work database. Discovery-only never invokes capture/readiness or registration submission. No test recording is promoted to counselling knowledge automatically.

`POST /gmail/scan` retains its work-database fence. The web client now obtains the authenticated `X-LKB-Work-DB` binding before submitting it. A hosted app without an isolated scan database must report that missing configuration; never point a test scan at counselling production just to remove the error.

CI code deployment, configured bridge, active Windows discovery, actual attendance and production data promotion are separate states. Verify the hosted Calendar against the SAME source snapshot after rollout; do not reuse an earlier event count after the source/window changes.
